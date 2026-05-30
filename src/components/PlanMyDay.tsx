'use client';

import { useState } from 'react';
import { DayPlan, Event } from '@/lib/types';
import EventModal from './EventModal';

interface PlanMyDayProps {
  onPlanGenerated?: (plan: DayPlan) => void;
}

type PlanState = 'idle' | 'loading' | 'success' | 'error';

export default function PlanMyDay({ onPlanGenerated }: PlanMyDayProps) {
  const [query, setQuery] = useState('');
  const [planState, setPlanState] = useState<PlanState>('idle');
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setPlanState('loading');
    setError(null);
    setPlan(null);

    try {
      const response = await fetch('/api/plan-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naturalLanguage: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate plan');
      }

      setPlan(data);
      setPlanState('success');
      if (onPlanGenerated) {
        onPlanGenerated(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPlanState('error');
    }
  };

  const handleReset = () => {
    setQuery('');
    setPlan(null);
    setError(null);
    setPlanState('idle');
    setExpandedReasons(new Set());
  };

  const handleActivityClick = (activity: DayPlan['activities'][0]) => {
    if (activity.event) {
      setSelectedEvent(activity.event);
    }
  };

  const closeEventModal = () => {
    setSelectedEvent(null);
  };

  const toggleReason = (index: number) => {
    const newExpanded = new Set(expandedReasons);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedReasons(newExpanded);
  };

  const formatTime = (time: string) => {
    if (!time || time === 'TBD') return 'TBD';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  return (
    <div className="mb-8">
      <div className="bg-gradient-to-r from-[#FF5833] to-[#FF8A50] rounded-2xl p-6 shadow-lg">
        <div className="text-white mb-4">
          <h2 className="text-2xl font-bold">Plan My Day ✨</h2>
          <p className="text-white/90 text-sm">Tell me how you want to spend your day and I&apos;ll create an itinerary</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g., "Plan a family day in Oakland from 10am to 6pm"'
            className="flex-1 px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button
            type="submit"
            disabled={planState === 'loading' || !query.trim()}
            className="px-6 py-3 bg-white hover:bg-gray-100 text-[#FF5833] font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {planState === 'loading' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Planning...
              </span>
            ) : (
              'Plan My Day'
            )}
          </button>
        </form>

        <div className="mt-3 text-white/80 text-xs">
          <p>Try: &quot;Family day in Oakland&quot; • &quot;Music events in SF from 2pm to 10pm&quot; • &quot;Kids activities in San Jose&quot;</p>
        </div>
      </div>

      {planState === 'error' && error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-red-700">{error}</p>
          <button
            onClick={handleReset}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Try again
          </button>
        </div>
      )}

      {planState === 'success' && plan && (
        <div className="mt-6">
          {plan.activities.length === 0 ? (
            <div className="p-6 bg-white rounded-xl border border-gray-200 text-center">
              <p className="text-gray-600 mb-3">{plan.summary}</p>
              <button
                onClick={handleReset}
                className="text-[#FF5833] hover:text-[#E54530] text-sm font-medium"
              >
                Try a different search
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-gradient-to-r from-[#FF5833]/10 to-[#FF8A50]/10 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Your Day Plan for {plan.location || 'the Bay Area'}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{plan.summary}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-[#FF5833] hover:text-[#E54530] font-medium"
                >
                  Start Over
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {plan.activities.map((activity, index) => (
                  <div key={index} className={activity.event ? 'hover:bg-orange-50 transition-colors cursor-pointer' : ''}>
                    {activity.event ? (
                      <div onClick={() => handleActivityClick(activity)} className="p-4">
                        <div className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF5833] to-[#FF8A50] flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {formatTime(activity.time)}
                            </div>
                            {index < plan.activities.length - 1 && (
                              <div className="w-1 h-full bg-gradient-to-b from-[#FF5833] to-[#FF8A50] my-1 rounded" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900">{activity.title}</h4>
                            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                              <span>📍</span>
                              {activity.location} {activity.city && `• ${activity.city}`}
                            </p>
                            {activity.description && (
                              <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                {activity.description}
                              </p>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReason(index);
                              }}
                              className="mt-2 text-xs text-[#FF5833] hover:text-[#E54530] flex items-center gap-1 font-medium"
                            >
                              {expandedReasons.has(index) ? (
                                <>
                                  <span>▲</span>
                                  Hide reasoning
                                </>
                              ) : (
                                <>
                                  <span>💡</span>
                                  Why this activity?
                                </>
                              )}
                            </button>
                            {expandedReasons.has(index) && (
                              <p className="mt-2 text-xs text-gray-600 bg-orange-50 p-3 rounded-lg border border-orange-100">
                                {activity.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF5833] to-[#FF8A50] flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {formatTime(activity.time)}
                            </div>
                            {index < plan.activities.length - 1 && (
                              <div className="w-1 h-full bg-gradient-to-b from-[#FF5833] to-[#FF8A50] my-1 rounded" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900">{activity.title}</h4>
                            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                              <span>📍</span>
                              {activity.location} {activity.city && `• ${activity.city}`}
                            </p>
                            {activity.description && (
                              <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                {activity.description}
                              </p>
                            )}
                            <button
                              onClick={() => toggleReason(index)}
                              className="mt-2 text-xs text-[#FF5833] hover:text-[#E54530] flex items-center gap-1 font-medium"
                            >
                              {expandedReasons.has(index) ? (
                                <>
                                  <span>▲</span>
                                  Hide reasoning
                                </>
                              ) : (
                                <>
                                  <span>💡</span>
                                  Why this activity?
                                </>
                              )}
                            </button>
                            {expandedReasons.has(index) && (
                              <p className="mt-2 text-xs text-gray-600 bg-orange-50 p-3 rounded-lg border border-orange-100">
                                {activity.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <EventModal event={selectedEvent} onClose={closeEventModal} />
    </div>
  );
}