import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env.local') });

const SKILL_PATH = resolve(__dirname, '../skills/scrape-events.md');

function loadSkill(): string {
  return readFileSync(SKILL_PATH, 'utf-8');
}

const SYSTEM_PROMPT = loadSkill();

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

async function callMinimax(messages: any[]): Promise<any> {
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      messages,
      max_tokens: 4000,
      temperature: 0.1,
      reasoning_split: true,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message || {};
}

async function scrapePage(url: string, country: string = 'us'): Promise<string> {
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
      country,
    }),
  });

  return response.text();
}

function extractTextFromHtml(html: string): string {
  return html
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
}

async function run() {
  console.log('Starting AI-driven scraping with LLM agent...\n');

  const allEvents: Event[] = [];

  for (const source of SOURCES) {
    console.log(`\n=== Scraping: ${source.name} ===`);

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Start by navigating to ${source.url} to find free events in ${source.county} county.` },
    ];

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`  Attempt ${attempts}...`);

      const response = await callMinimax(messages);

      const content = response.content || '';
      const reasoning = response.reasoning_content || '';

      console.log(`  LLM response preview: ${content.slice(0, 200)}...`);

      if (content.startsWith('[') && content.endsWith(']')) {
        try {
          const events = JSON.parse(content);
          console.log(`  Found ${events.length} events!`);
          allEvents.push(...events);
          break;
        } catch (e) {
          console.log(`  Failed to parse JSON, continuing...`);
        }
      }

      const navigateMatch = content.match(/navigate\s+to\s+(https?:\/\/[^\s]+)/i);
      if (navigateMatch) {
        const url = navigateMatch[1];
        console.log(`  Navigating to: ${url}`);
        const html = await scrapePage(url);
        const text = extractTextFromHtml(html);
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: `Here is the content from ${url}:\n\n${text.slice(0, 10000)}\n\nContinue scraping.` });
        continue;
      }

      if (content.includes('done') || content.includes('finished') || content.includes('complete')) {
        console.log(`  LLM indicates done`);
        break;
      }

      if (attempts >= maxAttempts) {
        console.log(`  Max attempts reached, moving on`);
        break;
      }

      const html = await scrapePage(source.url);
      const text = extractTextFromHtml(html);
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `Here is the content from ${source.url}:\n\n${text.slice(0, 10000)}\n\nContinue extracting events.` });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n\n=== FINAL RESULTS ===`);
  console.log(`Total events extracted: ${allEvents.length}`);
  console.log(JSON.stringify(allEvents, null, 2));
}

run().catch(console.error);