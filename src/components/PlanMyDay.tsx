'use client';

import { useState } from 'react';
import { DayPlan, PlannedActivity } from '@/lib/types';

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
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 shadow-lg">
        <div className="text-white mb-4">
          <h2 className="text-2xl font-bold">Plan My Day</h2>
          <p className="text-blue-100 text-sm">Tell me how you want to spend your day</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g., "Plan a family day in Oakland from 10am to 6pm"'
            className="flex-1 px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            type="submit"
            disabled={planState === 'loading' || !query.trim()}
            className="px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="mt-3 text-blue-100 text-xs">
          <p>Try: "Family day in Oakland" • "Music events in SF from 2pm to 10pm" • "Kids activities in San Jose"</p>
        </div>
      </div>

      {planState === 'error' && error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
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
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Try a different search
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Your Day Plan</h3>
                  <p className="text-sm text-gray-500">{plan.summary}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Start Over
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {plan.activities.map((activity, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                          {formatTime(activity.time)}
                        </div>
                        {index < plan.activities.length - 1 && (
                          <div className="w-0.5 h-full bg-blue-200 my-1" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900">{activity.title}</h4>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {activity.location} {activity.city && `• ${activity.city}`}
                        </p>
                        {activity.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {activity.description}
                          </p>
                        )}
                        <button
                          onClick={() => toggleReason(index)}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          {expandedReasons.has(index) ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              Hide reasoning
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              Why this activity?
                            </>
                          )}
                        </button>
                        {expandedReasons.has(index) && (
                          <p className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
                            {activity.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}