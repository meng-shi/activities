'use client';

import { useState, useRef, useEffect } from 'react';
import { Event } from '@/lib/types';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  events?: Event[];
}

const SUGGESTIONS = [
  "What free events are in SF this weekend?",
  "Find outdoor activities in the East Bay",
  "Plan a day trip with free activities",
  "Family-friendly events in South Bay",
];

export default function ChatModal({ isOpen, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "👋 Hi! I'm your SF Bay Area event assistant. I can help you:\n\n• Find free events by county, category, or date\n• Plan a day trip with multiple activities\n• Discover family-friendly events\n• Get personalized recommendations\n\nWhat would you like to do today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/plan-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naturalLanguage: userMessage,
          date: 'today',
          startTime: '09:00',
          endTime: '18:00',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let responseText = '';

        if (data.activities && data.activities.length > 0) {
          responseText = `🎯 Here's your personalized day plan for ${data.location || 'the Bay Area'}:\n\n`;
          for (const activity of data.activities) {
            responseText += `⏰ ${activity.time}\n📍 ${activity.title}\n   ${activity.location}${activity.city ? `, ${activity.city}` : ''}\n`;
            if (activity.description) {
              responseText += `   ${activity.description}\n`;
            }
            responseText += '\n';
          }
          if (data.summary) {
            responseText += `💡 ${data.summary}`;
          }
        } else {
          responseText = data.summary || 'I couldn\'t find any events matching your request. Try a different location or search term.';
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: responseText,
            events: data.activities,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I had trouble planning your day. Please try again or browse events manually using the filters.' },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I had trouble planning your day. Please try again or browse events manually using the filters.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
        <div className="bg-gradient-to-r from-[#FF5833] to-[#FF8A50] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">Event Assistant</h3>
              <p className="text-xs text-white/80">AI-powered event finder</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-[#FF5833] to-[#FF8A50] text-white rounded-br-md'
                    : 'bg-white shadow-sm text-gray-800 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

                {message.events && message.events.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium mb-2 text-gray-500">Relevant events:</p>
                    <div className="space-y-2">
                      {message.events.slice(0, 5).map((event) => (
                        <div key={event.id} className="text-sm bg-gray-50 px-3 py-2 rounded-lg">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          <p className="text-xs text-gray-500">{event.date} {event.time} • {event.location}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#FF5833] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#FF5833] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#FF5833] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && (
          <div className="px-4 pb-2">
            <p className="text-xs text-gray-500 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestion(suggestion)}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:border-[#FF5833] hover:text-[#FF5833] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Plan a trip or find events..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#FF5833] focus:border-transparent text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-3 bg-gradient-to-r from-[#FF5833] to-[#FF8A50] hover:from-[#E54530] hover:to-[#FF5833] disabled:from-gray-300 disabled:to-gray-300 text-white rounded-full transition-all shadow-md disabled:shadow-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease;
        }
      `}</style>
    </div>
  );
}