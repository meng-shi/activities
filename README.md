# SF Bay Area Free Events

A web application that scrapes free events and activities across the entire SF Bay Area (all 9 counties) from 20+ trusted sources and presents them through:

- **Browseable event list** with filters (county, date, category, search)
- **AI-powered "Plan My Day"** that creates personalized day itineraries from natural language requests
- **Floating chat interface** for natural language event queries
- **Auto-updating system** with hourly scraping and automatic Vercel redeployment

![SF Bay Area Events](public/sammy-ai.png)

## Features

### Browse & Filter Events
- Responsive grid layout (1-3 columns based on screen size)
- Filter by **9 Bay Area counties**: San Francisco, Alameda, Santa Clara, San Mateo, Contra Costa, Marin, Sonoma, Napa, Solano
- Filter by **10 categories**: Outdoors, Music, Arts, Sports, Library, Community, Family, Food, Education, Health
- Filter by **date**: Today, This Weekend, Next 7 Days
- Full-text search in titles and descriptions
- Pagination (20 events per page)

### Plan My Day
Natural language day planning that understands requests like:
- *"Plan a family day in Oakland from 10am to 6pm"*
- *"Create a music-focused itinerary in SF for tomorrow"*
- *"Find outdoor activities in the South Bay this weekend"*

The AI considers:
- Time windows and scheduling
- Location proximity and geographic coherence
- User interests and preferences
- Event details and descriptions

### AI Chat Interface
Floating chat button (bottom-right) opens a modal where you can ask:
- "What free events are happening in Oakland this weekend?"
- "Show me family-friendly activities in the South Bay"
- "Find free music events in San Francisco"

### Auto-Updated Content
- **Hourly scraping** via cron job using Bright Data MCP + Minimax LLM
- **Two-phase extraction**: Fast regex parsing → LLM fallback for complex pages
- **Automatic redeployment**: Inngest webhook triggers Vercel rebuild after each scrape
- **Expired event cleanup**: Events older than 24 hours are automatically removed

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 16 (App Router) + TypeScript | UI with static export |
| Database | Neon PostgreSQL (serverless) | Event storage |
| Scraping | Bright Data MCP API | Web scraping (5K req/month free) |
| AI Extraction | Minimax M2.5 | LLM-powered event extraction |
| AI Planning | Minimax M2.5 | Day planning & recommendations |
| Deploy Triggers | Inngest | Auto-redeploy on scrape completion |
| Hosting | Vercel | Static site hosting |

## Quick Start

### Prerequisites

- Node.js 18+
- Neon PostgreSQL account (free tier)
- Bright Data account (free tier: 5,000 requests/month)
- Minimax API key

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
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

# Inngest (for auto-deploy triggers)
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key

# Vercel (auto-deploy webhook)
VERCEL_WEBHOOK_URL=your_vercel_webhook_url
```

### Database Setup

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Run the schema from `src/lib/schema.sql` in the Neon SQL editor:

```sql
-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    event_detail TEXT,
    date DATE NOT NULL,
    end_date DATE,
    time TIME,
    location VARCHAR(500),
    address VARCHAR(500),
    full_address VARCHAR(500),
    city VARCHAR(100),
    county VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    price VARCHAR(50) DEFAULT 'free',
    category VARCHAR(100),
    source_url VARCHAR(1000) UNIQUE,
    source_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_scraped_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_county ON events(county);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_source ON events(source_name);
CREATE INDEX idx_events_city ON events(city);
CREATE INDEX idx_events_price ON events(price);

-- Sources table
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    base_url VARCHAR(500),
    region VARCHAR(50),
    last_scraped_at TIMESTAMP,
    events_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active'
);

-- Scrape logs
CREATE TABLE scrape_logs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    sources_updated INTEGER DEFAULT 0,
    events_added INTEGER DEFAULT 0,
    events_removed INTEGER DEFAULT 0,
    errors TEXT,
    status VARCHAR(50) DEFAULT 'running'
);
```

### Generate Static Data

Before running the dev server, generate the static events JSON:

```bash
npm run generate-data
```

This pulls all events from the database and creates `public/events.json`.

### Development

```bash
# Start development server
npm run dev

# Run scraper manually
npm run scrape

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view the website.

## Event Sources (20)

| Source | URL | County/Region |
|--------|-----|---------------|
| SF Public Library | sfpl.org/events | San Francisco |
| SF Recreation & Parks | sfrecpark.org/Calendar.aspx | San Francisco |
| FunCheapSF | sf.funcheap.com | Bay Area Wide |
| Santa Clara County Library | sccld.org | Santa Clara |
| San Jose Public Library | sjpl.org | Santa Clara |
| Oakland Public Library | oaklandlibrary.org | Alameda |
| Berkeley Public Library | berkeleypubliclibrary.org | Alameda |
| Alameda County Library | aclibrary.org | Alameda |
| Contra Costa County Library | ccclib.org | Contra Costa |
| East Bay Regional Parks | ebparks.org | Alameda/Contra Costa |
| Marin County Library | marinlibrary.org | Marin |
| Sonoma County Library | sonomalibrary.org | Sonoma |
| Solano County Library | solanolibrary.com | Solano |
| Napa County Library | napalibrary.org | Napa |
| San Mateo County Libraries | smcl.org | San Mateo |
| Do The Bay | dothebay.com/free | Bay Area Wide |
| Eventbrite (Bay Area) | eventbrite.com/d/ca--san-francisco/free | Bay Area Wide |
| 19hz.info | 19hz.info | Bay Area Wide |
| Reddit r/bayarea | reddit.com/r/bayarea | Bay Area Wide |
| Richmond Parks & Rec | ci.richmond.ca.us | Contra Costa |

## How Scraping Works

The scraper uses a **two-phase extraction** approach:

### Phase 1: Regex Parsing (`scraper.ts`)
- Fast pattern matching for date/time/location
- Works for structured event pages
- No API calls required

### Phase 2: LLM Extraction (`llm-scrape.ts`)
- Triggered when regex finds no events
- Uses Minimax M2.5 to intelligently parse varied website structures
- Adapts to irregular formats automatically

### Scraping Flow

```
1. For each source URL:
   a. Call Bright Data MCP scrape API → HTML
   b. Convert HTML to clean markdown
   c. Try parseEventsMarkdown() - regex parser
   d. If no events found, try extractEventsWithLLM() - Minimax extraction

2. Deduplicate by source_url

3. Database operations:
   a. DELETE expired events (date < now - 24 hours)
   b. UPSERT new events (ON CONFLICT DO UPDATE)

4. Trigger Inngest webhook → Vercel redeploy

5. Log results
```

### Cron Setup

To run the scraper hourly, add to your crontab:

```bash
0 * * * * cd /path/to/sf-bay-events && npm run scrape >> /var/log/scrape.log 2>&1
```

## API Reference

### POST /api/plan-day

Natural language day planning endpoint.

**Request:**
```json
{
  "naturalLanguage": "Plan a family day in Oakland from 10am to 6pm"
}
```

Or structured input:
```json
{
  "startTime": "10:00",
  "endTime": "18:00",
  "location": "Oakland",
  "interests": ["family", "kids"],
  "date": "today"
}
```

**Response:**
```json
{
  "date": "2026-05-30",
  "location": "Oakland",
  "activities": [
    {
      "time": "10:00",
      "title": "Sprout Pop Up!",
      "location": "Oakland Public Library - Golden Gate Branch",
      "city": "Oakland",
      "description": "Free gardening event where attendees can pick up herbs...",
      "reason": "Perfect for family activities with kids who love nature"
    }
  ],
  "summary": "A day of fun garden-themed activities perfect for the whole family in Oakland.",
  "eventsCount": 5
}
```

## Project Structure

```
sf-bay-events/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main page with event list & PlanMyDay
│   │   ├── layout.tsx             # Root layout
│   │   ├── globals.css            # Tailwind styles
│   │   └── api/
│   │       └── plan-day/
│   │           └── route.ts       # Day planning API endpoint
│   ├── components/
│   │   ├── EventCard.tsx          # Event card component
│   │   ├── EventList.tsx         # Paginated event grid
│   │   ├── EventModal.tsx         # Event detail modal
│   │   ├── FilterPanel.tsx        # Sidebar filters
│   │   ├── FloatingChatButton.tsx # Chat button (bottom-right)
│   │   ├── ChatModal.tsx          # AI chat interface
│   │   └── PlanMyDay.tsx          # Day planning form & timeline
│   └── lib/
│       ├── db.ts                  # Neon PostgreSQL client & queries
│       ├── scraper.ts             # Two-phase extraction logic
│       ├── planAgent.ts           # AI day planning agent
│       ├── types.ts               # TypeScript interfaces
│       └── schema.sql             # Database schema
├── scripts/
│   ├── llm-scrape.ts              # Main scraper (Bright Data + Minimax)
│   ├── agent-loop.ts              # LLM agent with tool calls
│   ├── generate-static-data.ts    # Builds public/events.json
│   ├── scrape.py                  # Python scraper
│   ├── get_event_details.py       # Python event detail fetcher
│   ├── enrich_events.py           # Event enrichment script
│   ├── remove_outdated_events.py  # Cleanup script
│   └── dedup-events.py            # Deduplication script
├── inngest/
│   └── client.ts                  # Inngest client for deploy triggers
├── skills/
│   ├── scrape-events.md           # Scraping agent skill
│   ├── mcp-scrape-skill.md        # Bright Data MCP skill
│   └── browse-events-skill.md      # Event browsing skill
├── public/
│   ├── events.json                # Static event data (generated)
│   ├── sammy-ai.png               # Mascot
│   └── *.svg                      # Logo assets
├── package.json
├── next.config.ts                  # Static export configuration
├── tsconfig.json
├── .env.example
├── requirements.txt               # Python dependencies
├── AGENTS.md                      # Agent documentation
└── README.md
```

## Categories

Events are classified into these categories:

| Category | Emoji | Description |
|----------|-------|-------------|
| outdoors | 🌲 | Parks, hikes, nature walks |
| music | 🎵 | Concerts, live music |
| arts | 🎨 | Art exhibits, theater, dance |
| sports | ⚽ | Sports, fitness activities |
| library | 📚 | Library events, book clubs |
| community | 👥 | Community gatherings, meetups |
| family | 👨‍👩‍👧 | Family-friendly activities |
| food | 🍕 | Food-related events, markets |
| education | 🎓 | Classes, workshops, learning |
| health | 🧘 | Health, wellness, yoga |

## Counties

Events are tagged with one of 9 Bay Area counties:

| County | Display Name |
|--------|--------------|
| san_francisco | San Francisco |
| alameda | Alameda |
| santa_clara | Santa Clara |
| san_mateo | San Mateo |
| contra_costa | Contra Costa |
| marin | Marin |
| sonoma | Sonoma |
| napa | Napa |
| solano | Solano |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically on push

### Auto-Deploy Flow

```
Hourly Cron → npm run scrape
           → Bright Data scrapes sources
           → Minimax extracts events
           → Neon PostgreSQL updated
           → Inngest webhook triggered
           → Vercel redeploys site
```

### Static Export

The site uses Next.js static export (`output: 'export'` in `next.config.ts`), which:
- Generates static HTML at build time
- Serves from CDN for fast loading
- No server-side rendering required
- Events loaded client-side from `/events.json`

## Troubleshooting

### Scraper Issues

- **No events found?** LLM extraction kicks in automatically
- **Page requires JavaScript?** Bright Data handles rendering
- **Rate limit hit?** Wait and retry, or check Bright Data dashboard

### Database Issues

- Verify DATABASE_URL format from Neon dashboard
- Check Neon project status and available storage
- Ensure SSL mode is enabled (`sslmode=require`)

### Chat/Planning Issues

- Ensure MINIMAX_API_KEY is valid
- Check Minimax dashboard for API usage
- Review server logs for response errors

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Run tests (`npm run build`)
5. Submit a pull request

## License

MIT License

## Acknowledgments

- [Bright Data](https://brightdata.com) - Web scraping infrastructure
- [Neon](https://neon.tech) - Serverless PostgreSQL
- [Minimax](https://minimax.chat) - AI extraction and chat
- Bay Area libraries and organizations for providing free event information