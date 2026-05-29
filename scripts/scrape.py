#!/usr/bin/env python3
"""
SF Bay Area Events Scraper

Uses agno + BrightDataTools to scrape free events from 20 SF Bay Area sources.
Writes directly to Neon PostgreSQL with upsert logic.

Usage:
    python3 scripts/scrape.py
"""

import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.brightdata import BrightDataTools
import psycopg2
from psycopg2.extras import execute_values

MAX_DAYS_AHEAD = 7
MAX_PAGES_PER_SOURCE = 10
TEST_MODE = '--test' in sys.argv

SOURCES = [
    {'name': 'sfpl', 'url': 'https://sfpl.org/events', 'county': 'san_francisco', 'category': 'library'},
    {'name': 'sf_recpark', 'url': 'https://sfrecpark.org/Calendar.aspx', 'county': 'san_francisco', 'category': 'outdoors'},
    {'name': 'funcheap', 'url': 'https://sf.funcheap.com', 'county': 'all', 'category': 'community'},
    {'name': 'sccld', 'url': 'https://sccld.org', 'county': 'santa_clara', 'category': 'library'},
    {'name': 'sjpl', 'url': 'https://sjpl.org', 'county': 'santa_clara', 'category': 'library'},
    {'name': 'oaklandlibrary', 'url': 'https://oaklandlibrary.org', 'county': 'alameda', 'category': 'library'},
    {'name': 'berkeleypl', 'url': 'https://berkeleypubliclibrary.org', 'county': 'alameda', 'category': 'library'},
    {'name': 'aclibrary', 'url': 'https://aclibrary.org', 'county': 'alameda', 'category': 'library'},
    {'name': 'ccclib', 'url': 'https://ccclib.org', 'county': 'contra_costa', 'category': 'library'},
    {'name': 'ebparks', 'url': 'https://ebparks.org', 'county': 'alameda', 'category': 'outdoors'},
    {'name': 'marinlib', 'url': 'https://marinlibrary.org', 'county': 'marin', 'category': 'library'},
    {'name': 'sonomalib', 'url': 'https://sonomalibrary.org', 'county': 'sonoma', 'category': 'library'},
    {'name': 'solanolib', 'url': 'https://solanolibrary.com', 'county': 'solano', 'category': 'library'},
    {'name': 'napalib', 'url': 'https://napalibrary.org', 'county': 'napa', 'category': 'library'},
    {'name': 'smcl', 'url': 'https://smcl.org', 'county': 'san_mateo', 'category': 'library'},
    {'name': 'dothebay', 'url': 'https://dothebay.com/free', 'county': 'all', 'category': 'community'},
    {'name': 'eventbrite', 'url': 'https://www.eventbrite.com/d/ca--san-francisco/free--events', 'county': 'all', 'category': 'community'},
    {'name': '19hz', 'url': 'https://19hz.info', 'county': 'all', 'category': 'music'},
    {'name': 'reddit_bayarea', 'url': 'https://www.reddit.com/r/bayarea/', 'county': 'all', 'category': 'community'},
    {'name': 'richmond_parks', 'url': 'https://ci.richmond.ca.us', 'county': 'contra_costa', 'category': 'outdoors'},
]


def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))


def parse_events_from_response(content):
    """Parse events JSON from agent response."""
    events = []

    code_block_match = re.search(r'```json\s*([\s\S]*?)\s*```', content)
    if code_block_match:
        try:
            data = json.loads(code_block_match.group(1))
            return data.get('data', [])
        except json.JSONDecodeError:
            pass

    json_start = content.find('{')
    json_end = content.rfind('}') + 1
    if json_start != -1 and json_end > json_start:
        try:
            data = json.loads(content[json_start:json_end])
            return data.get('data', [])
        except json.JSONDecodeError:
            pass

    return []


def normalize_date(event_date, today):
    """Normalize date to YYYY-MM-DD format."""
    if not event_date:
        return None

    try:
        parsed = datetime.strptime(event_date, '%Y-%m-%d')
        return parsed.strftime('%Y-%m-%d')
    except ValueError:
        pass

    try:
        parsed = datetime.strptime(event_date, '%m/%d/%Y')
        return parsed.strftime('%Y-%m-%d')
    except ValueError:
        pass

    return None


def normalize_time(event_time):
    """Normalize time to HH:MM:SS format."""
    if not event_time:
        return None

    match = re.match(r'(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?', event_time)
    if not match:
        return None

    hours = int(match.group(1))
    minutes = int(match.group(2)) if match.group(2) else 0
    period = match.group(3)

    if period:
        period = period.lower()
        if period == 'pm' and hours != 12:
            hours += 12
        elif period == 'am' and hours == 12:
            hours = 0

    return f'{hours:02d}:{minutes:02d}:00'


def filter_events_by_date_range(events, today, max_date):
    """Keep only events within date range."""
    filtered = []
    for event in events:
        event_date_str = event.get('date')
        if not event_date_str:
            continue

        normalized = normalize_date(event_date_str, today)
        if not normalized:
            continue

        try:
            event_date = datetime.strptime(normalized, '%Y-%m-%d').date()
            if today <= event_date <= max_date:
                event['date'] = normalized
                if event.get('time'):
                    event['time'] = normalize_time(event['time'])
                filtered.append(event)
        except ValueError:
            continue

    return filtered


def upsert_events(events, source_name):
    """Upsert events to Neon PostgreSQL."""
    if not events:
        return 0

    conn = get_db_connection()
    cur = conn.cursor()

    values = []
    for e in events:
        values.append((
            e.get('title', 'Unknown'),
            e.get('description', ''),
            e.get('date'),
            e.get('time'),
            e.get('location'),
            e.get('city'),
            e.get('county', 'san_francisco'),
            e.get('url') or e.get('source_url', ''),
            source_name,
            'free',
            get_category_for_source(source_name),
        ))

    query = """
        INSERT INTO events (
            title, description, date, time, location, city, county,
            source_url, source_name, price, category
        )
        VALUES %s
        ON CONFLICT (source_url) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            location = EXCLUDED.location,
            updated_at = NOW(),
            last_scraped_at = NOW()
    """

    execute_values(cur, query, values)
    conn.commit()
    cur.close()
    conn.close()

    return len(events)


def get_category_for_source(source_name):
    """Get category for a source."""
    for s in SOURCES:
        if s['name'] == source_name:
            return s.get('category', 'community')
    return 'community'


def delete_expired_events():
    """Delete events older than 24 hours."""
    conn = get_db_connection()
    cur = conn.cursor()

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    cur.execute("DELETE FROM events WHERE date < %s", (yesterday,))

    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()

    print(f"Removed {deleted} expired events")
    return deleted


def scrape_source(source):
    """Scrape a single source using agno agent."""
    today = date.today()
    today_str = today.strftime('%Y-%m-%d')
    max_date = today + timedelta(days=MAX_DAYS_AHEAD)
    max_date_str = max_date.strftime('%Y-%m-%d')

    agent = Agent(
        model=OpenAIChat(
            id='MiniMax-M2.7',
            api_key=os.getenv('MINIMAX_API_KEY'),
            base_url='https://api.minimax.io/v1',
        ),
        tools=[
            BrightDataTools(
                api_key=os.getenv('BRIGHT_DATA_API_KEY'),
                enable_scrape_markdown=True,
                enable_screenshot=False,
                enable_search_engine=False,
                enable_web_data_feed=False,
                web_unlocker_zone='mcp_unlocker',
            )
        ],
        debug_mode=False,
    )

    pagination_rules = ""
    critical_rules = ""

    if not TEST_MODE:
        critical_rules = """## CRITICAL RULES:
1. Scrape pages SEQUENTIALLY - do NOT skip any page numbers
2. Start from page 1 and go to page 2, then 3, then 4, etc.
3. STOP scraping when ALL events on a page are MORE than {MAX_DAYS_AHEAD} days in the future (after {max_date_str})
4. Sort all scraped events chronologically by date/time, from today ({today_str}) to latest
5. Today's date is {today_str}
"""
        pagination_rules = """## Pagination Pattern to Try:
- Page 1: {source['url']}
- Page 2: {source['url']}?page=1 or {source['url']}?page=2 (try both)
- Continue with ?page=3, ?page=4, etc.
- If that doesn't work, try /page/2, /events/page/2, etc.

## Steps:
1. First, scrape page 1 using scrape_as_markdown tool
2. Determine the pagination pattern (e.g., ?page=1, /page/2, ?p=2, etc.)
3. Scrape page 2, then page 3, then page 4, etc. - SEQUENTIALLY, no skipping
4. After scraping each page, check the dates of all events on that page
5. If ALL events on a page are AFTER {max_date_str}, STOP immediately - do not scrape more pages
6. Combine all events from all scraped pages
7. Sort by date/time chronologically
"""
    else:
        critical_rules = """## CRITICAL RULES (Test Mode):
1. ONLY scrape page 1 - do not scrape any additional pages
2. Return events from that single page only
3. Today's date is {today_str}
"""
        pagination_rules = """## Test Mode: Only scrape page 1
1. Scrape page 1 using scrape_as_markdown tool
2. Return events from that single page only
"""

    prompt = f"""You are a web scraping agent. Your task is to scrape data from: {source['url']}

{critical_rules}
{pagination_rules}

## Tool Usage:
Use scrape_as_markdown tool to scrape each page. This tool scrapes URLs directly and returns content as markdown.

## Output Format:
Return a JSON object with:
{{
    "source_url": "{source['url']}",
    "scraped_at": "{today_str}",
    "date_range": "{today_str} to {max_date_str}",
    "data": [
        {{
            "title": "...",
            "url": "...",
            "date": "...",
            "time": "...",
            "location": "...",
            "city": "...",
            "description": "...",
            ...other relevant fields...
        }}
    ]
}}

The data array should be SORTED chronologically from today to the latest event within {MAX_DAYS_AHEAD} days.

Now scrape {source['url']}{" page by page, following all rules above." if not TEST_MODE else " - ONLY scrape page 1, do not scrape additional pages."}"""

    try:
        response = agent.run(prompt)
        content = str(response.content)

        events = parse_events_from_response(content)
        filtered = filter_events_by_date_range(events, today, max_date)

        return filtered
    except Exception as e:
        print(f"  Agent error: {e}")
        return []


def main():
    print(f"Starting scrape at {datetime.now().isoformat()}")
    print(f"Sources to scrape: {len(SOURCES)}")

    if not os.getenv('DATABASE_URL'):
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    if not os.getenv('BRIGHT_DATA_API_TOKEN'):
        print("ERROR: BRIGHT_DATA_API_TOKEN not set")
        sys.exit(1)

    if not os.getenv('MINIMAX_API_KEY'):
        print("ERROR: MINIMAX_API_KEY not set")
        sys.exit(1)

    total_events = 0
    errors = []

    for source in SOURCES:
        print(f"\n=== Scraping: {source['name']} ===")

        try:
            events = scrape_source(source)
            count = upsert_events(events, source['name'])
            print(f"  -> {count} events saved from {source['name']}")
            total_events += count
        except Exception as e:
            error_msg = f"{source['name']}: {e}"
            errors.append(error_msg)
            print(f"  Error scraping {source['name']}: {e}")
            continue

    delete_expired_events()

    print(f"\n=== Scrape complete: {total_events} events processed ===")
    print(f"Errors: {len(errors)}")

    if errors:
        print("Error details:")
        for err in errors:
            print(f"  - {err}")


if __name__ == "__main__":
    main()