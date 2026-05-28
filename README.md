# SF Bay Area Free Activities

A web application that scrapes free events and activities across the entire SF Bay Area and presents them in a browsable list with filters and a natural language chat interface.

## Features

- **20 Event Sources** - Libraries, parks, community centers across all 9 Bay Area counties
- **Browseable List** - Paginated event listing with smooth scrolling
- **Filters** - Filter by county, date, category, or search term
- **Natural Language Chat** - Ask questions like "What free music events are in Oakland this weekend?"
- **Auto-Updated** - Hourly cron job keeps events fresh (via Bright Data MCP + LLM)
- **Auto-Deploy** - Website rebuilds when new events are scraped

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript
- **Database**: Neon PostgreSQL (serverless)
- **Scraping**: Bright Data MCP API + Minimax LLM
- **AI Chat**: Minimax M2.5
- **Deploy Triggers**: Inngest
- **Hosting**: Vercel

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Neon account (free tier available)
- Bright Data account (free tier: 5000 requests/month)
- Minimax API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sf-bay-events.git
cd sf-bay-events

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
```

### Environment Variables

Edit `.env.local` with your credentials:

```env
# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Bright Data MCP
BRIGHT_DATA_API_TOKEN=your_bright_data_token

# Minimax AI
MINIMAX_API_KEY=your_minimax_key
MINIMAX_BASE_URL=https://api.minimax.chat/v1

# Inngest (for auto-deploy)
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key
```

### Database Setup

1. Create a Neon project at https://neon.tech
2. Run the schema from `src/lib/schema.sql` in the Neon SQL editor

### Development

```bash
# Start development server
npm run dev

# Run scraper manually
npm run scrape
```

Open [http://localhost:3000](http://localhost:3000) to view the website.

## Usage

### Browsing Events

Visit the home page to see a paginated list of all free events. Use the filter panel to narrow down by:
- County (San Francisco, Alameda, Santa Clara, etc.)
- Date (Today, This Weekend, This Week, etc.)
- Category (Music, Arts, Sports, Library, etc.)
- Search term

### Chat

Click the floating chat button (bottom-right) to open the chat modal. Ask questions like:

- "What free events are happening in Oakland this weekend?"
- "Show me family-friendly activities in the South Bay"
- "Find free music events in San Francisco"

The AI will search the event database and provide personalized recommendations.

## Scraper

The scraper runs via cron and uses Bright Data MCP to extract events from 20 sources:

```bash
# Run scraper manually
npm run scrape
```

To set up hourly cron, add to your crontab:

```bash
0 * * * * cd /path/to/sf-bay-events && npm run scrape >> /var/log/scrape.log 2>&1
```

### How Scraping Works

The scraper uses a two-phase approach:

1. **Regex Parsing** - Fast pattern matching for date/time/location
2. **LLM Extraction** - Minimax M2.5 intelligently extracts events from varied website structures

This hybrid approach handles the diverse formats across all 20 event sources without requiring custom parsers for each site.

### Event Sources

| Source | County |
|--------|--------|
| SF Public Library | San Francisco |
| SF Recreation & Parks | San Francisco |
| FunCheapSF | Bay Area Wide |
| Santa Clara County Library | Santa Clara |
| San Jose Public Library | Santa Clara |
| Oakland Public Library | Alameda |
| Berkeley Public Library | Alameda |
| Alameda County Library | Alameda |
| Contra Costa County Library | Contra Costa |
| East Bay Regional Parks | Alameda/Contra Costa |
| Marin County Library | Marin |
| Sonoma County Library | Sonoma |
| Solano County Library | Solano |
| Napa County Library | Napa |
| San Mateo County Libraries | San Mateo |
| Do The Bay | Bay Area Wide |
| Eventbrite (Bay Area) | Bay Area Wide |
| 19hz.info | Bay Area Wide |
| Reddit r/bayarea | Bay Area Wide |
| Richmond Parks & Rec | Contra Costa |

## API

### GET /api/events

Get events with optional filters.

```bash
# Get all events
curl https://your-app.vercel.app/api/events

# Filter by county
curl "https://your-app.vercel.app/api/events?county=alameda"

# Search and paginate
curl "https://your-app.vercel.app/api/events?search=music&page=2"
```

### POST /api/chat

Query events with natural language.

```bash
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What free music events are in Oakland this weekend?"}'
```

## Auto-Deploy

When the scraper runs, it triggers an Inngest webhook which kicks off a Vercel redeploy. This ensures the website always shows the latest scraped events.

To configure:

1. Create an Inngest account
2. Create a new project with a deploy webhook
3. Add the webhook URL to your Inngest configuration
4. Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to your environment

## Project Structure

```
sf-bay-events/
├── scripts/
│   └── scrape.ts              # Scraper (run via cron)
├── src/
│   ├── app/
│   │   ├── page.tsx          # Home page
│   │   └── api/
│   │       ├── events/       # Events API
│   │       ├── chat/         # Chat API
│   │       └── inngest/     # Inngest webhook handler
│   ├── components/
│   │   ├── EventCard.tsx     # Event card component
│   │   ├── EventList.tsx    # Event list with pagination
│   │   ├── FilterPanel.tsx   # Filter sidebar
│   │   ├── FloatingChatButton.tsx
│   │   └── ChatModal.tsx
│   └── lib/
│       ├── db.ts             # Database client
│       ├── scraper.ts        # Bright Data MCP + LLM scraper
│       ├── types.ts          # TypeScript types
│       └── schema.sql        # Database schema
├── inngest/
│   └── client.ts             # Inngest client
├── package.json
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [Bright Data](https://brightdata.com) for web scraping infrastructure
- [Neon](https://neon.tech) for serverless PostgreSQL
- [Minimax](https://minimax.chat) for AI extraction and chat
- All the Bay Area libraries and organizations that provide free event information
