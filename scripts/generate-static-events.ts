import { getEvents } from './db';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env.local') });

async function generateStaticEvents() {
  console.log('Generating static events data...');

  const allEvents: any[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const result = await getEvents({}, page, limit);
    allEvents.push(...result.data);
    console.log(`  Page ${page}: ${result.data.length} events (total: ${result.pagination.total})`);

    if (page >= result.pagination.pages) break;
    page++;
  }

  const outputPath = resolve(__dirname, '../public/events.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ events: allEvents, generated: new Date().toISOString() }, null, 2));

  console.log(`\nGenerated ${allEvents.length} events to ${outputPath}`);
}

generateStaticEvents().catch(console.error);