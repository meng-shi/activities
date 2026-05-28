import { EventSource, ParsedEvent } from './types';

export const SOURCES: EventSource[] = [
  { name: 'sfpl', url: 'https://sfpl.org/events', county: 'san_francisco', category: 'library' },
  { name: 'sf_recpark', url: 'https://sfrecpark.org/Calendar.aspx', county: 'san_francisco', category: 'outdoors' },
  { name: 'funcheap', url: 'https://sf.funcheap.com', county: 'all', category: 'community' },
  { name: 'sccld', url: 'https://sccld.org', county: 'santa_clara', category: 'library' },
  { name: 'sjpl', url: 'https://sjpl.org', county: 'santa_clara', category: 'library' },
  { name: 'oaklandlibrary', url: 'https://oaklandlibrary.org', county: 'alameda', category: 'library' },
  { name: 'berkeleypl', url: 'https://berkeleypubliclibrary.org', county: 'alameda', category: 'library' },
  { name: 'aclibrary', url: 'https://aclibrary.org', county: 'alameda', category: 'library' },
  { name: 'ccclib', url: 'https://ccclib.org', county: 'contra_costa', category: 'library' },
  { name: 'ebparks', url: 'https://ebparks.org', county: 'alameda', category: 'outdoors' },
  { name: 'marinlib', url: 'https://marinlibrary.org', county: 'marin', category: 'library' },
  { name: 'sonomalib', url: 'https://sonomalibrary.org', county: 'sonoma', category: 'library' },
  { name: 'solanolib', url: 'https://solanolibrary.com', county: 'solano', category: 'library' },
  { name: 'napalib', url: 'https://napalibrary.org', county: 'napa', category: 'library' },
  { name: 'smcl', url: 'https://smcl.org', county: 'san_mateo', category: 'library' },
  { name: 'dothebay', url: 'https://dothebay.com/free', county: 'all', category: 'community' },
  { name: 'eventbrite', url: 'https://www.eventbrite.com/d/ca--san-francisco/free--events', county: 'all', category: 'community' },
  { name: '19hz', url: 'https://19hz.info', county: 'all', category: 'music' },
  { name: 'reddit_bayarea', url: 'https://www.reddit.com/r/bayarea/', county: 'all', category: 'community' },
  { name: 'richmond_parks', url: 'https://ci.richmond.ca.us', county: 'contra_costa', category: 'outdoors' },
];

const DATE_PATTERNS = [
  /(\w+)\s+(\d{1,2}),?\s+(\d{4})/g,
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
  /(\d{1,2})-(\d{1,2})-(\d{4})/g,
  /(\w+)\s+(\d{1,2})\s+(\d{4})/g,
];

const TIME_PATTERNS = [
  /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/g,
  /(\d{1,2})\s*(AM|PM|am|pm)/g,
];

export function parseEventsMarkdown(markdown: string, source: EventSource): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = markdown.split('\n');
  let currentEvent: Partial<ParsedEvent> = { source_name: source.name };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const dateMatch = extractDate(line);
    const timeMatch = extractTime(line);

    if (isTitleLine(line)) {
      if (currentEvent.title && currentEvent.date) {
        events.push(currentEvent as ParsedEvent);
      }
      currentEvent = {
        title: cleanTitle(line),
        date: dateMatch,
        time: timeMatch,
        source_name: source.name,
        source_url: source.url,
      };
    } else if (dateMatch && currentEvent.title) {
      currentEvent.date = dateMatch;
      if (timeMatch) currentEvent.time = timeMatch;
    } else if (timeMatch && currentEvent.title && !currentEvent.time) {
      currentEvent.time = timeMatch;
    }

    if (line.includes('location') || line.includes('Location') || line.includes('address') || line.includes('Address')) {
      const locMatch = line.match(/:?\s*(.+)/);
      if (locMatch) {
        currentEvent.location = locMatch[1].trim();
      }
    }
  }

  if (currentEvent.title && currentEvent.date) {
    events.push(currentEvent as ParsedEvent);
  }

  return events.map(e => ({
    ...e,
    county: source.county === 'all' ? extractCounty(e.location || '') : source.county,
    price: 'free',
    category: source.category || null,
  }));
}

function extractDate(text: string): string | undefined {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      try {
        const date = new Date(match[0]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

function extractTime(text: string): string | undefined {
  for (const pattern of TIME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return normalizeTime(match[0]);
    }
  }
  return undefined;
}

function normalizeTime(timeStr: string): string {
  const normalized = timeStr.trim().toLowerCase();
  const match = normalized.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return timeStr;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

function isTitleLine(line: string): boolean {
  const titleIndicators = [
    /^[A-Z][A-Za-z\s]{5,100}$/,
    /^[A-Z][A-Za-z\s]{3,50}:\s/,
    /\*\*.+\*\*/,
  ];
  return titleIndicators.some(p => p.test(line.trim())) && line.length > 5 && line.length < 200;
}

function cleanTitle(title: string): string {
  return title.replace(/\*\*/g, '').replace(/^[\d\.\)\-\s]+/, '').trim();
}

function extractCounty(location: string): string {
  const counties = ['san francisco', 'san mateo', 'santa clara', 'alameda', 'contra costa', 'marin', 'sonoma', 'napa', 'solano'];
  const lowerLoc = location.toLowerCase();
  for (const county of counties) {
    if (lowerLoc.includes(county)) {
      return county.replace(' ', '_');
    }
  }
  return 'san_francisco';
}

export function normalizeEvent(parsed: ParsedEvent & { county?: string; category?: string; price?: string }) {
  return {
    title: parsed.title || 'Untitled Event',
    description: parsed.description || null,
    date: parsed.date || new Date().toISOString().split('T')[0],
    time: parsed.time || null,
    location: parsed.location || null,
    address: parsed.address || null,
    city: parsed.city || null,
    county: parsed.county || 'san_francisco',
    latitude: null,
    longitude: null,
    price: parsed.price || 'free',
    category: parsed.category || null,
    source_url: parsed.source_url || '',
    source_name: parsed.source_name,
  };
}

export async function extractEventsWithLLM(
  markdown: string,
  sourceName: string,
  sourceUrl: string,
  county: string,
  category?: string
): Promise<ParsedEvent[]> {
  if (!process.env.MINIMAX_API_KEY) {
    return [];
  }

  const truncatedContent = markdown.slice(0, 8000);

  const prompt = `You are an expert at extracting event information from web content. Extract ALL free events from the following content collected from ${sourceName} (${sourceUrl}).

Return a JSON array of events with this exact structure:
[
  {
    "title": "Event Title",
    "description": "Brief description or empty string",
    "date": "YYYY-MM-DD format or null if not found",
    "time": "HH:MM:SS 24-hour format (e.g., '14:30:00') or null",
    "location": "Venue name or null",
    "city": "City name or null",
    "source_url": "${sourceUrl}"
  }
]

Rules:
- Extract ONLY free events
- For dates, use YYYY-MM-DD format
- For times, use 24-hour format like '14:30:00' NOT '2:30 PM'
- Include events that span multiple days if they're mentioned
- Be thorough - extract everything that looks like an event
- If no events found, return empty array []
- Do not include any explanation, only valid JSON

Content to parse:
${truncatedContent}`;

  try {
    const response = await fetch(
      `${process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/text/chatcompletion_v2`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.5',
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 4000,
          temperature: 0.1,
          reasoning_split: true,
        }),
      }
    );

    if (!response.ok) {
      console.error(`  LLM extraction failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content || content.trim().length < 10) {
      console.log('  LLM returned empty content');
      return [];
    }

    console.log('  LLM raw response preview:', content.slice(0, 200));

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('  LLM did not return valid JSON array');
      return [];
    }

    const parsedEvents = JSON.parse(jsonMatch[0]) as ParsedEvent[];

    return parsedEvents.map(e => ({
      title: e.title,
      description: e.description,
      date: e.date,
      time: e.time,
      location: e.location,
      address: e.address,
      city: e.city,
      source_url: e.source_url || sourceUrl,
      source_name: sourceName,
      county: county === 'all' ? extractCounty(e.location || e.city || '') : county,
      category: category || null,
      price: 'free' as const,
    })).filter(e => e.title && e.date);
  } catch (error) {
    console.error('  LLM extraction error:', error);
    return [];
  }
}
