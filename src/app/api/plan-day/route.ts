import { NextRequest, NextResponse } from 'next/server';
import { planMyDay } from '@/lib/planAgent';
import { PlanDayRequest } from '@/lib/types';

function parseNaturalLanguageQuery(query: string): {
  startTime?: string;
  endTime?: string;
  location?: string;
  interests: string[];
  date: string;
} {
  const result = {
    startTime: '09:00',
    endTime: '18:00',
    location: '',
    interests: [] as string[],
    date: 'today',
  };

  const lower = query.toLowerCase();

  const timeRangeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeRangeMatch) {
    let startHour = parseInt(timeRangeMatch[1], 10);
    if (timeRangeMatch[3] === 'pm' && startHour < 12) startHour += 12;
    if (timeRangeMatch[3] === 'am' && startHour === 12) startHour = 0;
    result.startTime = `${startHour.toString().padStart(2, '0')}:${timeRangeMatch[2] || '00'}`;

    let endHour = parseInt(timeRangeMatch[4], 10);
    if (timeRangeMatch[6] === 'pm' && endHour < 12) endHour += 12;
    if (timeRangeMatch[6] === 'am' && endHour === 12) endHour = 0;
    result.endTime = `${endHour.toString().padStart(2, '0')}:${timeRangeMatch[5] || '00'}`;
  }

  const locationPatterns = [
    /(?:in|near|around|at)\s+([a-z\s]+?)(?:\s+from|\s+for|\s+with|\s+with my|\s+with my|\s*$)/i,
    /(?:in|near|around|at)\s+([a-z\s]+?)(?:\s+\d)/i,
    /(?:in|near|around|at)\s+([a-z\s]+?)$/i,
  ];

  for (const pattern of locationPatterns) {
    const match = lower.match(pattern);
    if (match) {
      result.location = match[1].trim();
      break;
    }
  }

  if (!result.location) {
    const locationWords = [
      'oakland', 'berkeley', 'san francisco', 'sf', 'san jose', 'palo alto',
      'mountain view', 'sunnyvale', 'fremont', 'richmond', 'concord', 'walnut creek',
      'san mateo', 'redwood city', 'menlo park', 'marin', 'sonoma', 'napa', 'vallejo',
      'east bay', 'south bay', 'peninsula', 'north bay',
    ];
    for (const loc of locationWords) {
      if (lower.includes(loc)) {
        result.location = loc;
        break;
      }
    }
  }

  const interestPatterns = [
    /with (?:my )?(family|kids|children|friends|partner|kids and adults)/i,
    /(?:for |looking for )?(family|kids|children)/i,
    /(?:interested in |like |love )?(music|art|outdoor|nature|sports|fitness|food|dancing)/gi,
    /(?:doing |going to |attending )?(live music|concert|art exhibit|hiking|picnic|tennis)/gi,
  ];

  const interestKeywords = [
    'family', 'kids', 'children', 'music', 'art', 'outdoor', 'nature',
    'sports', 'fitness', 'food', 'art', 'concert', 'dancing', 'workshop',
    'library', 'books', 'community', 'wellness', 'health',
  ];

  for (const keyword of interestKeywords) {
    if (lower.includes(keyword)) {
      result.interests.push(keyword);
    }
  }

  const familyMatch = lower.match(/(?:with|for)\s*(?:my\s+)?(?:family|kids|children)/);
  if (familyMatch && !result.interests.includes('family')) {
    result.interests.push('family');
    result.interests.push('kids');
  }

  if (lower.includes('today')) {
    result.date = 'today';
  } else if (lower.includes('tomorrow')) {
    result.date = 'tomorrow';
  }

  if (result.interests.length === 0) {
    result.interests = ['general'];
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body: PlanDayRequest = await request.json();
    const { startTime, endTime, location, interests, date, naturalLanguage } = body;

    if (naturalLanguage && naturalLanguage.trim().length > 0) {
      const parsedNL = parseNaturalLanguageQuery(naturalLanguage);

      const planInput = {
        startTime: startTime || parsedNL.startTime || '09:00',
        endTime: endTime || parsedNL.endTime || '18:00',
        location: location || parsedNL.location || '',
        interests: interests?.length ? interests : (parsedNL.interests.length ? parsedNL.interests : ['general']),
        date: date || parsedNL.date || 'today',
      };

      if (!planInput.location) {
        return NextResponse.json(
          { error: 'Location is required. Please specify a location like "Oakland" or "San Francisco".', code: 'MISSING_LOCATION' },
          { status: 400 }
        );
      }

      const plan = await planMyDay({
        startTime: planInput.startTime,
        endTime: planInput.endTime,
        location: planInput.location,
        interests: planInput.interests,
        date: planInput.date,
      });

      return NextResponse.json(plan);
    }

    if (!location) {
      return NextResponse.json(
        { error: 'Location is required. Please specify a location like "Oakland" or "San Francisco".', code: 'MISSING_LOCATION' },
        { status: 400 }
      );
    }

    const plan = await planMyDay({
      startTime: startTime || '09:00',
      endTime: endTime || '18:00',
      location,
      interests: interests?.length ? interests : ['general'],
      date: date || 'today',
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Plan day error:', error);
    return NextResponse.json(
      { error: 'Failed to plan your day', code: 'PLAN_ERROR' },
      { status: 500 }
    );
  }
}