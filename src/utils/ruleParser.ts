import { UserProfile, SessionItem } from '../types';
import { categorizeItem } from './categories';

export interface RuleParseResult {
  shopName?: string;
  items: SessionItem[];
  confidence: number; // 0.0 to 1.0
  hasAmbiguous: boolean;
}

export function parseTextWithRules(
  text: string,
  paidByUid: string,
  membersInfo: Record<string, UserProfile>
): RuleParseResult {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { items: [], confidence: 0, hasAmbiguous: false };
  }

  const allUids = Object.keys(membersInfo);
  if (allUids.length === 0) {
    return { items: [], confidence: 0, hasAmbiguous: false };
  }

  // Create helper lookup maps for team members
  const memberList = Object.values(membersInfo);

  // Map initial -> list of uids (e.g. 'A' -> [uidOfAshutosh])
  const initialMap: Record<string, string[]> = {};
  memberList.forEach(m => {
    const name = m.displayName.trim();
    if (name.length > 0) {
      const initial = name[0].toUpperCase();
      if (!initialMap[initial]) initialMap[initial] = [];
      initialMap[initial].push(m.uid);
    }
  });

  // Helper function to resolve owner token string to array of UIDs
  function resolveOwners(token: string): { uids: string[]; isAmbiguous: boolean; reason?: string } {
    const raw = token.trim().toLowerCase();
    
    // Check "all", "everyone", "/3", "/n", "/ 3", "all members"
    if (
      raw === 'all' ||
      raw === 'everyone' ||
      /^\/\s*\d+$/.test(raw) ||
      raw === 'all members'
    ) {
      return { uids: [...allUids], isAmbiguous: false };
    }

    // Check "me", "myself"
    if (raw === 'me' || raw === 'myself') {
      return { uids: [paidByUid], isAmbiguous: false };
    }

    // Strip outer parentheses if present, e.g. "(b)", "(rajiv)"
    const cleaned = token.replace(/^[(\[\{]+|[)\}\]]+$/g, '').trim();
    const cleanedLower = cleaned.toLowerCase();

    if (cleanedLower === 'me' || cleanedLower === 'myself') {
      return { uids: [paidByUid], isAmbiguous: false };
    }
    if (cleanedLower === 'all' || cleanedLower === 'everyone') {
      return { uids: [...allUids], isAmbiguous: false };
    }

    // Try matching full or partial display names or email prefix
    const matchedUids = new Set<string>();
    let isAmbiguous = false;
    let ambiguityReason: string | undefined;

    // Check if cleaned string is separated by comma, slash, plus, or space
    // e.g. "A,R", "A/R", "A, B", "A+R"
    const parts = cleaned.split(/[,/+\s]+/).map(p => p.trim()).filter(Boolean);

    if (parts.length > 1) {
      for (const part of parts) {
        const subRes = resolveOwners(part);
        subRes.uids.forEach(u => matchedUids.add(u));
        if (subRes.isAmbiguous) isAmbiguous = true;
      }
      if (matchedUids.size > 0) {
        return { uids: Array.from(matchedUids), isAmbiguous };
      }
    }

    // Single token match attempt:
    // 1. Direct name match (e.g. "Ashutosh", "Rajiv", "Bastav")
    for (const member of memberList) {
      const dName = member.displayName.toLowerCase();
      const firstName = dName.split(' ')[0];
      if (dName === cleanedLower || firstName === cleanedLower) {
        matchedUids.add(member.uid);
      }
    }
    if (matchedUids.size > 0) {
      return { uids: Array.from(matchedUids), isAmbiguous: false };
    }

    // 2. Initials combination attempt (e.g., "AR", "AB", "RB", "A")
    // If the token consists solely of uppercase/lowercase initial letters corresponding to known member initials
    const letters = cleaned.toUpperCase().split('');
    const allValidInitials = letters.every(char => Boolean(initialMap[char]));

    if (allValidInitials && letters.length <= allUids.length) {
      for (const char of letters) {
        const uidsForInitial = initialMap[char] || [];
        if (uidsForInitial.length === 1) {
          matchedUids.add(uidsForInitial[0]);
        } else if (uidsForInitial.length > 1) {
          // Multiple members share same initial letter -> ambiguous!
          uidsForInitial.forEach(u => matchedUids.add(u));
          isAmbiguous = true;
          ambiguityReason = `Multiple members share initial '${char}'`;
        }
      }
      if (matchedUids.size > 0) {
        return { uids: Array.from(matchedUids), isAmbiguous, reason: ambiguityReason };
      }
    }

    // If we reach here, couldn't match token with certainty
    return {
      uids: [...allUids], // fallback to everyone, but flag ambiguous so user can verify
      isAmbiguous: true,
      reason: `Could not determine owner for '${token}'`
    };
  }

  const items: SessionItem[] = [];
  let shopName: string | undefined;
  let parsedCount = 0;
  let hasAmbiguous = false;

  // Regular expression to match line items
  // Examples matched:
  // "Vegetables - 130/3"
  // "Milk - 100/3"
  // "Chicken - 420 AR"
  // "Eggs=120 R"
  // "Soap - 40 (B)"
  // "Reliance Fresh - 1560/3" or "Milk 60 /3"
  // "Juice 20 Ashutosh"
  const lineRegex = /^(.+?)\s*[-=:]\s*(\d+(?:\.\d+)?)\s*(.*)$/;
  const altRegex = /^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if first line looks like a Shop Header (e.g. "Reliance Fresh" with no price)
    if (i === 0 && !/\d+/.test(line) && lines.length > 1) {
      shopName = line;
      continue;
    }

    let itemPart = '';
    let priceNum = 0;
    let ownerPart = '';
    let matched = false;

    const match1 = line.match(lineRegex);
    if (match1) {
      itemPart = match1[1].trim();
      priceNum = parseFloat(match1[2]);
      ownerPart = match1[3].trim();
      matched = true;
    } else {
      const match2 = line.match(altRegex);
      if (match2) {
        itemPart = match2[1].trim();
        priceNum = parseFloat(match2[2]);
        ownerPart = (match2[3] || '').trim();
        matched = true;
      }
    }

    if (matched && itemPart && !isNaN(priceNum) && priceNum > 0) {
      parsedCount++;

      // If ownerPart is empty or just "/3", default owner
      const ownerResolve = ownerPart
        ? resolveOwners(ownerPart)
        : { uids: [...allUids], isAmbiguous: false };

      if (ownerResolve.isAmbiguous) {
        hasAmbiguous = true;
      }

      // Calculate shares for item
      const numOwners = Math.max(1, ownerResolve.uids.length);
      const splitVal = Math.round((priceNum / numOwners) * 100) / 100;
      const shares: Record<string, number> = {};
      ownerResolve.uids.forEach(uid => {
        shares[uid] = splitVal;
      });

      items.push({
        id: `rule-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        item: itemPart,
        totalAmount: priceNum,
        owners: ownerResolve.uids,
        shares,
        category: categorizeItem(itemPart),
        isAmbiguous: ownerResolve.isAmbiguous,
        ambiguityReason: ownerResolve.reason
      });
    }
  }

  // Calculate confidence score
  const validLineCount = lines.filter(l => /\d+/.test(l)).length;
  const confidence = validLineCount > 0 ? parsedCount / validLineCount : 0;

  return {
    shopName,
    items,
    confidence: hasAmbiguous ? Math.min(confidence, 0.7) : confidence,
    hasAmbiguous
  };
}
