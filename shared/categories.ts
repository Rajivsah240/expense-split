import { CATEGORIES, type Category } from './types.js';

export { CATEGORIES };

export const CATEGORY_EMOJI: Record<Category, string> = {
  Vegetables: '🥬',
  Dairy: '🥛',
  Snacks: '🍪',
  Beverages: '🧃',
  Household: '🏠',
  'Personal Care': '🧴',
  Cleaning: '🧽',
  Miscellaneous: '📦',
};

/** Tailwind-safe classes; literal strings so the JIT scanner picks them up. */
export const CATEGORY_STYLE: Record<Category, string> = {
  Vegetables: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Dairy: 'bg-sky-50 text-sky-700 border-sky-200',
  Snacks: 'bg-amber-50 text-amber-700 border-amber-200',
  Beverages: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Household: 'bg-violet-50 text-violet-700 border-violet-200',
  'Personal Care': 'bg-pink-50 text-pink-700 border-pink-200',
  Cleaning: 'bg-teal-50 text-teal-700 border-teal-200',
  Miscellaneous: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

/** Hex values for charts, matched to the chip colours above. */
export const CATEGORY_COLOR: Record<Category, string> = {
  Vegetables: '#10b981',
  Dairy: '#0ea5e9',
  Snacks: '#f59e0b',
  Beverages: '#06b6d4',
  Household: '#8b5cf6',
  'Personal Care': '#ec4899',
  Cleaning: '#14b8a6',
  Miscellaneous: '#a1a1aa',
};

const RULES: [Category, RegExp][] = [
  [
    'Vegetables',
    /\b(veg|vegetable|sabzi|subzi|sabji|tomato|tamatar|potato|aloo|onion|pyaz|pyaaz|ginger|adrak|garlic|lehsun|chilli|chili|mirchi|palak|spinach|methi|coriander|dhaniya|capsicum|shimla|carrot|gajar|cucumber|kheera|gobi|cauliflower|cabbage|patta|brinjal|baingan|matar|peas|lauki|bhindi|okra|radish|mooli|beans|mushroom|corn|bhutta|lettuce|beetroot|pumpkin|kaddu|karela|drumstick|fruit|apple|seb|banana|kela|mango|aam|orange|santra|grapes|angoor|papaya|papita|pomegranate|anar|watermelon|tarbuj|guava|amrud|lemon|nimbu|pineapple|kiwi|strawberr)/i,
  ],
  [
    'Dairy',
    /\b(milk|doodh|dudh|paneer|butter|makhan|amul|curd|dahi|yoghurt|yogurt|cheese|ghee|cream|malai|lassi|buttermilk|chaas|egg|eggs|anda|ande)\b/i,
  ],
  [
    'Snacks',
    /\b(chip|chips|chocolate|choco|dairy milk|kitkat|munch|perk|oreo|biscuit|cookie|rusk|maggi|noodle|pasta|namkeen|mixture|bhujia|sev|kurkure|lays|bingo|popcorn|bread|pav|bun|cake|pastry|sweet|mithai|laddu|barfi|rasgulla|gulab jamun|candy|toffee|wafer|icecream|ice cream|kulfi|samosa|kachori|chaat|momo|pizza|burger|roll|chicken|mutton|fish|prawn|meat|keema|kebab|biryani|tikka|sausage|salami)/i,
  ],
  [
    'Beverages',
    /\b(coke|pepsi|thums|thumsup|sprite|fanta|limca|maaza|frooti|slice|tropicana|real|juice|drink|cold drink|soft drink|soda|water|pani|bisleri|kinley|tea|chai|tetley|coffee|nescafe|bru|horlicks|bournvita|boost|redbull|monster|sting|beer|wine|whisky|whiskey|vodka|rum|alcohol|beverage|shake|smoothie)/i,
  ],
  [
    'Household',
    /\b(rice|chawal|atta|flour|maida|besan|suji|rava|dal|daal|lentil|rajma|chana|chole|moong|toor|arhar|urad|masoor|oil|tel|refined|mustard oil|sarso|sunflower|olive oil|sugar|cheeni|shakkar|jaggery|gud|salt|namak|spice|masala|jeera|cumin|haldi|turmeric|dhania powder|garam masala|pepper|kali mirch|elaichi|cardamom|laung|tez patta|hing|vinegar|soy|ketchup|sauce|jam|honey|shahad|pickle|achar|papad|poha|oats|cornflakes|dry fruit|almond|badam|cashew|kaju|raisin|kishmish|walnut|foil|cling|matchbox|lighter|candle|battery|bulb|cylinder|gas|lpg|rent|wifi|internet|broadband|electricity|bijli|water bill|maid|cook|bai|maintenance|dth|recharge|cable)/i,
  ],
  [
    'Personal Care',
    /\b(soap|sabun|lifebuoy|dove|lux|shampoo|conditioner|toothpaste|colgate|pepsodent|closeup|toothbrush|facewash|face wash|hair oil|coconut oil|parachute|sanitizer|handwash|lotion|moisturizer|vaseline|nivea|ponds|razor|blade|gillette|shaving|deodorant|deo|perfume|talc|powder|sunscreen|makeup|lipstick|kajal|nail|comb|tissue paper|sanitary|pad|whisper|stayfree|diaper|shaver|trimmer)/i,
  ],
  [
    'Cleaning',
    /\b(detergent|surf|ariel|tide|rin|nirma|ghadi|vim|dishwash|dish wash|scrub|scrubber|sponge|harpic|lizol|domex|colin|dettol|savlon|phenyl|acid|bleach|toilet cleaner|floor cleaner|glass cleaner|mop|pocha|broom|jhadu|wiper|dustbin|garbage|trash|dustpan|duster|napkin|tissue|paper towel|wipe|room freshener|odonil|naphthalene|mosquito|all out|hit|baygon)/i,
  ],
];

export function categorize(name: string): Category {
  const text = ` ${name.toLowerCase().trim()} `;
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return category;
  }
  return 'Miscellaneous';
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
