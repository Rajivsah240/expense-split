/**
 * A tiny path-template router shared by the dev Express server and the Vercel
 * function, so both environments run byte-identical routing logic.
 */

import type { UserDoc } from './models.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const tooMany = (message: string) => new HttpError(429, message);

export interface Ctx {
  method: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  /** Present on every authenticated route; routes with auth:false must not read it. */
  user: UserDoc;
}

export interface Reply {
  status: number;
  body: unknown;
}

export type Handler = (ctx: Ctx) => Promise<Reply>;

export interface Route {
  method: string;
  /** Template such as "groups/:groupId/sessions/:sessionId". */
  path: string;
  auth: boolean;
  handler: Handler;
}

export const ok = (body: unknown = {}): Reply => ({ status: 200, body });
export const created = (body: unknown = {}): Reply => ({ status: 201, body });

export function route(method: string, path: string, handler: Handler, auth = true): Route {
  return { method: method.toUpperCase(), path, auth, handler };
}

export function matchRoute(routes: Route[], method: string, segments: string[]) {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const template = candidate.path.split('/').filter(Boolean);
    if (template.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < template.length; index += 1) {
      const part = template[index];
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[index]);
      } else if (part !== segments[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route: candidate, params };
  }
  return null;
}

/** Field helpers that fail loudly instead of coercing junk into the database. */
export function requireString(value: unknown, field: string, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  return text;
}

export function optionalString(value: unknown, max = 500): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.slice(0, max);
}

export function requireInt(value: unknown, field: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) throw badRequest(`${field} must be a number.`);
  return Math.round(numeric);
}

export function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list.`);
  return value;
}
