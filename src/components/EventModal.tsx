'use client';

import { Event, COUNTY_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { format } from 'date-fns';

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

export default function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null;

  const formattedDate = event.date
    ? format(new Date(event.date), 'EEEE, MMMM d, yyyy')
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
            className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
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
              <div className="text-2xl font-bold">{format(new Date(event.date), 'd')}</div>
              <div className="text-sm uppercase">{format(new Date(event.date), 'MMM')}</div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">
                {event.title}
              </h2>
              <span className="inline-block mt-2 bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">
                FREE Event
              </span>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 text-gray-700">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#FF5833]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">{formattedDate}</p>
                {event.time && <p className="text-sm text-gray-500">at {event.time}</p>}
              </div>
            </div>

            {event.location && (
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#FF5833]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{event.location}</p>
                  {event.city && <p className="text-sm text-gray-500">{event.city}</p>}
                </div>
              </div>
            )}
          </div>

          {event.description && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">About this event</h3>
              <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {event.event_detail && (
            <div className="mb-6 p-4 bg-orange-50 rounded-xl border border-orange-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">✨ Event Summary</h3>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {event.event_detail}
              </p>
            </div>
          )}

          {event.items && event.items.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🎒 Recommended Items to Bring</h3>
              <ul className="space-y-2">
                {event.items.map((item, index) => (
                  <li key={index} className="flex items-center justify-between">
                    <span className="text-gray-700">{item.name}</span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 px-3 py-1 bg-white hover:bg-blue-100 text-blue-600 text-sm font-medium rounded-full border border-blue-200 transition-colors"
                    >
                      Find on Amazon →
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full flex items-center gap-1">
              {CATEGORY_EMOJI[event.category || 'community']} {CATEGORY_LABELS[event.category as keyof typeof CATEGORY_LABELS] || event.category}
            </span>
            {event.county && (
              <span className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                📍 {COUNTY_LABELS[event.county as keyof typeof COUNTY_LABELS]}
              </span>
            )}
          </div>

          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 bg-gradient-to-r from-[#FF5833] to-[#FF8A50] hover:from-[#E54530] hover:to-[#FF5833] text-white font-semibold text-center rounded-xl transition-all shadow-md hover:shadow-lg"
            >
              View Event Details →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}