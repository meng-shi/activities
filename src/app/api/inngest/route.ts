import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventCount, scrapeId } = body;

    console.log(`Scrape completed: ${eventCount} events (ID: ${scrapeId})`);

    const vercelWebhookUrl = process.env.VERCEL_WEBHOOK_URL;
    if (vercelWebhookUrl) {
      await fetch(vercelWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventCount,
          scrapeId,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log('Vercel deploy triggered successfully');
    }

    return NextResponse.json({ success: true, eventCount });
  } catch (error) {
    console.error('Inngest webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
