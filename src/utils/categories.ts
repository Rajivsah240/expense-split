import { ExpenseCategory } from '../types';

export const CATEGORIES: ExpenseCategory[] = [
  'Vegetables',
  'Dairy',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
  'Cleaning',
  'Miscellaneous'
];

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  'Vegetables': '🥬',
  'Dairy': '🥛',
  'Snacks': '🍪',
  'Beverages': '☕',
  'Household': '🏠',
  'Personal Care': '🧴',
  'Cleaning': '🧹',
  'Miscellaneous': '📦'
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Vegetables': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'Dairy': 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  'Snacks': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Beverages': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'Household': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  'Personal Care': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'Cleaning': 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  'Miscellaneous': 'bg-slate-500/15 text-slate-400 border-slate-500/20'
};

export function categorizeItem(itemName: string): ExpenseCategory {
  const name = itemName.toLowerCase().trim();

  // Vegetables & Fruits / Fresh Produce
  if (
    /veg|vegetable|tomato|potato|onion|ginger|garlic|chilli|chili|palak|sabzi|subzi|fruit|apple|banana|mango|lemon|coriander|dhaniya|capsicum|carrot|cucumber|gobi|cauliflower|brinjal|matar|peas|spinach|cabbage|radish|beans|mushroom|corn|lettuce/.test(name)
  ) {
    return 'Vegetables';
  }

  // Dairy
  if (
    /milk|paneer|butter|curd|dahi|cheese|ghee|cream|yogurt|lassi|milkshake|malai|egg|eggs/.test(name)
  ) {
    return 'Dairy';
  }

  // Snacks & Confectionery
  if (
    /chip|chips|chocolate|biscuit|cookie|maggi|noodle|namkeen|munch|snack|bhujia|kurkure|lays|popcorn|toast|bread|cake|sweet|mithai|candy|wafer|chicken|mutton|fish|meat|prawn|kebab|biryani/.test(name)
  ) {
    return 'Snacks';
  }

  // Beverages
  if (
    /coke|pepsi|drink|juice|water|soda|tea|chai|coffee|redbull|monster|thumsup|sprite|fanta|bev|beverage|cold drink|beer|wine|alcohol/.test(name)
  ) {
    return 'Beverages';
  }

  // Household
  if (
    /rice|atta|flour|dal|lentil|oil|sugar|salt|spice|masala|jeera|turmeric|haldi|pepper|mustard|vinegar|ketchup|sauce|foil|matchbox|lighter|cylinder|gas|rent|wifi|internet|electricity|water bill|maid|cook|maintenance/.test(name)
  ) {
    return 'Household';
  }

  // Personal Care
  if (
    /soap|shampoo|paste|toothbrush|toothpaste|brush|facewash|face wash|hair oil|sanitizer|cream|lotion|razor|blade|deodorant|perfume|shaving|moisturizer|sunscreen|makeup|lipstick/.test(name)
  ) {
    return 'Personal Care';
  }

  // Cleaning
  if (
    /detergent|surf|vim|dishwash|tissue|mop|cleaner|trash|garbage|harpic|lizol|dettol|scrub|sponge|dustbin|broom|phenyl|colin|wipe|paper towel|toilet cleaner/.test(name)
  ) {
    return 'Cleaning';
  }

  return 'Miscellaneous';
}
