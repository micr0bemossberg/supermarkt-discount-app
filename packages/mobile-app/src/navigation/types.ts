/**
 * Navigation Types
 * Type definitions for React Navigation
 */

export type RootStackParamList = {
  MainTabs: undefined;
  ProductDetail: { productId: string };
  Search: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
