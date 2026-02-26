/**
 * Navigation Types
 * Type definitions for React Navigation
 */

export type RootStackParamList = {
  MainTabs: undefined;
  ProductDetail: { productId: string };
  Search: undefined;
  ShoppingPlan: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  GroceryList: undefined;
  Favorites: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
