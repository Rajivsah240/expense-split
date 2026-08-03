/**
 * Rule-based expense parser. Runs in the browser (instant, no network) and on
 * the server (as the fallback when the AI call fails).
 *
 * It is deliberately conservative: anything it cannot resolve with certainty is
 * returned flagged rather than guessed, so the caller can either ask the user or
 * escalate to the AI parser.
 */

import { categorize } from './categories.js';
import { parseAmount } from './money.js';
import type { Category, Paise } from './types.js';

export interface ParserMember {
  userId: string;
  displayName: string;
  username: string;
}

export interface ParseOptions {
  members: ParserMember[];
  payerId: string;
  assumeSharedWhenUnspecified?: boolean;
}

export interface ParsedRow {
  raw: string;
  name: string;
  amount: Paise;
  owners: string[];
  /** Owners were defaulted because the line named none. */
  assumed: boolean;
  /** Owners could not be resolved — the caller must ask. */
  needsOwners: boolean;
  reason: string;
  category: Category;
}

export interface ParseResult {
  shop: string;
  rows: ParsedRow[];
  /** Lines that looked like they should be expenses but could not be read. */
  skipped: string[];
  /** Sender name found in a pasted WhatsApp line, if any. */
  senderHint: string;
  confidence: number;
}

export interface OwnerResolution {
  ok: boolean;
  owners: string[];
  reason: string;
}

const ALL_WORDS = [
  'all',
  'everyone',
  'every1',
  'everybody',
  'shared',
  'share',
  'common',
  'both',
  'sab',
  'sabhi',
  'sabko',
  'us',
  'we',
  'team',
  'group',
  'flat',
  'room',
  'house',
];

const SELF_WORDS = ['me', 'myself', 'self', 'mine', 'my', 'apna', 'apne', 'khud'];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Allow one typo in short words and two in longer ones. OCR noise is mostly single-character. */
function fuzzyEquals(input: string, target: string): boolean {
  if (input === target) return true;
  if (target.length < 4 || input.length < 3) return false;
  const budget = target.length >= 7 ? 2 : 1;
  if (Math.abs(input.length - target.length) > budget) return false;
  return levenshtein(input, target) <= budget;
}

function normalizeLine(line: string): string {
  return line
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/₹|\bINR\b|\bRs\b\.?|\brupees?\b/gi, ' ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const WHATSAPP_PREFIX =
  /^\[?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\s*\]?\s*-?\s*([^:]{1,40}?)\s*:\s*/i;

const NOISE =
  /^(?:messages and calls are end-to-end encrypted|you (?:were )?(?:added|joined)|[^:]{1,40} (?:joined|left|added|removed|changed)\b|<media omitted>|this message was deleted|image omitted|sticker omitted|ok+|okay|thik|thanks?|thank you|thx|done|yes|no|yeah|nice|good|great|hi|hello|hey|bhai|👍+|🙏+)$/i;

/** Strip list bullets and "1." style numbering, but never a leading price. */
function stripBullet(line: string): string {
  return line.replace(/^(?:[-*•·–—>]+\s+|\d{1,2}[).]\s+)/, '').trim();
}

const AMOUNT_AT_END = /^(.*?)[\s:=\-]*(\d{1,9}(?:\.\d{1,2})?)\s*\/?\s*[-=]?\s*$/;

const SEPARATORS = /[\s:,=\-]+/g;

/**
 * Owner-shaped text: every space-separated word must begin with a letter or @.
 * This is what keeps "Milk 2 litre 120" from reading "litre 120" as an owner,
 * while still allowing "A,R", "Ashutosh Rajiv" and "@bastav".
 */
const OWNER_CANDIDATE = /^[A-Za-z@][A-Za-z0-9_@.,/+&]*(?:[ ,/+&]+[A-Za-z@][A-Za-z0-9_@.,/+&]*)*$/;

export function createResolver(options: ParseOptions) {
  const { members, payerId } = options;
  const allIds = members.map(member => member.userId);

  const byUsername = new Map<string, string>();
  const byFullName = new Map<string, string[]>();
  const byFirstName = new Map<string, string[]>();
  const byInitial = new Map<string, string[]>();

  const push = (map: Map<string, string[]>, key: string, userId: string) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(userId)) list.push(userId);
    map.set(key, list);
  };

  for (const member of members) {
    const name = member.displayName.trim().toLowerCase();
    const username = member.username.trim().toLowerCase();
    if (username) byUsername.set(username, member.userId);
    push(byFullName, name, member.userId);
    push(byFirstName, name.split(' ')[0], member.userId);
    if (name) push(byInitial, name[0].toUpperCase(), member.userId);
  }

  const nameKeys = [...byFullName.keys(), ...byFirstName.keys()];

  /** Resolve one word (or one hyphen-free name fragment) to a single member. */
  function resolveWord(word: string): { ids: string[]; ambiguous: boolean } {
    const token = word.replace(/^@+/, '').replace(/[.,;]+$/, '').trim().toLowerCase();
    if (!token) return { ids: [], ambiguous: false };

    const byUser = byUsername.get(token);
    if (byUser) return { ids: [byUser], ambiguous: false };

    const full = byFullName.get(token);
    if (full) return { ids: full, ambiguous: full.length > 1 };

    const first = byFirstName.get(token);
    if (first) return { ids: first, ambiguous: first.length > 1 };

    // Unique prefix, e.g. "ashu" for Ashutosh.
    if (token.length >= 3) {
      const prefixed = new Set<string>();
      for (const [key, ids] of byFullName) if (key.startsWith(token)) ids.forEach(id => prefixed.add(id));
      for (const [key, ids] of byFirstName) if (key.startsWith(token)) ids.forEach(id => prefixed.add(id));
      for (const [key, id] of byUsername) if (key.startsWith(token)) prefixed.add(id);
      if (prefixed.size === 1) return { ids: [...prefixed], ambiguous: false };
      if (prefixed.size > 1) return { ids: [...prefixed], ambiguous: true };
    }

    // Spelling / OCR slips.
    if (token.length >= 3) {
      const fuzzy = new Set<string>();
      for (const key of nameKeys) {
        if (fuzzyEquals(token, key)) {
          (byFullName.get(key) ?? byFirstName.get(key) ?? []).forEach(id => fuzzy.add(id));
        }
      }
      for (const [key, id] of byUsername) if (fuzzyEquals(token, key)) fuzzy.add(id);
      if (fuzzy.size === 1) return { ids: [...fuzzy], ambiguous: false };
      if (fuzzy.size > 1) return { ids: [...fuzzy], ambiguous: true };
    }

    // Combined initials: "AR", "RB", "ARB".
    if (/^[a-z]+$/i.test(token) && token.length <= Math.max(1, members.length)) {
      const letters = token.toUpperCase().split('');
      if (new Set(letters).size === letters.length) {
        const ids: string[] = [];
        let ambiguous = false;
        for (const letter of letters) {
          const matches = byInitial.get(letter);
          if (!matches) return { ids: [], ambiguous: false };
          if (matches.length > 1) ambiguous = true;
          matches.forEach(id => {
            if (!ids.includes(id)) ids.push(id);
          });
        }
        if (ids.length) return { ids, ambiguous };
      }
    }

    return { ids: [], ambiguous: false };
  }

  /**
   * Resolve a whole owner expression: "/3", "All", "AR", "A,R", "(Rajiv)",
   * "Ashutosh Rajiv", "Me".
   */
  function resolve(token: string): OwnerResolution {
    const cleaned = token
      .replace(/^[([{<]+/, '')
      .replace(/[)\]}>]+$/, '')
      .replace(/[.,;:]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return { ok: false, owners: [], reason: 'No owners named' };

    const lower = cleaned.toLowerCase();

    const splitCount = lower.match(/^\/?\s*(\d{1,2})\s*(?:way|ways|people|person|pax|members?)?$/);
    if (splitCount) {
      const count = Number(splitCount[1]);
      if (count === members.length) return { ok: true, owners: [...allIds], reason: '' };
      return {
        ok: false,
        owners: [],
        reason: `Split among ${count}, but this group has ${members.length} members`,
      };
    }

    if (ALL_WORDS.some(word => fuzzyEquals(lower, word) || lower === word)) {
      return { ok: true, owners: [...allIds], reason: '' };
    }
    if (SELF_WORDS.includes(lower)) {
      return { ok: true, owners: [payerId], reason: '' };
    }

    // Try the expression as one name before splitting it into words.
    const whole = resolveWord(lower);
    if (whole.ids.length && !whole.ambiguous) {
      return { ok: true, owners: whole.ids, reason: '' };
    }

    const words = cleaned.split(/[,/+&]|\s+/).map(part => part.trim()).filter(Boolean);
    if (words.length === 0) return { ok: false, owners: [], reason: 'No owners named' };

    const owners: string[] = [];
    const unresolved: string[] = [];
    let ambiguous = '';

    // Greedy longest-run matching so multi-word display names survive.
    let index = 0;
    while (index < words.length) {
      let matched = false;
      for (let span = Math.min(3, words.length - index); span >= 1; span -= 1) {
        const phrase = words.slice(index, index + span).join(' ');
        const result = resolveWord(phrase);
        if (result.ids.length && !result.ambiguous) {
          result.ids.forEach(id => {
            if (!owners.includes(id)) owners.push(id);
          });
          index += span;
          matched = true;
          break;
        }
        if (result.ids.length && result.ambiguous && span === 1) {
          ambiguous = phrase;
        }
      }
      if (!matched) {
        const word = words[index];
        if (ALL_WORDS.includes(word.toLowerCase())) {
          allIds.forEach(id => {
            if (!owners.includes(id)) owners.push(id);
          });
        } else if (SELF_WORDS.includes(word.toLowerCase())) {
          if (!owners.includes(payerId)) owners.push(payerId);
        } else {
          unresolved.push(word);
        }
        index += 1;
      }
    }

    if (ambiguous) {
      return { ok: false, owners, reason: `"${ambiguous}" could mean more than one member` };
    }
    if (unresolved.length) {
      return { ok: false, owners, reason: `Could not match "${unresolved.join(' ')}" to a member` };
    }
    if (!owners.length) return { ok: false, owners: [], reason: `Could not read "${cleaned}"` };
    return { ok: true, owners, reason: '' };
  }

  return { resolve, allIds };
}

/** Pull a trailing owner expression off a line, leaving the item and price behind. */
function extractOwnerToken(
  line: string,
  resolve: (token: string) => OwnerResolution
): { core: string; token: string } {
  const bracketed = line.match(/^(.*?)[\s:,=\-]*[([{]([^()[\]{}]{1,40})[)\]}]\s*$/);
  if (bracketed && /\d/.test(bracketed[1])) {
    return { core: bracketed[1].trim(), token: bracketed[2].trim() };
  }

  const slashCount = line.match(/^(.*?)\s*\/\s*(\d{1,2})\s*$/);
  if (slashCount && /\d/.test(slashCount[1])) {
    return { core: slashCount[1].trim(), token: `/${slashCount[2]}` };
  }

  // Walk separators left to right so the longest valid owner expression wins
  // ("Paneer - 180 A,R" must yield "A,R", not just "R").
  const separators = [...line.matchAll(SEPARATORS)];
  let unresolvable: { core: string; token: string } | null = null;

  for (const separator of separators) {
    const start = (separator.index ?? 0) + separator[0].length;
    const candidate = line.slice(start).trim();
    if (!candidate || !OWNER_CANDIDATE.test(candidate)) continue;
    const head = line.slice(0, separator.index).trim();
    if (!/\d/.test(head) || !AMOUNT_AT_END.test(head)) continue;
    if (resolve(candidate).ok) return { core: head, token: candidate };
    // Someone clearly tried to name an owner here. Keep the best attempt so the
    // row gets flagged for confirmation instead of silently defaulting to everyone.
    if (!unresolvable && candidate.length <= 24 && candidate.split(/\s+/).length <= 3) {
      unresolvable = { core: head, token: candidate };
    }
  }

  return unresolvable ?? { core: line, token: '' };
}

function cleanName(value: string): string {
  const name = value.replace(/^[\s:,=\-]+|[\s:,=\-]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  return name[0].toUpperCase() + name.slice(1);
}

export function parseExpenseText(text: string, options: ParseOptions): ParseResult {
  const { resolve, allIds } = createResolver(options);
  const assumeShared = options.assumeSharedWhenUnspecified !== false;

  const rawLines = String(text ?? '')
    .split(/\r?\n|;/)
    .map(line => line.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];
  const skipped: string[] = [];
  let shop = '';
  let senderHint = '';
  let considered = 0;
  const pending: string[] = [];

  for (const original of rawLines) {
    let line = normalizeLine(original);
    const whatsapp = line.match(WHATSAPP_PREFIX);
    if (whatsapp) {
      if (!senderHint) senderHint = whatsapp[1].trim();
      line = normalizeLine(line.slice(whatsapp[0].length));
    }
    line = stripBullet(line);
    if (!line) continue;
    if (NOISE.test(line)) continue;

    if (!/\d/.test(line)) {
      // A no-digit line is either a shop header or chatter; decide once we know
      // whether any items follow it.
      pending.push(line);
      continue;
    }

    considered += 1;

    const { core, token } = extractOwnerToken(line, resolve);
    const match = core.match(AMOUNT_AT_END);
    if (!match) {
      skipped.push(original);
      continue;
    }

    const name = cleanName(match[1]);
    const amount = parseAmount(match[2]);
    if (!name || amount === null || amount <= 0) {
      skipped.push(original);
      continue;
    }

    let owners = [...allIds];
    let assumed = false;
    let needsOwners = false;
    let reason = '';

    if (token) {
      const resolution = resolve(token);
      if (resolution.ok) {
        owners = resolution.owners;
      } else {
        owners = resolution.owners.length ? resolution.owners : [...allIds];
        needsOwners = true;
        reason = resolution.reason;
      }
    } else if (assumeShared) {
      assumed = true;
      reason = 'No owners named — assumed shared by everyone';
    } else {
      needsOwners = true;
      reason = 'Who should share this item?';
    }

    rows.push({
      raw: original,
      name,
      amount,
      owners,
      assumed,
      needsOwners,
      reason,
      category: categorize(name),
    });
  }

  if (rows.length && pending.length) {
    // The first no-digit line above the items reads as the shop name.
    shop = pending[0];
    for (const extra of pending.slice(1)) skipped.push(extra);
  } else if (!rows.length) {
    for (const extra of pending) skipped.push(extra);
  }

  const unresolved = rows.filter(row => row.needsOwners).length;
  let confidence = considered === 0 ? 0 : rows.length / considered;
  if (unresolved > 0) confidence = Math.min(confidence, 0.5);
  if (skipped.some(line => /\d/.test(line))) confidence = Math.min(confidence, 0.6);

  return { shop, rows, skipped, senderHint, confidence: Number(confidence.toFixed(3)) };
}

/** True when the rule parser is confident enough to skip the AI round trip. */
export function isConfident(result: ParseResult): boolean {
  return result.rows.length > 0 && result.confidence >= 0.85;
}
