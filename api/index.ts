import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseExpenses } from './parse-expenses';
import { handleApi } from '../server-lib/api';

/**
 * Stable Vercel Function entry point for authenticated API routes. The
 * vercel.json rewrite supplies the requested API path as ?path=... .
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path;
  const pathValue = Array.isArray(rawPath) ? rawPath[0] : rawPath || '';
  const path = pathValue.split('/').filter(Boolean);
  if (path.length === 1 && path[0] === 'parse-expenses') {
    return parseExpenses(req, res);
  }
  return handleApi(req, res, path);
}
