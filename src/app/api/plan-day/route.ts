import { NextRequest, NextResponse } from 'next/server';
import { planMyDay } from '@/lib/planAgent';
import { PlanDayRequest } from '@/lib/types';

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDateFromQuery(lower: string): string {
  const today = new Date().toISOString().split('T')[0];

  if (lower.includes('tomorrow')) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  if (lower.includes('this weekend') || lower.includes('weekend')) {
    const d = new Date();
    const day = d.getDay();
    const saturday = day <= 6 ? 6 - day : 6;
    d.setDate(d.getDate() + saturday);
    return d.toISOString().split('T')[0];
  }

  if (lower.includes('next week')) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const d = new Date();
      const currentDay = d.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }

  const monthDayMatch = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  if (monthDayMatch) {
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = monthNames.indexOf(monthDayMatch[1].toLowerCase());
    const day = parseInt(monthDayMatch[2], 10);
    const d = new Date();
    d.setMonth(month);
    d.setDate(day);
    return d.toISOString().split('T')[0];
  }

  const numericDateMatch = lower.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?/);
  if (numericDateMatch) {
    const month = parseInt(numericDateMatch[1], 10) - 1;
    const day = parseInt(numericDateMatch[2], 10);
    const d = new Date();
    d.setMonth(month);
    d.setDate(day);
    return d.toISOString().split('T')[0];
  }

  return today;
}

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
    date: new Date().toISOString().split('T')[0],
  };

  const lower = query.toLowerCase();

  // Parse time range: "10am-2pm", "10:00-14:00", "from 10 to 2"
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
  } else {
    // Parse time-of-day keywords
    if (/\b(morning)\b/.test(lower)) {
      result.startTime = '08:00';
      result.endTime = '12:00';
    } else if (/\b(afternoon)\b/.test(lower)) {
      result.startTime = '12:00';
      result.endTime = '18:00';
    } else if (/\b(evening)\b/.test(lower)) {
      result.startTime = '15:00';
      result.endTime = '20:00';
    } else if (/\b(night|tonight)\b/.test(lower)) {
      result.startTime = '17:00';
      result.endTime = '23:00';
    }
  }

  // Parse location: stop before date/time/interest words
  const locationPatterns = [
    /(?:in|near|around|at)\s+([a-z\s]+?)(?:\s+(?:on|from|for|with|this|next|today|tomorrow|weekend|\d))/i,
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
      'san francisco', 'sf', 'oakland', 'berkeley', 'san jose', 'palo alto',
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

  const interestKeywords = [
    'family', 'kids', 'children', 'music', 'art', 'outdoor', 'nature',
    'sports', 'fitness', 'food', 'concert', 'dancing', 'workshop',
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

  result.date = parseDateFromQuery(lower);

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
        date: date || parsedNL.date || new Date().toISOString().split('T')[0],
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
      date: date || new Date().toISOString().split('T')[0],
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
