/**
 * The one request dispatcher. Both the local Express server and the Vercel
 * function call handleApiRequest, so routing, auth and error mapping behave
 * identically in development and production.
 */

import { getAuthenticatedUser } from './auth.js';
import { HttpError, matchRoute, type Ctx, type Route } from './http.js';
import { authRoutes } from './routes/auth.js';
import { groupRoutes } from './routes/groups.js';
import { sessionRoutes } from './routes/sessions.js';
import { settlementRoutes } from './routes/settlements.js';
import { feedRoutes } from './routes/feed.js';
import { statsRoutes } from './routes/stats.js';
import { aiRoutes } from './routes/ai.js';
import type { UserDoc } from './models.js';

const routes: Route[] = [
  ...authRoutes,
  ...feedRoutes,
  ...groupRoutes,
  ...sessionRoutes,
  ...settlementRoutes,
  ...statsRoutes,
  ...aiRoutes,
];

export interface ApiRequest {
  method: string;
  /** Path segments after /api, e.g. ["groups", "abc", "state"]. */
  segments: string[];
  query: Record<string, string>;
  body: unknown;
  authorization?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function describeError(error: unknown): ApiResponse {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message } };
  }

  const record = error as { code?: number; name?: string; message?: string; errors?: Record<string, { message: string }> };

  if (record?.code === 11000) {
    return { status: 409, body: { error: 'That value is already taken.' } };
  }
  if (record?.name === 'ValidationError') {
    const first = Object.values(record.errors ?? {})[0]?.message;
    return { status: 400, body: { error: first || 'Some of that information is not valid.' } };
  }
  if (record?.name === 'CastError') {
    return { status: 400, body: { error: 'That request referred to something that does not exist.' } };
  }
  if (record?.name === 'MongooseServerSelectionError' || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(record?.message ?? '')) {
    return { status: 503, body: { error: 'Could not reach the database. Please try again in a moment.' } };
  }

  console.error('[api] unhandled error:', error);
  return { status: 500, body: { error: 'Something went wrong on the server.' } };
}

export async function handleApiRequest(request: ApiRequest): Promise<ApiResponse> {
  const method = (request.method || 'GET').toUpperCase();

  try {
    const match = matchRoute(routes, method, request.segments);
    if (!match) {
      return { status: 404, body: { error: `No API route for ${method} /${request.segments.join('/')}` } };
    }

    const ctx: Ctx = {
      method,
      params: match.params,
      query: request.query ?? {},
      body: parseBody(request.body),
      user: undefined as unknown as UserDoc,
    };

    if (match.route.auth) {
      ctx.user = await getAuthenticatedUser(request.authorization);
    }

    const reply = await match.route.handler(ctx);
    return { status: reply.status, body: reply.body };
  } catch (error) {
    return describeError(error);
  }
}

/** Normalise "/api/groups/x/state" (or a ?path= rewrite) into segments. */
export function segmentsFromPath(pathname: string): string[] {
  return pathname
    .replace(/^\/?api\/?/, '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
}
