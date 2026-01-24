# Technical Product Requirements Document (PRD)
## Dutch Supermarket Discount Aggregator App

**Version:** 1.0
**Date:** 2026-01-17
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Product Overview
A mobile application (Android APK via Expo) that aggregates and displays current discount offers and special deals from major Dutch supermarket chains in a single, user-friendly interface.

### 1.2 Problem Statement
Customers currently need to check multiple supermarket apps/websites to compare discount offers, leading to time waste and missed savings opportunities.

### 1.3 Solution
Automated scraping system that collects discount data from Dutch supermarket websites and presents them in a unified mobile app with excellent UX.

---

## 2. Technical Architecture

### 2.1 System Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Actions                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Scheduled Scraper Jobs (Cron)                     │    │
│  │  - Daily at 06:00 CET                              │    │
│  │  - Headless Browser (Playwright/Puppeteer)         │    │
│  └────────────────┬───────────────────────────────────┘    │
└──────────────────┬┼───────────────────────────────────────┘
                   ││
                   ││ Scraped Data (JSON)
                   ▼▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase Backend                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                 │  │
│  │  - Products table                                    │  │
│  │  - Supermarkets table                                │  │
│  │  - Categories table                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Storage Buckets                                     │  │
│  │  - Product images                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  REST API / GraphQL                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ API Calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Expo React Native App (Android)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Features:                                           │  │
│  │  - Browse discounts by supermarket                   │  │
│  │  - Search & filter                                   │  │
│  │  - Favorites/Watchlist                               │  │
│  │  - Price comparison                                  │  │
│  │  - Push notifications                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Target Supermarkets

### 3.1 Priority Supermarkets (Phase 1)
1. **Albert Heijn** - https://www.ah.nl/bonus
2. **Jumbo** - https://www.jumbo.com/aanbiedingen
3. **Lidl** - https://www.lidl.nl/aanbiedingen
4. **Aldi** - https://www.aldi.nl/aanbiedingen
5. **Plus** - https://www.plus.nl/aanbiedingen

### 3.2 Secondary Supermarkets (Phase 2)
- Dirk van den Broek
- Coop
- Spar
- Vomar
- DekaMarkt

---

## 4. Data Scraping System

### 4.1 Technology Stack
- **Runtime:** Node.js 20+
- **Headless Browser:** Playwright or Puppeteer
- **Scheduler:** GitHub Actions (cron)
- **Image Processing:** Sharp (for optimization)
- **Storage:** Supabase Storage API

### 4.2 Scraper Requirements

#### 4.2.1 Data Points to Extract
For each product:
- Product name/title
- Original price
- Discount price
- Discount percentage
- Product image URL (high resolution)
- Product description/details
- Validity period (start date, end date)
- Supermarket brand
- Category (if available)
- Product URL (deeplink)
- Unit information (per kg, per piece, etc.)

#### 4.2.2 Scraping Schedule
- **Primary scrape:** Daily at 06:00 CET
- **Secondary scrape:** Daily at 18:00 CET (for updated offers)
- **Manual trigger:** Available via GitHub Actions workflow dispatch

#### 4.2.3 Error Handling
- Retry logic: 3 attempts with exponential backoff
- Error logging to dedicated log table in Supabase
- Fallback to cached data if scrape fails
- Notification to admin on persistent failures

#### 4.2.4 Anti-Bot Measures
- Randomized user agents
- Request rate limiting (2-5 seconds between requests)
- Cookie handling
- JavaScript rendering support
- Proxy rotation (if needed)

### 4.3 GitHub Actions Workflow Structure
```yaml
name: Scrape Supermarket Offers
on:
  schedule:
    - cron: '0 6 * * *'  # 06:00 CET daily
    - cron: '0 18 * * *' # 18:00 CET daily
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        supermarket: [ah, jumbo, lidl, aldi, plus]
    steps:
      - Checkout code
      - Setup Node.js
      - Install dependencies
      - Run scraper for each supermarket
      - Upload results to Supabase
      - Clean up old data
```

---

## 5. Backend & Database (Supabase)

### 5.1 Database Schema

#### 5.1.1 Supermarkets Table
```sql
CREATE TABLE supermarkets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  primary_color VARCHAR(7),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 5.1.2 Categories Table
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  icon_name VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 5.1.3 Products Table
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supermarket_id UUID REFERENCES supermarkets(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  original_price DECIMAL(10, 2),
  discount_price DECIMAL(10, 2) NOT NULL,
  discount_percentage INTEGER,
  image_url TEXT,
  image_storage_path TEXT,
  product_url TEXT,
  unit_info VARCHAR(100),
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  scrape_hash VARCHAR(64) UNIQUE, -- To prevent duplicates
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_supermarket (supermarket_id),
  INDEX idx_category (category_id),
  INDEX idx_valid_dates (valid_from, valid_until),
  INDEX idx_active (is_active),
  INDEX idx_discount_price (discount_price)
);
```

#### 5.1.4 User Favorites Table
```sql
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, product_id),
  INDEX idx_user_favorites (user_id)
);
```

#### 5.1.5 Scrape Logs Table
```sql
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supermarket_id UUID REFERENCES supermarkets(id),
  status VARCHAR(20) NOT NULL, -- success, failed, partial
  products_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_scrape_status (status, created_at)
);
```

### 5.2 Row Level Security (RLS) Policies
- Public read access to products, supermarkets, and categories
- Authenticated users can manage their own favorites
- Scraper service uses service role key for writes

### 5.3 Storage Buckets
- **Bucket:** `product-images`
  - Public read access
  - Organized by: `{supermarket_slug}/{year}/{month}/{image_hash}.jpg`
  - Max file size: 5MB
  - Allowed formats: JPG, PNG, WEBP

### 5.4 API Endpoints (Auto-generated by Supabase)
- `GET /rest/v1/products` - List products with filters
- `GET /rest/v1/supermarkets` - List supermarkets
- `GET /rest/v1/categories` - List categories
- `POST /rest/v1/user_favorites` - Add favorite
- `DELETE /rest/v1/user_favorites` - Remove favorite

---

## 6. Mobile Application (Expo/React Native)

### 6.1 Technology Stack
- **Framework:** Expo SDK 51+
- **Language:** TypeScript
- **State Management:** Zustand or Redux Toolkit
- **UI Library:** React Native Paper or NativeBase
- **Navigation:** React Navigation v6
- **API Client:** Supabase JS Client
- **Image Caching:** Expo Image
- **Analytics:** Expo Analytics or Firebase

### 6.2 Core Features

#### 6.2.1 Home Screen
- Featured/trending discounts carousel
- Filter by supermarket (chips/pills)
- Quick category navigation
- Search bar (prominent placement)
- Pull-to-refresh functionality

#### 6.2.2 Browse/Explore
- Grid view of products (2 columns)
- Product cards showing:
  - Product image
  - Title
  - Supermarket logo badge
  - Original price (strikethrough)
  - Discount price (prominent)
  - Discount percentage badge
  - Valid until date
  - Favorite button
- Infinite scroll/pagination
- Filter sidebar/modal:
  - Supermarket selection (multi-select)
  - Category selection
  - Price range slider
  - Sort by: newest, highest discount, price low-to-high, price high-to-low

#### 6.2.3 Product Detail Screen
- Full-screen image gallery
- Complete product information
- Price comparison across supermarkets (if same product)
- Validity dates (visual countdown)
- Action buttons:
  - Add to favorites
  - Share discount
  - Open in supermarket website/app
- Similar discounts section

#### 6.2.4 Search
- Real-time search with debouncing
- Search history (local storage)
- Suggestions/autocomplete
- Recent searches
- Popular searches

#### 6.2.5 Favorites/Watchlist
- Saved products list
- Grouping by supermarket
- Price drop notifications
- Remove from favorites
- Empty state with suggestions

#### 6.2.6 Supermarket Directory
- List of all supermarkets
- Toggle to show/hide specific supermarkets in feed
- Store locator integration (future)

#### 6.2.7 Settings
- Notification preferences
- Preferred supermarkets
- Theme selection (light/dark)
- About/Help
- Privacy policy & terms

### 6.3 UI/UX Requirements

#### 6.3.1 Design Principles
- Material Design 3 or iOS-like aesthetics
- Responsive to different screen sizes
- Smooth animations (60fps)
- Haptic feedback on interactions
- Skeleton loaders for async content
- Empty states with helpful messages
- Error states with retry options

#### 6.3.2 Color Scheme
- Primary color: Fresh, trust-inspiring (e.g., green or blue)
- Accent color: For CTAs and highlights
- Supermarket brand colors for badges/cards
- Dark mode support

#### 6.3.3 Typography
- Clear hierarchy (H1, H2, body, caption)
- Price typography: Bold, large, easy to scan
- Accessibility: Minimum 16px body text

#### 6.3.4 Accessibility
- Screen reader support
- Minimum touch targets: 44x44px
- Sufficient color contrast (WCAG AA)
- Keyboard navigation support

### 6.4 Performance Requirements
- App launch time: < 2 seconds
- Time to interactive: < 3 seconds
- Image loading: Progressive with placeholders
- Offline support: Cached data available
- Bundle size: < 50MB

### 6.5 App Distribution
- Build Android APK via EAS Build
- Future: Google Play Store listing
- Over-the-air (OTA) updates via Expo Updates

---

## 7. Image Processing Pipeline

### 7.1 Image Workflow
1. Scraper downloads original image
2. Image optimization:
   - Resize to max width: 800px (maintain aspect ratio)
   - Convert to WebP format
   - Compression quality: 85%
   - Generate thumbnail: 200x200px
3. Generate hash for deduplication
4. Upload to Supabase Storage
5. Store path in database

### 7.2 Image CDN
- Leverage Supabase Storage CDN for fast delivery
- Implement lazy loading in app
- Use Expo Image for automatic caching

---

## 8. Monitoring & Analytics

### 8.1 Scraper Monitoring
- Success/failure rates per supermarket
- Scraping duration metrics
- Data quality checks (missing images, prices)
- Alert on consecutive failures

### 8.2 App Analytics
- Daily active users (DAU)
- Screen views
- Search queries (popular terms)
- Favorite actions
- Conversion: view → favorite → external link click
- Crash reporting (Sentry or Bugsnag)

---

## 9. Security & Compliance

### 9.1 Data Privacy
- GDPR compliance (data retention policies)
- User data encryption at rest
- Secure API communication (HTTPS only)
- Minimal data collection

### 9.2 Authentication (Optional for Phase 2)
- Supabase Auth (email/password, social logins)
- Anonymous browsing allowed
- Account for favorites sync across devices

### 9.3 Scraping Ethics
- Respect robots.txt
- Reasonable request rates
- Proper attribution to supermarkets
- No data resale

---

## 10. Development Phases

### Phase 1: MVP (8-10 weeks)
**Weeks 1-2: Setup & Infrastructure**
- Set up Supabase project
- Create database schema
- Set up GitHub Actions workflow
- Initialize Expo project

**Weeks 3-4: Scraper Development**
- Build scraper for 2-3 supermarkets (AH, Jumbo, Lidl)
- Implement image download & upload
- Test and refine scraping logic
- Set up error handling and logging

**Weeks 5-7: App Development**
- Build core UI screens (Home, Browse, Detail)
- Implement Supabase integration
- Add search and filtering
- Implement favorites (local storage)

**Week 8: Testing & Refinement**
- End-to-end testing
- Performance optimization
- Bug fixes
- UI polish

**Weeks 9-10: Deployment**
- Build production APK
- Create app documentation
- Soft launch testing
- Gather initial feedback

### Phase 2: Enhancement (4-6 weeks)
- Add remaining supermarkets
- User authentication & cloud sync
- Push notifications for price drops
- Advanced filtering and sorting
- Price history graphs
- Share to social media

### Phase 3: Scale (Ongoing)
- iOS version
- Store locator integration
- Shopping list feature
- Recipe suggestions based on discounts
- Community features (reviews, ratings)

---

## 11. Technical Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Supermarket websites change structure | High | Medium | Implement robust selectors, monitoring, quick update process |
| Anti-bot measures block scraper | High | Medium | Use residential proxies, rotate user agents, add delays |
| High image storage costs | Medium | Low | Aggressive compression, CDN optimization, cleanup old offers |
| Slow app performance | Medium | Low | Optimize images, implement pagination, use FlatList optimization |
| Legal issues with scraping | High | Low | Review ToS, consult legal, implement proper attribution |

---

## 12. Success Metrics (KPIs)

### 12.1 Technical KPIs
- Scraper uptime: > 99%
- Data freshness: < 24 hours old
- App crash rate: < 1%
- API response time: < 500ms (p95)

### 12.2 Product KPIs
- Daily active users: Track growth
- User retention: D1, D7, D30
- Average session duration: > 3 minutes
- Products favorited per user: > 5
- Search usage rate: > 30% of users

---

## 13. Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Mobile App | Expo (React Native), TypeScript |
| Backend | Supabase (PostgreSQL, REST API, Storage) |
| Scraper | Node.js, Playwright/Puppeteer |
| CI/CD | GitHub Actions |
| Image Processing | Sharp |
| State Management | Zustand/Redux Toolkit |
| UI Components | React Native Paper/NativeBase |
| Analytics | Expo Analytics/Firebase |
| Error Tracking | Sentry (optional) |

---

## 14. Open Questions

1. Should we support user accounts in MVP or start with local-only favorites?
2. Do we need real-time price alerts, or are daily updates sufficient?
3. Should we include non-food items in future phases?
4. Do we need multi-language support (English/Dutch)?
5. Should we monetize (ads, premium features) or keep it free?

---

## 15. Appendix

### 15.1 Useful Links
- Expo Documentation: https://docs.expo.dev/
- Supabase Documentation: https://supabase.com/docs
- Playwright Documentation: https://playwright.dev/
- React Navigation: https://reactnavigation.org/

### 15.2 Estimated Costs (Monthly)
- Supabase Free Tier: €0 (sufficient for MVP)
- GitHub Actions: €0 (within free tier limits)
- EAS Build: €0 (hobby plan)
- Total MVP: €0/month

Scaling costs (1000+ active users):
- Supabase Pro: ~€25/month
- Image CDN bandwidth: ~€10-50/month
- Total: €35-75/month

---

**Document Owner:** Development Team
**Last Updated:** 2026-01-17
**Next Review:** After MVP completion
