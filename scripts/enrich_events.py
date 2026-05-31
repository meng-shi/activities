#!/usr/bin/env python3
"""
Event Enrichment Orchestrator

Fetches events from database and enriches them with event summaries.

Usage:
    python3 scripts/enrich_events.py --source=aclibrary,funcheap      # specific sources
    python3 scripts/enrich_events.py --all                             # all events
    python3 scripts/enrich_events.py --limit=50                       # first 50 events
    python3 scripts/enrich_events.py --source=visitmarin --dry-run    # preview only
    python3 scripts/enrich_events.py --first-enrichment-only         # only events with NULL county

Flags:
    --source=<name1,name2>  : comma-separated source names (default: all)
    --all                   : enrich all events
    --limit=N               : process maximum N events
    --dry-run               : preview what would be enriched without writing to DB
    --first-enrichment-only : only enrich events where county IS NULL
"""

import json
import os
import sys
import time
from datetime import datetime
from dotenv import load_dotenv

# Add project root to path so we can import scripts modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(dotenv_path='.env.local')

# Parse arguments
SOURCE_FILTER = None
LIMIT = None
DRY_RUN = '--dry-run' in sys.argv
PROCESS_ALL = '--all' in sys.argv
FIRST_ENRICHMENT_ONLY = '--first-enrichment-only' in sys.argv

for arg in sys.argv:
    if arg.startswith('--source='):
        source_list = arg.split('=', 1)[1]
        SOURCE_FILTER = [s.strip() for s in source_list.split(',') if s.strip()]
    elif arg.startswith('--limit='):
        LIMIT = int(arg.split('=', 1)[1])

import psycopg2
from scripts.get_event_details import enrich_event, update_event_in_db


def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))


def fetch_events_to_enrich():
    """Fetch events that need enrichment based on filters."""
    conn = get_db_connection()
    cur = conn.cursor()

    where_clauses = []
    params = []

    if SOURCE_FILTER:
        placeholders = ','.join(['%s'] * len(SOURCE_FILTER))
        where_clauses.append(f"source_name IN ({placeholders})")
        params.extend(SOURCE_FILTER)

    if FIRST_ENRICHMENT_ONLY:
        where_clauses.append("(county IS NULL OR event_detail IS NULL)")

    if where_clauses:
        where_sql = 'WHERE ' + ' AND '.join(where_clauses)
    else:
        where_sql = ''

    query = f"""
        SELECT id, source_url, title, location, address, city, county, source_name
        FROM events
        {where_sql}
        ORDER BY source_name, date
    """

    if LIMIT:
        query += f" LIMIT {LIMIT}"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    events = []
    for row in rows:
        events.append({
            'id': row[0],
            'source_url': row[1],
            'title': row[2],
            'location': row[3] or '',
            'address': row[4] or '',
            'city': row[5] or '',
            'county': row[6] or '',
            'source_name': row[7],
        })

    return events


def main():
    print(f"Starting event enrichment at {datetime.now().isoformat()}")

    if DRY_RUN:
        print("[DRY RUN MODE] - No changes will be written to database")

    filter_parts = []
    if SOURCE_FILTER:
        filter_parts.append(f"sources: {', '.join(SOURCE_FILTER)}")
    elif PROCESS_ALL:
        filter_parts.append("all events")
    elif LIMIT:
        filter_parts.append(f"first {LIMIT} events")
    else:
        filter_parts.append("all events (no limit)")

    if FIRST_ENRICHMENT_ONLY:
        filter_parts.append("county IS NULL")

    filter_desc = ", ".join(filter_parts) if filter_parts else "all events"

    print(f"Filter: {filter_desc}")

    events = fetch_events_to_enrich()
    print(f"Found {len(events)} events to enrich")

    if len(events) == 0:
        print("No events to enrich")
        return

    success_count = 0
    error_count = 0

    for i, event in enumerate(events):
        print(f"\n[{i+1}/{len(events)}] Enriching: {event['title'][:50]}...")
        print(f"    URL: {event['source_url']}")

        enrichment = enrich_event(event)

        event_detail = enrichment.get('event_detail')
        city = enrichment.get('city')
        county = enrichment.get('county')
        items = enrichment.get('items', [])

        if event_detail:
            if DRY_RUN:
                print(f"    [DRY RUN] Would set event_detail:")
                print(f"      {event_detail[:100]}...")
                if city:
                    print(f"    [DRY RUN] Would set city: {city}")
                if county:
                    print(f"    [DRY RUN] Would set county: {county}")
                if items:
                    print(f"    [DRY RUN] Would set items: {[i['name'] for i in items]}")
                success_count += 1
            else:
                update_event_in_db(event['id'], enrichment)
                print(f"    [OK] event_detail: {event_detail[:50]}...")
                if city:
                    print(f"    [OK] city: {city}, county: {county}")
                if items:
                    print(f"    [OK] items: {[i['name'] for i in items]}")
                success_count += 1
        else:
            print(f"    [SKIP] No enrichment data found")
            error_count += 1

        time.sleep(1)

    print(f"\n=== Enrichment complete ===")
    print(f"Successful: {success_count}")
    print(f"Failed/No data: {error_count}")
    if DRY_RUN:
        print("(No changes were written - this was a dry run)")


if __name__ == '__main__':
    main()