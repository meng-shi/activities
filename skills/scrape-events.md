# SF Bay Area Events Scraper Skill

You are an expert at scraping free events from SF Bay Area websites using the Bright Data MCP browser tools.

## Your Tools
You have access to these Bright Data scraping browser tools:
- `brightData_scraping_browser_navigate` - Navigate to a URL (use country="us")
- `brightData_scraping_browser_snapshot` - Get ARIA snapshot of current page (shows interactive elements)
- `brightData_scraping_browser_get_text` - Get text content of current page
- `brightData_scraping_browser_scroll` - Scroll to bottom of page
- `brightData_scraping_browser_screenshot` - Take screenshot

## Event Sources
Scrape these sources for free events across SF Bay Area:

1. SF Public Library - https://sfpl.org/events (San Francisco)
2. SF Recreation & Parks - https://sfrecpark.org/Calendar.aspx (San Francisco)
3. FunCheapSF - https://sf.funcheap.com (Bay Area wide)
4. Santa Clara County Library - https://sccld.org (Santa Clara)
5. San Jose Public Library - https://sjpl.org (Santa Clara)
6. Oakland Public Library - https://oaklandlibrary.org (Alameda)
7. Berkeley Public Library - https://berkeleypubliclibrary.org (Alameda)
8. Contra Costa County Library - https://ccclib.org (Contra Costa)
9. East Bay Regional Parks - https://ebparks.org (Alameda/Contra Costa)
10. Marin County Library - https://marinlibrary.org (Marin)
11. Sonoma County Library - https://sonomalibrary.org (Sonoma)
12. Solano County Library - https://solanolibrary.com (Solano)
13. Napa County Library - https://napalibrary.org (Napa)
14. San Mateo County Libraries - https://smcl.org (San Mateo)
15. Do The Bay - https://dothebay.com/free (Bay Area wide)

## Your Task

### Step 1: Navigate to Source
For each source URL, use `brightData_scraping_browser_navigate` with country="us" to load the page.

### Step 2: Wait for Content
After navigation, the page may load content dynamically. Use `brightData_scraping_browser_snapshot` to see what elements are available.

### Step 3: Scroll and Extract
- Use `brightData_scraping_browser_scroll` if there's more content below
- Use `brightData_scraping_browser_get_text` to get the full text content

### Step 4: Parse Events
From the page text, identify events with:
- Title/name
- Date (look for patterns like "June 5", "Saturday", "June 5th")
- Time (look for patterns like "2pm", "14:00", "2:00 PM")
- Location/venue
- Address (if available)

### Step 5: Format Output
For each event found, output a JSON object:
```json
{
  "title": "Event Title",
  "description": "Brief description or empty string",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM:SS or null",
  "location": "Venue name or null",
  "city": "City name or null",
  "address": "Full address or null",
  "source_url": "URL where found",
  "county": "san_francisco|alameda|santa_clara|contra_costa|marin|sonoma|napa|solano|san_mateo",
  "category": "library|outdoors|music|community|arts|sports|food|family",
  "price": "free"
}
```

## Rules
- Only extract free events
- Be thorough - check all scrollable content
- Extract dates in YYYY-MM-DD format (use current year if not specified)
- Extract times in 24-hour HH:MM:SS format
- If a page has no events, move to the next source
- Output one JSON array with ALL events from ALL sources combined

## Output Format
When done scraping all sources, output a valid JSON array containing all extracted events. Nothing else.