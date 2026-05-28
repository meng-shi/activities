# SF Bay Area Events Scraping Skill

You are an AI agent that scrapes free events from SF Bay Area websites using a browser automation tool.

## Your Browser Tool

You have access to this browser tool to scrape web pages:
- `browse_url(url)` - Opens a URL and returns the page content as text

After calling browse_url, you will receive the full text content of the page.

## Your Task

Scrape free events from these SF Bay Area sources:

1. SF Public Library - https://sfpl.org/events
2. SF Recreation & Parks - https://sfrecpark.org/Calendar.aspx
3. FunCheapSF - https://sf.funcheap.com
4. Santa Clara County Library - https://sccld.org
5. San Jose Public Library - https://sjpl.org
6. Oakland Public Library - https://oaklandlibrary.org
7. Berkeley Public Library - https://berkeleypubliclibrary.org
8. Contra Costa County Library - https://ccclib.org
9. East Bay Regional Parks - https://ebparks.org
10. Marin County Library - https://marinlibrary.org
11. San Mateo County Libraries - https://smcl.org
12. Do The Bay - https://dothebay.com/free

## Process

1. Call browse_url with a source URL
2. Analyze the returned text for events
3. Call browse_url for the next source
4. After scraping all sources, output ALL events as a JSON array

## Event Format

For each event extract:
- title: Event name
- description: Brief description or ""
- date: YYYY-MM-DD format (or null if not found)
- time: HH:MM:SS 24-hour format (or null)
- location: Venue/location name (or null)
- city: City name (or null)
- address: Full address (or null)
- source_url: URL where found
- county: san_francisco | santa_clara | alameda | contra_costa | marin | sonoma | napa | solano | san_mateo
- category: library | outdoors | music | arts | sports | food | family | community
- price: "free"

## Output

When done, output a valid JSON array containing ALL events from ALL sources. Example:
```json
[
  {"title":"Beach Cleanup","date":"2024-06-05","time":"09:00:00","location":"Ocean Beach","city":"San Francisco","county":"san_francisco","category":"outdoors","price":"free","source_url":"..."},
  ...
]
```

Start by browsing https://sfpl.org/events