import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'sf-bay-events',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export async function triggerDeploy(eventCount: number, scrapeId?: number) {
  if (!process.env.INNGEST_SIGNING_KEY) {
    console.log('Inngest not configured, skipping deploy trigger');
    return;
  }

  try {
    await inngest.send({
      name: 'scrape/completed',
      data: {
        eventCount,
        scrapeId,
        timestamp: new Date().toISOString(),
      },
    });
    console.log(`Deploy triggered for ${eventCount} events`);
  } catch (error) {
    console.error('Failed to trigger Inngest:', error);
  }
}

export async function handleScrapeCompleted({ eventCount, scrapeId }: { eventCount: number; scrapeId?: number }) {
  console.log(`Scrape completed: ${eventCount} events (scrapeId: ${scrapeId})`);

  return {
    message: `Processed ${eventCount} events`,
    scrapeId,
  };
}
