/**
 * Gemini-backed extraction. The model's only job is to turn messy text or a
 * photographed receipt into {item, amount, owners} triples — it never computes a
 * share, a balance or a settlement. All arithmetic happens in shared/money.ts.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Category } from '../shared/types.js';
import { isCategory } from '../shared/categories.js';
import { HttpError, badRequest } from './http.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface AiMember {
  userId: string;
  displayName: string;
  username: string;
}

export interface AiItem {
  name: string;
  /** Rupees as written on the receipt/message; converted to paise by the caller. */
  amount: number;
  owners: string[];
  category: Category;
  ambiguous: boolean;
  reason: string;
}

export interface AiSessionGroup {
  date: string;
  shop: string;
  payerId: string;
  payerName: string;
  items: AiItem[];
}

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new HttpError(500, 'GEMINI_API_KEY is not configured on the server.');
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

const ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Item name exactly as written, cleaned of OCR noise' },
    amount: { type: Type.NUMBER, description: 'Total price for this line in rupees' },
    owners: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'userId values of the members who share this item',
    },
    category: { type: Type.STRING, description: 'One of the allowed categories' },
    ambiguous: { type: Type.BOOLEAN, description: 'true when the owners could not be determined confidently' },
    reason: { type: Type.STRING, description: 'Short explanation when ambiguous is true, else empty' },
  },
  required: ['name', 'amount', 'owners', 'category', 'ambiguous'],
} as const;

function roster(members: AiMember[]): string {
  return members
    .map(member => `- userId "${member.userId}" | display name "${member.displayName}" | @${member.username} | initial "${member.displayName.trim()[0] ?? ''}"`)
    .join('\n');
}

function ownershipRules(members: AiMember[], payerId: string): string {
  const ids = members.map(member => member.userId);
  return `Ownership rules:
- "all", "everyone", "shared", "/${members.length}", or "/N" where N equals ${members.length} means every member: ${JSON.stringify(ids)}.
- "me", "myself", "self" means only the payer: "${payerId}".
- Initials map to members by the first letter of their display name. Combined initials such as "AR", "A,R", "A/R", "A+R" mean several members.
- Full or partial names, misspellings and OCR damage ("Ashuosh", "Rajv", "8astav") should still map to the closest member when it is unmistakable.
- If ownership cannot be determined with confidence, set ambiguous=true, give a one-line reason, and put your best guess in owners. Never invent a userId that is not listed.
- "/N" where N does NOT equal ${members.length}: set ambiguous=true.
Categories allowed: Vegetables, Dairy, Snacks, Beverages, Household, Personal Care, Cleaning, Miscellaneous.
Never compute shares, splits, balances, totals per person, or settlements. Return only the line items with their full price.`;
}

async function generate(parts: unknown[], responseSchema: unknown): Promise<Record<string, unknown>> {
  let response;
  try {
    response = await getClient().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: parts as never }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema as never,
        temperature: 0,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new HttpError(502, `The AI parser is unavailable right now (${detail}).`);
  }

  const text = response.text?.trim();
  if (!text) throw new HttpError(502, 'The AI parser returned an empty response.');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(502, 'The AI parser returned a response that could not be read.');
  }
}

function coerceItems(raw: unknown, members: AiMember[]): AiItem[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(members.map(member => member.userId));

  return raw.flatMap((entry): AiItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? '').trim().slice(0, 120);
    const amount = Number(record.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0) return [];

    const owners = Array.isArray(record.owners)
      ? [...new Set(record.owners.map(String).filter(id => valid.has(id)))]
      : [];
    const category: Category = isCategory(record.category) ? record.category : 'Miscellaneous';
    // A model that dropped or hallucinated every owner is exactly the case the
    // user must be asked about, so surface it rather than defaulting silently.
    const ambiguous = Boolean(record.ambiguous) || owners.length === 0;

    return [
      {
        name,
        amount,
        owners,
        category,
        ambiguous,
        reason: String(record.reason ?? '').trim().slice(0, 160),
      },
    ];
  });
}

export async function aiParseText(input: {
  text: string;
  members: AiMember[];
  payerId: string;
}): Promise<{ shop: string; items: AiItem[] }> {
  const prompt = `You extract shopping line items from messages that flatmates send each other. There is no fixed format: dashes, equals signs, missing spaces, brackets, commas, slashes, initials and typos are all normal.

Group members:
${roster(input.members)}

The person who paid is userId "${input.payerId}".

${ownershipRules(input.members, input.payerId)}

Also return the shop name if the text names one (often on its own first line), otherwise an empty string.

Input:
"""
${input.text.slice(0, 8000)}
"""`;

  const data = await generate([{ text: prompt }], {
    type: Type.OBJECT,
    properties: {
      shop: { type: Type.STRING },
      items: { type: Type.ARRAY, items: ITEM_SCHEMA },
    },
    required: ['items'],
  });

  return {
    shop: String(data.shop ?? '').trim().slice(0, 80),
    items: coerceItems(data.items, input.members),
  };
}

export async function aiParseReceipt(input: {
  imageBase64: string;
  mimeType: string;
  members: AiMember[];
  payerId: string;
}): Promise<{ shop: string; date: string; items: AiItem[] }> {
  const commaIndex = input.imageBase64.indexOf(',');
  const isDataUrl = input.imageBase64.startsWith('data:');
  const data = isDataUrl && commaIndex >= 0 ? input.imageBase64.slice(commaIndex + 1) : input.imageBase64;

  const declaredMime = isDataUrl
    ? input.imageBase64.slice(5, input.imageBase64.indexOf(';') >= 0 ? input.imageBase64.indexOf(';') : commaIndex)
    : input.mimeType;
  const mimeType = /^image\/(png|jpe?g|webp|heic|heif)$/i.test(declaredMime || '')
    ? declaredMime
    : 'image/jpeg';

  if (!data) throw badRequest('No image data was received.');
  if (data.length * 0.75 > MAX_IMAGE_BYTES) throw badRequest('That image is too large. Please use one under 8 MB.');

  const prompt = `Read this shopping receipt and extract every purchased line item.

Group members:
${roster(input.members)}

The person who paid is userId "${input.payerId}".

Receipt reading rules:
- Fix obvious OCR damage in item names ("MlLK 1L" -> "Milk 1L").
- Use the line total for each item, already including its quantity.
- Skip subtotals, totals, taxes, discounts, savings, round-off, change, tender and loyalty lines. Only real purchased goods.
- Receipts do not say who owns what, so unless handwriting on the receipt names someone, set owners to every member and ambiguous=false.
- Return the store name and the receipt date as YYYY-MM-DD when both are legible, otherwise empty strings.

${ownershipRules(input.members, input.payerId)}`;

  const result = await generate(
    [{ inlineData: { mimeType, data } }, { text: prompt }],
    {
      type: Type.OBJECT,
      properties: {
        shop: { type: Type.STRING },
        date: { type: Type.STRING },
        items: { type: Type.ARRAY, items: ITEM_SCHEMA },
      },
      required: ['items'],
    }
  );

  return {
    shop: String(result.shop ?? '').trim().slice(0, 80),
    date: String(result.date ?? '').trim().slice(0, 10),
    items: coerceItems(result.items, input.members),
  };
}

export async function aiParseWhatsapp(input: {
  text: string;
  members: AiMember[];
  payerId: string;
}): Promise<{ sessions: AiSessionGroup[] }> {
  const prompt = `You are importing a pasted WhatsApp conversation from a flatmate group into an expense tracker.

Group members:
${roster(input.members)}

Your job:
1. Ignore ordinary conversation. Only messages that record a purchase matter.
2. Group the expense messages into shopping sessions. Messages from the same sender within the same shopping trip (usually consecutive, same day) belong to one session.
3. For each session return the date as YYYY-MM-DD (from the message timestamp when present, otherwise an empty string), the shop name if mentioned, and who paid.
4. The payer is the person who sent the messages. Map their WhatsApp name to a userId from the list above and also return the raw name you saw. If you cannot map them, use payerId "" and still fill payerName.
5. Extract the line items for each session.

${ownershipRules(input.members, input.payerId)}

Conversation:
"""
${input.text.slice(0, 60000)}
"""`;

  const data = await generate([{ text: prompt }], {
    type: Type.OBJECT,
    properties: {
      sessions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            shop: { type: Type.STRING },
            payerId: { type: Type.STRING },
            payerName: { type: Type.STRING },
            items: { type: Type.ARRAY, items: ITEM_SCHEMA },
          },
          required: ['items'],
        },
      },
    },
    required: ['sessions'],
  });

  const valid = new Set(input.members.map(member => member.userId));
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];

  return {
    sessions: sessions.flatMap((entry): AiSessionGroup[] => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const items = coerceItems(record.items, input.members);
      if (!items.length) return [];
      const payerId = String(record.payerId ?? '');
      return [
        {
          date: String(record.date ?? '').trim().slice(0, 10),
          shop: String(record.shop ?? '').trim().slice(0, 80),
          payerId: valid.has(payerId) ? payerId : '',
          payerName: String(record.payerName ?? '').trim().slice(0, 60),
          items,
        },
      ];
    }),
  };
}
