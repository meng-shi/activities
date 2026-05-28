-- SF Bay Area Free Events Database Schema

-- Events table
CREATE TABLE IF NOT EXISTS events (
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_county ON events(county);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_name);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_price ON events(price);

-- Sources table for tracking scrape history
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    base_url VARCHAR(500),
    region VARCHAR(50),
    last_scraped_at TIMESTAMP,
    events_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active'
);

-- Scrape logs for tracking
CREATE TABLE IF NOT EXISTS scrape_logs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    sources_updated INTEGER DEFAULT 0,
    events_added INTEGER DEFAULT 0,
    events_removed INTEGER DEFAULT 0,
    errors TEXT,
    status VARCHAR(50) DEFAULT 'running'
);

-- Insert initial sources
INSERT INTO sources (name, base_url, region) VALUES
    ('sfpl', 'https://sfpl.org/events', 'san_francisco'),
    ('sf_recpark', 'https://sfrecpark.org/Calendar.aspx', 'san_francisco'),
    ('funcheap', 'https://sf.funcheap.com', 'bay_area_wide'),
    ('sccld', 'https://sccld.org', 'santa_clara'),
    ('sjpl', 'https://sjpl.org', 'santa_clara'),
    ('oaklandlibrary', 'https://oaklandlibrary.org', 'alameda'),
    ('berkeleypl', 'https://berkeleypubliclibrary.org', 'alameda'),
    ('aclibrary', 'https://aclibrary.org', 'alameda'),
    ('ccclib', 'https://ccclib.org', 'contra_costa'),
    ('ebparks', 'https://ebparks.org', 'alameda'),
    ('marinlib', 'https://marinlibrary.org', 'marin'),
    ('sonomalib', 'https://sonomalibrary.org', 'sonoma'),
    ('solanolib', 'https://solanolibrary.com', 'solano'),
    ('napalib', 'https://napalibrary.org', 'napa'),
    ('smcl', 'https://smcl.org', 'san_mateo'),
    ('dothebay', 'https://dothebay.com/free', 'bay_area_wide'),
    ('eventbrite', 'https://www.eventbrite.com/d/ca--san-francisco/free--events', 'bay_area_wide'),
    ('19hz', 'https://19hz.info', 'bay_area_wide'),
    ('reddit_bayarea', 'https://www.reddit.com/r/bayarea/', 'bay_area_wide'),
    ('richmond_parks', 'https://ci.richmond.ca.us', 'contra_costa')
ON CONFLICT (name) DO NOTHING;
