import { NextRequest, NextResponse } from 'next/server';
import { getEvents, getEventById } from '@/lib/db';
import { EventFilters } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: EventFilters = {};

    const county = searchParams.get('county');
    if (county) filters.county = county;

    const category = searchParams.get('category');
    if (category) filters.category = category;

    const date = searchParams.get('date');
    if (date) filters.date = date;

    const search = searchParams.get('search');
    if (search) filters.search = search;

    const price = searchParams.get('price');
    if (price) filters.price = price;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const result = await getEvents(filters, page, limit);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events', code: 'FETCH_ERROR' },
      { status: 500 }
    );
  }
}
