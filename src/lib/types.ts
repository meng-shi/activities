export interface Event {
  id: string;
  title: string;
  description: string | null;
  event_detail: string | null;
  date: string;
  end_date: string | null;
  time: string | null;
  location: string | null;
  address: string | null;
  full_address: string | null;
  city: string | null;
  county: string;
  latitude: number | null;
  longitude: number | null;
  price: string;
  category: string | null;
  source_url: string;
  source_name: string;
  created_at: string;
  updated_at: string;
  last_scraped_at: string;
}

export interface EventSource {
  name: string;
  url: string;
  county: string;
  category?: string;
}

export interface ScrapeResult {
  source: string;
  events: ParsedEvent[];
  errors: string[];
}

export interface ParsedEvent {
  title: string;
  description?: string;
  date?: string;
  end_date?: string;
  time?: string;
  location?: string;
  address?: string;
  city?: string;
  source_url?: string;
  source_name: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  filters?: {
    county?: string;
    category?: string;
    date?: string;
  };
}

export interface ChatResponse {
  response: string;
  events: Event[];
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface EventFilters {
  county?: string;
  category?: string;
  date?: string;
  search?: string;
  price?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const COUNTIES = [
  'san_francisco',
  'san_mateo',
  'santa_clara',
  'alameda',
  'contra_costa',
  'marin',
  'sonoma',
  'napa',
  'solano',
] as const;

export type County = typeof COUNTIES[number];

export const COUNTY_LABELS: Record<County, string> = {
  san_francisco: 'San Francisco',
  san_mateo: 'San Mateo',
  santa_clara: 'Santa Clara',
  alameda: 'Alameda',
  contra_costa: 'Contra Costa',
  marin: 'Marin',
  sonoma: 'Sonoma',
  napa: 'Napa',
  solano: 'Solano',
};

export const CATEGORIES = [
  'music',
  'arts',
  'sports',
  'outdoors',
  'library',
  'community',
  'family',
  'food',
  'education',
  'health',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  music: 'Music',
  arts: 'Arts & Culture',
  sports: 'Sports & Fitness',
  outdoors: 'Outdoors & Nature',
  library: 'Library',
  community: 'Community',
  family: 'Family',
  food: 'Food & Drink',
  education: 'Education',
  health: 'Health & Wellness',
};

export interface DayPlanInput {
  startTime: string;
  endTime: string;
  location: string;
  interests: string[];
  date: string;
}

export interface PlannedActivity {
  time: string;
  title: string;
  location: string;
  city: string;
  description: string;
  reason: string;
  sourceUrl?: string;
}

export interface DayPlan {
  date: string;
  location: string;
  activities: PlannedActivity[];
  summary: string;
  eventsCount: number;
}

export interface PlanDayRequest {
  startTime?: string;
  endTime?: string;
  location?: string;
  interests?: string[];
  date?: string;
  naturalLanguage?: string;
}
