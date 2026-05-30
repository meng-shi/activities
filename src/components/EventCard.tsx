'use client';

import { Event, COUNTY_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { format } from 'date-fns';

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

export default function EventCard({ event, onClick }: EventCardProps) {
  const formattedDate = event.date
    ? format(new Date(event.date), 'EEE, MMM d')
    : 'Date TBA';

  const monthDay = event.date
    ? format(new Date(event.date), 'd')
    : '--';

  const month = event.date
    ? format(new Date(event.date), 'MMM')
    : '';

  return (
    <button
      onClick={onClick}
      className="event-card w-full text-left bg-white rounded-xl shadow-sm hover:shadow-lg border border-gray-100 overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#FF5833] focus:ring-offset-2"
    >
      <div className="flex">
        <div className="w-20 bg-gradient-to-br from-[#FF5833] to-[#FF8A50] flex flex-col items-center justify-center text-white py-3 flex-shrink-0">
          <span className="text-2xl font-bold">{monthDay}</span>
          <span className="text-sm uppercase">{month}</span>
        </div>

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 line-clamp-2 leading-tight">
              {event.title}
            </h3>
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
              FREE
            </span>
          </div>

          {event.description && (
            <p className="text-sm text-gray-500 line-clamp-2 mb-2">
              {event.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
            {event.time && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {event.time}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1 line-clamp-1">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span className="line-clamp-1">{event.location}</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {CATEGORY_EMOJI[event.category || 'community']} {event.category}
              </span>
            </div>
            <span className="text-xs text-[#FF5833] font-medium flex items-center gap-1">
              Details
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}