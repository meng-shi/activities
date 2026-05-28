import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(__dirname, '../.env.local') });

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1'
});

const SKILL = readFileSync(resolve(__dirname, '../skills/browse-events-skill.md'), 'utf-8');

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

async function browseUrl(url: string): Promise<string> {
  console.log(`  Browsing: ${url}`);

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

async function run() {
  console.log('=== AI Agent Event Scraper ===\n');

  const messages: any[] = [
    { role: 'system', content: SKILL },
    { role: 'user', content: 'Start by browsing https://sfpl.org/events to find free events.' },
  ];

  const maxTurns = 30;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;
    console.log(`\n--- Turn ${turns} ---`);

    const response = await callLLM(messages);
    const content = response.content || '';
    const reasoning = response.reasoning_content || '';

    console.log(`LLM (${content.length} chars): ${content.slice(0, 200)}...`);

    // Check if LLM returned events JSON
    if (content.startsWith('[') && content.includes('"title"')) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const events = JSON.parse(jsonMatch[0]);
          if (Array.isArray(events) && events.length > 0) {
            console.log(`\n=== FOUND ${events.length} EVENTS ===`);
            console.log(JSON.stringify(events, null, 2));
            return events;
          }
        }
      } catch (e) {
        console.log('Parse error:', e);
      }
    }

    // Check if LLM wants to browse a URL
    const urlMatch = content.match(/browse_url\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (urlMatch) {
      const url = urlMatch[1];
      console.log(`LLM wants to browse: ${url}`);
      const text = await browseUrl(url);
      console.log(`Got ${text.length} chars of text`);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `browse_url("${url}") returned:\n\n${text.slice(0, 15000)}\n\nContinue extracting events.` });
      continue;
    }

    // If LLM seems done, check for events
    if (content.includes('done') || content.includes('finished') || content.includes('complete')) {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const events = JSON.parse(jsonMatch[0]);
          if (events.length > 0) {
            console.log(`Found ${events.length} events before completion`);
            return events;
          }
        } catch (e) {}
      }
      console.log('LLM indicates done but no events found');
      break;
    }

    // Add response and ask to continue
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: 'Continue. If you have events, output them as JSON. If not, call browse_url for the next source.' });
  }

  console.log('Max turns reached');
  return [];
}

run().then(events => {
  console.log('\n\nFinal events:', JSON.stringify(events, null, 2));
}).catch(console.error);