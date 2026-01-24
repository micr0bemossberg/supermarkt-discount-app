# @supermarkt-deals/shared

Shared TypeScript types for the SupermarktDeals application.

## Overview

This package contains TypeScript type definitions that are shared across:
- **Scraper package** (Node.js + Playwright)
- **Mobile app package** (Expo React Native)

## Types

### Core Types
- `Supermarket` - Dutch supermarket chain
- `Category` - Product category
- `Product` - Discount product with all details
- `ProductWithRelations` - Product with joined supermarket and category
- `UserFavorite` - User's favorited product

### Scraper Types
- `ScrapedProduct` - Raw product data from scraping
- `ScrapeResult` - Result of a scraper execution
- `ScrapeLog` - Log entry for monitoring

### Filter Types
- `ProductFilters` - Query filters for fetching products

## Usage

```typescript
import {
  Product,
  Supermarket,
  Category,
  ScrapedProduct
} from '@supermarkt-deals/shared';
```

## Building

```bash
npm run build
```

This compiles the TypeScript types to JavaScript with declaration files.

## Development

```bash
npm run watch
```

Watches for changes and recompiles automatically.
