import { getEvents } from '@/lib/db';

export async function generateEventsJson() {
  const allEvents = [];
  let page = 1;
  const limit = 100;
  
  while (true) {
    const result = await getEvents({}, page, limit);
    allEvents.push(...result.data);
    
    if (page >= result.pagination.pages) break;
    page++;
  }
  
  return allEvents;
}