import { Event, DayPlan, DayPlanInput, PlannedActivity } from './types';
import { searchEventsForPlanning } from './db';

function formatTime(time: string | null): string {
  if (!time) return 'TBD';
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function parseTimeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildPlanningPrompt(
  input: DayPlanInput,
  events: Event[]
): string {
  const eventsContext = events
    .map(e => {
      const desc = e.description || 'No description';
      const detail = e.event_detail && e.event_detail.length > 20 ? `\nDetails: ${e.event_detail}` : '';
      const addr = e.full_address || e.address || '';
      return `[${e.time || 'TBD'}] ${e.title} (${e.category || 'general'})\n  Location: ${e.location || 'TBA'}, ${e.city || e.county}${addr ? ` - ${addr}` : ''}\n  ${desc}${detail}`;
    })
    .join('\n\n');

  return `You are an event planning assistant for the SF Bay Area.

USER REQUEST:
- Date: ${input.date}
- Time window: ${input.startTime} to ${input.endTime}
- Location: ${input.location}
- Interests: ${input.interests.join(', ') || 'general'}

AVAILABLE EVENTS FROM DATABASE:
${eventsContext}

RULES:
- Only pick events from the list above. Never invent events.
- Every event MUST happen on ${input.date}. If it doesn't match the date, skip it.
- Every event MUST start within ${input.startTime} to ${input.endTime}. If it's outside the time window, skip it.
- If no events fit, use a filler like "Explore the neighborhood" or "Take a break".
- Include at least 30 min buffer between events if locations differ.
- Return ONLY valid JSON, no markdown.

OUTPUT:
{
  "activities": [
    {
      "time": "10:00",
      "title": "Event name",
      "location": "Location name",
      "city": "City",
      "description": "Brief description",
      "reason": "Why this fits"
    }
  ],
  "summary": "1-2 sentence summary"
}`;
}

function parseAIPlan(aiContent: string, events: Event[]): DayPlan {
  let jsonStr = aiContent.trim();

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

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

function createFallbackPlan(events: Event[], input: DayPlanInput): DayPlan {
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = parseTimeToMinutes(a.time) || 9999;
    const timeB = parseTimeToMinutes(b.time) || 9999;
    return timeA - timeB;
  });

  const inRangeEvents = sortedEvents.filter(e => {
    if (!input.startTime || !input.endTime) return true;
    const eventTime = parseTimeToMinutes(e.time);
    if (eventTime === null) return true;
    const start = parseTimeToMinutes(input.startTime) || 0;
    const end = parseTimeToMinutes(input.endTime) || 1440;
    return eventTime >= start && eventTime <= end;
  });

  const activities: PlannedActivity[] = inRangeEvents.slice(0, 6).map(e => ({
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
    summary: `Found ${activities.length} events matching your criteria in ${input.location}.`,
    eventsCount: activities.length,
  };
}

export async function planMyDay(input: DayPlanInput): Promise<DayPlan> {
  try {
    const events = await searchEventsForPlanning(
      input.location,
      input.interests,
      input.date,
      input.startTime,
      input.endTime
    );

    if (events.length === 0) {
      return {
        date: input.date,
        location: input.location,
        activities: [],
        summary: `No events found matching your criteria in ${input.location}. Try broadening your search or selecting a different location.`,
        eventsCount: 0,
      };
    }

    if (!process.env.MINIMAX_API_KEY) {
      return createFallbackPlan(events, input);
    }

    const prompt = buildPlanningPrompt(input, events);

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
          max_tokens: 2000,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      console.error('Minimax API error:', response.status);
      return createFallbackPlan(events, input);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';

    if (!aiContent) {
      return createFallbackPlan(events, input);
    }

    const plan = parseAIPlan(aiContent, events);
    return plan;

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