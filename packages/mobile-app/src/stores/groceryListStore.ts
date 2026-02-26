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
  { name: 'Dranken', icon: 'cup-water' },
  { name: 'Ontbijt & Tussendoor', icon: 'cookie' },
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
    brood: ['brood', 'volkoren', 'wit brood', 'bruin brood', 'tijgerbrood'],
    boter: ['boter', 'roomboter', 'margarine'],
    kaas: ['kaas', 'goudse', 'jong belegen', 'oud', 'plakken kaas'],
    pindakaas: ['pindakaas'],
    hagelslag: ['hagelslag', 'chocolade vlokken', 'strooisel'],
    beleg: ['beleg', 'ham', 'salami', 'kipfilet'],
    melk: ['melk', 'halfvolle melk', 'volle melk', 'magere melk'],
    yoghurt: ['yoghurt', 'yogurt'],
    vla: ['vla', 'vanillevla', 'chocoladevla'],
    eieren: ['eieren', 'ei', 'scharreleieren', 'vrije uitloop'],
    kwark: ['kwark'],
    appels: ['appel', 'appels', 'elstar', 'jonagold', 'granny smith'],
    bananen: ['banaan', 'bananen'],
    tomaten: ['tomaat', 'tomaten', 'cherry tomaat', 'trostomaat'],
    komkommer: ['komkommer'],
    wortels: ['wortel', 'wortels', 'winterwortel'],
    sla: ['sla', 'ijsbergsla', 'veldsla', 'rucola'],
    aardappelen: ['aardappel', 'aardappelen', 'krieltjes'],
    kipfilet: ['kip', 'kipfilet', 'kippenfilet', 'kipdijfilet'],
    gehakt: ['gehakt', 'rundergehakt', 'half-om-half'],
    vis: ['vis', 'visfilet', 'zalm', 'pangasius', 'visstick'],
    sap: ['sap', 'sinaasappelsap', 'appelsap', 'jus d\'orange', 'fruitsap'],
    water: ['water', 'mineraalwater', 'bronwater', 'spa'],
    thee: ['thee', 'groene thee', 'zwarte thee'],
    ontbijtgranen: ['ontbijtgranen', 'muesli', 'cornflakes', 'havermout', 'cruesli'],
    koekjes: ['koekjes', 'koek', 'biscuit', 'speculaas'],
    crackers: ['cracker', 'crackers', 'rijstwafel'],
    diepvriesgroenten: ['diepvries', 'diepvriesgroenten', 'vriesvers'],
    pizza: ['pizza', 'diepvriespizza'],
    luiers: ['luier', 'luiers', 'pampers'],
    babyvoeding: ['babyvoeding', 'flesvoeding', 'potjes', 'baby'],
    tussendoortjes: ['tussendoortje', 'kinderkoek', 'fruitknijp', 'liga'],
    schoonmaakmiddel: ['schoonmaak', 'allesreiniger', 'sanitair'],
    wasmiddel: ['wasmiddel', 'waspoeder', 'wascapsules', 'wasverzachter'],
    toiletpapier: ['toiletpapier', 'wc-papier', 'wc papier'],
    vaatwastabletten: ['vaatwas', 'vaatwastablet', 'afwasmiddel'],
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
  { id: generateId(), name: 'Boter', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('boter') },
  { id: generateId(), name: 'Kaas', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('kaas') },
  { id: generateId(), name: 'Pindakaas', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('pindakaas') },
  { id: generateId(), name: 'Hagelslag', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('hagelslag') },
  { id: generateId(), name: 'Beleg', category: 'Brood & Beleg', quantity: 1, checked: false, keywords: generateKeywords('beleg') },

  // Zuivel & Eieren
  { id: generateId(), name: 'Melk', category: 'Zuivel & Eieren', quantity: 2, checked: false, keywords: generateKeywords('melk') },
  { id: generateId(), name: 'Yoghurt', category: 'Zuivel & Eieren', quantity: 2, checked: false, keywords: generateKeywords('yoghurt') },
  { id: generateId(), name: 'Vla', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('vla') },
  { id: generateId(), name: 'Eieren', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('eieren') },
  { id: generateId(), name: 'Kwark', category: 'Zuivel & Eieren', quantity: 1, checked: false, keywords: generateKeywords('kwark') },

  // Groente & Fruit
  { id: generateId(), name: 'Appels', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('appels') },
  { id: generateId(), name: 'Bananen', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('bananen') },
  { id: generateId(), name: 'Tomaten', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('tomaten') },
  { id: generateId(), name: 'Komkommer', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('komkommer') },
  { id: generateId(), name: 'Wortels', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('wortels') },
  { id: generateId(), name: 'Sla', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('sla') },
  { id: generateId(), name: 'Aardappelen', category: 'Groente & Fruit', quantity: 1, checked: false, keywords: generateKeywords('aardappelen') },

  // Vlees & Vis
  { id: generateId(), name: 'Kipfilet', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('kipfilet') },
  { id: generateId(), name: 'Gehakt', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('gehakt') },
  { id: generateId(), name: 'Vis', category: 'Vlees & Vis', quantity: 1, checked: false, keywords: generateKeywords('vis') },

  // Dranken
  { id: generateId(), name: 'Sap', category: 'Dranken', quantity: 2, checked: false, keywords: generateKeywords('sap') },
  { id: generateId(), name: 'Water', category: 'Dranken', quantity: 1, checked: false, keywords: generateKeywords('water') },
  { id: generateId(), name: 'Thee', category: 'Dranken', quantity: 1, checked: false, keywords: generateKeywords('thee') },

  // Ontbijt & Tussendoor
  { id: generateId(), name: 'Ontbijtgranen', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('ontbijtgranen') },
  { id: generateId(), name: 'Koekjes', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('koekjes') },
  { id: generateId(), name: 'Crackers', category: 'Ontbijt & Tussendoor', quantity: 1, checked: false, keywords: generateKeywords('crackers') },

  // Diepvries
  { id: generateId(), name: 'Diepvriesgroenten', category: 'Diepvries', quantity: 1, checked: false, keywords: generateKeywords('diepvriesgroenten') },
  { id: generateId(), name: 'Pizza', category: 'Diepvries', quantity: 1, checked: false, keywords: generateKeywords('pizza') },

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
