/**
 * AI escalation endpoints.
 *
 * The client always tries the rule parser first; these routes exist for the
 * messy remainder. The member roster is read from the database, never taken from
 * the request, so a caller cannot inject fake members into the prompt.
 */

import { parseAmount } from '../../shared/money.js';
import { parseExpenseText } from '../../shared/parser.js';
import type { DraftItem } from '../../shared/types.js';
import { aiParseReceipt, aiParseText, aiParseWhatsapp, type AiItem, type AiMember } from '../ai.js';
import { badRequest, ok, requireString, route } from '../http.js';
import { requireGroup } from './shared.js';
import type { GroupDoc } from '../models.js';

function rosterOf(group: GroupDoc): AiMember[] {
  return group.members.map(member => ({
    userId: member.userId,
    displayName: member.displayName || 'Member',
    username: member.username || '',
  }));
}

let counter = 0;
const nextId = () => `draft_${Date.now().toString(36)}_${(counter += 1).toString(36)}`;

function draftFromAi(item: AiItem, allIds: string[]): DraftItem {
  const amount = parseAmount(item.amount) ?? 0;
  const owners = item.owners.length ? item.owners : [...allIds];
  return {
    id: nextId(),
    name: item.name,
    amount: (amount / 100).toString(),
    owners,
    category: item.category,
    assumed: !item.ambiguous && item.owners.length === allIds.length,
    needsOwners: Boolean(item.ambiguous),
    reason: item.ambiguous ? item.reason || 'Please confirm who shares this item.' : '',
  };
}

/** Rule-parser output in the same draft shape, used as the offline/AI-failure path. */
function draftFromRules(group: GroupDoc, text: string, payerId: string) {
  const result = parseExpenseText(text, {
    members: rosterOf(group),
    payerId,
    assumeSharedWhenUnspecified: group.settings?.assumeSharedWhenUnspecified !== false,
  });
  return {
    shop: result.shop,
    items: result.rows.map((row): DraftItem => ({
      id: nextId(),
      name: row.name,
      amount: (row.amount / 100).toString(),
      owners: row.owners,
      category: row.category,
      assumed: row.assumed,
      needsOwners: row.needsOwners,
      reason: row.reason,
    })),
    confidence: result.confidence,
  };
}

export const aiRoutes = [
  route('POST', 'groups/:groupId/ai/text', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const text = requireString(ctx.body.text, 'Text', 8000);
    const payerId = group.memberIds.includes(String(ctx.body.payerId ?? ''))
      ? String(ctx.body.payerId)
      : ctx.user._id.toString();
    const allIds = group.memberIds ?? [];

    try {
      const result = await aiParseText({ text, members: rosterOf(group), payerId });
      if (result.items.length === 0) {
        // The model found nothing; fall back rather than returning an empty table.
        const fallback = draftFromRules(group, text, payerId);
        return ok({ shop: fallback.shop, items: fallback.items, usedAi: false });
      }
      return ok({
        shop: result.shop,
        items: result.items.map(item => draftFromAi(item, allIds)),
        usedAi: true,
      });
    } catch (error) {
      const fallback = draftFromRules(group, text, payerId);
      if (fallback.items.length === 0) throw error;
      return ok({
        shop: fallback.shop,
        items: fallback.items,
        usedAi: false,
        warning: 'AI parsing was unavailable, so basic parsing was used. Please double-check the rows.',
      });
    }
  }),

  route('POST', 'groups/:groupId/ai/receipt', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const imageBase64 = String(ctx.body.imageBase64 ?? '');
    if (!imageBase64) throw badRequest('Attach a photo of the receipt.');
    const payerId = group.memberIds.includes(String(ctx.body.payerId ?? ''))
      ? String(ctx.body.payerId)
      : ctx.user._id.toString();

    const result = await aiParseReceipt({
      imageBase64,
      mimeType: String(ctx.body.mimeType ?? 'image/jpeg'),
      members: rosterOf(group),
      payerId,
    });

    return ok({
      shop: result.shop,
      date: result.date,
      items: result.items.map(item => draftFromAi(item, group.memberIds ?? [])),
      usedAi: true,
    });
  }),

  route('POST', 'groups/:groupId/ai/whatsapp', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const text = requireString(ctx.body.text, 'Conversation', 60000);
    const payerId = ctx.user._id.toString();

    const result = await aiParseWhatsapp({ text, members: rosterOf(group), payerId });
    const allIds = group.memberIds ?? [];

    return ok({
      sessions: result.sessions.map(session => ({
        date: session.date,
        shop: session.shop,
        payerId: session.payerId,
        payerName: session.payerName,
        items: session.items.map(item => draftFromAi(item, allIds)),
      })),
    });
  }),
];
