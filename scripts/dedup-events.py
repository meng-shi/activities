#!/usr/bin/env python3
"""
Event Deduplication Script

Uses MiniMax M2.5 LLM to find duplicate events in the database and optionally remove them.
Duplicate events may have slightly different descriptions but refer to the same event.

Usage:
    python3 scripts/dedup-events.py           # Print duplicates only (dry run)
    python3 scripts/dedup-events.py --execute  # Actually remove duplicates
"""

import json
import os
import re
import sys
from datetime import date, datetime

from dotenv import load_dotenv
import psycopg2

load_dotenv(dotenv_path='.env.local')

EXECUTE_MODE = '--execute' in sys.argv
DRY_RUN = not EXECUTE_MODE


def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))


def fetch_json(url, method='GET', headers=None, body=None):
    """Fetch and parse JSON."""
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
            text = response.read().decode('utf-8')
            return json.loads(text)
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}', 'text': e.read().decode('utf-8')}
    except Exception as e:
        return {'error': str(e)}


def call_llm(prompt, max_tokens=4000):
    """Call MiniMax-M2.5 LLM for deduplication analysis."""
    response = fetch_json(
        'https://api.minimax.io/v1/text/chatcompletion_v2',
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {os.getenv('MINIMAX_API_KEY')}",
        },
        body=json.dumps({
            'model': 'MiniMax-M2.5',
            'messages': [
                {'role': 'system', 'content': 'You analyze events to find duplicates. Return ONLY valid JSON with fields: is_duplicate (bool), canonical_event (object with id and reason), reasoning (string).'},
                {'role': 'user', 'content': prompt},
            ],
            'max_tokens': max_tokens,
            'temperature': 0.1,
            'reasoning_split': False,
        }),
    )
    return response.get('choices', [{}])[0].get('message', {}).get('content', '')


def get_all_events(limit=500):
    """Fetch all events from database."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, description, date, time, location, address, city, county,
               price, category, source_url, source_name
        FROM events
        WHERE date >= CURRENT_DATE
        ORDER BY date, title
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    conn.close()

    events = []
    for row in rows:
        events.append({
            'id': str(row[0]),
            'title': row[1] or '',
            'description': row[2] or '',
            'date': str(row[3]) if row[3] else '',
            'time': str(row[4]) if row[4] else '',
            'location': row[5] or '',
            'address': row[6] or '',
            'city': row[7] or '',
            'county': row[8] or '',
            'price': row[9] or 'free',
            'category': row[10] or '',
            'source_url': row[11] or '',
            'source_name': row[12] or '',
        })
    return events


def find_candidate_duplicates(events):
    """Group events by title similarity for LLM review."""
    from difflib import SequenceMatcher

    def similar(a, b):
        return SequenceMatcher(None, a.lower(), b.lower()).ratio()

    groups = []
    processed = set()

    for i, event in enumerate(events):
        if event['id'] in processed:
            continue

        group = [event]
        for j, other in enumerate(events[i+1:], i+1):
            if other['id'] in processed:
                continue
            title_sim = similar(event['title'], other['title'])
            same_day = event['date'] == other['date']
            same_county = event['county'] == other['county']

            if title_sim > 0.75 and same_day and same_county:
                group.append(other)
                processed.add(other['id'])

        if len(group) > 1:
            processed.add(event['id'])
            groups.append(group)

    return groups


def analyze_duplicates_with_llm(groups):
    """Send candidate duplicate groups to LLM for verification."""
    results = []

    for i, group in enumerate(groups):
        print(f"\nAnalyzing group {i+1}/{len(groups)} ({len(group)} events)...")

        prompt = f"""Analyze these events for duplicates:

{json.dumps(group, indent=2)}

Determine if these are duplicates of the same event (just from different sources).
Consider: same title, same date, same location, similar description.
Pick the most official URL (prefer: official org website > event listing site > calendar aggregator).

Return JSON with your analysis."""

        response = call_llm(prompt)

        try:
            if '```json' in response:
                json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response)
                if json_match:
                    data = json.loads(json_match.group(1))
                else:
                    data = json.loads(response)
            else:
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start != -1 and json_end > json_start:
                    data = json.loads(response[json_start:json_end])
                else:
                    data = {'error': 'Could not parse LLM response', 'raw': response}
        except json.JSONDecodeError as e:
            data = {'error': f'JSON parse error: {e}', 'raw': response[:500]}

        results.append({'group': group, 'analysis': data})
        print(f"  -> {data.get('reasoning', data.get('error', 'unknown'))[:100]}...")

    return results


def print_duplicate_report(results):
    """Print a detailed report of found duplicates."""
    print("\n" + "="*80)
    print("DUPLICATE EVENT ANALYSIS REPORT")
    print("="*80)

    if DRY_RUN:
        print("\n*** DRY RUN MODE - No changes will be made. Use --execute to remove duplicates ***\n")
    else:
        print("\n*** EXECUTE MODE - Duplicates WILL be removed ***\n")

    duplicate_count = 0
    total_removed = 0

    for i, result in enumerate(results):
        group = result['group']
        analysis = result['analysis']

        if analysis.get('is_duplicate', False):
            duplicate_count += 1
            canonical = analysis.get('canonical_event', {})
            canonical_id = canonical.get('id', group[0]['id'])

            print(f"\n{'='*80}")
            print(f"DUPLICATE GROUP #{duplicate_count}")
            print(f"{'='*80}")
            print(f"Reasoning: {analysis.get('reasoning', 'N/A')}")
            print(f"\nCanonical event (will be kept): {canonical.get('reason', 'N/A')}")
            print(f"\nEvents in this group:")

            for j, event in enumerate(group):
                marker = " [KEPT]" if event['id'] == canonical_id else " [REMOVE]"
                print(f"  {j+1}.{marker}")
                print(f"     Title: {event['title'][:60]}...")
                print(f"     Date: {event['date']} | Location: {event['location']}")
                print(f"     Source: {event['source_name']}")
                print(f"     URL: {event['source_url']}")
                print()

            if DRY_RUN:
                total_removed += len(group) - 1

    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total groups analyzed: {len(results)}")
    print(f"Duplicate groups found: {duplicate_count}")

    if DRY_RUN:
        print(f"Events that WOULD be removed: {total_removed}")
        print(f"\nTo remove these duplicates, run: python3 scripts/dedup-events.py --execute")
    else:
        print(f"Events removed: {total_removed}")

    return duplicate_count, total_removed


def remove_duplicates(results):
    """Remove duplicate events, keeping the canonical one."""
    conn = get_db_connection()
    cur = conn.cursor()

    removed_count = 0

    for result in results:
        analysis = result['analysis']
        group = result['group']

        if not analysis.get('is_duplicate', False):
            continue

        canonical = analysis.get('canonical_event', {})
        canonical_id = canonical.get('id', group[0]['id'])

        for event in group:
            if event['id'] != canonical_id:
                cur.execute("DELETE FROM events WHERE id = %s", (event['id'],))
                removed_count += 1
                print(f"Removed: {event['title'][:50]}... (kept: {canonical_id})")

    conn.commit()
    conn.close()
    return removed_count


def main():
    print("="*80)
    print("SF BAY AREA EVENTS - DEDUPLICATION SCRIPT")
    print("="*80)

    if DRY_RUN:
        print("\n>>> DRY RUN MODE - Showing duplicates without removing <<<")
        print(">>> Run with --execute flag to actually remove duplicates <<<\n")
    else:
        print("\n>>> EXECUTE MODE - Will remove duplicate events <<<\n")

    print("Fetching events from database...")
    events = get_all_events(limit=500)
    print(f"Loaded {len(events)} events")

    if len(events) == 0:
        print("No events found in database.")
        return

    print("\nFinding candidate duplicate groups (title similarity + same date + same county)...")
    groups = find_candidate_duplicates(events)
    print(f"Found {len(groups)} candidate duplicate groups")

    if len(groups) == 0:
        print("\nNo potential duplicates found based on initial criteria.")
        return

    print("\nAnalyzing groups with LLM to verify duplicates...")
    results = analyze_duplicates_with_llm(groups)

    duplicate_count, remove_count = print_duplicate_report(results)

    if not DRY_RUN and duplicate_count > 0:
        print("\nRemoving duplicates...")
        removed = remove_duplicates(results)
        print(f"\nDone! Removed {removed} duplicate events.")

    print("\n" + "="*80)


if __name__ == '__main__':
    main()