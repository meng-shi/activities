'use client';

import { useState, useEffect } from 'react';
import { Event, PaginatedResponse } from '@/lib/types';
import EventList from '@/components/EventList';
import FilterPanel, { FilterState } from '@/components/FilterPanel';
import FloatingChatButton from '@/components/FloatingChatButton';

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState<FilterState>({});

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  const fetchEvents = async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');

      if (filters.county) params.set('county', filters.county);
      if (filters.category) params.set('category', filters.category);
      if (filters.date) params.set('date', filters.date);
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`/api/events?${params.toString()}`);
      const data: PaginatedResponse<Event> = await response.json();

      setEvents(data.data);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    fetchEvents(newPage);
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
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 flex-shrink-0">
            <FilterPanel onFilterChange={handleFilterChange} />
          </aside>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-500">
                {loading ? 'Loading...' : `${pagination.total} events found`}
              </p>
            </div>

            <EventList events={events} loading={loading} />

            {pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
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
