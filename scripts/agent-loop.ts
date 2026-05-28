import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

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

const SYSTEM_PROMPT = `You are an expert AI agent that scrapes free events from SF Bay Area websites using the Bright Data MCP browser tools.

## Your Available Tools

You have access to these Bright Data scraping tools:

**Scraping (works reliably):**
- \`scrape_url(url)\` - Scrapes a URL directly and returns content as markdown. This is your PRIMARY tool.
- \`navigate_and_scrape(url, country)\` - Opens a browser, navigates to URL, waits for content, returns markdown

**Browser navigation (for dynamic content):**
- \`browser_navigate(url, country)\` - Navigate to URL with a headless browser
- \`browser_scroll()\` - Scroll the current browser page
- \`browser_get_text()\` - Get text from current browser page
- \`browser_snapshot()\` - Get interactive elements

## Event Sources to Scrape

Scrape free events from these SF Bay Area sources:

1. SF Public Library - https://sfpl.org/events (san_francisco, library)
2. SF Recreation & Parks - https://sfrecpark.org/Calendar.aspx (san_francisco, outdoors)
3. FunCheapSF - https://sf.funcheap.com (all counties, community)
4. Santa Clara County Library - https://sccld.org (santa_clara, library)
5. San Jose Public Library - https://sjpl.org (santa_clara, library)
6. Oakland Public Library - https://oaklandlibrary.org (alameda, library)
7. Berkeley Public Library - https://berkeleypubliclibrary.org (alameda, library)
8. Contra Costa County Library - https://ccclib.org (contra_costa, library)
9. East Bay Regional Parks - https://ebparks.org (alameda, outdoors)
10. Marin County Library - https://marinlibrary.org (marin, library)
11. San Mateo County Libraries - https://smcl.org (san_mateo, library)
12. Do The Bay - https://dothebay.com/free (all counties, community)

## Your Task

1. For each source, use scrape_url to get the content
2. Analyze the content for events
3. Extract event details (title, date, time, location)
4. Format as JSON array

## Output Format

Return a JSON array of events like this:
\`\`\`json
[
  {
    "title": "Event Title",
    "description": "Brief description",
    "date": "2026-06-05",
    "time": "14:30:00",
    "location": "Venue Name",
    "city": "San Francisco",
    "source_url": "https://...",
    "county": "san_francisco",
    "category": "library",
    "price": "free"
  }
]
\`\`\`

Start by scraping https://sfpl.org/events to find free library events.`;

// Simulated tool functions that call the Bright Data MCP-like API
async function scrapeUrl(url: string): Promise<string> {
  console.log(`  [TOOL] scrape_url("${url}")`);

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

  // Convert to markdown-like text
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

async function browserNavigate(url: string, country: string = 'us'): Promise<string> {
  console.log(`  [TOOL] browser_navigate("${url}", "${country}")`);
  return scrapeUrl(url);
}

async function callLLM(messages: any[]): Promise<any> {
  const response = await client.chat.completions.create({
    model: 'MiniMax-M2.5',
    messages,
    max_tokens: 4000,
    temperature: 0.1,
    reasoning_split: true,
  });

  return response.choices[0].message;
}

async function extractEventsFromText(text: string, sourceName: string, sourceUrl: string, county: string): Event[] {
  const prompt = `Extract all free events from this text as a JSON array.

For each event extract:
- title: Event name
- description: Brief description or ""
- date: YYYY-MM-DD format (today is 2026-05-28)
- time: HH:MM:SS 24-hour format or null
- location: Venue/location name or null
- city: City name or null
- source_url: "${sourceUrl}"
- county: "${county}"
- category: "library" or "outdoors" or "community" based on context
- price: "free"

Return ONLY a valid JSON array like:
[{"title":"Event","date":"2026-06-05","time":"14:00:00","location":"Library","city":"SF","source_url":"${sourceUrl}","county":"${county}","category":"library","price":"free"}]

Text to parse:
${text.slice(0, 20000)}`;

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

  if (content.startsWith('[') && content.includes('title')) {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log(`  Parse error: ${e}`);
    }
  }

  return [];
}

async function run() {
  console.log('=== LLM-Driven MCP Scraping Agent ===\n');

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const allEvents: Event[] = [];
  const maxTurns = 40;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;
    console.log(`\n--- Turn ${turns} ---`);

    const response = await callLLM(messages);
    const content = response.content || '';

    console.log(`LLM (${content.length} chars): ${content.slice(0, 300)}...`);

    // Check if LLM returned events
    if (content.startsWith('[') && content.includes('"title"')) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const events = JSON.parse(jsonMatch[0]);
          if (Array.isArray(events) && events.length > 0) {
            console.log(`\n=== FOUND ${events.length} EVENTS ===`);
            allEvents.push(...events);
          }
        }
      } catch (e) {
        console.log('Parse error:', e);
      }
    }

    // Check for done
    if (content.includes('done') || content.includes('finished') || content.includes('complete')) {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const events = JSON.parse(jsonMatch[0]);
          if (events.length > 0) {
            console.log(`Found ${events.length} events before done`);
            allEvents.push(...events);
          }
        } catch (e) {}
      }
      console.log('LLM indicated done');
      break;
    }

    // Check if LLM wants to call scrape_url
    const scrapeMatch = content.match(/scrape_url\s*\(\s*["']([^"']+)["']\s*\)/);
    if (scrapeMatch) {
      const url = scrapeMatch[1];
      const text = await scrapeUrl(url);
      console.log(`  Scraped ${text.length} chars from ${url}`);

      // Extract events from this page
      const countyMatch = url.match(/sfpl|sjpl|sccld|oakland|berkeley|ccclib|marin|smcl/);
      let county = 'san_francisco';
      if (url.includes('sccld') || url.includes('sjpl')) county = 'santa_clara';
      else if (url.includes('oakland') || url.includes('berkeley')) county = 'alameda';
      else if (url.includes('ccclib')) county = 'contra_costa';
      else if (url.includes('marin')) county = 'marin';
      else if (url.includes('smcl')) county = 'san_mateo';

      const sourceName = url.includes('sfpl') ? 'SF Public Library' :
                        url.includes('sjpl') ? 'San Jose Public Library' :
                        url.includes('sccld') ? 'Santa Clara County Library' :
                        url.includes('oakland') ? 'Oakland Public Library' :
                        url.includes('berkeley') ? 'Berkeley Public Library' :
                        url.includes('ccclib') ? 'Contra Costa County Library' :
                        url.includes('marin') ? 'Marin County Library' :
                        url.includes('smcl') ? 'San Mateo County Library' :
                        'Event Source';

      const events = await extractEventsFromText(text, sourceName, url, county);
      console.log(`  Extracted ${events.length} events`);
      allEvents.push(...events);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `scrape_url("${url}") returned ${text.length} chars with ${events.length} events. Continue scraping other sources or return all events as JSON when done.` });
      continue;
    }

    // Check if LLM wants to call browser_navigate
    const navMatch = content.match(/browser_navigate\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/);
    if (navMatch) {
      const url = navMatch[1];
      const text = await browserNavigate(url);
      console.log(`  Navigated and got ${text.length} chars`);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `browser_navigate returned ${text.length} chars. Continue scraping.` });
      continue;
    }

    // Otherwise continue conversation
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: 'Continue scraping the remaining event sources. Call scrape_url for each source.' });
  }

  console.log(`\n\n=== FINAL: ${allEvents.length} total events ===`);

  if (allEvents.length > 0) {
    // Save to database
    console.log('\nSaving to database...');
    const sql = neon(process.env.DATABASE_URL!);

    for (const event of allEvents) {
      try {
        await sql`
          INSERT INTO events (
            title, description, date, time, location, city, county,
            source_url, source_name, category, price
          ) VALUES (
            ${event.title}, ${event.description || ''}, ${event.date || '2026-05-28'},
            ${event.time || null}, ${event.location || null}, ${event.city || null}, ${event.county},
            ${event.source_url}, 'scraped', ${event.category || 'community'}, 'free'
          )
          ON CONFLICT (source_url) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            location = EXCLUDED.location,
            updated_at = NOW()
        `;
      } catch (e) {
        // Skip duplicates
      }
    }
    console.log('Done!');
  }

  return allEvents;
}

run().then(events => {
  console.log('\n\nSample events:');
  console.log(JSON.stringify(events.slice(0, 5), null, 2));
}).catch(console.error);