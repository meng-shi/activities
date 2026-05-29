'use client';

import { useState } from 'react';
import { Event } from '@/lib/types';
import EventCard from './EventCard';
import EventModal from './EventModal';

interface EventListProps {
  events: Event[];
  loading?: boolean;
}

export default function EventList({ events, loading }: EventListProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-md p-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-lg mb-2">No events found</div>
        <p className="text-gray-500">Try adjusting your filters or check back later</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} onClick={() => setSelectedEvent(event)} />
        ))}
      </div>
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </>
  );
}
