import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env.local') });

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1'
});

const SKILL = readFileSync(resolve(__dirname, '../skills/mcp-scrape-skill.md'), 'utf-8');

interface Event {
  title: string;
  description: string;
  date: string | null;
  time: string | null;
  location: string | null;
  city: string | null;
  address: string | null;
  source_url: string;
  county: string;
  category: string;
  price: string;
}

const SOURCES = [
  { name: 'SF Public Library', url: 'https://sfpl.org/events', county: 'san_francisco', category: 'library' },
  { name: 'SF Recreation & Parks', url: 'https://sfrecpark.org/Calendar.aspx', county: 'san_francisco', category: 'outdoors' },
  { name: 'FunCheapSF', url: 'https://sf.funcheap.com', county: 'all', category: 'community' },
  { name: 'Santa Clara County Library', url: 'https://sccld.org', county: 'santa_clara', category: 'library' },
  { name: 'San Jose Public Library', url: 'https://sjpl.org', county: 'santa_clara', category: 'library' },
  { name: 'Oakland Public Library', url: 'https://oaklandlibrary.org', county: 'alameda', category: 'library' },
  { name: 'Berkeley Public Library', url: 'https://berkeleypubliclibrary.org', county: 'alameda', category: 'library' },
  { name: 'Contra Costa County Library', url: 'https://ccclib.org', county: 'contra_costa', category: 'library' },
  { name: 'East Bay Regional Parks', url: 'https://ebparks.org', county: 'alameda', category: 'outdoors' },
  { name: 'Marin County Library', url: 'https://marinlibrary.org', county: 'marin', category: 'library' },
  { name: 'San Mateo County Libraries', url: 'https://smcl.org', county: 'san_mateo', category: 'library' },
  { name: 'Do The Bay', url: 'https://dothebay.com/free', county: 'all', category: 'community' },
];

async function scrapeAsMarkdown(url: string): Promise<string> {
  console.log(`  Scraping: ${url}`);

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

  return response.text();
}

function extractEventsFromText(text: string, sourceName: string, sourceUrl: string, county: string): Event[] {
  const events: Event[] = [];
  const lines = text.split('\n');

  const dateRegex = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s*\d{4})/gi;
  const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*(?:AM|PM|am|pm)\s*-\s*\d{1,2}\s*(?:AM|PM|am|pm))/g;
  const titleLinkRegex = /\[([^\]]+)\]\(([^)]+)\]/g;

  for (const line of lines) {
    if (line.includes('/events/') && line.includes('[')) {
      const titleMatch = line.match(/\[([^\]]+)\]/);
      const urlMatch = line.match(/\(([^)]+)\)/);

      if (titleMatch && urlMatch) {
        const title = titleMatch[1];
        const eventUrl = urlMatch[1];

        let date: string | null = null;
        let time: string | null = null;

        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
          const dateStr = dateMatch[0];
          const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (parts) {
            date = `${parts[3]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }

        const timeMatch = line.match(timeRegex);
        if (timeMatch) {
          const timeStr = timeMatch[0];
          const timeParts = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
          if (timeParts) {
            let hours = parseInt(timeParts[1]);
            const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
            const meridiem = timeParts[3];

            if (meridiem) {
              if (meridiem.toLowerCase() === 'pm' && hours !== 12) hours += 12;
              if (meridiem.toLowerCase() === 'am' && hours === 12) hours = 0;
            }

            time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
          }
        }

        const locationMatch = line.match(/\[([^\]]+)\]\(\/locations\/[^)]+\)/);
        const city = locationMatch ? locationMatch[1] : null;

        events.push({
          title,
          description: '',
          date,
          time,
          location: city || sourceName,
          city,
          address: null,
          source_url: eventUrl.startsWith('http') ? eventUrl : `https://sfpl.org${eventUrl}`,
          county: county === 'all' ? 'san_francisco' : county,
          category: sourceName.toLowerCase().includes('library') ? 'library' : 'community',
          price: 'free',
        });
      }
    }
  }

  return events;
}

async function callLLM(content: string, context: string): Promise<any> {
  const response = await client.chat.completions.create({
    model: 'MiniMax-M2.5',
    messages: [
      { role: 'system', content: 'You are an expert at extracting structured event data from text.' },
      { role: 'user', content: `Extract all events from this content and return as JSON array:\n\n${content}\n\n${context}` },
    ],
    max_tokens: 4000,
    temperature: 0.1,
    reasoning_split: true,
  });

  return response.choices[0].message;
}

async function run() {
  console.log('=== Bright Data MCP Scraper ===\n');

  const allEvents: Event[] = [];

  for (const source of SOURCES) {
    console.log(`\n=== ${source.name} ===`);

    const html = await scrapeAsMarkdown(source.url);
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '\n')
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

    const llmResponse = await callLLM(
      text.slice(0, 15000),
      `Source: ${source.name} (${source.url}). Extract events with title, date (YYYY-MM-DD), time (HH:MM:SS), location, county (${source.county}), category (${source.category}), price (free).`
    );

    const content = llmResponse.content || '';

    if (content.startsWith('[') && content.includes('title')) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const events = JSON.parse(jsonMatch[0]);
          console.log(`  Found ${events.length} events`);
          allEvents.push(...events);
        }
      } catch (e) {
        console.log(`  Parse error: ${e}`);
      }
    } else {
      const extracted = extractEventsFromText(text, source.name, source.url, source.county);
      console.log(`  Extracted ${extracted.length} events via regex`);
      allEvents.push(...extracted);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n\n=== TOTAL: ${allEvents.length} events ===`);

  if (allEvents.length > 0) {
    console.log('\nSample events:');
    console.log(JSON.stringify(allEvents.slice(0, 3), null, 2));
  }
}

run().catch(console.error);