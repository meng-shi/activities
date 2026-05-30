'use client';

import { Event, COUNTY_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { format } from 'date-fns';

interface EventModalProps {
  event: Event | null;
  onClose: () => void;
}

export default function EventModal({ event, onClose }: EventModalProps) {
  if (!event) return null;

  const formattedDate = event.date
    ? format(new Date(event.date), 'EEEE, MMMM d, yyyy')
    : 'Date TBA';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Event Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded whitespace-nowrap">
              {event.price || 'Free'}
            </span>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 text-gray-700">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-lg">{formattedDate}</span>
            </div>

            {event.time && (
              <div className="flex items-center gap-3 text-gray-700">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg">{event.time}</span>
              </div>
            )}

            {event.location && (
              <div className="flex items-start gap-3 text-gray-700">
                <svg className="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-medium">{event.location}</p>
                  {event.city && <p className="text-gray-500">{event.city}</p>}
                </div>
              </div>
            )}
          </div>

          {event.description && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">About</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          {event.event_detail && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Summary</h3>
              <p className="text-gray-700">{event.event_detail}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-6">
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
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
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