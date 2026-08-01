import { ExpenseCategory } from '../types';

export const CATEGORIES: ExpenseCategory[] = [
  'Vegetables',
  'Dairy',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
  'Rent & Bills',
  'General'
];

export function categorizeItem(itemName: string): ExpenseCategory {
  const name = itemName.toLowerCase().trim();

  // Vegetables & Fruits / Fresh Produce
  if (
    /veg|vegetable|tomato|potato|onion|ginger|garlic|chilli|chili|palak|sabzi|subzi|fruit|apple|banana|mango|lemon|coriander|dhaniya|capsicum|carrot|cucumber|gobi|cauliflower|brinjal|matar|peas|spinach/.test(name)
  ) {
    return 'Vegetables';
  }

  // Dairy
  if (
    /milk|paneer|butter|curd|dahi|cheese|ghee|cream|yogurt|lassi|milkshake|malai/.test(name)
  ) {
    return 'Dairy';
  }

  // Snacks & Confectionery
  if (
    /chip|chips|chocolate|biscuit|cookie|maggi|noodle|namkeen|munch|snack|bhujia|kurkure|lays|popcorn|toast|bread|cake|sweet|mithai|candy|wafer/.test(name)
  ) {
    return 'Snacks';
  }

  // Beverages
  if (
    /coke|pepsi|drink|juice|water|soda|tea|chai|coffee|redbull|monster|thumsup|sprite|fanta|bev|beverage|cold drink|beer|wine/.test(name)
  ) {
    return 'Beverages';
  }

  // Household & Cleaning
  if (
    /detergent|surf|vim|dishwash|tissue|mop|cleaner|foil|trash|garbage|harpic|lizol|dettol|soap bar|scrub|sponge|dustbin|matchbox|lighter/.test(name)
  ) {
    return 'Household';
  }

  // Personal Care
  if (
    /soap|shampoo|paste|toothbrush|toothpaste|brush|facewash|face wash|oil|sanitizer|cream|lotion|razor|blade|deodorant|perfume|shaving/.test(name)
  ) {
    return 'Personal Care';
  }

  // Rent & Bills
  if (
    /rent|wifi|internet|electricity|water bill|gas|cylinder|maid|cook|maintenance/.test(name)
  ) {
    return 'Rent & Bills';
  }

  return 'General';
}
