#!/usr/bin/env python3
"""Event Detail Extraction Script

Extracts event summaries, location, and suggested items from event URLs using a single MiniMax M2.5 agent call.

Usage:
    from scripts.get_event_details import enrich_event

enrich_event(event) -> {
    'event_detail': 'summary text or None',
    'city': 'city name or None',
    'county': 'county name or None',
    'items': [{'name': 'item name', 'link': 'amazon search link'}] or []
}
"""

import json
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.brightdata import BrightDataTools

AGENT = None

def get_agent():
    """Get or create the MiniMax agent (singleton)."""
    global AGENT
    if AGENT is None:
        AGENT = Agent(
            model=OpenAIChat(
                id='MiniMax-M2.7',
                api_key=os.getenv('MINIMAX_API_KEY'),
                base_url='https://api.minimax.io/v1',
            ),
            tools=[
                BrightDataTools(
                    api_key=os.getenv('BRIGHT_DATA_API_TOKEN'),
                    enable_scrape_markdown=True,
                    enable_screenshot=False,
                    enable_search_engine=False,
                    enable_web_data_feed=False,
                    web_unlocker_zone='mcp_unlocker',
                )
            ],
            debug_mode=False,
        )
    return AGENT


def enrich_event(event):
    """Use MiniMax agent to extract summary, location, and suggested items from event.

    Single LLM call extracts all fields efficiently.

    Returns:
        dict with event_detail, city, county, items
    """
    source_url = event.get('source_url', '')
    title = event.get('title', '')

    if not source_url:
        return {'event_detail': None, 'city': None, 'county': 'san_francisco', 'items': []}

    agent = get_agent()

    user_prompt = f"""You are an event enrichment assistant. Your goals are:

1. EXTRACT the city and county from the event webpage
2. SUMMARIZE the event in no more than 2000 characters
3. INFER what inexpensive items a person should bring to have a good experience at this event

Title: {title}
URL: {source_url}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "summary": "Comprehensive event summary up to 2000 chars. Include: what the event is, when it happens (date/time/repeating schedule), where it takes place (specific venue/branch), and what attendees can do/expect. Write in plain text only.",
  "city": "The specific city or neighborhood where this event takes place (e.g., 'San Francisco', 'Oakland', 'Berkeley'). Return null if cannot determine from the page.",
  "county": "One of: san_francisco, alameda, santa_clara, san_mateo, contra_costa, marin, sonoma, napa, solano, all. Default to san_francisco if unclear or cannot determine.",
  "items": [
    {{
      "name": "Name of an inexpensive item that would help someone have a better experience at this event (e.g., sunscreen for outdoor events, notebook for learning events, blanket for park picnics, water bottle for hiking). Only include items that are genuinely useful for this specific event type.",
      "link": "https://www.google.com/search?q=<item_name>+amazon+best+seller"
    }}
  ]
}}

Rules:
- summary: REQUIRED, 50-2000 characters, plain text only, no markdown
- city: Extract from webpage content. Return null if page doesn't clearly state a location
- county: REQUIRED, must be one of the valid values. Default to san_francisco if the page doesn't clearly indicate another county
- items: 0-3 items that would genuinely improve someone's experience at this event. Consider the event type and activities involved to infer what would be useful. Items should be inexpensive and commonly available.
- link: Replace spaces in item name with plus signs (+). Format: https://www.google.com/search?q=<item_name>+amazon+best+seller"""

    try:
        response = agent.run(user_prompt, max_errors=1)
        content = str(response.content).strip()

        if not content or len(content) < 50:
            return {'event_detail': None, 'city': None, 'county': 'san_francisco', 'items': []}

        if content.startswith('{') and content.endswith('}'):
            try:
                data = json.loads(content)

                summary = data.get('summary', '')
                if not isinstance(summary, str) or len(summary.strip()) < 50:
                    return {'event_detail': None, 'city': None, 'county': 'san_francisco', 'items': []}

                summary = summary.strip()[:2000]

                city = data.get('city')
                if city and isinstance(city, str):
                    city = city.strip()
                    if city == '' or city.lower() == 'null':
                        city = None
                else:
                    city = None

                county = data.get('county', 'san_francisco')
                valid_counties = ['san_francisco', 'alameda', 'santa_clara', 'san_mateo',
                                  'contra_costa', 'marin', 'sonoma', 'napa', 'solano', 'all']
                if county not in valid_counties:
                    county = 'san_francisco'

                items = []
                raw_items = data.get('items', [])
                if isinstance(raw_items, list):
                    for item in raw_items[:3]:
                        if isinstance(item, dict) and item.get('name') and item.get('link'):
                            name = item['name'].strip()
                            link = item['link'].strip()
                            if name and link:
                                items.append({'name': name, 'link': link})

                return {
                    'event_detail': summary,
                    'city': city,
                    'county': county,
                    'items': items
                }

            except json.JSONDecodeError:
                pass

        return {'event_detail': None, 'city': None, 'county': 'san_francisco', 'items': []}

    except Exception as e:
        print(f"    [Enrichment Error] {e}")
        return {'event_detail': None, 'city': None, 'county': 'san_francisco', 'items': []}


def update_event_in_db(event_id, enrichment_data):
    """Update event with enrichment data in database.

    Args:
        event_id: UUID of the event
        enrichment_data: dict with event_detail, city, county, items
    """
    import psycopg2

    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()

    event_detail = enrichment_data.get('event_detail')
    city = enrichment_data.get('city')
    county = enrichment_data.get('county', 'san_francisco')
    items = enrichment_data.get('items', [])

    items_json = json.dumps(items) if items else None

    cur.execute("""
        UPDATE events
        SET event_detail = %s,
            city = %s,
            county = %s,
            items = %s,
            updated_at = NOW()
        WHERE id = %s
    """, (event_detail, city, county, items_json, event_id))

    conn.commit()
    cur.close()
    conn.close()


if __name__ == '__main__':
    test_event = {
        'source_url': 'https://sfpl.org/events/2026/06/03/storytime-toddlers',
        'title': 'Storytime: For Toddlers'
    }
    print(f"Testing with: {test_event['source_url']}")
    result = enrich_event(test_event)
    print(f"Summary length: {len(result.get('event_detail', '') or '')}")
    print(f"City: {result.get('city')}")
    print(f"County: {result.get('county')}")
    print(f"Items: {result.get('items')}")