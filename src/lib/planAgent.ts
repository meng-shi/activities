import { readFileSync } from 'fs';
import { join } from 'path';
import { Event, DayPlan, DayPlanInput, PlannedActivity } from './types';

// ── City → County mapping (real Bay Area geography) ──
const CITY_TO_COUNTY: Record<string, string> = {
  'San Francisco': 'san_francisco',
  'Oakland': 'alameda', 'Berkeley': 'alameda', 'Fremont': 'alameda',
  'Alameda': 'alameda', 'Hayward': 'alameda', 'Livermore': 'alameda',
  'Pleasanton': 'alameda', 'Dublin': 'alameda', 'San Leandro': 'alameda',
  'Castro Valley': 'alameda', 'Union City': 'alameda', 'Newark': 'alameda',
  'San Lorenzo': 'alameda', 'Cherryland': 'alameda', 'Sunol': 'alameda',
  'Albany': 'alameda', 'Emeryville': 'alameda',
  'San Jose': 'santa_clara', 'Sunnyvale': 'santa_clara', 'Santa Clara': 'santa_clara',
  'Mountain View': 'santa_clara', 'Palo Alto': 'santa_clara', 'Cupertino': 'santa_clara',
  'Milpitas': 'santa_clara', 'Campbell': 'santa_clara', 'Los Gatos': 'santa_clara',
  'Saratoga': 'santa_clara', 'Morgan Hill': 'santa_clara', 'Gilroy': 'santa_clara',
  'Los Altos': 'santa_clara', 'Los Altos Hills': 'santa_clara', 'Monte Sereno': 'santa_clara',
  'San Mateo': 'san_mateo', 'Redwood City': 'san_mateo', 'Daly City': 'san_mateo',
  'South San Francisco': 'san_mateo', 'Foster City': 'san_mateo', 'San Carlos': 'san_mateo',
  'Belmont': 'san_mateo', 'Half Moon Bay': 'san_mateo', 'Menlo Park': 'san_mateo',
  'East Palo Alto': 'san_mateo', 'Portola Valley': 'san_mateo', 'Woodside': 'san_mateo',
  'Atherton': 'san_mateo', 'North Fair Oaks': 'san_mateo', 'Pacifica': 'san_mateo',
  'Millbrae': 'san_mateo', 'Brisbane': 'san_mateo', 'Colma': 'san_mateo',
  'Concord': 'contra_costa', 'Walnut Creek': 'contra_costa', 'Richmond': 'contra_costa',
  'Antioch': 'contra_costa', 'Pittsburg': 'contra_costa', 'San Ramon': 'contra_costa',
  'Danville': 'contra_costa', 'Lafayette': 'contra_costa', 'Clayton': 'contra_costa',
  'El Cerrito': 'contra_costa', 'Hercules': 'contra_costa', 'Pinole': 'contra_costa',
  'Martinez': 'contra_costa', 'Pleasant Hill': 'contra_costa', 'Brentwood': 'contra_costa',
  'Oakley': 'contra_costa', 'Kensington': 'contra_costa',
  'San Rafael': 'marin', 'Novato': 'marin', 'Mill Valley': 'marin',
  'Tiburon': 'marin', 'Corte Madera': 'marin', 'Larkspur': 'marin',
  'Fairfax': 'marin', 'Sausalito': 'marin', 'Marin City': 'marin',
  'Bolinas': 'marin', 'Point Reyes': 'marin', 'Inverness': 'marin',
  'Petaluma': 'sonoma', 'Santa Rosa': 'sonoma', 'Rohnert Park': 'sonoma',
  'Sebastopol': 'sonoma', 'Sonoma': 'sonoma',
  'Napa': 'napa', 'Calistoga': 'napa', 'St. Helena': 'napa', 'Yountville': 'napa',
  'Vallejo': 'solano', 'Fairfield': 'solano', 'Vacaville': 'solano',
  'Suisun City': 'solano', 'Benicia': 'solano', 'Dixon': 'solano',
};

const COUNTY_NAMES: Record<string, string> = {
  'san_francisco': 'San Francisco',
  'alameda': 'Alameda',
  'santa_clara': 'Santa Clara',
  'san_mateo': 'San Mateo',
  'contra_costa': 'Contra Costa',
  'marin': 'Marin',
  'sonoma': 'Sonoma',
  'napa': 'Napa',
  'solano': 'Solano',
};

// ── Helpers ──

function loadEventsFromJson(): Event[] {
  const data = readFileSync(join(process.cwd(), 'public', 'events.json'), 'utf-8');
  const parsed = JSON.parse(data);
  return (parsed.events || []) as Event[];
}

function parseTimeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeCity(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [city, county] of Object.entries(CITY_TO_COUNTY)) {
    if (city.toLowerCase() === lower) return city;
  }
  // fuzzy: "sf" → "San Francisco", "san fran" etc.
  if (lower === 'sf' || lower === 'san fran' || lower === 'san fransisco') return 'San Francisco';
  return null;
}

function resolveCounty(city: string): string | null {
  return CITY_TO_COUNTY[city] || null;
}

// ── Core filter ──

interface FilterResult {
  events: Event[];
  matchType: 'city' | 'county';
  matchLabel: string;
  totalOnDate: number;
}

function filterEventsForPlanning(
  allEvents: Event[],
  input: DayPlanInput
): FilterResult {
  const today = new Date().toISOString().split('T')[0];
  let targetDate = input.date || today;

  // Normalize date: handle "today", "tomorrow", YYYY-MM-DD
  if (targetDate === 'today') targetDate = today;
  else if (targetDate === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    targetDate = d.toISOString().split('T')[0];
  }

  // 1. Filter by exact date
  const dateEvents = allEvents.filter(e => {
    if (!e.date) return false;
    return e.date.slice(0, 10) === targetDate;
  });

  const totalOnDate = dateEvents.length;

  // 2. Resolve user location → city + county
  const userCity = normalizeCity(input.location);
  const userCounty = userCity
    ? resolveCounty(userCity)
    : CITY_TO_COUNTY[input.location] || null;

  // 3. Filter by time window
  const startMin = parseTimeToMinutes(input.startTime) ?? 0;
  const endMin = parseTimeToMinutes(input.endTime) ?? 1440;
  const timeEvents = dateEvents.filter(e => {
    if (!e.time) return true; // no time → include
    const eventMin = parseTimeToMinutes(e.time);
    if (eventMin === null) return true;
    return eventMin >= startMin && eventMin <= endMin;
  });

  // 4. Filter by city/county with fallback
  let matched: Event[];
  let matchType: 'city' | 'county';
  let matchLabel: string;

  if (userCity) {
    // Exact city match
    matched = timeEvents.filter(e => e.city?.toLowerCase() === userCity.toLowerCase());
    if (matched.length >= 3) {
      matchType = 'city';
      matchLabel = userCity;
    } else {
      // Fallback: same county
      const county = resolveCounty(userCity);
      if (county) {
        matched = timeEvents.filter(e => {
          const eventCounty = CITY_TO_COUNTY[e.city || ''] || e.county;
          return eventCounty === county;
        });
        matchType = 'county';
        matchLabel = COUNTY_NAMES[county] || county;
      } else {
        matchType = 'city';
        matchLabel = userCity;
      }
    }
  } else if (userCounty) {
    matched = timeEvents.filter(e => {
      const eventCounty = CITY_TO_COUNTY[e.city || ''] || e.county;
      return eventCounty === userCounty;
    });
    matchType = 'county';
    matchLabel = COUNTY_NAMES[userCounty] || userCounty;
  } else {
    // No location resolved — use all
    matched = timeEvents;
    matchType = 'county';
    matchLabel = 'Bay Area';
  }

  return { events: matched, matchType, matchLabel, totalOnDate };
}

// ── Prompt builder ──

function buildPlanningPrompt(
  input: DayPlanInput,
  result: FilterResult
): string {
  const { events, matchType, matchLabel, totalOnDate } = result;
  const eventCount = events.length;

  const eventsContext = events
    .map(e => {
      const desc = e.description || 'No description';
      const detail = e.event_detail && e.event_detail.length > 20 ? `\n  Details: ${e.event_detail}` : '';
      const addr = e.full_address || e.address || '';
      const timeStr = e.time ? e.time.slice(0, 5) : 'TBD';
      return `[${timeStr}] ${e.title}\n  Category: ${e.category || 'general'}\n  Location: ${e.location || 'TBA'}, ${e.city || 'unknown city'}${addr ? ` - ${addr}` : ''}\n  ${desc}${detail}`;
    })
    .join('\n\n');

  return `You are a local event planning assistant for the SF Bay Area.

═══════════════════════════════════════════
USER REQUEST
═══════════════════════════════════════════
Date: ${input.date} (${totalOnDate} total events on this date)
Time window: ${input.startTime} to ${input.endTime}
Location: ${input.location}
Matched: ${eventCount} events in ${matchLabel} (via ${matchType} match)
Interests: ${input.interests.join(', ') || 'general'}

═══════════════════════════════════════════
AVAILABLE EVENTS (${eventCount} in ${matchLabel})
═══════════════════════════════════════════
${eventsContext}

═══════════════════════════════════════════
STRICT RULES
═══════════════════════════════════════════

1. DATE: Every event MUST be on ${input.date}. Do not include events from other dates.
2. TIME: Every event's start time MUST be between ${input.startTime} and ${input.endTime}. Skip events outside this window.
3. LOCATION: Prioritize events in ${input.location}. If few events exist there, use events in ${matchLabel}.
4. EVENTS: Only use events from the list above. Never invent events.
5. BUFFER: Include at least 30 minutes between events when locations differ.
6. FILLERS: If gaps remain, use "Explore the neighborhood" or "Take a break".
7. CITY: For each activity, include the actual city from the event data.

═══════════════════════════════════════════
OUTPUT (JSON only, no markdown)
═══════════════════════════════════════════
{
  "activities": [
    {
      "time": "10:00",
      "title": "Event name from list",
      "location": "Location name",
      "city": "City from event data",
      "description": "Brief description",
      "reason": "Why this fits the user"
    }
  ],
  "summary": "1-2 sentence summary of the day plan"
}`;
}

// ── AI plan parser ──

function parseAIPlan(aiContent: string, events: Event[]): DayPlan {
  let jsonStr = aiContent.trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    const activities: PlannedActivity[] = (parsed.activities || []).map((act: {
      time: string;
      title: string;
      location: string;
      city?: string;
      description: string;
      reason: string;
    }) => {
      const matchedEvent = events.find(
        e => e.title.toLowerCase().includes(act.title.toLowerCase().slice(0, 20))
      );
      return {
        time: act.time,
        title: act.title,
        location: act.location || 'TBD',
        city: act.city || 'TBD',
        description: act.description || '',
        reason: act.reason || '',
        sourceUrl: matchedEvent?.source_url,
        event: matchedEvent,
      };
    });
    return {
      date: new Date().toISOString().split('T')[0],
      location: parsed.location || '',
      activities: activities.slice(0, 8),
      summary: parsed.summary || 'A day of fun activities in the Bay Area.',
      eventsCount: activities.length,
    };
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return {
      date: new Date().toISOString().split('T')[0],
      location: '',
      activities: [],
      summary: 'Failed to generate plan.',
      eventsCount: 0,
    };
  }
}

// ── Fallback (no API key) ──

function createFallbackPlan(events: Event[], input: DayPlanInput): DayPlan {
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = parseTimeToMinutes(a.time) || 9999;
    const timeB = parseTimeToMinutes(b.time) || 9999;
    return timeA - timeB;
  });
  const activities: PlannedActivity[] = sortedEvents.slice(0, 6).map(e => ({
    time: e.time || 'TBD',
    title: e.title,
    location: e.location || 'TBD',
    city: e.city || e.county || 'TBD',
    description: e.description || '',
    reason: `Matches ${input.interests.join(', ') || 'user interests'}`,
    sourceUrl: e.source_url,
    event: e,
  }));
  return {
    date: input.date,
    location: input.location,
    activities,
    summary: `Found ${activities.length} events in ${input.location}.`,
    eventsCount: activities.length,
  };
}

// ── Main entry point ──

export async function planMyDay(input: DayPlanInput): Promise<DayPlan> {
  try {
    const allEvents = loadEventsFromJson();
    const result = filterEventsForPlanning(allEvents, input);

    if (result.events.length === 0) {
      return {
        date: input.date,
        location: input.location,
        activities: [],
        summary: `No events found in ${input.location} on ${input.date}. Try a different date or broader location.`,
        eventsCount: 0,
      };
    }

    if (!process.env.AIML_API_KEY) {
      return createFallbackPlan(result.events, input);
    }

    const prompt = buildPlanningPrompt(input, result);

    const response = await fetch(
      'https://api.aimlapi.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AIML_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a helpful event planning assistant for the SF Bay Area. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 10000,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      console.error('AI/ML API error:', response.status);
      return createFallbackPlan(result.events, input);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    if (!aiContent) {
      return createFallbackPlan(result.events, input);
    }

    return parseAIPlan(aiContent, result.events);

  } catch (error) {
    console.error('Error in planMyDay:', error);
    return {
      date: input.date,
      location: input.location,
      activities: [],
      summary: 'An error occurred while planning your day. Please try again.',
      eventsCount: 0,
    };
  }
}
