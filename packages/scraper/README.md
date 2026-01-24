# SupermarktDeals Scraper

Web scraper for Dutch supermarket discount offers using Playwright.

## Features

- Scrapes discount products from Albert Heijn, Jumbo, and Lidl
- Automated image processing and optimization
- Supabase integration for data storage
- Deduplication to prevent duplicate products
- Error handling with retry logic
- Screenshot capture on errors
- Detailed logging and monitoring

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Usage

### Run specific supermarket scraper

```bash
# Albert Heijn
npm run scrape -- --supermarket=ah

# Jumbo
npm run scrape -- --supermarket=jumbo

# Lidl
npm run scrape -- --supermarket=lidl
```

### Run all scrapers

```bash
npm run scrape -- all
```

### View statistics

```bash
npm run scrape -- stats --supermarket=ah
```

### Cleanup expired products

```bash
npm run scrape -- cleanup
```

## Development

### Run in non-headless mode (for debugging)

```bash
HEADLESS=false npm run scrape -- --supermarket=ah
```

### Build TypeScript

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

## How It Works

1. **Browser Initialization**: Launches Chromium with stealth settings to avoid bot detection
2. **Page Navigation**: Navigates to supermarket offers page
3. **Cookie Consent**: Automatically handles cookie consent popups
4. **Product Extraction**: Scrolls page and extracts product data using CSS selectors
5. **Image Processing**: Downloads images, optimizes to WebP format, uploads to Supabase Storage
6. **Data Insertion**: Inserts products into Supabase database with deduplication
7. **Logging**: Records scrape execution details for monitoring

## Architecture

```
src/
├── config/           # Configuration and Supabase client
├── database/         # Database layer (products, scrape logs)
├── scrapers/
│   ├── base/        # BaseScraper abstract class
│   ├── ah/          # Albert Heijn scraper
│   ├── jumbo/       # Jumbo scraper
│   └── lidl/        # Lidl scraper
├── utils/           # Utilities (logger, image processor, deduplication)
└── index.ts         # CLI entry point
```

## Troubleshooting

### Scraper fails with selector not found

The website structure may have changed. Update the selectors in `src/scrapers/{supermarket}/selectors.ts`:

1. Visit the supermarket website in your browser
2. Open DevTools (F12)
3. Inspect the product elements
4. Update the CSS selectors accordingly

### Images not uploading

- Ensure the `product-images` bucket exists in Supabase Storage
- Verify the bucket has public read access
- Check that your service role key has storage permissions

### Bot detection / CAPTCHA

- Try running in non-headless mode: `HEADLESS=false`
- Increase delays in `src/config/constants.ts`
- Consider using residential proxies (not implemented in MVP)

## Adding New Supermarkets

1. Create folder: `src/scrapers/{supermarket}/`
2. Create `selectors.ts` with CSS selectors
3. Create `{Supermarket}Scraper.ts` extending `BaseScraper`
4. Implement `scrapeProducts()` method
5. Add to `src/index.ts` switch statement
6. Update Supabase seed data with new supermarket

## Notes

- Scrapers respect rate limiting (2-5 second delays between requests)
- Screenshots are saved to `./screenshots/` on errors
- Products are automatically deduplicated based on hash
- Expired products remain in database but are marked inactive
