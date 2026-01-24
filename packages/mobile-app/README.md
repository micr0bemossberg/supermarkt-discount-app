# SupermarktDeals Mobile App

React Native mobile application for browsing Dutch supermarket discount offers.

## Features

- Browse discounts from Albert Heijn, Jumbo, and Lidl
- Filter by supermarket and category
- Search products
- Save favorites locally
- Product details with pricing and validity
- Dark mode support
- Material Design 3 UI

## Prerequisites

- Node.js 20+
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

## Setup

### 1. Install Dependencies

```bash
cd packages/mobile-app
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the mobile-app directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run the App

#### Development (Expo Go)

```bash
npm start
```

Then:
- Press `a` for Android
- Press `i` for iOS (macOS only)
- Scan QR code with Expo Go app

#### Development Build

For better performance and native features:

```bash
# Install Expo dev client
npm install expo-dev-client

# Create development build
npx expo run:android
# or
npx expo run:ios
```

## Building for Production

### Android APK

#### Using EAS Build (Recommended)

1. Install EAS CLI:
```bash
npm install -g eas-cli
eas login
```

2. Configure project:
```bash
eas build:configure
```

3. Build preview APK:
```bash
eas build --platform android --profile preview
```

4. Build production APK:
```bash
eas build --platform android --profile production
```

5. Download APK from EAS dashboard:
```bash
eas build:list
```

#### Local Build

```bash
# Generate Android app bundle
npx expo build:android
```

### iOS (macOS only)

```bash
eas build --platform ios --profile production
```

## Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── ProductCard.tsx
│   ├── SupermarketFilter.tsx
│   ├── CategoryChips.tsx
│   ├── EmptyState.tsx
│   └── LoadingSkeleton.tsx
├── screens/          # Screen components
│   ├── HomeScreen.tsx
│   ├── ProductDetailScreen.tsx
│   ├── SearchScreen.tsx
│   ├── FavoritesScreen.tsx
│   └── SettingsScreen.tsx
├── navigation/       # Navigation setup
│   ├── AppNavigator.tsx
│   ├── BottomTabNavigator.tsx
│   └── types.ts
├── services/        # API services
│   ├── products.ts
│   └── supermarkets.ts
├── stores/          # Zustand state management
│   ├── productsStore.ts
│   ├── favoritesStore.ts
│   └── settingsStore.ts
├── theme/           # App theming
│   └── theme.ts
├── utils/           # Utility functions
│   └── formatters.ts
└── config/          # Configuration
    └── supabase.ts
```

## Key Libraries

- **Expo** - React Native framework
- **React Navigation** - Navigation library
- **React Native Paper** - Material Design components
- **Zustand** - State management
- **Supabase** - Backend and database
- **Expo Image** - Optimized image component

## Development Tips

### Hot Reload

Press `r` in the terminal to reload the app during development.

### Clear Cache

```bash
npm start -- --clear
```

### View Logs

```bash
# Android
npx react-native log-android

# iOS
npx react-native log-ios
```

### Debug Menu

- Android: Shake device or press `Ctrl+M` (emulator)
- iOS: Shake device or press `Cmd+D` (simulator)

## Common Issues

### Metro bundler errors

```bash
# Clear cache and restart
npm start -- --clear
```

### Android build errors

```bash
# Clean Android build
cd android
./gradlew clean
cd ..
```

### Missing dependencies

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Performance Optimization

### Image Loading

- Images are automatically cached by Expo Image
- WebP format reduces file sizes
- Progressive loading with placeholders

### List Performance

- FlatList with optimized rendering
- Pagination (20 items per page)
- Virtual scrolling for long lists

### Bundle Size

Bundle size is optimized through:
- Hermes engine (enabled by default in Expo 50+)
- Tree shaking
- Code splitting

## Testing

### Manual Testing Checklist

- [ ] Browse products
- [ ] Filter by supermarket
- [ ] Filter by category
- [ ] Search products
- [ ] View product details
- [ ] Add/remove favorites
- [ ] Pull to refresh
- [ ] Load more (pagination)
- [ ] Dark mode toggle
- [ ] Open product in browser

### Test on Multiple Devices

Test on various screen sizes:
- Small phone (5")
- Medium phone (6")
- Large phone (6.5"+)

## Deployment

### Internal Testing

1. Build preview APK with EAS
2. Share download link with testers
3. Gather feedback

### Production Release

1. Build production APK
2. Upload to Google Play Console
3. Complete store listing
4. Submit for review

### Over-the-Air Updates

```bash
# Publish update to preview channel
eas update --branch preview --message "Bug fixes"

# Publish to production
eas update --branch production --message "New features"
```

## Troubleshooting

### Supabase Connection Issues

- Verify .env file has correct credentials
- Check Supabase project is active
- Ensure anon key has correct permissions

### Navigation Errors

- Clear navigation state: Close app completely and reopen
- Check navigation types match screen names

### Favorites Not Persisting

- Check AsyncStorage permissions
- Verify loadFavorites() is called on app start
- Check browser console for errors

## Contributing

This is a personal project. For major changes, please open an issue first.

## License

MIT

## Support

For issues or questions, create an issue in the GitHub repository.
