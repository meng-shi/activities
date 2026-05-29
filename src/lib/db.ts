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

  if (filters.county) {
    conditions.push(`county = '${filters.county.replace(/'/g, "''")}'`);
  }

  if (filters.category) {
    conditions.push(`category = '${filters.category.replace(/'/g, "''")}'`);
  }

  if (filters.search) {
    const search = filters.search.replace(/'/g, "''");
    conditions.push(`(title ILIKE '%${search}%' OR description ILIKE '%${search}%')`);
  }

  if (filters.price) {
    conditions.push(`price = '${filters.price.replace(/'/g, "''")}'`);
  }

  if (filters.date) {
    const today = new Date().toISOString().split('T')[0];
    switch (filters.date) {
      case 'today':
        conditions.push(`date = '${today}'`);
        break;
      case 'weekend': {
        const d = new Date();
        const dayOfWeek = d.getDay();
        const weekendStart = new Date(d);
        weekendStart.setDate(d.getDate() + (6 - dayOfWeek));
        const weekendEnd = new Date(weekendStart);
        weekendEnd.setDate(weekendStart.getDate() + 1);
        conditions.push(`date >= '${weekendStart.toISOString().split('T')[0]}' AND date <= '${weekendEnd.toISOString().split('T')[0]}'`);
        break;
      }
      case 'week':
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 7);
        conditions.push(`date >= '${today}' AND date <= '${weekEnd.toISOString().split('T')[0]}'`);
        break;
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  let countResult;
  if (conditions.length > 0) {
    countResult = await sql`SELECT COUNT(*) as total FROM events WHERE ${sql.unsafe(whereClause.replace('WHERE ', ''))}` as unknown as [{ total: string }];
  } else {
    countResult = await sql`SELECT COUNT(*) as total FROM events` as unknown as [{ total: string }];
  }

  const total = parseInt(countResult[0]?.total || '0', 10);

  let eventsResult;
  if (conditions.length > 0) {
    eventsResult = await sql`SELECT * FROM events WHERE ${sql.unsafe(whereClause.replace('WHERE ', ''))} ORDER BY date ASC, time ASC LIMIT ${limit} OFFSET ${offset}` as unknown as Event[];
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

const INTEREST_TO_CATEGORY_MAP: Record<string, string[]> = {
  family: ['family', 'children', 'kids'],
  kids: ['family', 'children', 'kids'],
  children: ['family', 'children', 'kids'],
  music: ['music', 'concert'],
  concert: ['music', 'concert'],
  art: ['arts', 'art', 'exhibit'],
  arts: ['arts', 'art', 'exhibit'],
  outdoor: ['outdoors', 'outdoor', 'nature', 'park'],
  outdoors: ['outdoors', 'outdoor', 'nature', 'park'],
  nature: ['outdoors', 'nature', 'park'],
  sports: ['sports', 'fitness', 'exercise'],
  fitness: ['sports', 'fitness', 'exercise'],
  library: ['library', 'books'],
  books: ['library', 'books'],
  community: ['community', 'social'],
  food: ['food', 'drink', 'dining'],
  education: ['education', 'learning', 'workshop'],
  workshop: ['education', 'learning', 'workshop'],
  health: ['health', 'wellness'],
  wellness: ['health', 'wellness'],
};

const COUNTY_ALIASES: Record<string, string> = {
  'east bay': 'alameda',
  'eastbay': 'alameda',
  'oakland': 'alameda',
  'berkeley': 'alameda',
  'fremont': 'alameda',
  'san francisco': 'san_francisco',
  'sf': 'san_francisco',
  'south bay': 'santa_clara',
  'southbay': 'santa_clara',
  'san jose': 'santa_clara',
  'santa clara': 'santa_clara',
  'palo alto': 'santa_clara',
  'mountain view': 'santa_clara',
  'sunnyvale': 'santa_clara',
  'peninsula': 'san_mateo',
  'redwood city': 'san_mateo',
  'menlo park': 'san_mateo',
  'marin': 'marin',
  'sonoma': 'sonoma',
  'napa': 'napa',
  'vallejo': 'solano',
  'fairfield': 'solano',
  'contra costa': 'contra_costa',
  'concord': 'contra_costa',
  'richmond': 'contra_costa',
};

function normalizeCounty(location: string): string | null {
  const lower = location.toLowerCase().trim();
  return COUNTY_ALIASES[lower] || null;
}

export async function searchEventsForPlanning(
  location: string,
  interests: string[],
  date: string,
  startTime?: string,
  endTime?: string
): Promise<Event[]> {
  const sql = getSql();

  const county = normalizeCounty(location);

  const today = new Date().toISOString().split('T')[0];
  let targetDate = today;

  if (date === 'today') {
    targetDate = today;
  } else if (date === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().split('T')[0];
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    targetDate = date;
  }

  const categories: string[] = [];
  for (const interest of interests) {
    const mapped = INTEREST_TO_CATEGORY_MAP[interest.toLowerCase()];
    if (mapped) {
      categories.push(...mapped);
    } else {
      categories.push(interest.toLowerCase());
    }
  }

  let events: Event[] = [];

  if (county && categories.length > 0) {
    const placeholders = categories.map(() => `%`).join('|');
    const result = await sql`
      SELECT * FROM events
      WHERE county = ${county}
        AND date = ${targetDate}
        AND price = 'free'
        AND (
          category ILIKE ANY(${categories.map(c => `%${c}%`)})
          OR title ILIKE ANY(${categories.map(c => `%${c}%`)})
          OR description ILIKE ANY(${categories.map(c => `%${c}%`)})
        )
      ORDER BY time ASC
      LIMIT 30
    `;
    events = result as unknown as Event[];
  } else if (county) {
    const result = await sql`
      SELECT * FROM events
      WHERE county = ${county}
        AND date = ${targetDate}
        AND price = 'free'
      ORDER BY time ASC
      LIMIT 30
    `;
    events = result as unknown as Event[];
  } else if (categories.length > 0) {
    const result = await sql`
      SELECT * FROM events
      WHERE date = ${targetDate}
        AND price = 'free'
        AND (
          category ILIKE ANY(${categories.map(c => `%${c}%`)})
          OR title ILIKE ANY(${categories.map(c => `%${c}%`)})
          OR description ILIKE ANY(${categories.map(c => `%${c}%`)})
        )
      ORDER BY time ASC
      LIMIT 30
    `;
    events = result as unknown as Event[];
  } else {
    const result = await sql`
      SELECT * FROM events
      WHERE date = ${targetDate}
        AND price = 'free'
      ORDER BY time ASC
      LIMIT 30
    `;
    events = result as unknown as Event[];
  }

  let filteredEvents = events;
  if (startTime && endTime) {
    filteredEvents = events.filter(event => {
      if (!event.time) return true;
      return event.time >= startTime && event.time <= endTime;
    });
  }

  return filteredEvents;
}
