import { neon } from '@neondatabase/serverless';
import { Event, EventFilters, PaginatedResponse } from './types';

let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!_sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _sql = neon(connectionString);
  }
  return _sql;
}

export async function getEvents(
  filters: EventFilters = {},
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<Event>> {
  const sql = getSql();
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (filters.county) {
    conditions.push(`county = $${paramIndex++}`);
    params.push(filters.county);
  }

  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.search) {
    conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.price) {
    conditions.push(`price = $${paramIndex++}`);
    params.push(filters.price);
  }

  if (filters.date) {
    const today = new Date().toISOString().split('T')[0];
    switch (filters.date) {
      case 'today':
        conditions.push(`date = $${paramIndex++}`);
        params.push(today);
        break;
      case 'weekend': {
        const d = new Date();
        const dayOfWeek = d.getDay();
        const weekendStart = new Date(d);
        weekendStart.setDate(d.getDate() + (6 - dayOfWeek));
        const weekendEnd = new Date(weekendStart);
        weekendEnd.setDate(weekendStart.getDate() + 1);
        conditions.push(`date >= $${paramIndex++} AND date <= $${paramIndex++}`);
        params.push(weekendStart.toISOString().split('T')[0], weekendEnd.toISOString().split('T')[0]);
        break;
      }
      case 'week':
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 7);
        conditions.push(`date >= $${paramIndex++} AND date <= $${paramIndex++}`);
        params.push(today, weekEnd.toISOString().split('T')[0]);
        break;
      default:
        conditions.push(`date = $${paramIndex++}`);
        params.push(filters.date);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  let countResult;
  if (conditions.length > 0) {
    countResult = await sql`SELECT COUNT(*) as total FROM events WHERE ${sql.unsafe(conditions.join(' AND '))}` as unknown as [{ total: string }];
  } else {
    countResult = await sql`SELECT COUNT(*) as total FROM events` as unknown as [{ total: string }];
  }

  const total = parseInt(countResult[0]?.total || '0', 10);

  let eventsResult;
  if (conditions.length > 0) {
    eventsResult = await sql`SELECT * FROM events WHERE ${sql.unsafe(conditions.join(' AND '))} ORDER BY date ASC, time ASC LIMIT ${limit} OFFSET ${offset}` as unknown as Event[];
  } else {
    eventsResult = await sql`SELECT * FROM events ORDER BY date ASC, time ASC LIMIT ${limit} OFFSET ${offset}` as unknown as Event[];
  }

  return {
    data: eventsResult,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getEventById(id: string): Promise<Event | null> {
  const sql = getSql();
  const result = await sql`SELECT * FROM events WHERE id = ${id}` as unknown as Event[];
  return result[0] || null;
}

export async function searchEventsForChat(
  query: string,
  filters: EventFilters = {}
): Promise<Event[]> {
  const sql = getSql();

  if (filters.county && filters.category) {
    const events = await sql`
      SELECT * FROM events
      WHERE county = ${filters.county}
        AND category = ${filters.category}
        AND price = 'free'
        AND date >= CURRENT_DATE
      ORDER BY date ASC, time ASC
      LIMIT 20
    `;
    return events as unknown as Event[];
  }

  if (filters.county) {
    const events = await sql`
      SELECT * FROM events
      WHERE county = ${filters.county}
        AND price = 'free'
        AND date >= CURRENT_DATE
      ORDER BY date ASC, time ASC
      LIMIT 20
    `;
    return events as unknown as Event[];
  }

  if (filters.category) {
    const events = await sql`
      SELECT * FROM events
      WHERE category = ${filters.category}
        AND price = 'free'
        AND date >= CURRENT_DATE
      ORDER BY date ASC, time ASC
      LIMIT 20
    `;
    return events as unknown as Event[];
  }

  const events = await sql`
    SELECT * FROM events
    WHERE price = 'free'
      AND date >= CURRENT_DATE
    ORDER BY date ASC, time ASC
    LIMIT 20
  `;
  return events as unknown as Event[];
}

export async function upsertEvent(event: Partial<Event> & { source_url: string; source_name: string }): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO events (
      title, description, date, end_date, time, location, address,
      city, county, latitude, longitude, price, category,
      source_url, source_name
    ) VALUES (
      ${event.title || 'Untitled Event'}, ${event.description || null}, ${event.date || new Date().toISOString().split('T')[0]},
      ${event.end_date || null}, ${event.time || null}, ${event.location || null},
      ${event.address || null}, ${event.city || null}, ${event.county || 'san_francisco'},
      ${event.latitude || null}, ${event.longitude || null}, ${event.price || 'free'},
      ${event.category || null}, ${event.source_url}, ${event.source_name}
    )
    ON CONFLICT (source_url) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      date = EXCLUDED.date,
      end_date = EXCLUDED.end_date,
      time = EXCLUDED.time,
      location = EXCLUDED.location,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      updated_at = NOW(),
      last_scraped_at = NOW()
  `;
}

export async function deleteExpiredEvents(hoursOld: number = 24): Promise<number> {
  const sql = getSql();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hoursOld);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const result = await sql`DELETE FROM events WHERE date < ${cutoffDate}` as unknown as { count?: number };
  return result.count || 0;
}

export async function getEventCount(): Promise<number> {
  const sql = getSql();
  const result = await sql`SELECT COUNT(*) as count FROM events` as unknown as [{ count: string }];
  return parseInt(result[0]?.count || '0', 10);
}

export async function logScrapeStart(): Promise<number> {
  try {
    const sql = getSql();
    const result = await sql`
      INSERT INTO scrape_logs (status) VALUES ('running') RETURNING id
    ` as unknown as Array<{ id: number }>;
    return result[0]?.id || 0;
  } catch {
    return 0;
  }
}

export async function logScrapeComplete(
  id: number,
  sourcesUpdated: number,
  eventsAdded: number,
  eventsRemoved: number,
  errors: string
): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      UPDATE scrape_logs
      SET completed_at = NOW(),
          sources_updated = ${sourcesUpdated},
          events_added = ${eventsAdded},
          events_removed = ${eventsRemoved},
          errors = ${errors || null},
          status = 'completed'
      WHERE id = ${id}
    `;
  } catch {
    console.log('Could not log scrape completion');
  }
}
