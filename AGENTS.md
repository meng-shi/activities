# SF Bay Area Free Activities - Agent Documentation

## Project Overview

A web application that scrapes free events and activities across the entire SF Bay Area (all 9 counties: San Francisco, San Mateo, Santa Clara, Alameda, Contra Costa, Marin, Sonoma, Napa, Solano) from 20 trusted sources and presents them in a browsable list with filters and a natural language chat interface.

### Core Features

- **Scraping**: Hourly cron job scrapes 20 event sources using Bright Data MCP + LLM extraction
- **Browseable List**: Paginated event list with filtering
- **Filters**: By date, county, category, search term
- **Chat**: Floating chat button → modal with natural language queries via Minimax M2.5
- **Auto-Deploy**: Inngest webhook triggers Vercel rebuild on database changes

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Backend | Next.js API Routes (serverless) |
| Database | Neon PostgreSQL (serverless) |
| Scraping | Bright Data MCP API + Minimax LLM |
| AI Chat | Minimax M2.5 API |
| Deploy Trigger | Inngest (external webhook) |
| Hosting | Vercel |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCRAPING LAYER (hourly cron)                │
│                                                                  │
│  scripts/scrape.ts                                               │
│  ├── Uses Bright Data MCP API (scrape_as_markdown)             │
│  ├── Falls back to LLM extraction (Minimax) for varied sites  │
│  ├── Updates Neon PostgreSQL                                     │
│  │   - Removes expired events (24h+)                            │
│  │   - Upserts new/updated events                              │
│  └── Triggers Inngest webhook → Vercel redeploy               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE (Neon PostgreSQL)                    │
│                                                                  │
│  Table: events                                                   │
│  ├── id (UUID, PK)                                             │
│  ├── title, description, date, time, location, address          │
│  ├── city, county                                               │
│  ├── price (default 'free')                                     │
│  ├── category, source_url, source_name                          │
│  └── created_at, updated_at, last_scraped_at                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    WEBSITE (Next.js on Vercel)                  │
│                                                                  │
│  / ................... Browseable event list                    │
│  /api/events ....... GET events (filter, search, paginate)      │
│  /api/chat ........ POST natural language query                 │
│  /api/inngest ..... Webhook handler for deploy triggers         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│                                                                  │
│  Bright Data MCP ........... Web scraping (5000 req/month free)│
│  Neon PostgreSQL ........... Serverless Postgres database        │
│  Minimax M2.5 .............. AI extraction & chat responses       │
│  Inngest ................... Deploy triggers & async jobs        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Event Sources (20)

| # | Source | URL | County |
|---|--------|-----|--------|
| 1 | SF Public Library | sfpl.org/events | San Francisco |
| 2 | SF Recreation & Parks | sfrecpark.org/Calendar.aspx | San Francisco |
| 3 | FunCheapSF | sf.funcheap.com | Bay Area Wide |
| 4 | Santa Clara County Library | sccld.org | Santa Clara |
| 5 | San Jose Public Library | sjpl.org | Santa Clara |
| 6 | Oakland Public Library | oaklandlibrary.org | Alameda |
| 7 | Berkeley Public Library | berkeleypubliclibrary.org | Alameda |
| 8 | Alameda County Library | aclibrary.org | Alameda |
| 9 | Contra Costa County Library | ccclib.org | Contra Costa |
| 10 | East Bay Regional Parks | ebparks.org | Alameda/Contra Costa |
| 11 | Marin County Library | marinlibrary.org | Marin |
| 12 | Sonoma County Library | sonomalibrary.org | Sonoma |
| 13 | Solano County Library | solanolibrary.com | Solano |
| 14 | Napa County Library | napalibrary.org | Napa |
| 15 | San Mateo County Libraries | smcl.org | San Mateo |
| 16 | Do The Bay | dothebay.com/free | Bay Area Wide |
| 17 | Eventbrite (Bay Area) | eventbrite.com/d/ca--san-francisco/free | Bay Area Wide |
| 18 | 19hz.info | 19hz.info | Bay Area Wide |
| 19 | Reddit r/bayarea | reddit.com/r/bayarea | Bay Area Wide |
| 20 | Richmond Parks & Rec | ci.richmond.ca.us | Contra Costa |

---

## Scraping Strategy

### Two-Phase Extraction

1. **Phase 1 - Regex Parsing** (`parseEventsMarkdown`):
   - Generic date/time/location patterns
   - Works for structured event pages
   - Fast, no API calls

2. **Phase 2 - LLM Extraction** (`extractEventsWithLLM`):
   - Uses Minimax M2.5 when regex finds no events
   - Adapts to varied website structures
   - Handles irregular formats

### Bright Data MCP Usage

```typescript
// Direct API call to Bright Data MCP endpoint
const response = await fetch(
  `https://mcp.brightdata.com/mcp/scrape?token=${API_TOKEN}&url=${url}&format=markdown`
);
```

### Scraper Logic

```
scripts/scrape.ts:

1. For each source URL:
   a. Call Bright Data MCP scrape API
   b. Convert HTML to markdown if needed
   c. Try parseEventsMarkdown() - generic regex parser
   d. If no events found, try extractEventsWithLLM() - Minimax extraction

2. Deduplicate by source_url

3. Database operations:
   a. DELETE expired events (date < now - 24 hours)
   b. UPSERT new events (ON CONFLICT DO UPDATE)

4. Trigger Inngest:
   POST to Inngest webhook with { eventCount, scrapeId }

5. Log results
```

---

## Database Schema

```sql
-- events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    end_date DATE,
    time TIME,
    location VARCHAR(500),
    address VARCHAR(500),
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

---

## API Endpoints

### GET /api/events

Query events with filters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `county` | string | Filter by county |
| `category` | string | Filter by category |
| `date` | string | Filter by date (today, weekend, week) |
| `search` | string | Search in title/description |
| `price` | string | Filter by price (default: free) |

### POST /api/chat

Natural language event queries.

**Request:**
```json
{
  "message": "What free music events are happening in Oakland this weekend?"
}
```

### POST /api/inngest

Webhook handler for scrape completion events (triggers Vercel redeploy).

---

## Project Structure

```
sf-bay-events/
├── scripts/
│   └── scrape.ts              # Cron-triggered scraper
├── src/
│   ├── app/
│   │   ├── page.tsx          # Home - browseable event list
│   │   └── api/
│   │       ├── events/route.ts
│   │       ├── chat/route.ts
│   │       └── inngest/route.ts
│   ├── components/
│   │   ├── EventCard.tsx
│   │   ├── EventList.tsx
│   │   ├── FilterPanel.tsx
│   │   ├── FloatingChatButton.tsx
│   │   └── ChatModal.tsx
│   └── lib/
│       ├── db.ts             # Neon PostgreSQL client
│       ├── scraper.ts        # Bright Data MCP + LLM scraper
│       ├── types.ts          # TypeScript types
│       └── schema.sql        # Database schema
├── inngest/
│   └── client.ts             # Inngest client
├── package.json
├── .env.example
├── AGENTS.md
└── README.md
```

---

## Environment Variables

```env
# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Bright Data MCP
BRIGHT_DATA_API_TOKEN=your_token_here

# Minimax AI
MINIMAX_API_KEY=your_key_here
MINIMAX_BASE_URL=https://api.minimax.chat/v1

# Inngest
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key

# Vercel (for auto-deploy)
VERCEL_WEBHOOK_URL=https://api.vercel.com/v1/integrations/deploy/...
```

---

## Bright Data MCP Configuration

### Direct API Usage (Recommended)

```typescript
const response = await fetch(
  `https://mcp.brightdata.com/mcp/scrape?token=${API_TOKEN}&url=${url}&format=markdown`
);
```

### MCP Server Setup (for coding agents)

```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "<your-api-token>",
        "GROUPS": "browser,advanced_scraping"
      }
    }
  }
}
```

---

## Important Conventions

### Code Style
- TypeScript strict mode
- No inline comments unless explaining complex logic
- Generic types where applicable
- Prefer `async/await`

### Scraper
- Two-phase extraction: regex first, then LLM fallback
- Generic patterns only - no site-specific selectors
- Respect rate limits
- Log all scrape operations
- Delete expired events during each scrape

### Chat
- Include relevant events as context
- Summarize don't just list
- Handle "no results" gracefully

---

## Troubleshooting

### Scraper Issues
- No events found? LLM extraction kicks in automatically
- Page requires JS? Bright Data handles rendering
- Check date patterns match source format

### Database Issues
- Verify Neon DATABASE_URL format
- Check Neon project status

### Chat Issues
- Ensure event context is passed to prompt
- Check Minimax API key validity
