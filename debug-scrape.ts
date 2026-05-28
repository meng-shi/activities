import { config } from 'dotenv';
import { resolve } from 'path';
import OpenAI from 'openai';

config({ path: resolve(__dirname, '.env.local') });

async function test() {
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_TOKEN}`,
    },
    body: JSON.stringify({
      zone: 'mcp_unlocker',
      url: 'https://sfpl.org/events',
      format: 'raw',
    }),
  });

  const html = await response.text();

  console.log('HTML length:', html.length);

  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (jsonLd) {
    console.log('\nJSON-LD found:');
    console.log(jsonLd[1].slice(0, 2000));
  } else {
    console.log('\nNo JSON-LD found');
  }

  const eventUrls = html.match(/https?:\/\/[^\s"'<>]*event[^\s"'<>]*/gi);
  if (eventUrls) {
    console.log('\nEvent-related URLs:', eventUrls.slice(0, 10));
  }

  const scriptSrc = html.match(/src=["']([^"']*\.js[^"']*)["']/gi);
  if (scriptSrc) {
    console.log('\nJS files:', scriptSrc.slice(0, 5));
  }
}

test().catch(console.error);