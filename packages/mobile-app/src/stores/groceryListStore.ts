/**
 * Grocery List Store
 * Zustand store for managing the weekly grocery list (local storage only)
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GROCERY_LIST_STORAGE_KEY = '@supermarkt_deals_grocery_list';

export interface GroceryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  checked: boolean;
  keywords: string[];
}

export interface GroceryCategory {
  name: string;
  icon: string; // MaterialCommunityIcons name
}

export const GROCERY_CATEGORIES: GroceryCategory[] = [
  { name: 'Brood & Beleg', icon: 'bread-slice' },
  { name: 'Zuivel & Eieren', icon: 'cheese' },
  { name: 'Groente & Fruit', icon: 'fruit-watermelon' },
  { name: 'Vlees & Vis', icon: 'food-drumstick' },
  { name: 'Pasta, Rijst & Sauzen', icon: 'noodles' },
  { name: 'Noten & Zaden', icon: 'peanut' },
  { name: 'Dranken', icon: 'cup-water' },
  { name: 'Ontbijt & Tussendoor', icon: 'cookie' },
  { name: 'Kruiden & Specerijen', icon: 'shaker-outline' },
  { name: 'Diepvries', icon: 'snowflake' },
  { name: 'Baby & Kind', icon: 'baby-carriage' },
  { name: 'Huishouden', icon: 'spray-bottle' },
  { name: 'Persoonlijke Verzorging', icon: 'toothbrush-paste' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function generateKeywords(name: string): string[] {
  const lower = name.toLowerCase();
  const keywords = [lower];

  // Add common Dutch variations
  const variants: Record<string, string[]> = {
    // Brood & Beleg
    brood: ['brood', 'volkoren', 'wit brood', 'bruin brood', 'tijgerbrood'],
    croissants: ['croissant', 'croissants', 'roomboter croissant'],
    afbakbroodjes: ['afbak', 'afbakbrood', 'afbakbroodjes', 'petit pain', 'pistolet'],
    'vers brood': ['vers brood', 'vers gebakken', 'bakery', 'stokbrood', 'ciabatta', 'focaccia'],
    boter: ['boter', 'roomboter', 'margarine'],
    kaas: ['kaas', 'goudse', 'jong belegen', 'oud', 'plakken kaas'],
    pindakaas: ['pindakaas'],
    hagelslag: ['hagelslag', 'chocolade vlokken', 'strooisel'],
    beleg: ['beleg', 'ham', 'salami', 'kipfilet'],
    hummus: ['hummus', 'houmous'],
    // Zuivel & Eieren
    melk: ['melk', 'halfvolle melk', 'volle melk', 'magere melk'],
    yoghurt: ['yoghurt', 'yogurt', 'griekse yoghurt'],
    vla: ['vla', 'vanillevla', 'chocoladevla'],
    eieren: ['eieren', 'ei', 'scharreleieren', 'vrije uitloop'],
    kwark: ['kwark'],
    breakers: ['breakers', 'danone', 'drinkyoghurt', 'zuiveldrank'],
    'turkse yoghurt': ['turkse yoghurt', 'zuiveldrank', 'ayran'],
    roomboter: ['roomboter', 'boter', 'ongezouten boter'],
    'verse room': ['room', 'slagroom', 'kookroom'],
    // Groente & Fruit
    appels: ['appel', 'appels', 'elstar', 'jonagold', 'granny smith'],
    bananen: ['banaan', 'bananen'],
    tomaten: ['tomaat', 'tomaten', 'cherry tomaat', 'trostomaat'],
    komkommer: ['komkommer'],
    wortels: ['wortel', 'wortels', 'winterwortel'],
    sla: ['sla', 'ijsbergsla', 'veldsla', 'rucola'],
    aardappelen: ['aardappel', 'aardappelen', 'krieltjes'],
    "avocado's": ['avocado', "avocado's"],
    paprika: ['paprika', 'rode paprika', 'groene paprika'],
    uien: ['ui', 'uien', 'rode ui'],
    knoflook: ['knoflook', 'teentje knoflook'],
    citroenen: ['citroen', 'citroenen', 'limoen'],
    druiven: ['druiven', 'druif', 'pitloze druiven'],
    mango: ['mango', "mango's"],
    courgette: ['courgette'],
    spinazie: ['spinazie', 'verse spinazie'],
    // Vlees & Vis (halal)
    'halal kipfilet': ['halal', 'kip', 'kipfilet', 'halal kip', 'kippenfilet', 'kipdijfilet'],
    'halal gehakt': ['halal', 'gehakt', 'rundergehakt', 'halal gehakt', 'halal rundergehakt'],
    'halal lamsvlees': ['halal', 'lam', 'lamsvlees', 'lamskoteletten', 'lamsbout', 'halal lam'],
    'halal kalkoen': ['halal', 'kalkoen', 'kalkoenfilet', 'halal kalkoen'],
    vis: ['vis', 'visfilet', 'zalm', 'pangasius', 'visstick', 'tilapia'],
    // Pasta, Rijst & Sauzen
    rijst: ['rijst', 'basmati', 'pandan', 'jasmijn'],
    pasta: ['pasta', 'spaghetti', 'penne', 'macaroni', 'fusilli'],
    tomatensaus: ['tomatensaus', 'pastasaus', 'passata', 'pomodoro'],
    olijfolie: ['olijfolie', 'olie', 'extra vierge'],
    couscous: ['couscous'],
    // Noten & Zaden
    pijnboompitten: ['pijnboompitten', 'pijnboompitjes', 'pine nuts'],
    'gemengde noten': ['gemengde noten', 'notenmix', 'mixed nuts', 'noten'],
    amandelen: ['amandel', 'amandelen'],
    cashewnoten: ['cashew', 'cashewnoten'],
    'zonnebloempitten': ['zonnebloempitten', 'zonnebloemzaad', 'pitten'],
    // Dranken
    sap: ['sap', 'sinaasappelsap', 'appelsap', 'jus d\'orange', 'fruitsap'],
    water: ['water', 'mineraalwater', 'bronwater', 'spa'],
    thee: ['thee', 'groene thee', 'zwarte thee', 'muntthee'],
    // Ontbijt & Tussendoor
    ontbijtgranen: ['ontbijtgranen', 'muesli', 'cornflakes', 'havermout', 'cruesli'],
    koekjes: ['koekjes', 'koek', 'biscuit', 'speculaas'],
    crackers: ['cracker', 'crackers', 'rijstwafel'],
    dadels: ['dadels', 'medjoul', 'medjool'],
    // Kruiden & Specerijen
    komijn: ['komijn', 'cumin'],
    paprikapoeder: ['paprikapoeder', 'paprika poeder'],
    kurkuma: ['kurkuma', 'geelwortel', 'turmeric'],
    koriander: ['koriander', 'verse koriander'],
    peterselie: ['peterselie', 'verse peterselie'],
    munt: ['munt', 'verse munt', 'muntblaadjes'],
    // Diepvries
    diepvriesgroenten: ['diepvries', 'diepvriesgroenten', 'vriesvers'],
    pizza: ['pizza', 'diepvriespizza'],
    'diepvries snacks': ['frikandel', 'kroket', 'bitterballen', 'loempia', 'snack'],
    // Baby & Kind
    luiers: ['luier', 'luiers', 'pampers'],
    babyvoeding: ['babyvoeding', 'flesvoeding', 'potjes', 'baby'],
    tussendoortjes: ['tussendoortje', 'kinderkoek', 'fruitknijp', 'liga'],
    // Huishouden
    schoonmaakmiddel: ['schoonmaak', 'allesreiniger', 'sanitair'],
    wasmiddel: ['wasmiddel', 'waspoeder', 'wascapsules', 'wasverzachter'],
    toiletpapier: ['toiletpapier', 'wc-papier', 'wc papier'],
    vaatwastabletten: ['vaatwas', 'vaatwastablet', 'afwasmiddel'],
    // Persoonlijke Verzorging
    tandpasta: ['tandpasta', 'tandenborstel'],
    shampoo: ['shampoo', 'douchegel'],
    zeep: ['zeep', 'handzeep', 'handgel'],
  };

  const match = variants[lower];
  if (match) {
    keywords.push(...match);
  }

  return [...new Set(keywords)];
}

const DEFAULT_ITEMS: GroceryItem[] = [
  // Brood & Beleg
  { id: generateId(), name: 'Brood', category: 'Brood & Beleg', quantity: 2, checked: false, keywords: generateKeywords('brood') },
  { id: generateId(), name: 'Croissants', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('croissants') },
  { id: generateId(), name: 'Afbakbroodjes', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('afbakbroodjes') },
  { id: generateId(), name: 'Vers brood', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('vers brood') },
  { id: generateId(), name: 'Boter', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('boter') },
  { id: generateId(), name: 'Kaas', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('kaas') },
  { id: generateId(), name: 'Pindakaas', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('pindakaas') },
  { id: generateId(), name: 'Hagelslag', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('hagelslag') },
  { id: generateId(), name: 'Beleg', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('beleg') },
  { id: generateId(), name: 'Hummus', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('hummus') },

  // Zuivel & Eieren
  { id: generateId(), name: 'Melk', category: 'Zuivel & Eieren', quantity: 2, checked: false, keywords: generateKeywords('melk') },
  { id: generateId(), name: 'Yoghurt', category: 'Zuivel & Eieren', quantity: 2, checked: false, keywords: generateKeywords('yoghurt') },
  { id: generateId(), name: 'Breakers', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('breakers') },
  { id: generateId(), name: 'Turkse yoghurt', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('turkse yoghurt') },
  { id: generateId(), name: 'Vla', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('vla') },
  { id: generateId(), name: 'Eieren', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('eieren') },
  { id: generateId(), name: 'Roomboter', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('roomboter') },
  { id: generateId(), name: 'Verse room', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('verse room') },

  // Groente & Fruit
  { id: generateId(), name: 'Appels', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('appels') },
  { id: generateId(), name: 'Bananen', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('bananen') },
  { id: generateId(), name: 'Druiven', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('druiven') },
  { id: generateId(), name: 'Mango', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('mango') },
  { id: generateId(), name: "Avocado's", category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords("avocado's") },
  { id: generateId(), name: 'Citroenen', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('citroenen') },
  { id: generateId(), name: 'Tomaten', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('tomaten') },
  { id: generateId(), name: 'Komkommer', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('komkommer') },
  { id: generateId(), name: 'Paprika', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('paprika') },
  { id: generateId(), name: 'Uien', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('uien') },
  { id: generateId(), name: 'Knoflook', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('knoflook') },
  { id: generateId(), name: 'Wortels', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('wortels') },
  { id: generateId(), name: 'Spinazie', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('spinazie') },
  { id: generateId(), name: 'Courgette', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('courgette') },
  { id: generateId(), name: 'Sla', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('sla') },
  { id: generateId(), name: 'Aardappelen', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('aardappelen') },

  // Vlees & Vis (halal)
  { id: generateId(), name: 'Halal kipfilet', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('halal kipfilet') },
  { id: generateId(), name: 'Halal gehakt', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('halal gehakt') },
  { id: generateId(), name: 'Halal lamsvlees', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('halal lamsvlees') },
  { id: generateId(), name: 'Halal kalkoen', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('halal kalkoen') },
  { id: generateId(), name: 'Vis', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('vis') },

  // Pasta, Rijst & Sauzen
  { id: generateId(), name: 'Rijst', category: 'Pasta, Rijst & Sauzen', quantity: 1, checked: false, keywords: generateKeywords('rijst') },
  { id: generateId(), name: 'Pasta', category: 'Pasta, Rijst & Sauzen', quantity: 1, checked: false, keywords: generateKeywords('pasta') },
  { id: generateId(), name: 'Couscous', category: 'Pasta, Rijst & Sauzen', quantity: 1, checked: false, keywords: generateKeywords('couscous') },
  { id: generateId(), name: 'Tomatensaus', category: 'Pasta, Rijst & Sauzen', quantity: 1, checked: false, keywords: generateKeywords('tomatensaus') },
  { id: generateId(), name: 'Olijfolie', category: 'Pasta, Rijst & Sauzen', quantity: 1, checked: false, keywords: generateKeywords('olijfolie') },

  // Noten & Zaden
  { id: generateId(), name: 'Pijnboompitten', category: 'Noten & Zaden', quantity: 1, checked: false, keywords: generateKeywords('pijnboompitten') },
  { id: generateId(), name: 'Gemengde noten', category: 'Noten & Zaden', quantity: 1, checked: false, keywords: generateKeywords('gemengde noten') },
  { id: generateId(), name: 'Amandelen', category: 'Noten & Zaden', quantity: 1, checked: false, keywords: generateKeywords('amandelen') },
  { id: generateId(), name: 'Cashewnoten', category: 'Noten & Zaden', quantity: 1, checked: false, keywords: generateKeywords('cashewnoten') },
  { id: generateId(), name: 'Zonnebloempitten', category: 'Noten & Zaden', quantity: 1, checked: false, keywords: generateKeywords('zonnebloempitten') },

  // Dranken
  { id: generateId(), name: 'Sap', category: 'Dranken', quantity: 2, checked: false, keywords: generateKeywords('sap') },
  { id: generateId(), name: 'Water', category: 'Dranken', quantity: 1, checked: false, keywords: generateKeywords('water') },
  { id: generateId(), name: 'Thee', category: 'Dranken', quantity: 1, checked: false, keywords: generateKeywords('thee') },

  // Ontbijt & Tussendoor
  { id: generateId(), name: 'Ontbijtgranen', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('ontbijtgranen') },
  { id: generateId(), name: 'Koekjes', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('koekjes') },
  { id: generateId(), name: 'Crackers', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('crackers') },
  { id: generateId(), name: 'Dadels', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('dadels') },

  // Kruiden & Specerijen
  { id: generateId(), name: 'Komijn', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('komijn') },
  { id: generateId(), name: 'Paprikapoeder', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('paprikapoeder') },
  { id: generateId(), name: 'Kurkuma', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('kurkuma') },
  { id: generateId(), name: 'Koriander', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('koriander') },
  { id: generateId(), name: 'Peterselie', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('peterselie') },
  { id: generateId(), name: 'Munt', category: 'Kruiden & Specerijen', quantity: 1, checked: false, keywords: generateKeywords('munt') },

  // Diepvries
  { id: generateId(), name: 'Diepvriesgroenten', category: 'Diepvries', quantity: 1, checked: false, keywords: generateKeywords('diepvriesgroenten') },
  { id: generateId(), name: 'Pizza', category: 'Diepvries', quantity: 1, checked: false, keywords: generateKeywords('pizza') },
  { id: generateId(), name: 'Diepvries snacks', category: 'Diepvries', quantity: 1, checked: false, keywords: generateKeywords('diepvries snacks') },

  // Baby & Kind
  { id: generateId(), name: 'Luiers', category: 'Baby & Kind', quantity: 1, checked: false, keywords: generateKeywords('luiers') },
  { id: generateId(), name: 'Babyvoeding', category: 'Baby & Kind', quantity: 1, checked: false, keywords: generateKeywords('babyvoeding') },
  { id: generateId(), name: 'Tussendoortjes', category: 'Baby & Kind', quantity: 1, checked: false, keywords: generateKeywords('tussendoortjes') },

  // Huishouden
  { id: generateId(), name: 'Schoonmaakmiddel', category: 'Huishouden', quantity: 1, checked: false, keywords: generateKeywords('schoonmaakmiddel') },
  { id: generateId(), name: 'Wasmiddel', category: 'Huishouden', quantity: 1, checked: false, keywords: generateKeywords('wasmiddel') },
  { id: generateId(), name: 'Toiletpapier', category: 'Huishouden', quantity: 1, checked: false, keywords: generateKeywords('toiletpapier') },
  { id: generateId(), name: 'Vaatwastabletten', category: 'Huishouden', quantity: 1, checked: false, keywords: generateKeywords('vaatwastabletten') },

  // Persoonlijke Verzorging
  { id: generateId(), name: 'Tandpasta', category: 'Persoonlijke Verzorging', quantity: 1, checked: false, keywords: generateKeywords('tandpasta') },
  { id: generateId(), name: 'Shampoo', category: 'Persoonlijke Verzorging', quantity: 1, checked: false, keywords: generateKeywords('shampoo') },
  { id: generateId(), name: 'Zeep', category: 'Persoonlijke Verzorging', quantity: 1, checked: false, keywords: generateKeywords('zeep') },
];

interface GroceryListState {
  items: GroceryItem[];
  loading: boolean;
  error: string | null;

  loadList: () => Promise<void>;
  addItem: (name: string, category: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  updateItem: (id: string, changes: Partial<Pick<GroceryItem, 'name' | 'quantity' | 'keywords'>>) => Promise<void>;
  toggleChecked: (id: string) => Promise<void>;
  resetToTemplate: () => Promise<void>;
  uncheckAll: () => Promise<void>;
  getItemCount: () => number;
  getUncheckedCount: () => number;
}

export const useGroceryListStore = create<GroceryListState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  loadList: async () => {
    set({ loading: true, error: null });
    try {
      const json = await AsyncStorage.getItem(GROCERY_LIST_STORAGE_KEY);
      if (json) {
        set({ items: JSON.parse(json), loading: false });
      } else {
        // First time: load default template
        const defaultItems = DEFAULT_ITEMS.map((item) => ({ ...item, id: generateId() }));
        await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(defaultItems));
        set({ items: defaultItems, loading: false });
      }
    } catch (error: any) {
      console.error('Failed to load grocery list:', error);
      set({ error: error.message || 'Laden mislukt', loading: false });
    }
  },

  addItem: async (name: string, category: string) => {
    try {
      const newItem: GroceryItem = {
        id: generateId(),
        name,
        category,
        quantity: 1,
        checked: false,
        keywords: generateKeywords(name),
      };
      const newItems = [...get().items, newItem];
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(newItems));
      set({ items: newItems });
    } catch (error: any) {
      console.error('Failed to add grocery item:', error);
      set({ error: error.message || 'Toevoegen mislukt' });
    }
  },

  removeItem: async (id: string) => {
    try {
      const newItems = get().items.filter((item) => item.id !== id);
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(newItems));
      set({ items: newItems });
    } catch (error: any) {
      console.error('Failed to remove grocery item:', error);
      set({ error: error.message || 'Verwijderen mislukt' });
    }
  },

  updateItem: async (id: string, changes: Partial<Pick<GroceryItem, 'name' | 'quantity' | 'keywords'>>) => {
    try {
      const newItems = get().items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...changes };
        // Regenerate keywords if name changed
        if (changes.name && !changes.keywords) {
          updated.keywords = generateKeywords(changes.name);
        }
        return updated;
      });
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(newItems));
      set({ items: newItems });
    } catch (error: any) {
      console.error('Failed to update grocery item:', error);
      set({ error: error.message || 'Bijwerken mislukt' });
    }
  },

  toggleChecked: async (id: string) => {
    try {
      const newItems = get().items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      );
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(newItems));
      set({ items: newItems });
    } catch (error: any) {
      console.error('Failed to toggle item:', error);
    }
  },

  resetToTemplate: async () => {
    try {
      const defaultItems = DEFAULT_ITEMS.map((item) => ({ ...item, id: generateId() }));
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(defaultItems));
      set({ items: defaultItems });
    } catch (error: any) {
      console.error('Failed to reset grocery list:', error);
      set({ error: error.message || 'Resetten mislukt' });
    }
  },

  uncheckAll: async () => {
    try {
      const newItems = get().items.map((item) => ({ ...item, checked: false }));
      await AsyncStorage.setItem(GROCERY_LIST_STORAGE_KEY, JSON.stringify(newItems));
      set({ items: newItems });
    } catch (error: any) {
      console.error('Failed to uncheck items:', error);
    }
  },

  getItemCount: () => get().items.length,

  getUncheckedCount: () => get().items.filter((item) => !item.checked).length,
}));
