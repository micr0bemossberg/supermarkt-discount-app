/**
 * Formatting Utilities
 * Helper functions for formatting data for display
 */

/**
 * Format price as Euro currency
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * Format date as Dutch locale
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
}

/**
 * Format date as short format (e.g., "15 jan")
 */
export function formatDateShort(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
  }).format(dateObj);
}

/**
 * Calculate days until date
 */
export function daysUntil(date: string | Date): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const diffTime = dateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Get validity status text
 */
export function getValidityText(validUntil: string): string {
  const days = daysUntil(validUntil);

  if (days < 0) {
    return 'Verlopen';
  } else if (days === 0) {
    return 'Laatste dag!';
  } else if (days === 1) {
    return 'Nog 1 dag';
  } else if (days <= 3) {
    return `Nog ${days} dagen`;
  } else {
    return `Geldig t/m ${formatDateShort(validUntil)}`;
  }
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get supermarket color from slug
 */
export function getSupermarketColor(slug: string): string {
  const colors: Record<string, string> = {
    ah: '#0066CC',
    jumbo: '#FFD700',
    lidl: '#0050AA',
    aldi: '#009FE3',
    plus: '#E30613',
    dirk: '#ED7203',
    vomar: '#ED1C24',
    hoogvliet: '#E31937',
    action: '#0071CE',
    picnic: '#E4262A',
    megafoodstunter: '#2ECC40',
    butlon: '#1A1A2E',
    flink: '#D9006C',
    kruidvat: '#00A651',
  };

  return colors[slug] || '#666666';
}
