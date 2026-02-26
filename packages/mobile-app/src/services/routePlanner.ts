/**
 * Route Planner Service
 * Finds nearest store branches and plans an efficient shopping route
 */

import type { Supermarket } from '@supermarkt-deals/shared';
import { STORE_LOCATIONS, DEFAULT_HOME, type StoreLocation } from '../data/storeLocations';

export interface RouteStop {
  supermarket: Supermarket;
  store: StoreLocation;
  distanceFromPrevious: number; // km
}

export interface Route {
  stops: RouteStop[];
  totalDistance: number; // km total
  googleMapsUrl: string;
}

/**
 * Haversine distance between two points in km
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the nearest branch of a supermarket chain from a given point
 */
function findNearestBranch(
  slug: string,
  fromLat: number,
  fromLng: number
): StoreLocation | null {
  const branches = STORE_LOCATIONS[slug];
  if (!branches || branches.length === 0) return null;

  let nearest = branches[0];
  let minDist = haversineDistance(fromLat, fromLng, nearest.lat, nearest.lng);

  for (let i = 1; i < branches.length; i++) {
    const dist = haversineDistance(fromLat, fromLng, branches[i].lat, branches[i].lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = branches[i];
    }
  }

  return nearest;
}

/**
 * Nearest-neighbor TSP: start from home, visit nearest unvisited store, repeat.
 * Good enough for small number of stops (typically 2-5 stores).
 */
function optimizeRoute(stops: RouteStop[], homeLat: number, homeLng: number): RouteStop[] {
  if (stops.length <= 1) return stops;

  const ordered: RouteStop[] = [];
  const remaining = [...stops];
  let currentLat = homeLat;
  let currentLng = homeLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = haversineDistance(
      currentLat, currentLng,
      remaining[0].store.lat, remaining[0].store.lng
    );

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat, currentLng,
        remaining[i].store.lat, remaining[i].store.lng
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const next = remaining.splice(nearestIdx, 1)[0];
    next.distanceFromPrevious = nearestDist;
    ordered.push(next);
    currentLat = next.store.lat;
    currentLng = next.store.lng;
  }

  return ordered;
}

/**
 * Generate a Google Maps multi-stop directions URL.
 * Format: https://www.google.com/maps/dir/origin/waypoint1/waypoint2/.../destination
 */
function generateGoogleMapsUrl(
  stops: RouteStop[],
  homeLat: number,
  homeLng: number
): string {
  const homeCoord = `${homeLat},${homeLng}`;
  const waypoints = stops.map((s) => `${s.store.lat},${s.store.lng}`);

  // Start from home, visit all stops, return home
  const allPoints = [homeCoord, ...waypoints, homeCoord];
  return `https://www.google.com/maps/dir/${allPoints.join('/')}`;
}

/**
 * Plan a shopping route for the given supermarkets.
 * Finds the nearest branch of each chain, optimizes the visit order,
 * and generates a Google Maps URL.
 */
export function planRoute(
  supermarkets: Supermarket[],
  homeLat: number = DEFAULT_HOME.lat,
  homeLng: number = DEFAULT_HOME.lng
): Route {
  // Find nearest branch for each supermarket
  const stops: RouteStop[] = [];

  for (const sm of supermarkets) {
    // Skip online-only stores
    if (sm.is_online_only) continue;

    const branch = findNearestBranch(sm.slug, homeLat, homeLng);
    if (!branch) continue;

    stops.push({
      supermarket: sm,
      store: branch,
      distanceFromPrevious: 0,
    });
  }

  // Optimize route order
  const ordered = optimizeRoute(stops, homeLat, homeLng);

  // Calculate total distance (including return home)
  let totalDistance = 0;
  for (const stop of ordered) {
    totalDistance += stop.distanceFromPrevious;
  }
  // Add distance from last stop back home
  if (ordered.length > 0) {
    const last = ordered[ordered.length - 1];
    totalDistance += haversineDistance(last.store.lat, last.store.lng, homeLat, homeLng);
  }

  // Generate Google Maps URL
  const googleMapsUrl = generateGoogleMapsUrl(ordered, homeLat, homeLng);

  return {
    stops: ordered,
    totalDistance: Math.round(totalDistance * 10) / 10,
    googleMapsUrl,
  };
}
