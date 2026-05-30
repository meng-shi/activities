'use client';

import { useState, useEffect } from 'react';
import { Event } from '@/lib/types';
import EventList from '@/components/EventList';
import PlanMyDay from '@/components/PlanMyDay';

interface FilterState {
  county?: string;
  category?: string;
  date?: string;
  search?: string;
}

const CATEGORIES = [
  { id: 'outdoors', label: 'Outdoor', icon: '🌲' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'arts', label: 'Arts & Culture', icon: '🎨' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'community', label: 'Community', icon: '👥' },
  { id: 'family', label: 'Family', icon: '👨‍👩‍👧' },
  { id: 'food', label: 'Food & Drink', icon: '🍕' },
  { id: 'education', label: 'Education', icon: '🎓' },
  { id: 'health', label: 'Health', icon: '🧘' },
];

const COUNTIES = [
  { id: 'san_francisco', label: 'SF', icon: '🏙️' },
  { id: 'alameda', label: 'Alameda', icon: '🌉' },
  { id: 'santa_clara', label: 'Santa Clara', icon: '💻' },
  { id: 'san_mateo', label: 'San Mateo', icon: '🌊' },
  { id: 'contra_costa', label: 'Contra Costa', icon: '⛰️' },
  { id: 'marin', label: 'Marin', icon: '🌲' },
  { id: 'sonoma', label: 'Sonoma', icon: '🍷' },
  { id: 'napa', label: 'Napa', icon: '🍇' },
  { id: 'solano', label: 'Solano', icon: '✈️' },
];

const DATE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'weekend', label: 'This Weekend' },
  { id: 'week', label: 'Next 7 Days' },
];

export default function Home() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/events.json')
      .then(res => res.json())
      .then((data: { events: Event[] }) => {
        setAllEvents(data.events);
        setFilteredEvents(data.events);
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

    if (searchQuery) {
      const search = searchQuery.toLowerCase();
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

    setCurrentPage(1);
    setFilteredEvents(filtered);
  }, [filters, searchQuery, allEvents]);

  const handleFilterClick = (type: 'county' | 'category' | 'date', id: string) => {
    const key = type === 'county' ? 'county' : type === 'category' ? 'category' : 'date';
    if (filters[key] === id) {
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      });
    } else {
      setFilters(prev => ({ ...prev, [key]: id }));
    }
  };

  const clearAllFilters = () => {
    setFilters({});
    setSearchQuery('');
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const getPageEvents = () => {
    const start = (currentPage - 1) * 20;
    const end = start + 20;
    return filteredEvents.slice(start, end);
  };

  const pages = Math.ceil(filteredEvents.length / 20);
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-50 text-orange-500">
        <div className="max-w-6xl mx-auto px-4 pt-8 pb-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl md:text-5xl font-bold mb-3 font-[var(--font-pacifico)]">
              Activities Near Me
            </h1>
            <p className="text-xl text-orange-500/70">
              Find amazing activities across the SF Bay Area
            </p>
          </div>

          
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-6">
        <PlanMyDay />
      </section>

      <section className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Browse</h2>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-[#FF5833] hover:text-[#E54530] font-medium"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2">County</p>
          <div className="flex flex-wrap gap-2">
            {COUNTIES.map(county => (
              <button
                key={county.id}
                onClick={() => handleFilterClick('county', county.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all ${
                  filters.county === county.id
                    ? 'bg-[#FF5833] text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#FF5833]'
                }`}
              >
                <span>{county.icon}</span>
                <span>{county.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-2">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleFilterClick('category', cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all ${
                  filters.category === cat.id
                    ? 'bg-[#FF5833] text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#FF5833]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">When</p>
          <div className="flex flex-wrap gap-2">
            {DATE_OPTIONS.map(date => (
              <button
                key={date.id}
                onClick={() => handleFilterClick('date', date.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filters.date === date.id
                    ? 'bg-[#FF5833] text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#FF5833]'
                }`}
              >
                {date.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#FF5833] rounded-full pulse-dot"></span>
                Loading events...
              </span>
            ) : (
              <span>
                <strong className="text-[#FF5833] font-bold">{filteredEvents.length}</strong> free events found
              </span>
            )}
          </p>
        </div>

        <EventList events={getPageEvents()} loading={loading} />

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-5 py-2 border border-gray-300 rounded-full disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700 font-medium"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                let pageNum;
                if (pages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pages - 2) {
                  pageNum = pages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`w-10 h-10 rounded-full transition-colors font-medium ${
                      currentPage === pageNum
                        ? 'bg-[#FF5833] text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= pages}
              className="px-5 py-2 border border-gray-300 rounded-full disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700 font-medium"
            >
              Next →
            </button>
          </div>
        )}
      </main>

      <footer className="bg-gradient-to-r from-[#FF5833] to-[#FF8A50] text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="font-medium">
            SF Bay Area Events ✨
          </p>
          <p className="text-sm text-white/80 mt-2">
            Discover activities across all 9 Bay Area counties
          </p>
        </div>
      </footer>
    </div>
  );
}