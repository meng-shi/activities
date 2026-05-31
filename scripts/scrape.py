#!/usr/bin/env python3
"""
SF Bay Area Events Scraper

Uses agno + BrightDataTools with multi-tier fallback scraping.
Tier 1: scrape_as_markdown → Tier 2: browser_navigate → Tier 3: search_engine

Usage:
    python3 scripts/scrape.py
    python3 scripts/scrape.py --test  (single page only)
    python3 scripts/scrape.py --debug (save debug logs)
"""

import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path='.env.local')

DEBUG_MODE = '--debug' in sys.argv
TEST_MODE = '--test' in sys.argv
DEBUG_DIR = Path('debug_logs')

# Parse --source flag for comma-separated list of source names
SOURCE_FILTER = None
for arg in sys.argv:
    if arg.startswith('--source='):
        source_list = arg.split('=', 1)[1]
        SOURCE_FILTER = [s.strip() for s in source_list.split(',') if s.strip()]
        break

# Constants
RETRY_DELAY = 2  # seconds between retries
MIN_CONTENT_LENGTH = 200  # minimum chars for valid content
MAX_RETRIES_PER_TIER = 2
MAX_DAYS_AHEAD = 2
STOP_DAYS_AHEAD = 3
MAX_PAGES_PER_SOURCE = 10

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.brightdata import BrightDataTools
import psycopg2
from psycopg2.extras import execute_values

SOURCES = [
    # Existing working sources
    {'name': 'sfpl', 'url': 'https://sfpl.org/events', 'county': 'san_francisco', 'category': 'library'},
    {'name': 'funcheap', 'url': 'https://sf.funcheap.com', 'county': 'all', 'category': 'community'},
    {'name': 'sccld', 'url': 'https://sccld.org', 'county': 'santa_clara', 'category': 'library'},
    {'name': 'sjpl', 'url': 'https://sjpl.org', 'county': 'santa_clara', 'category': 'library'},
    {'name': 'oaklandlibrary', 'url': 'https://oaklandlibrary.org', 'county': 'alameda', 'category': 'library'},
    {'name': 'aclibrary', 'url': 'https://aclibrary.org', 'county': 'alameda', 'category': 'library'},
    {'name': 'ebparks', 'url': 'https://ebparks.org', 'county': 'alameda', 'category': 'outdoors'},
    {'name': 'marinlib', 'url': 'https://marinlibrary.org', 'county': 'marin', 'category': 'library'},
    {'name': 'sonomalib', 'url': 'https://sonomalibrary.org', 'county': 'sonoma', 'category': 'library'},
    {'name': 'smcl', 'url': 'https://smcl.org', 'county': 'san_mateo', 'category': 'library'},
    {'name': 'dothebay', 'url': 'https://dothebay.com/free', 'county': 'all', 'category': 'community'},
    {'name': 'eventbrite', 'url': 'https://www.eventbrite.com/d/ca--san-francisco/free--events', 'county': 'all', 'category': 'community'},

    # NEW SOURCES - Non-duplicated coverage
    # San Mateo

    # Santa Clara
    {'name': 'sccparks', 'url': 'https://parks.santaclaracounty.gov/events', 'county': 'santa_clara', 'category': 'outdoors'},
    {'name': 'santaclaracity', 'url': 'https://www.santaclaraca.gov/recreation-community/events/events-calendar', 'county': 'santa_clara', 'category': 'community'},

    # Alameda
    {'name': '510families', 'url': 'https://www.510families.com/calendar/', 'county': 'alameda', 'category': 'family'},

    # Contra Costa (no coverage before!)
    {'name': 'contracostalive', 'url': 'https://www.contracostalive.com/event', 'county': 'contra_costa', 'category': 'community'},
    {'name': 'visitconcord', 'url': 'https://www.visitconcordca.com/events/', 'county': 'contra_costa', 'category': 'community'},
    {'name': 'richmondside', 'url': 'https://richmondside.org/events/', 'county': 'contra_costa', 'category': 'community'},

    # Marin
    {'name': 'visitmarin', 'url': 'https://www.visitmarin.org/event-calendar/', 'county': 'marin', 'category': 'community'},
    {'name': 'marinarts', 'url': 'https://marinarts.org/event/', 'county': 'marin', 'category': 'arts'},

    # Napa
    {'name': 'cityofnapa', 'url': 'https://www.cityofnapa.org/395/Community-Events', 'county': 'napa', 'category': 'community'},

    # Previously failed sources - keeping for retry assessment
    {'name': 'sf_recpark', 'url': 'https://sfrecpark.org/Calendar.aspx', 'county': 'san_francisco', 'category': 'outdoors'},
    {'name': 'ccclib', 'url': 'https://ccclib.org', 'county': 'contra_costa', 'category': 'library'},
    {'name': 'solanolib', 'url': 'https://solanolibrary.com', 'county': 'solano', 'category': 'library'},
    {'name': 'reddit_bayarea', 'url': 'https://www.reddit.com/r/bayarea/', 'county': 'all', 'category': 'community'},
    {'name': 'richmond_parks', 'url': 'https://ci.richmond.ca.us', 'county': 'contra_costa', 'category': 'outdoors'},
]


def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))


def wait_and_retry(delay=RETRY_DELAY):
    time.sleep(delay)


def call_llm(prompt, max_tokens=4000):
    """Call MiniMax-M2.5 LLM directly for extraction."""
    response = fetch(
        'https://api.minimax.io/v1/text/chatcompletion_v2',
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {os.getenv('MINIMAX_API_KEY')}",
        },
        body=json.dumps({
            'model': 'MiniMax-M2.5',
            'messages': [
                {'role': 'system', 'content': 'You extract structured event data from text. Return ONLY valid JSON.'},
                {'role': 'user', 'content': prompt},
            ],
            'max_tokens': max_tokens,
            'temperature': 0.1,
            'reasoning_split': True,
        }),
    )
    data = response.json()
    return data.get('choices', [{}])[0].get('message', {}).get('content', '')


def fetch(url, method='GET', headers=None, body=None):
    """Simple fetch wrapper."""
    import urllib.request
    import urllib.error

    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body:
        req.add_header('Content-Type', 'application/json')
        req.data = body.encode('utf-8')

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return type('Response', (), {
                'ok': True,
                'status': response.status,
                'json': lambda: json.loads(response.read().decode('utf-8')),
                'text': lambda: response.read().decode('utf-8'),
            })()
    except urllib.error.HTTPError as e:
        return type('Response', (), {
            'ok': False,
            'status': e.code,
            'json': lambda: {'error': str(e)},
            'text': lambda: str(e),
        })()
    except Exception as e:
        return type('Response', (), {
            'ok': False,
            'status': 0,
            'json': lambda: {'error': str(e)},
            'text': lambda: str(e),
        })()


def parse_events_from_response(content):
    """Parse events JSON from agent/LLM response."""
    if not content:
        return []

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
            None,  # city - only populated by enrichment
            None,  # county - only populated by enrichment
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


def extract_domain(url):
    """Extract domain from URL."""
    match = re.search(r'https?://([^/]+)', url)
    return match.group(1) if match else url


def extract_events_llm(content, source):
    """Use LLM to extract events from raw content."""
    if not content or len(content) < 50:
        return []

    today = date.today()
    today_str = today.strftime('%Y-%m-%d')
    max_date = today + timedelta(days=MAX_DAYS_AHEAD)
    max_date_str = max_date.strftime('%Y-%m-%d')

    prompt = f"""Extract ALL free events from the content below collected from {source['url']}.

Return a JSON object with this exact structure:
{{
    "source_url": "{source['url']}",
    "scraped_at": "{today_str}",
    "date_range": "{today_str} to {max_date_str}",
    "data": [
        {{
            "title": "Event Title",
            "url": "event URL or empty string",
            "date": "YYYY-MM-DD format",
            "time": "HH:MM:SS 24-hour format or null",
            "location": "Venue name or null",
            "city": "City name or null",
            "description": "Brief description or empty string"
        }}
    ]
}}

Rules:
- Extract ONLY free events
- Dates MUST be in YYYY-MM-DD format
- Times MUST be in 24-hour HH:MM:SS format (e.g., '14:30:00' NOT '2:30 PM')
- Include location and city when available
- If no events found, return: {{"data": []}}
- Do NOT include any explanation, ONLY valid JSON

Content to parse (first 15000 chars):
{content[:15000]}"""

    try:
        llm_response = call_llm(prompt)
        events = parse_events_from_response(llm_response)
        return events
    except Exception as e:
        print(f"    [WARN] LLM extraction failed: {e}")
        return []


class BrightDataScraper:
    """Wrapper for Bright Data scraping with multi-tier fallback."""

    def __init__(self):
        self.api_key = os.getenv('BRIGHT_DATA_API_TOKEN')
        self.zone = 'mcp_unlocker'

    def scrape_as_markdown(self, url):
        """Tier 1: Direct markdown scraping."""
        print(f"    [Tier 1] scrape_as_markdown: {url}")

        response = fetch(
            'https://api.brightdata.com/request',
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {self.api_key}",
            },
            body=json.dumps({
                'zone': self.zone,
                'url': url,
                'format': 'markdown',
                'country': 'us',
            }),
        )

        if response.ok and response.status == 200:
            content = response.text()
            print(f"    [Tier 1] Got {len(content)} chars")
            return content

        print(f"    [Tier 1] Failed: HTTP {response.status}")
        return None

    def browser_navigate(self, url):
        """Tier 2: Browser automation scraping."""
        print(f"    [Tier 2] browser_navigate: {url}")

        response = fetch(
            'https://api.brightdata.com/request',
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {self.api_key}",
            },
            body=json.dumps({
                'zone': self.zone,
                'url': url,
                'format': 'raw',
                'country': 'us',
                'render': 'browser',
            }),
        )

        if response.ok and response.status == 200:
            content = response.text()
            print(f"    [Tier 2] Got {len(content)} chars")
            return content

        print(f"    [Tier 2] Failed: HTTP {response.status}")
        return None

    def search_engine(self, query, engine='google'):
        """Tier 3: Search engine fallback."""
        print(f"    [Tier 3] search_engine: {query}")

        response = fetch(
            'https://api.brightdata.com/request',
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {self.api_key}",
            },
            body=json.dumps({
                'zone': self.zone,
                'url': f'https://www.google.com/search?q={query}',
                'format': 'markdown',
                'country': 'us',
            }),
        )

        if response.ok and response.status == 200:
            content = response.text()
            print(f"    [Tier 3] Got {len(content)} chars")
            return content

        print(f"    [Tier 3] Failed: HTTP {response.status}")
        return None


def scrape_source_with_fallback(source):
    """
    Multi-tier scraping with fallback logic.
    Returns dict with events, tier_reached, attempts, error info.
    """
    today = date.today()
    max_date = today + timedelta(days=MAX_DAYS_AHEAD)
    domain = extract_domain(source['url'])

    scraper = BrightDataScraper()

    tier_info = {
        'tier_reached': None,
        'attempts': {'t1': 0, 't2': 0, 't3': 0},
        'total_attempts': 0,
        'error': None,
        'raw_content': None,
    }

    # Tier 1: scrape_as_markdown
    for attempt in range(MAX_RETRIES_PER_TIER):
        tier_info['attempts']['t1'] += 1
        tier_info['total_attempts'] += 1
        print(f"  [Tier 1] Attempt {attempt + 1}/{MAX_RETRIES_PER_TIER}")

        content = scraper.scrape_as_markdown(source['url'])

        if content and len(content) > MIN_CONTENT_LENGTH:
            print(f"    [Tier 1] Content valid ({len(content)} chars)")

            events = extract_events_llm(content, source)
            if events:
                tier_info['tier_reached'] = 1
                return {'events': events, **tier_info}

        if attempt < MAX_RETRIES_PER_TIER - 1:
            print(f"    [Tier 1] Retrying in {RETRY_DELAY}s...")
            wait_and_retry()

    # Tier 2: browser_navigate
    for attempt in range(MAX_RETRIES_PER_TIER):
        tier_info['attempts']['t2'] += 1
        tier_info['total_attempts'] += 1
        print(f"  [Tier 2] Attempt {attempt + 1}/{MAX_RETRIES_PER_TIER}")

        content = scraper.browser_navigate(source['url'])

        if content and len(content) > MIN_CONTENT_LENGTH:
            print(f"    [Tier 2] Content valid ({len(content)} chars)")

            events = extract_events_llm(content, source)
            if events:
                tier_info['tier_reached'] = 2
                return {'events': events, **tier_info}

        if attempt < MAX_RETRIES_PER_TIER - 1:
            print(f"    [Tier 2] Retrying in {RETRY_DELAY}s...")
            wait_and_retry()

    # Tier 3: search_engine
    for attempt in range(MAX_RETRIES_PER_TIER):
        tier_info['attempts']['t3'] += 1
        tier_info['total_attempts'] += 1
        print(f"  [Tier 3] Attempt {attempt + 1}/{MAX_RETRIES_PER_TIER}")

        search_query = f"site:{domain} events"
        search_content = scraper.search_engine(search_query)

        if search_content and len(search_content) > MIN_CONTENT_LENGTH:
            print(f"    [Tier 3] Search results valid ({len(search_content)} chars)")
            tier_info['raw_content'] = search_content

            events = extract_events_llm(search_content, source)
            if events:
                tier_info['tier_reached'] = 3
                return {'events': events, **tier_info}

        if attempt < MAX_RETRIES_PER_TIER - 1:
            print(f"    [Tier 3] Retrying in {RETRY_DELAY}s...")
            wait_and_retry()

    # All tiers exhausted
    tier_info['tier_reached'] = 'exhausted'
    tier_info['error'] = f"All tiers failed after {tier_info['total_attempts']} total attempts"
    print(f"  [ERROR] {tier_info['error']}")

    return {'events': [], **tier_info}


def log_debug(source_name, tier_info, prompt, content, events):
    """Log debug information with tier details."""
    if not DEBUG_MODE:
        return

    DEBUG_DIR.mkdir(exist_ok=True)
    debug_file = DEBUG_DIR / f"scrape_debug_{datetime.now().strftime('%Y%m%d')}.log"

    with open(debug_file, 'a') as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"SOURCE: {source_name}\n")
        f.write(f"TIME: {datetime.now().isoformat()}\n")
        f.write(f"{'='*60}\n\n")

        f.write(f"--- TIER ATTEMPTS ---\n")
        f.write(f"Tier 1 (scrape_as_markdown): {tier_info['attempts']['t1']} attempts\n")
        f.write(f"Tier 2 (browser_navigate): {tier_info['attempts']['t2']} attempts\n")
        f.write(f"Tier 3 (search_engine): {tier_info['attempts']['t3']} attempts\n")
        f.write(f"Tier Reached: {tier_info['tier_reached']}\n")
        f.write(f"Total Attempts: {tier_info['total_attempts']}\n")

        if tier_info['error']:
            f.write(f"\n--- ERROR ---\n")
            f.write(f"{tier_info['error']}\n")

        f.write(f"\n--- PROMPT ---\n")
        f.write(prompt if prompt else "(using tier scraping without agent prompt)")

        f.write(f"\n\n--- RAW CONTENT ({len(str(content)) if content else 0} chars) ---\n")
        f.write(str(content)[:5000] if content else "No content")

        f.write(f"\n\n--- PARSED EVENTS ({len(events)} found) ---\n")
        json.dump(events, f, indent=2)

        f.write("\n\n")

    print(f"  [DEBUG] Logs appended to {debug_file}")


def scrape_source_agent(source):
    """Original agent-based scraping for comparison."""
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
                api_key=os.getenv('BRIGHT_DATA_API_TOKEN'),
                enable_scrape_markdown=True,
                enable_screenshot=True,
                enable_search_engine=True,
                enable_web_data_feed=False,
                web_unlocker_zone='mcp_unlocker',
            )
        ],
        debug_mode=False,
    )

    critical_rules = """## CRITICAL RULES:
1. Use multi-tool strategy - try multiple approaches if first fails
2. If scrape_as_markdown returns empty content, try browser_navigate
3. If browser also fails, use search_engine with query "site:{domain} events"
4. Extract events from whatever content you get
5. Today's date is {today_str}

## Error Reporting:
If all methods fail, return:
{{
    "source_url": "{url}",
    "data": [],
    "error": "EXPLANATION of what failed"
}}
"""

    if TEST_MODE:
        critical_rules = """## CRITICAL RULES (Test Mode):
1. ONLY scrape page 1 - do not scrape any additional pages
2. Try multiple approaches: scrape_as_markdown first, then browser, then search
3. Today's date is {today_str}

## Error Reporting:
If all methods fail, return:
{{
    "source_url": "{url}",
    "data": [],
    "error": "EXPLANATION"
}}
"""

    prompt = f"""You are a web scraping agent. Your task is to scrape free events from: {source['url']}

{critical_rules}

## Output Format:
Return a JSON object with:
{{
    "source_url": "{source['url']}",
    "scraped_at": "{today_str}",
    "date_range": "{today_str} to {max_date_str}",
    "data": [
        {{
            "title": "...",
            "url": "REQUIRED - URL to individual event page. If not found, use {source['url']}?event={{title_hash}}",
            "date": "YYYY-MM-DD",
            "time": "HH:MM:SS or null",
            "location": "...",
            "city": "...",
            "description": "..."
        }}
    ]
}}

Now scrape {source['url']}{" page by page. IMPORTANT: Stop pagination when you encounter events that are 3 or more days from today - do not scrape additional pages beyond that point." if not TEST_MODE else " - ONLY scrape page 1."}"""

    try:
        response = agent.run(prompt)
        content = str(response.content)

        if DEBUG_MODE:
            print(f"  [DEBUG] Agent response: {len(content)} chars")

        events = parse_events_from_response(content)
        filtered = filter_events_by_date_range(events, today, max_date)

        tier_info = {
            'tier_reached': 'agent',
            'attempts': {'t1': 1, 't2': 0, 't3': 0},
            'total_attempts': 1,
            'error': None,
            'raw_content': content,
        }

        log_debug(source['name'], tier_info, prompt, content, filtered)

        return filtered
    except Exception as e:
        print(f"  Agent error: {e}")
        return []


def main():
    print(f"Starting scrape at {datetime.now().isoformat()}")

    # Filter sources if --source flag is provided
    if SOURCE_FILTER:
        sources_to_scrape = [s for s in SOURCES if s['name'] in SOURCE_FILTER]
        print(f"Source filter: {SOURCE_FILTER}")
        print(f"Sources to scrape: {len(sources_to_scrape)} ({', '.join([s['name'] for s in sources_to_scrape])})")
    else:
        sources_to_scrape = SOURCES
        print(f"Sources to scrape: {len(sources_to_scrape)} (all)")

    print(f"Test mode: {TEST_MODE}, Debug mode: {DEBUG_MODE}")

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

    for source in sources_to_scrape:
        print(f"\n=== Scraping: {source['name']} ===")
        print(f"    URL: {source['url']}")

        try:
            # Try agent-based scraping first
            events = scrape_source_agent(source)

            if len(events) == 0:
                print(f"    [INFO] Agent returned 0 events, trying tier fallback...")
                result = scrape_source_with_fallback(source)
                events = result['events']

                tier_info = {
                    'tier_reached': result['tier_reached'],
                    'attempts': result['attempts'],
                    'total_attempts': result['total_attempts'],
                    'error': result['error'],
                    'raw_content': result.get('raw_content'),
                }
                log_debug(source['name'], tier_info, None, result.get('raw_content'), events)

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