'use client';

import { useState, useEffect } from 'react';
import { Event, PaginatedResponse } from '@/lib/types';
import EventList from '@/components/EventList';
import FilterPanel, { FilterState } from '@/components/FilterPanel';
import FloatingChatButton from '@/components/FloatingChatButton';
import PlanMyDay from '@/components/PlanMyDay';

interface EventsJson {
  events: Event[];
  generated: string;
}

export default function Home() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  useEffect(() => {
    fetch('/events.json')
      .then(res => res.json())
      .then((data: EventsJson) => {
        setAllEvents(data.events);
        setFilteredEvents(data.events);
        setPagination(prev => ({ ...prev, total: data.events.length, pages: Math.ceil(data.events.length / 20) }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (allEvents.length === 0) return;

    let filtered = [...allEvents];

    if (filters.county) {
      filtered = filtered.filter(e => e.county === filters.county);
    }

    if (filters.category) {
      filtered = filtered.filter(e => e.category === filters.category);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(search) ||
        (e.description && e.description.toLowerCase().includes(search))
      );
    }

    if (filters.date) {
      const today = new Date().toISOString().split('T')[0];
      switch (filters.date) {
        case 'today':
          filtered = filtered.filter(e => e.date === today);
          break;
        case 'weekend': {
          const d = new Date();
          const dayOfWeek = d.getDay();
          const weekendStart = new Date(d);
          weekendStart.setDate(d.getDate() + (6 - dayOfWeek));
          const weekendEnd = new Date(weekendStart);
          weekendEnd.setDate(weekendStart.getDate() + 1);
          filtered = filtered.filter(e => {
            const ed = new Date(e.date);
            return ed >= weekendStart && ed <= weekendEnd;
          });
          break;
        }
        case 'week': {
          const weekEnd = new Date();
          weekEnd.setDate(weekEnd.getDate() + 7);
          filtered = filtered.filter(e => e.date >= today && e.date <= weekEnd.toISOString().split('T')[0]);
          break;
        }
      }
    }

    setPagination(prev => ({
      ...prev,
      total: filtered.length,
      pages: Math.ceil(filtered.length / 20)
    }));
    setCurrentPage(1);
    setFilteredEvents(filtered);
  }, [filters, allEvents]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const getPageEvents = () => {
    const start = (currentPage - 1) * 20;
    const end = start + 20;
    return filteredEvents.slice(start, end);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            SF Bay Area Free Events
          </h1>
          <p className="mt-1 text-gray-500">
            Discover free activities across all 9 Bay Area counties
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <PlanMyDay />

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 flex-shrink-0">
            <FilterPanel onFilterChange={handleFilterChange} />
          </aside>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-500">
                {loading ? 'Loading...' : `${filteredEvents.length} events found`}
              </p>
            </div>

            <EventList events={getPageEvents()} loading={loading} />

            {pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {currentPage} of {pagination.pages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= pagination.pages}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <FloatingChatButton />
    </div>
  );
}