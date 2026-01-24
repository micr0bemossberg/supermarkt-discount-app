# SupermarktDeals - Dutch Supermarket Discount Aggregator

A mobile application that aggregates discount offers from major Dutch supermarkets (Albert Heijn, Jumbo, Lidl) with automated scraping and cloud-synced favorites.

## Project Structure

```
supermarkt-discount-app/
├── packages/
│   ├── scraper/          # Node.js + Playwright web scraper
│   ├── mobile-app/       # Expo React Native mobile app
│   └── shared/           # Shared TypeScript types
├── supabase/             # Database migrations and functions
├── .github/workflows/    # GitHub Actions for automated scraping
└── docs/                 # Documentation
```

## Tech Stack

- **Mobile App:** Expo (React Native), TypeScript, React Native Paper
- **Backend:** Supabase (PostgreSQL, Auth, Storage, REST API)
- **Scraper:** Node.js, Playwright
- **CI/CD:** GitHub Actions
- **State Management:** Zustand

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account
- Expo account (for EAS Build)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/supermarkt-discount-app.git
cd supermarkt-discount-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in each package
   - Fill in your Supabase credentials

### Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Run the migrations in order:
```bash
# In Supabase SQL Editor, run:
# 1. supabase/migrations/20260117000001_initial_schema.sql
# 2. supabase/migrations/20260117000002_seed_data.sql
# 3. supabase/migrations/20260117000003_rls_policies.sql
```
3. Create storage bucket named `product-images` with public access
4. Save your project URL and keys to `.env` files

### Running the Scraper

```bash
cd packages/scraper
npm install
npm run scrape -- --supermarket=ah
```

### Running the Mobile App

```bash
cd packages/mobile-app
npm install
npx expo start
```

Scan the QR code with Expo Go app on your Android device.

## Features

### MVP (Phase 1)
- Browse discounts from 3 Dutch supermarkets
- Search and filter products
- User authentication (email/password)
- Cloud-synced favorites
- Product details with images
- Dark mode support

### Planned Features (Phase 2+)
- Add more supermarkets (Aldi, Plus, etc.)
- Push notifications for price drops
- Store locator
- Shopping list
- Recipe suggestions

## Development

### Scraper Package
See [packages/scraper/README.md](packages/scraper/README.md)

### Mobile App Package
See [packages/mobile-app/README.md](packages/mobile-app/README.md)

### Shared Types Package
See [packages/shared/README.md](packages/shared/README.md)

## Deployment

### Scraper (GitHub Actions)
Scrapers run automatically via GitHub Actions twice daily (6am and 6pm CET).

Add these secrets to your GitHub repository:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Mobile App (EAS Build)
Build Android APK:
```bash
cd packages/mobile-app
eas build --platform android --profile production
```

## Documentation

- [Technical PRD](docs/PRD.md)
- [Architecture Guide](docs/ARCHITECTURE.md) (coming soon)
- [Scraping Guide](docs/SCRAPING_GUIDE.md) (coming soon)
- [Deployment Guide](docs/DEPLOYMENT.md) (coming soon)

## License

MIT

## Contributing

This is a personal project, but suggestions and feedback are welcome via issues.
