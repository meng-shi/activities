import { NextRequest, NextResponse } from 'next/server';
import { searchEventsForChat } from '@/lib/db';
import { ChatRequest, Event, EventFilters } from '@/lib/types';

function extractFiltersFromQuery(query: string): EventFilters {
  const filters: EventFilters = {};
  const lowerQuery = query.toLowerCase();

  const countyMap: Record<string, string> = {
    'san francisco': 'san_francisco',
    'sf': 'san_francisco',
    'oakland': 'alameda',
    'berkeley': 'alameda',
    'san jose': 'santa_clara',
    'santa clara': 'santa_clara',
    'palo alto': 'santa_clara',
    'mountain view': 'santa_clara',
    'sunnyvale': 'santa_clara',
    'cupertino': 'santa_clara',
    'fremont': 'alameda',
    'richmond': 'contra_costa',
    'concord': 'contra_costa',
    'walnut creek': 'contra_costa',
    'san mateo': 'san_mateo',
    'redwood city': 'san_mateo',
    'marin': 'marin',
    'sonoma': 'sonoma',
    'napa': 'napa',
    'vallejo': 'solano',
    'fairfield': 'solano',
  };

  for (const [city, county] of Object.entries(countyMap)) {
    if (lowerQuery.includes(city)) {
      filters.county = county;
      break;
    }
  }

  const categoryMap: Record<string, string> = {
    'music': 'music',
    'concert': 'music',
    'art': 'arts',
    'museum': 'arts',
    'exhibit': 'arts',
    'sports': 'sports',
    'fitness': 'sports',
    'workout': 'sports',
    'outdoor': 'outdoors',
    'nature': 'outdoors',
    'hiking': 'outdoors',
    'park': 'outdoors',
    'library': 'library',
    'book': 'library',
    'community': 'community',
    'family': 'family',
    'kids': 'family',
    'children': 'family',
    'food': 'food',
    'dining': 'food',
    'festival': 'food',
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (lowerQuery.includes(keyword)) {
      filters.category = category;
      break;
    }
  }

  if (lowerQuery.includes('today')) {
    filters.date = 'today';
  } else if (lowerQuery.includes('weekend')) {
    filters.date = 'weekend';
  } else if (lowerQuery.includes('this week')) {
    filters.date = 'week';
  }

  return filters;
}

function buildPrompt(query: string, events: Event[]): string {
  const eventsContext = events
    .map(e => `- ${e.title} (${e.date}${e.time ? ` at ${e.time}` : ''}) in ${e.city || e.county}: ${e.description?.slice(0, 100) || 'No description'}`)
    .join('\n');

  return `You are a helpful assistant recommending free events in the SF Bay Area.

User query: "${query}"

Based on the user's query, here are the matching free events from the database:
${eventsContext}

Please provide a natural, conversational response that:
1. Acknowledges what the user is looking for
2. Recommends specific events from the list that match their query
3. Includes practical details (date, time, location)
4. If no events match, suggest related alternatives or apologize

Keep the response concise but informative.`;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, filters: initialFilters } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required', code: 'MISSING_MESSAGE' },
        { status: 400 }
      );
    }

    const extractedFilters = extractFiltersFromQuery(message);
    const filters: EventFilters = {
      ...initialFilters,
      ...extractedFilters,
    };

    const events = await searchEventsForChat(message, filters);

    if (!process.env.MINIMAX_API_KEY) {
      return NextResponse.json({
        response: `I found ${events.length} free events matching your query. Here are some options:\n\n${events.slice(0, 5).map(e => `• ${e.title} - ${e.date} at ${e.location || 'TBA'}`).join('\n')}`,
        events: events.slice(0, 10),
      });
    }

    const prompt = buildPrompt(message, events);

    const aiResponse = await fetch(`${process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/text/chatcompletion_v2`, {
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
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Minimax API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const response = aiData.choices?.[0]?.message?.content || 'I found some events for you!';

    return NextResponse.json({
      response,
      events: events.slice(0, 10),
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request', code: 'CHAT_ERROR' },
      { status: 500 }
    );
  }
}
