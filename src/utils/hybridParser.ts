import { UserProfile, SessionItem, ExpenseCategory } from '../types';
import { api } from '../lib/api';
import { parseTextWithRules } from './ruleParser';
import { categorizeItem } from './categories';

export interface HybridParseOptions {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  paidByUid: string;
  membersInfo: Record<string, UserProfile>;
}

export interface HybridParseResult {
  shopName?: string;
  items: SessionItem[];
  usedAi: boolean;
  hasAmbiguous: boolean;
}

export async function parseExpensesHybrid(options: HybridParseOptions): Promise<HybridParseResult> {
  const { text, imageBase64, imageMimeType, paidByUid, membersInfo } = options;
  const allUids = Object.keys(membersInfo);

  // 1. If NO image and text exists, try rule-based parsing first
  if (text && !imageBase64) {
    const ruleResult = parseTextWithRules(text, paidByUid, membersInfo);

    // If rule parsing has high confidence (> 0.8) and extracted items, return immediately!
    if (ruleResult.confidence >= 0.8 && ruleResult.items.length > 0) {
      return {
        shopName: ruleResult.shopName,
        items: ruleResult.items,
        usedAi: false,
        hasAmbiguous: ruleResult.hasAmbiguous
      };
    }
  }

  // 2. Fallback to AI Parser Endpoint for receipts, images, or low-confidence / complex texts
  try {
    const data = await api<any>('parse-expenses', {
      method: 'POST',
      body: JSON.stringify({
        text,
        imageBase64,
        imageMimeType,
        paidByUid,
        membersInfo
      })
    });
    const rawItems = data.items || [];
    let hasAmbiguous = false;

    const items: SessionItem[] = rawItems.map((raw: any, index: number) => {
      let owners: string[] = Array.isArray(raw.owners) && raw.owners.length > 0 ? raw.owners : allUids;
      
      // Filter owners to valid team UIDs only
      owners = owners.filter(uid => allUids.includes(uid));
      if (owners.length === 0) owners = [...allUids];

      const priceNum = Number(raw.totalAmount) || 0;
      const splitVal = owners.length > 0 ? Math.round((priceNum / owners.length) * 100) / 100 : priceNum;
      
      const shares: Record<string, number> = {};
      owners.forEach(uid => {
        shares[uid] = splitVal;
      });

      const category: ExpenseCategory = raw.category && ['Vegetables', 'Dairy', 'Snacks', 'Beverages', 'Household', 'Personal Care', 'Cleaning', 'Miscellaneous'].includes(raw.category)
        ? raw.category
        : categorizeItem(raw.item || '');

      const isAmbiguous = Boolean(raw.isAmbiguous) || owners.length === 0;
      if (isAmbiguous) hasAmbiguous = true;

      return {
        id: `ai-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
        item: raw.item || `Item ${index + 1}`,
        totalAmount: priceNum,
        owners,
        shares,
        category,
        isAmbiguous
      };
    });

    return {
      shopName: data.shopName || undefined,
      items,
      usedAi: true,
      hasAmbiguous
    };
  } catch (error) {
    console.warn('AI Parsing failed, falling back to rule parser result:', error);
    // If AI fails but we had some rule result, return rule result
    if (text) {
      const ruleResult = parseTextWithRules(text, paidByUid, membersInfo);
      return {
        shopName: ruleResult.shopName,
        items: ruleResult.items,
        usedAi: false,
        hasAmbiguous: ruleResult.hasAmbiguous
      };
    }

    return {
      items: [],
      usedAi: true,
      hasAmbiguous: false
    };
  }
}
