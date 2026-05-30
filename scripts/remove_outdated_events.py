#!/usr/bin/env python3
"""Remove outdated events from database.

Deletes events with dates older than today (yesterday and before) plus events with NULL dates.

Usage:
    python3 scripts/remove_outdated_events.py         # delete outdated events
    python3 scripts/remove_outdated_events.py --dry-run  # preview only
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv(dotenv_path='.env.local')

import psycopg2


def remove_outdated_events(dry_run=False):
    """Remove events with date < today or date IS NULL."""
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()

    cur.execute("""
        SELECT COUNT(*) FROM events
        WHERE date < CURRENT_DATE OR date IS NULL
    """)
    count = cur.fetchone()[0]

    if count == 0:
        print("No outdated events found.")
        conn.close()
        return 0

    if dry_run:
        print(f"[DRY RUN] Would delete {count} outdated events:")
        cur.execute("""
            SELECT date, COUNT(*) as cnt
            FROM events
            WHERE date < CURRENT_DATE OR date IS NULL
            GROUP BY date
            ORDER BY date DESC
        """)
        for row in cur.fetchall():
            date_str = row[0] if row[0] else "NULL"
            print(f"  {date_str}: {row[1]} events")
        conn.close()
        return count

    cur.execute("""
        DELETE FROM events
        WHERE date < CURRENT_DATE OR date IS NULL
    """)
    deleted = cur.rowcount
    conn.commit()
    conn.close()

    print(f"Deleted {deleted} outdated events.")
    return deleted


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    remove_outdated_events(dry_run=dry_run)