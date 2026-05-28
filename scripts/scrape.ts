import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

import { SOURCES, parseEventsMarkdown, normalizeEvent, extractEventsWithLLM } from '../src/lib/scraper';
import { upsertEvent, deleteExpiredEvents, logScrapeStart, logScrapeComplete } from '../src/lib/db';
import { triggerDeploy } from '../inngest/client';

async function scrapeSource(
  url: string,
  sourceName: string,
  county: string,
  category?: string
) {
  console.log(`Scraping ${sourceName}: ${url}`);

  try {
    if (!process.env.BRIGHT_DATA_API_TOKEN) {
      console.log(`  Bright Data API token not set`);
      return [];
    }

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const html = await response.text();
    const markdown = htmlToMarkdown(html);

    if (!markdown || markdown.trim().length < 100) {
      console.log(`  Minimal content, trying LLM extraction...`);
      if (process.env.MINIMAX_API_KEY) {
        const events = await extractEventsWithLLM(markdown || '', sourceName, url, county, category);
        console.log(`  LLM extracted ${events.length} events`);
        return events;
      }
      return [];
    }

    let parsed = parseEventsMarkdown(markdown, { name: sourceName, url, county, category });

    if (parsed.length === 0 && process.env.MINIMAX_API_KEY) {
      console.log(`  No events found with regex, trying LLM extraction...`);
      parsed = await extractEventsWithLLM(markdown, sourceName, url, county, category);
    }

    console.log(`  Found ${parsed.length} events from ${sourceName}`);
    return parsed;
  } catch (error) {
    console.error(`  Error scraping ${sourceName}:`, error);
    return [];
  }
}

function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '\n');
  md = md.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '\n');
  md = md.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '\n');
  md = md.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '\n');

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1');
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  md = md.replace(/<[^>]+>/g, '');

  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&mdash;/g, '—');
  md = md.replace(/&ndash;/g, '–');
  md = md.replace(/&hellip;/g, '...');
  md = md.replace(/&#\d+;/g, '');

  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

async function runScrape() {
  console.log('Starting scrape at', new Date().toISOString());
  console.log(`Sources to scrape: ${SOURCES.length}`);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  if (!process.env.BRIGHT_DATA_API_TOKEN) {
    console.error('BRIGHT_DATA_API_TOKEN not set');
    process.exit(1);
  }

  const logId = await logScrapeStart();

  let totalEvents = 0;
  let errors: string[] = [];

  for (const source of SOURCES) {
    try {
      const events = await scrapeSource(source.url, source.name, source.county, source.category);

      for (const event of events) {
        try {
          const normalized = normalizeEvent({
            ...event,
            source_name: source.name,
            source_url: event.source_url || source.url,
          });
          await upsertEvent(normalized);
          totalEvents++;
        } catch (err) {
          console.error(`  Error upserting event:`, err);
        }
      }
    } catch (err) {
      const errorMsg = `${source.name}: ${err}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  const removedCount = await deleteExpiredEvents(24);
  console.log(`Removed ${removedCount} expired events`);

  await logScrapeComplete(logId, SOURCES.length, totalEvents, removedCount, errors.join('\n'));

  await triggerDeploy(totalEvents);

  console.log(`\nScrape complete: ${totalEvents} events processed`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Error details:', errors);
  }
}

runScrape().catch(console.error);
