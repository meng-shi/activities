#!/usr/bin/env python3
"""Event Detail Extraction Script

Extracts event summaries from event URLs using MiniMax M2.5 agent.

Usage:
    from scripts.get_event_details import enrich_event

enrich_event(event) -> {'event_detail': 'summary text or None'}
"""

import json
import os
import re
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.brightdata import BrightDataTools


def enrich_event(event):
    """Use MiniMax agent to get a summary of the event."""
    source_url = event.get('source_url', '')
    title = event.get('title', '')

    if not source_url:
        return {'event_detail': None}

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
                enable_screenshot=False,
                enable_search_engine=False,
                enable_web_data_feed=False,
                web_unlocker_zone='mcp_unlocker',
            )
        ],
        debug_mode=False,
    )

    user_prompt = f"""Summarize this event in 2-3 sentences. Include what it is, when it happens, and what attendees can expect.

Title: {title}
URL: {source_url}

Important: Write your summary in plain text, 2-3 sentences only."""

    try:
        response = agent.run(user_prompt, max_errors=1)
        content = str(response.content).strip()

        if not content or len(content) < 10:
            return {'event_detail': None}

        if content.startswith('{') and content.endswith('}'):
            try:
                data = json.loads(content)
                event_detail = data.get('event_detail')
                if event_detail and isinstance(event_detail, str) and len(event_detail.strip()) > 0:
                    return {'event_detail': event_detail.strip()}
            except json.JSONDecodeError:
                pass

        summary = extract_summary_from_text(content)
        if summary:
            return {'event_detail': summary}
        return {'event_detail': None}

    except Exception as e:
        print(f"    [Enrichment Error] {e}")
        return {'event_detail': None}


def extract_summary_from_text(content):
    """Extract summary from text content (handles markdown or plain text)."""
    if not content:
        return None

    content = content.strip()

    lines = content.split('\n')
    sentences = []
    in_summary = False
    currentparagraph = []

    for line in lines:
        line = line.strip()
        if not line:
            if currentparagraph:
                text = ' '.join(currentparagraph)
                if len(text) > 20:
                    sentences.append(text)
                currentparagraph = []
            continue

        if line.startswith('#'):
            if 'summary' in line.lower() or 'about' in line.lower():
                in_summary = True
            continue

        line_clean = re.sub(r'^\s*[-*•]\s*', '', line)
        line_clean = re.sub(r'\*\*([^*]+)\*\*', r'\1', line_clean)

        if len(line_clean) > 20:
            currentparagraph.append(line_clean)

    if currentparagraph:
        text = ' '.join(currentparagraph)
        if len(text) > 20:
            sentences.append(text)

    summary = ' '.join(sentences[:2])

    if len(summary) > 200:
        summary = summary[:200].rsplit(' ', 1)[0] + '...'

    return summary if len(summary) > 30 else None


def update_event_in_db(event_id, enrichment_data):
    """Update event with enrichment data in database."""
    import psycopg2

    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()

    event_detail = enrichment_data.get('event_detail')

    cur.execute("""
        UPDATE events
        SET event_detail = %s,
            updated_at = NOW()
        WHERE id = %s
    """, (event_detail, event_id))

    conn.commit()
    cur.close()
    conn.close()


if __name__ == '__main__':
    test_event = {
        'source_url': 'https://aclibrary.bibliocommons.com/events/69cff4f0b6c4ac1fedc9fd23',
        'title': 'Go: The Game'
    }
    print(f"Testing with: {test_event['source_url']}")
    result = enrich_event(test_event)
    print(f"Result: {result}")