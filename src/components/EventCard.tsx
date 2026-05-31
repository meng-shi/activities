'use client';

import { Event, COUNTY_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

interface EventCardProps {
  event: Event;
  onClick: () => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  outdoors: '🌲',
  music: '🎵',
  arts: '🎨',
  sports: '⚽',
  library: '📚',
  community: '👥',
  family: '👨‍👩‍👧',
  food: '🍕',
  education: '🎓',
  health: '🧘',
};

function formatEventDate(dateStr: string, formatStr: string): string {
  try {
    const date = parseISO(dateStr.split('T')[0]);
    return formatInTimeZone(date, 'America/Los_Angeles', formatStr);
  } catch {
    return '';
  }
}

export default function EventCard({ event, onClick }: EventCardProps) {
  const formattedDate = event.date
    ? formatEventDate(event.date, 'EEE, MMM d')
    : 'Date TBA';

  const monthDay = event.date
    ? formatEventDate(event.date, 'd')
    : '--';

  const month = event.date
    ? formatEventDate(event.date, 'MMM')
    : '';

  return (
    <button
      onClick={onClick}
      className="event-card w-full text-left bg-white rounded-xl shadow-sm hover:shadow-lg border border-gray-100 overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#FF5833] focus:ring-offset-2"
 >
      <div className="flex">
        <div className="bg-gradient-to-br from-[#FF5833] to-[#FF8A50] text-white text-center p-3 min-w-[70px]">
          <div className="text-2xl font-bold">{monthDay}</div>
          <div className="text-sm uppercase">{month}</div>
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold text-gray-900 leading-tight pr-2">{event.title}</h3>
            {event.price && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded whitespace-nowrap">
                {event.price}
              </span>
            )}
          </div>
          {event.location && (
            <p className="text-sm text-gray-500 mt-1 truncate">{event.location}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {event.category && CATEGORY_EMOJI[event.category] && (
              <span className="text-sm">{CATEGORY_EMOJI[event.category]}</span>
            )}
            {event.county && (
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                {COUNTY_LABELS[event.county as keyof typeof COUNTY_LABELS] || event.county}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}