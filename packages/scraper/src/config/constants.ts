/**
 * Scraper Constants and Configuration
 */

import type { SupermarketSlug } from '@supermarkt-deals/shared';

// Scraper behavior
export const SCRAPER_CONFIG = {
  // Delays and timing
  MIN_DELAY_MS: 2000, // Minimum delay between requests (2 seconds)
  MAX_DELAY_MS: 5000, // Maximum delay between requests (5 seconds)
  PAGE_TIMEOUT_MS: 30000, // Page load timeout (30 seconds)

  // Retry logic
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,

  // Browser settings
  HEADLESS: process.env.HEADLESS !== 'false', // Default true, set to 'false' for debugging
  SCREENSHOT_ON_ERROR: process.env.SCREENSHOT_ON_ERROR !== 'false',
  SCREENSHOTS_DIR: './screenshots',

  // User agents for rotation
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ],
};

// Supermarket configurations
export const SUPERMARKET_URLS: Record<SupermarketSlug, string> = {
  // Physical stores
  ah: 'https://www.ah.nl/bonus',
  jumbo: 'https://www.jumbo.com/aanbiedingen',
  aldi: 'https://www.aldi.nl/aanbiedingen',
  vomar: 'https://www.vomar.nl/aanbiedingen',
  dirk: 'https://www.dirk.nl/aanbiedingen',
  hoogvliet: 'https://www.hoogvliet.com/aanbiedingen',
  plus: 'https://www.plus.nl/aanbiedingen',
  action: 'https://www.action.com/nl-nl/weekactie/',
  kruidvat: 'https://www.kruidvat.nl/acties',
  // Online only
  flink: 'https://www.goflink.com/shop/nl-NL/',
  picnic: 'https://www.picnic.app',
  joybuy: 'https://www.joybuy.nl',
  megafoodstunter: 'https://www.megafoodstunter.nl',
  butlon: 'https://www.butlon.nl',
  dekamarkt: 'https://www.dekamarkt.nl/aanbiedingen',
};

// Image processing
export const IMAGE_CONFIG = {
  MAX_WIDTH: 800,
  MAX_HEIGHT: 800,
  QUALITY: 85,
  FORMAT: 'webp' as const,
  MAX_FILE_SIZE_MB: 5,
};

// Supabase Storage
export const STORAGE_CONFIG = {
  BUCKET_NAME: 'product-images',
  PATH_TEMPLATE: '{supermarket}/{year}/{month}/{hash}.webp',
};

// Category mapping keywords (Dutch to slug)
export const CATEGORY_KEYWORDS: Record<string, string> = {
  // Vers & Gebak
  'brood': 'vers-gebak',
  'gebak': 'vers-gebak',
  'banket': 'vers-gebak',
  'croissant': 'vers-gebak',
  'stokbrood': 'vers-gebak',
  'beschuit': 'vers-gebak',
  'crackers': 'vers-gebak',
  'taart': 'vers-gebak',
  'cake': 'vers-gebak',
  'bolletje': 'vers-gebak',

  // Vlees, Vis & Vega
  'vlees': 'vlees-vis-vega',
  'vis': 'vlees-vis-vega',
  'vega': 'vlees-vis-vega',
  'vegetarisch': 'vlees-vis-vega',
  'kip': 'vlees-vis-vega',
  'rund': 'vlees-vis-vega',
  'varken': 'vlees-vis-vega',
  'gehakt': 'vlees-vis-vega',
  'filet': 'vlees-vis-vega',
  'schnitzel': 'vlees-vis-vega',
  'worst': 'vlees-vis-vega',
  'bacon': 'vlees-vis-vega',
  'ham': 'vlees-vis-vega',
  'zalm': 'vlees-vis-vega',
  'garnaal': 'vlees-vis-vega',
  'tonijn': 'vlees-vis-vega',
  'kipfilet': 'vlees-vis-vega',
  'biefstuk': 'vlees-vis-vega',
  'slavink': 'vlees-vis-vega',
  'rookworst': 'vlees-vis-vega',
  'shoarma': 'vlees-vis-vega',
  'hamburger': 'vlees-vis-vega',
  'frikandel': 'vlees-vis-vega',
  'kroket': 'vlees-vis-vega',
  'bitterbal': 'vlees-vis-vega',
  'loempia': 'vlees-vis-vega',
  'saté': 'vlees-vis-vega',
  'sate': 'vlees-vis-vega',

  // Zuivel & Eieren
  'melk': 'zuivel-eieren',
  'kaas': 'zuivel-eieren',
  'yoghurt': 'zuivel-eieren',
  'eieren': 'zuivel-eieren',
  'boter': 'zuivel-eieren',
  'kwark': 'zuivel-eieren',
  'room': 'zuivel-eieren',
  'vla': 'zuivel-eieren',
  'pudding': 'zuivel-eieren',
  'margarine': 'zuivel-eieren',
  'zuivel': 'zuivel-eieren',
  'cottage': 'zuivel-eieren',
  'mozzarella': 'zuivel-eieren',
  'gouda': 'zuivel-eieren',

  // Groente & Fruit
  'groente': 'groente-fruit',
  'fruit': 'groente-fruit',
  'appel': 'groente-fruit',
  'banaan': 'groente-fruit',
  'tomaat': 'groente-fruit',
  'aardappel': 'groente-fruit',
  'sla': 'groente-fruit',
  'komkommer': 'groente-fruit',
  'paprika': 'groente-fruit',
  'ui': 'groente-fruit',
  'wortel': 'groente-fruit',
  'broccoli': 'groente-fruit',
  'bloemkool': 'groente-fruit',
  'spinazie': 'groente-fruit',
  'champignon': 'groente-fruit',
  'sinaasappel': 'groente-fruit',
  'mandarijn': 'groente-fruit',
  'druiven': 'groente-fruit',
  'aardbei': 'groente-fruit',
  'blauwe bessen': 'groente-fruit',
  'peer': 'groente-fruit',
  'citroen': 'groente-fruit',
  'avocado': 'groente-fruit',
  'mango': 'groente-fruit',
  'ananas': 'groente-fruit',
  'courgette': 'groente-fruit',
  'aubergine': 'groente-fruit',
  'prei': 'groente-fruit',
  'radijs': 'groente-fruit',

  // Diepvries
  'diepvries': 'diepvries',
  'bevroren': 'diepvries',
  'pizza': 'diepvries',
  'ijsje': 'diepvries',
  'ijs': 'diepvries',

  // Dranken
  'drank': 'dranken',
  'sap': 'dranken',
  'koffie': 'dranken',
  'thee': 'dranken',
  'water': 'dranken',
  'cola': 'dranken',
  'bier': 'dranken',
  'wijn': 'dranken',
  'frisdrank': 'dranken',
  'limonade': 'dranken',
  'smoothie': 'dranken',
  'energy': 'dranken',
  'fanta': 'dranken',
  'sprite': 'dranken',
  'pepsi': 'dranken',
  'heineken': 'dranken',
  'whisky': 'dranken',
  'jenever': 'dranken',
  'rum': 'dranken',
  'wodka': 'dranken',

  // Ontbijt
  'ontbijt': 'ontbijt',
  'granen': 'ontbijt',
  'muesli': 'ontbijt',
  'cornflakes': 'ontbijt',
  'havermout': 'ontbijt',
  'jam': 'ontbijt',
  'pindakaas': 'ontbijt',
  'hagelslag': 'ontbijt',
  'honing': 'ontbijt',
  'nutella': 'ontbijt',

  // Snoep & Chips
  'snoep': 'snoep-chips',
  'chips': 'snoep-chips',
  'chocolade': 'snoep-chips',
  'drop': 'snoep-chips',
  'koek': 'snoep-chips',
  'noten': 'snoep-chips',
  'popcorn': 'snoep-chips',
  'borrelnootjes': 'snoep-chips',
  'winegums': 'snoep-chips',
  'kauwgom': 'snoep-chips',
  'snoepgoed': 'snoep-chips',

  // Bewaren (Houdbare Producten) — was incorrectly mapped to 'ontbijt'
  'pasta': 'bewaren',
  'rijst': 'bewaren',
  'noodles': 'bewaren',
  'saus': 'bewaren',
  'soep': 'bewaren',
  'macaroni': 'bewaren',
  'spaghetti': 'bewaren',
  'penne': 'bewaren',
  'fusilli': 'bewaren',
  'bonen': 'bewaren',
  'kikkererwten': 'bewaren',
  'linzen': 'bewaren',
  'tomatenpuree': 'bewaren',
  'olijfolie': 'bewaren',
  'azijn': 'bewaren',
  'mosterd': 'bewaren',
  'mayonaise': 'bewaren',
  'ketchup': 'bewaren',
  'conserven': 'bewaren',

  // Persoonlijke verzorging
  'shampoo': 'persoonlijke-verzorging',
  'tandpasta': 'persoonlijke-verzorging',
  'zeep': 'persoonlijke-verzorging',
  'deodorant': 'persoonlijke-verzorging',
  'douchegel': 'persoonlijke-verzorging',
  'scheermesje': 'persoonlijke-verzorging',
  'tandenborstel': 'persoonlijke-verzorging',
  'bodylotion': 'persoonlijke-verzorging',
  'crème': 'persoonlijke-verzorging',
  'luier': 'persoonlijke-verzorging',
  'maandverband': 'persoonlijke-verzorging',
  'conditioner': 'persoonlijke-verzorging',
  'haargel': 'persoonlijke-verzorging',
  'zonnebrand': 'persoonlijke-verzorging',
  'lippenbalsem': 'persoonlijke-verzorging',
  'mascara': 'persoonlijke-verzorging',
  'nagellak': 'persoonlijke-verzorging',

  // Huishouden
  'wasmiddel': 'huishouden',
  'afwasmiddel': 'huishouden',
  'toiletpapier': 'huishouden',
  'wasverzachter': 'huishouden',
  'schoonmaak': 'huishouden',
  'keukenrol': 'huishouden',
  'vuilniszak': 'huishouden',
  'allesreiniger': 'huishouden',
  'bleek': 'huishouden',
  'vaatwasmiddel': 'huishouden',

  // Baby & Kind
  'baby': 'baby-kind',
  'speelgoed': 'baby-kind',
  'fopspeen': 'baby-kind',
  'kinderstoel': 'baby-kind',
  'pamper': 'baby-kind',
  'babyvoeding': 'baby-kind',
  'knuffel': 'baby-kind',
  'buggy': 'baby-kind',
  'kinderwagen': 'baby-kind',

  // Elektronica
  'batterij': 'elektronica',
  'batterijen': 'elektronica',
  'oplader': 'elektronica',
  'oplaadkabel': 'elektronica',
  'usb': 'elektronica',
  'oordopjes': 'elektronica',
  'koptelefoon': 'elektronica',
  'zaklamp': 'elektronica',
  'stekker': 'elektronica',
  'verlengsnoer': 'elektronica',
  'spaarlamp': 'elektronica',
  'adapter': 'elektronica',
  'powerbank': 'elektronica',
  'bluetooth': 'elektronica',
  'speaker': 'elektronica',

  // Wonen & Keuken
  'kookpan': 'wonen-keuken',
  'braadpan': 'wonen-keuken',
  'koekenpan': 'wonen-keuken',
  'bestek': 'wonen-keuken',
  'servies': 'wonen-keuken',
  'opbergbox': 'wonen-keuken',
  'kaars': 'wonen-keuken',
  'theelicht': 'wonen-keuken',
  'vaas': 'wonen-keuken',
  'kussen': 'wonen-keuken',
  'deurmat': 'wonen-keuken',
  'decoratie': 'wonen-keuken',
  'bloempot': 'wonen-keuken',
  'handdoek': 'wonen-keuken',
  'badlaken': 'wonen-keuken',

  // Sport & Vrije Tijd
  'fiets': 'sport-vrije-tijd',
  'yogamat': 'sport-vrije-tijd',
  'tent': 'sport-vrije-tijd',
  'slaapzak': 'sport-vrije-tijd',
  'sporttas': 'sport-vrije-tijd',
  'zwembroek': 'sport-vrije-tijd',
  'barbecue': 'sport-vrije-tijd',
  'bbq': 'sport-vrije-tijd',
  'tuinstoel': 'sport-vrije-tijd',
  'parasol': 'sport-vrije-tijd',
  'voetbal': 'sport-vrije-tijd',
  'fitnessmat': 'sport-vrije-tijd',

  // Kleding & Mode
  't-shirt': 'kleding-mode',
  'broek': 'kleding-mode',
  'sokken': 'kleding-mode',
  'schoenen': 'kleding-mode',
  'sneakers': 'kleding-mode',
  'handschoenen': 'kleding-mode',
  'muts': 'kleding-mode',
  'sjaal': 'kleding-mode',
  'trui': 'kleding-mode',
  'ondergoed': 'kleding-mode',
  'badjas': 'kleding-mode',
  'regenjas': 'kleding-mode',
};

// All valid category slugs (aligned with CategorySlug type in shared package)
export const ALL_CATEGORY_SLUGS = [
  'vers-gebak', 'vlees-vis-vega', 'zuivel-eieren', 'groente-fruit',
  'diepvries', 'dranken', 'bewaren', 'ontbijt', 'snoep-chips',
  'persoonlijke-verzorging', 'huishouden', 'baby-kind', 'elektronica',
  'wonen-keuken', 'sport-vrije-tijd', 'kleding-mode', 'overig',
];
