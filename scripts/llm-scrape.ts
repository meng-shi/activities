import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1'
});

interface Event {
  title: string;
  description: string;
  date: string | null;
  time: string | null;
  location: string | null;
  city: string | null;
  source_url: string;
  county: string;
  category: string;
  price: string;
}

const SOURCES = [
  { name: 'FunCheapSF', url: 'https://sf.funcheap.com', county: 'all', category: 'community' },
  { name: 'Santa Clara County Library', url: 'https://sccl.bibliocommons.com/v2/events', county: 'santa_clara', category: 'library' },
  { name: 'San Jose Public Library', url: 'https://sjpl.bibliocommons.com/events', county: 'santa_clara', category: 'library' },
  { name: 'Marin County Library', url: 'https://marinlibrary.org', county: 'marin', category: 'library' },
  { name: 'Alameda County Library', url: 'https://aclibrary.bibliocommons.com/events', county: 'alameda', category: 'library' },
  { name: 'Do The Bay', url: 'https://dothebay.com/free', county: 'all', category: 'community' },
];

async function scrapeUrl(url: string): Promise<string> {
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_TOKEN}`,
    },
    body: JSON.stringify({
      zone: 'mcp_unlocker',
      url,
      format: 'raw',
      country: 'us',
    }),
  });

  const html = await response.text();

  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '\n')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '\n')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '\n')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '\n')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractEvents(text: string, sourceName: string, sourceUrl: string, county: string, category: string): Promise<Event[]> {
  const prompt = `Extract ALL free events from this text as a JSON array.

Rules:
- title: Event name (required)
- date: YYYY-MM-DD format (today is 2026-05-28)
- time: HH:MM:SS 24-hour format or null
- location: Venue name or null
- city: City name or null
- source_url: "${sourceUrl}"
- county: "${county}"
- category: "${category}"
- price: "free"

Return ONLY valid JSON array like:
[{"title":"Event","date":"2026-06-05","time":"14:00:00","location":"Library","city":"SF","county":"${county}","category":"${category}","price":"free"}]

Text (first 15000 chars):
${text.slice(0, 15000)}`;

  try {
    const response = await client.chat.completions.create({
      model: 'MiniMax-M2.5',
      messages: [
        { role: 'system', content: 'You extract structured event data from text. Return ONLY valid JSON array, no explanation.' },
        { role: 'user', content: prompt },
      ],
max_tokens: 4000,
      temperature: 0.1,
    });

    const content = response.choices[0].message.content || '';

    console.log(`  LLM response preview: ${content.slice(0, 300)}...`);

    // Find JSON array in content (may have reasoning text before/after)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const events = JSON.parse(jsonMatch[0]);
        if (Array.isArray(events) && events.length > 0) {
          console.log(`  Extracted ${events.length} events`);
          return events;
        }
      } catch (e) {
        console.log(`  Parse error: ${e}`);
      }
    }

    console.log(`  No events found in LLM response (${content.length} chars)`);
  } catch (e) {
    console.log(`  LLM error: ${e}`);
  }

  return [];
}

async function run() {
  console.log('=== LLM Event Scraper ===\n');

  const allEvents: Event[] = [];

  for (const source of SOURCES) {
    console.log(`\nScraping: ${source.name}`);

    try {
      const text = await scrapeUrl(source.url);
      console.log(`  Got ${text.length} chars`);

      const events = await extractEvents(text, source.name, source.url, source.county, source.category);
      console.log(`  Found ${events.length} events`);

      if (events.length > 0) {
        console.log('\nSample events:');
        console.log(JSON.stringify(events.slice(0, 3), null, 2));

        console.log('\nSaving to database...');
        const sql = neon(process.env.DATABASE_URL!);

        for (const event of events) {
          try {
            await sql`
              INSERT INTO events (
                title, description, date, time, location, city, county,
                source_url, source_name, category, price
              ) VALUES (
                ${event.title}, ${event.description || ''}, ${event.date || '2026-05-28'},
                ${event.time || null}, ${event.location || null}, ${event.city || null}, ${event.county},
                ${source.url}, ${source.name}, ${event.category || source.category}, 'free'
              )
              ON CONFLICT (source_url) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                date = EXCLUDED.date,
                time = EXCLUDED.time,
                location = EXCLUDED.location,
                source_name = EXCLUDED.source_name,
                category = EXCLUDED.category,
                updated_at = NOW()
            `;
          } catch (e) {
            // Skip duplicates
          }
        }
        console.log(`  Saved ${events.length} events from ${source.name}`);
      }
    } catch (e) {
      console.log(`  Error: ${e}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nDone!');

  return allEvents;
}

run().catch(console.error);