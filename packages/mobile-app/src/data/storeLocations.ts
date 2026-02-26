/**
 * Store Locations near Zwanenburg, Netherlands
 * Hardcoded supermarket branch locations from OpenStreetMap data.
 * Covers Zwanenburg, Halfweg, Badhoevedorp, Hoofddorp, and nearby areas.
 */

export interface StoreLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// Default home location: Zwanenburg center
export const DEFAULT_HOME = {
  lat: 52.3697,
  lng: 4.7394,
  label: 'Zwanenburg',
};

/**
 * Supermarket branch locations near Zwanenburg.
 * Only physical stores (online-only stores excluded).
 * Key = supermarket slug from database.
 */
export const STORE_LOCATIONS: Record<string, StoreLocation[]> = {
  ah: [
    { name: 'Albert Heijn Zwanenburg', address: 'Dennenlaan 17, Zwanenburg', lat: 52.3685, lng: 4.7365 },
    { name: 'Albert Heijn Halfweg', address: 'Halfweg', lat: 52.3840, lng: 4.7530 },
    { name: 'Albert Heijn Badhoevedorp', address: 'Sloterweg 22, Badhoevedorp', lat: 52.3395, lng: 4.7835 },
    { name: 'Albert Heijn Hoofddorp', address: 'Polderplein 4, Hoofddorp', lat: 52.3025, lng: 4.6910 },
  ],
  jumbo: [
    { name: 'Jumbo Halfweg', address: 'Halfweg', lat: 52.3840, lng: 4.7620 },
    { name: 'Jumbo Hoofddorp', address: 'Hoofddorp Centrum', lat: 52.3030, lng: 4.6890 },
    { name: 'Jumbo Badhoevedorp', address: 'Badhoevedorp', lat: 52.3390, lng: 4.7850 },
  ],
  aldi: [
    { name: 'Aldi Badhoevedorp', address: 'Sloterweg, Badhoevedorp', lat: 52.3380, lng: 4.7810 },
    { name: 'Aldi Hoofddorp', address: 'Hoofddorp', lat: 52.3060, lng: 4.6940 },
  ],
  dirk: [
    { name: 'Dirk van den Broek Halfweg', address: 'Halfweg', lat: 52.3845, lng: 4.7510 },
    { name: 'Dirk van den Broek Haarlem', address: 'Haarlem Zuid', lat: 52.3720, lng: 4.6400 },
  ],
  vomar: [
    { name: 'Vomar Zwanenburg', address: 'Dennenlaan, Zwanenburg', lat: 52.3690, lng: 4.7370 },
    { name: 'Vomar Halfweg', address: 'Halfweg', lat: 52.3838, lng: 4.7505 },
  ],
  hoogvliet: [
    { name: 'Hoogvliet Hoofddorp', address: 'Hoofddorp', lat: 52.3035, lng: 4.6920 },
  ],
  kruidvat: [
    { name: 'Kruidvat Zwanenburg', address: 'Dennenlaan, Zwanenburg', lat: 52.3688, lng: 4.7360 },
    { name: 'Kruidvat Halfweg', address: 'Halfweg', lat: 52.3842, lng: 4.7520 },
    { name: 'Kruidvat Hoofddorp', address: 'Polderplein, Hoofddorp', lat: 52.3028, lng: 4.6905 },
  ],
  action: [
    { name: 'Action Hoofddorp', address: 'Hoofddorp Centrum', lat: 52.3032, lng: 4.6915 },
    { name: 'Action Badhoevedorp', address: 'Sloterweg, Badhoevedorp', lat: 52.3385, lng: 4.7820 },
  ],
};
