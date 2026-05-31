'use client';

import { Event, COUNTY_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

interface EventModalProps {
  event: Event | null;
  onClose: () => void;
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
    return 'Date TBA';
  }
}

export default function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null;

  const formattedDate = event.date
    ? formatEventDate(event.date, 'EEEE, MMMM d, yyyy')
    : 'Date TBA';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="h-3 bg-gradient-to-r from-[#FF5833] via-[#FF8A50] to-[#FFB400]"></div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-gradient-to-br from-[#FF5833] to-[#FF8A50] text-white text-center p-3 rounded-xl min-w-[70px]">
              <div className="text-2xl font-bold">{formatEventDate(event.date, 'd')}</div>
              <div className="text-sm uppercase">{formatEventDate(event.date, 'MMM')}</div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">
                {event.title}
              </h2>
             <p className="text-gray-500 mt-1">{formattedDate}</p>
            </div>
          </div>

          {event.location && (
            <div className="mb-4 flex items-center gap-2 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="mb-4">
              <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          {event.event_detail && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-gray-700">{event.event_detail}</p>
            </div>
          )}

          {event.items && event.items.length > 0 && (
            <div className="mb-4 p-4 bg-orange-50 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">What to Bring</h3>
              <ul className="space-y-2">
                {event.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">{item.name}</span>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:text-orange-700 text-sm ml-2"
                      >
                        (Find on Google Shopping)
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {event.county && (
              <span className="px-3 py-1 bg-blue-50 text-blue-600 text-sm rounded-full">
                {COUNTY_LABELS[event.county as keyof typeof COUNTY_LABELS] || event.county}
              </span>
            )}
            {event.category && (
              <span className="px-3 py-1 bg-purple-50 text-purple-600 text-sm rounded-full">
                {CATEGORY_LABELS[event.category as keyof typeof CATEGORY_LABELS] || event.category}
              </span>
            )}
            {event.source_name && (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                Source: {event.source_name}
              </span>
            )}
          </div>

          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF5833] hover:bg-[#FF8A50] text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Original Event
            </a>
          )}
        </div>
      </div>
    </div>
  );
}