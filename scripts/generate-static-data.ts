import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import { neon } from '@neondatabase/serverless';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve as pathResolve } from 'path';

async function generateStaticData() {
  console.log('Generating static events data...\n');

  const sql = neon(process.env.DATABASE_URL!);

  const result = await sql`
    SELECT * FROM events ORDER BY date ASC, time ASC
  `;

  const events = result as unknown as any[];
  console.log(`Found ${events.length} events`);

  const publicDir = pathResolve(__dirname, '../public');
  mkdirSync(publicDir, { recursive: true });

  const outputPath = pathResolve(publicDir, 'events.json');
  writeFileSync(outputPath, JSON.stringify({ events, generated: new Date().toISOString() }, null, 2));

  console.log(`\nGenerated ${events.length} events to ${outputPath}`);

  const bySource: Record<string, number> = {};
  for (const e of events) {
    bySource[e.source_name] = (bySource[e.source_name] || 0) + 1;
  }
  console.log('\nEvents by source:');
  for (const [source, count] of Object.entries(bySource)) {
    console.log(`  ${source}: ${count}`);
  }
}

generateStaticData().catch(console.error);