# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dutch supermarket discount aggregator that scrapes deals from Albert Heijn, Jumbo, and Lidl and displays them in a mobile app. Monorepo with three packages using npm workspaces.

## Common Commands

```bash
# Install all dependencies (run from root)
npm install

# Run mobile app (Expo)
cd packages/mobile-app
npm start                    # Start Expo dev server
npx expo start --android     # Start with Android

# Run scraper
cd packages/scraper
npm run scrape -- --supermarket=ah      # Scrape Albert Heijn
npm run scrape -- --supermarket=jumbo   # Scrape Jumbo
npm run scrape -- --supermarket=lidl    # Scrape Lidl

# Install Playwright browsers (required for scraper)
npx playwright install chromium

# Build mobile app
cd packages/mobile-app
eas build --platform android --profile preview

# Type checking
cd packages/mobile-app
npm run type-check
```

## Architecture

### Package Structure
- `packages/scraper` - Playwright-based web scrapers for supermarket websites
- `packages/mobile-app` - Expo React Native app with React Native Paper UI
- `packages/shared` - TypeScript types shared between scraper and mobile app

### Scraper Architecture
All scrapers extend `BaseScraper` in `packages/scraper/src/scrapers/base/BaseScraper.ts`:
- Handles browser initialization with stealth mode
- Cookie consent handling
- Retry logic with exponential backoff
- Image processing and upload to Supabase Storage
- Logging to `scrape_logs` table

Each supermarket has its own directory under `packages/scraper/src/scrapers/{supermarket}/`:
- `{Supermarket}Scraper.ts` - Implements `scrapeProducts()` method
- `selectors.ts` - CSS selectors for product data extraction

### Mobile App State Management
Uses Zustand stores in `packages/mobile-app/src/stores/`:
- `productsStore.ts` - Product listing with pagination and filters
- `favoritesStore.ts` - User favorites (persisted locally)
- `settingsStore.ts` - App settings

### Backend
Supabase handles:
- PostgreSQL database (products, supermarkets, categories, user_favorites, scrape_logs)
- Storage bucket `product-images` for optimized product images
- REST API auto-generated from schema

### CI/CD
GitHub Actions workflows in `.github/workflows/` run scrapers twice daily (6am/6pm CET). Each supermarket has its own workflow file. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` secrets.

## Environment Variables

**Scraper** (`packages/scraper/.env`):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (write access)
- `HEADLESS=true` - Run browser headless
- `SCREENSHOT_ON_ERROR=true` - Capture screenshots on failure

**Mobile App** (`packages/mobile-app/.env`):
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key (read access)

## Key Types

Defined in `packages/shared/src/types/`:
- `ScrapedProduct` - Data structure scraped from websites
- `Product` / `ProductWithRelations` - Database product with supermarket/category relations
- `SupermarketSlug` - `'ah' | 'jumbo' | 'lidl'`
