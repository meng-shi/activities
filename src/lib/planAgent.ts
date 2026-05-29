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
      const desc = e.description?.slice(0, 150) || 'No description';
      return `[${e.time || 'TBD'}] ${e.title} - ${e.city || e.county}, ${e.location || 'TBA'}. ${desc}`;
    })
    .join('\n');

  return `You are a local event planning assistant helping users plan their day in the SF Bay Area.

USER CONSTRAINTS:
- Date: ${input.date}
- Time range: ${input.startTime} to ${input.endTime}
- Location preference: ${input.location}
- Interests: ${input.interests.join(', ') || 'general'}

AVAILABLE EVENTS FROM DATABASE:
${eventsContext}

TASK:
Create a personalized day plan selecting events that:
1. Match the user's interests
2. Fit within the time window (${input.startTime} to ${input.endTime})
3. Are geographically coherent (group nearby locations)
4. Include a mix of activity types if possible

IMPORTANT RULES:
- Only include events that actually exist in the list above
- Do not invent or guess event names
- Respect the time constraints - do not schedule events outside the time window
- Include reasonable buffer time between activities (at least 30 mins if locations change)
- If events are sparse, fill gaps with general suggestions like "Explore the neighborhood" or "Take a break"

OUTPUT FORMAT (JSON only, no markdown):
{
  "activities": [
    {
      "time": "10:00",
      "title": "Event name from database",
      "location": "Location name",
      "city": "City",
      "description": "Brief description",
      "reason": "Why this fits the user's interests"
    }
  ],
  "summary": "A brief 1-2 sentence summary of the planned day"
}

Return ONLY valid JSON, no additional text.`;
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
    description: e.description?.slice(0, 150) || '',
    reason: `Matches ${input.interests.join(', ') || 'user interests'}`,
    sourceUrl: e.source_url,
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