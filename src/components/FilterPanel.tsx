'use client';

import { useState } from 'react';
import { COUNTIES, COUNTY_LABELS } from '@/lib/types';

interface FilterState {
  county?: string;
  category?: string;
  date?: string;
  search?: string;
}

interface FilterPanelProps {
  onFilterChange: (filters: FilterState) => void;
}

const DATE_OPTIONS = [
  { value: '', label: 'Any Date' },
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'This Weekend' },
  { value: 'week', label: 'Next 7 Days' },
];

export default function FilterPanel({ onFilterChange }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterState>({});

  const updateFilter = (key: keyof FilterState, value: string | undefined) => {
    const newFilters = { ...filters, [key]: value };
    if (!value) delete newFilters[key];
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Filters</h2>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            County
          </label>
          <select
            value={filters.county || ''}
            onChange={(e) => updateFilter('county', e.target.value || undefined)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF5833] focus:border-transparent text-gray-700"
          >
            <option value="">All Counties</option>
            {COUNTIES.map((county) => (
              <option key={county} value={county}>
                {COUNTY_LABELS[county]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            When
          </label>
          <div className="space-y-2">
            {DATE_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="date"
                  value={option.value}
                  checked={filters.date === option.value || (!filters.date && option.value === '')}
                  onChange={(e) => updateFilter('date', e.target.value || undefined)}
                  className="w-4 h-4 text-[#FF5833] border-gray-300 focus:ring-[#FF5833]"
                />
                <span className="text-sm text-gray-600 group-hover:text-gray-900">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="w-full py-2.5 text-sm text-[#FF5833] hover:text-[#E54530] font-medium border border-[#FF5833] rounded-lg hover:bg-orange-50 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}