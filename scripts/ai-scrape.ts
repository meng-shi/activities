import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1'
});

interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  markdown?: string;
}

interface ExtractedEvent {
  title: string;
  description: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  city: string | null;
  address: string | null;
  source_url: string;
}

const SOURCES = [
  { name: 'SF Public Library', url: 'https://sfpl.org/events', county: 'san_francisco', category: 'library' },
  { name: 'SF Recreation & Parks', url: 'https://sfrecpark.org/Calendar.aspx', county: 'san_francisco', category: 'outdoors' },
  { name: 'FunCheapSF', url: 'https://sf.funcheap.com', county: 'all', category: 'community' },
  { name: 'Santa Clara County Library', url: 'https://sccld.org', county: 'santa_clara', category: 'library' },
  { name: 'San Jose Public Library', url: 'https://sjpl.org', county: 'santa_clara', category: 'library' },
  { name: 'Oakland Public Library', url: 'https://oaklandlibrary.org', county: 'alameda', category: 'library' },
  { name: 'Berkeley Public Library', url: 'https://berkeleypubliclibrary.org', county: 'alameda', category: 'library' },
  { name: 'Alameda County Library', url: 'https://aclibrary.org', county: 'alameda', category: 'library' },
  { name: 'Contra Costa County Library', url: 'https://ccclib.org', county: 'contra_costa', category: 'library' },
  { name: 'East Bay Regional Parks', url: 'https://ebparks.org', county: 'alameda', category: 'outdoors' },
  { name: 'Marin County Library', url: 'https://marinlibrary.org', county: 'marin', category: 'library' },
  { name: 'Sonoma County Library', url: 'https://sonomalibrary.org', county: 'sonoma', category: 'library' },
  { name: 'Solano County Library', url: 'https://solanolibrary.com', county: 'solano', category: 'library' },
  { name: 'Napa County Library', url: 'https://napalibrary.org', county: 'napa', category: 'library' },
  { name: 'San Mateo County Libraries', url: 'https://smcl.org', county: 'san_mateo', category: 'library' },
  { name: 'Do The Bay', url: 'https://dothebay.com/free', county: 'all', category: 'community' },
  { name: 'Eventbrite Bay Area', url: 'https://www.eventbrite.com/d/ca--san-francisco/free', county: 'all', category: 'community' },
  { name: '19hz.info', url: 'https://19hz.info', county: 'all', category: 'music' },
  { name: 'Richmond Parks & Rec', url: 'https://www.ci.richmond.ca.us', county: 'contra_costa', category: 'outdoors' },
];

async function browsePage(url: string): Promise<ScrapedPage> {
  console.log(`Browsing: ${url}`);

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_TOKEN}`,
    },
    body: JSON.stringify({
      zone: 'mcp_unlocker',
      url: url,
      format: 'raw',
      country: 'us',
    }),
  });

  const html = await response.text();

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

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : url;

  return {
    url,
    title,
    text: text.slice(0, 15000),
    markdown: text,
  };
}

async function extractEventsWithLLM(
  pageContent: string,
  sourceName: string,
  sourceUrl: string,
  county: string
): Promise<ExtractedEvent[]> {
  const prompt = `You are a data extraction assistant. Extract ALL free events from the text below and return a JSON array.

For each event, extract these exact fields:
- title: Event name (required)
- description: Brief description or empty string
- date: YYYY-MM-DD format or null if not found
- time: HH:MM:SS 24-hour format (e.g., '14:30:00') or null
- location: Venue name or null
- city: City name or null
- address: Full address or null
- source_url: The URL where you found this event (use: ${sourceUrl})

Return ONLY a valid JSON array of events, nothing else. Example:
[{"title":"Event","description":"","date":"2024-06-15","time":"14:30:00","location":"Park","city":"SF","address":"123 Main St","source_url":"${sourceUrl}"}]

Rules:
- Extract ONLY free events
- Include events that span multiple days if mentioned
- Be thorough - extract everything that looks like an event
- If no events found, return []
- Do not include any explanation, only valid JSON
- Use null for missing fields, not empty strings (except description which can be "")

Text to parse:
${pageContent}`;

  const response = await client.chat.completions.create({
    model: 'MiniMax-M2.5',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    temperature: 0.1,
    reasoning_split: true,
  });

  const content = response.choices[0].message.content?.trim() || '';

  if (!content || content.length < 10) {
    return [];
  }

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`  LLM did not return valid JSON array`);
      return [];
    }
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`  Failed to parse JSON: ${e}`);
    return [];
  }
}

async function scrapeSource(
  url: string,
  sourceName: string,
  county: string,
  category?: string
): Promise<ExtractedEvent[]> {
  try {
    const page = await browsePage(url);
    const events = await extractEventsWithLLM(page.text, sourceName, url, county);
    return events.map(e => ({
      ...e,
      source_name: sourceName,
      county: county === 'all' ? 'san_francisco' : county,
      category: category || null,
      price: 'free' as const,
    }));
  } catch (error) {
    console.error(`  Error scraping ${sourceName}:`, error);
    return [];
  }
}

async function main() {
  console.log('Starting AI-driven scrape at', new Date().toISOString());
  console.log(`Sources to scrape: ${SOURCES.length}\n`);

  let totalEvents = 0;

  for (const source of SOURCES) {
    console.log(`\nScraping ${source.name}: ${source.url}`);

    const events = await scrapeSource(source.url, source.name, source.county, source.category);

    console.log(`  Found ${events.length} events from ${source.name}`);
    totalEvents += events.length;

    if (events.length > 0) {
      console.log(`  Sample event: ${events[0].title}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== Scrape complete: ${totalEvents} total events ===`);
}

main().catch(console.error);