# SupermarktDeals - Complete Setup Guide

This guide will walk you through setting up the complete SupermarktDeals application from scratch.

## 🎯 Overview

The SupermarktDeals app consists of three main components:
1. **Supabase Backend** - Database, storage, and API
2. **Scraper** - Node.js app that scrapes supermarket websites
3. **Mobile App** - Expo/React Native Android app

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** - [Download](https://nodejs.org/)
- **npm or yarn** - Comes with Node.js
- **Git** - For version control
- **Supabase Account** - [Sign up free](https://supabase.com)
- **Expo Account** - [Sign up free](https://expo.dev)
- **Android Studio** (optional) - For Android emulator
- **Physical Android device** (recommended) - With Expo Go app installed

## 🚀 Step-by-Step Setup

### Step 1: Initialize the Project

```bash
# Navigate to project directory
cd "c:\Users\husayna\supermarkt discount app"

# Install dependencies for all packages
npm install
```

This will install dependencies for:
- Root workspace
- Scraper package
- Mobile app package
- Shared types package

### Step 2: Set Up Supabase Backend

#### 2.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create new project:
   - Name: `supermarkt-deals`
   - Database Password: Choose a strong password (save it!)
   - Region: Select closest to Netherlands
   - Wait 2-3 minutes for project setup

#### 2.2 Run Database Migrations

1. In Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy content from `supabase/migrations/20260117000001_initial_schema.sql`
4. Paste and click "Run"
5. Repeat for the other migration files **in order**:
   - `20260117000002_seed_data.sql`
   - `20260117000003_rls_policies.sql`

#### 2.3 Create Storage Bucket

1. In Supabase dashboard, go to **Storage**
2. Click "Create a new bucket"
3. Bucket name: `product-images`
4. **Public bucket**: Toggle ON
5. Click "Create bucket"

#### 2.4 Get Your API Keys

1. Go to **Project Settings** → **API**
2. Copy these values (you'll need them later):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key: `eyJxxx...` (long string)
   - **service_role** key: `eyJxxx...` (different long string)

⚠️ **Important**: Keep your `service_role` key secret! Never commit it to Git.

### Step 3: Configure Scraper

```bash
# Navigate to scraper package
cd packages/scraper

# Copy environment template
cp .env.example .env
```

Edit `packages/scraper/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
NODE_ENV=development
HEADLESS=true
SCREENSHOT_ON_ERROR=true
```

### Step 4: Configure Mobile App

```bash
# Navigate to mobile app package
cd ../mobile-app

# Copy environment template
cp .env.example .env
```

Edit `packages/mobile-app/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 5: Test the Scraper

```bash
# Navigate to scraper directory
cd ../scraper

# Install Playwright browsers
npx playwright install chromium

# Test scraper with one supermarket
npm run scrape -- --supermarket=jumbo
```

Expected output:
```
✓ Supabase connection successful
Starting JUMBO scraper
========================================
Navigating to https://www.jumbo.com/aanbiedingen...
Page loaded
Extracting products...
Found X product elements
Scraped X products from Jumbo
Processing X products...
Processed: X inserted, X skipped
✓ JUMBO scraper completed successfully
  Products scraped: X
  Products inserted: X
  Duration: Xs
```

**Troubleshooting**:
- If scraper fails, check selectors in `packages/scraper/src/scrapers/jumbo/selectors.ts`
- Supermarket websites change frequently - you may need to update selectors
- Run with `HEADLESS=false` to see browser: `HEADLESS=false npm run scrape -- --supermarket=jumbo`

### Step 6: Verify Data in Supabase

1. Go to Supabase dashboard → **Table Editor**
2. Select `products` table
3. You should see products from Jumbo
4. Go to **Storage** → `product-images`
5. You should see product images uploaded

### Step 7: Run the Mobile App

```bash
# Navigate to mobile app
cd ../mobile-app

# Start Expo development server
npm start
```

Options:
- Press `a` to open on Android emulator
- Scan QR code with **Expo Go** app on your phone
- Press `w` to open in web browser (limited features)

### Step 8: Configure GitHub Actions (Optional)

If you want automated scraping:

1. Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/supermarkt-discount-app.git
git push -u origin main
```

2. Add GitHub Secrets:
   - Go to repo **Settings** → **Secrets and variables** → **Actions**
   - Click "New repository secret"
   - Add:
     - `SUPABASE_URL` = your Supabase project URL
     - `SUPABASE_SERVICE_KEY` = your service role key

3. Scrapers will now run automatically:
   - Albert Heijn: 6:00 AM & 6:00 PM CET
   - Jumbo: 6:15 AM & 6:15 PM CET
   - Lidl: 6:30 AM & 6:30 PM CET
   - Cleanup: Mondays at 2:00 AM CET

## 🧪 Testing the App

### Test Checklist

- [ ] App launches successfully
- [ ] Products load on home screen
- [ ] Filter by supermarket works
- [ ] Filter by category works
- [ ] Search functionality works
- [ ] Product detail screen shows correct info
- [ ] Add/remove favorites works
- [ ] Favorites persist after app restart
- [ ] Settings screen opens
- [ ] Dark mode toggle works

## 🛠 Troubleshooting

### Scraper Issues

**"Failed to connect to Supabase"**
- Check `.env` file has correct credentials
- Verify Supabase project is active
- Try copying keys again from Supabase dashboard

**"No products scraped"**
- Supermarket website structure may have changed
- Update selectors in `packages/scraper/src/scrapers/{supermarket}/selectors.ts`
- Run with `HEADLESS=false` to debug visually

**"Image upload failed"**
- Check `product-images` bucket exists and is public
- Verify service role key has storage permissions

### Mobile App Issues

**"Module not found" errors**
```bash
# Clear cache and reinstall
cd packages/mobile-app
rm -rf node_modules
npm install
npm start -- --clear
```

**App shows "No products"**
- Run scraper first to populate database
- Check Supabase connection in app
- Verify `.env` file has anon key (not service key!)

**Expo Go not connecting**
- Ensure phone and computer are on same Wi-Fi network
- Try restarting Expo dev server
- Check firewall isn't blocking connections

## 📱 Building Production APK

### One-Time Setup

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS Build
cd packages/mobile-app
eas build:configure
```

### Build APK

```bash
# Build preview APK (for testing)
eas build --platform android --profile preview

# Build production APK
eas build --platform android --profile production
```

The build takes 10-20 minutes. You'll receive an email when done.

### Download APK

```bash
# List recent builds
eas build:list

# Or download from dashboard
# https://expo.dev/accounts/[your-account]/projects/supermarkt-deals/builds
```

## 🔄 Daily Workflow

### For Development

```bash
# Terminal 1: Run mobile app
cd packages/mobile-app
npm start

# Terminal 2: Run scraper manually when needed
cd packages/scraper
npm run scrape -- --supermarket=ah

# Terminal 3: Monitor logs
# Check Supabase dashboard → Table Editor → scrape_logs
```

### For Production

- Scrapers run automatically via GitHub Actions
- Check GitHub Actions tab for scraper status
- Monitor Supabase for data quality
- Build new APK when making app changes

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Paper](https://callstack.github.io/react-native-paper/)
- [Playwright Documentation](https://playwright.dev/)

## 🆘 Getting Help

If you encounter issues:

1. Check error messages carefully
2. Review this setup guide again
3. Check individual package READMEs:
   - [Scraper README](packages/scraper/README.md)
   - [Mobile App README](packages/mobile-app/README.md)
4. Search for similar issues online
5. Create an issue in the GitHub repository

## ✅ Success!

If you can:
- See products in the mobile app
- Add items to favorites
- Search and filter products
- View product details

**Congratulations! Your SupermarktDeals app is fully set up! 🎉**

## 🎯 Next Steps

1. **Customize selectors**: Update selectors for better scraping accuracy
2. **Add more supermarkets**: Implement Aldi and Plus scrapers
3. **Improve UI**: Customize colors, add more features
4. **Publish app**: Upload to Google Play Store
5. **Monitor**: Set up alerts for scraper failures

Happy coding! 🚀
