/**
 * Vercel Function entry point. vercel.json rewrites every /api/* request here
 * with the original path in ?path=, keeping the deployment to a single function.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiRequest, segmentsFromPath } from '../server/api.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === 'path') continue;
    query[key] = Array.isArray(value) ? String(value[0]) : String(value ?? '');
  }

  const rawPath = req.query?.path;
  const pathValue = Array.isArray(rawPath) ? rawPath[0] : rawPath || '';
  const segments = segmentsFromPath(String(pathValue) || req.url?.split('?')[0] || '');

  const result = await handleApiRequest({
    method: req.method ?? 'GET',
    segments,
    query,
    body: req.body,
    authorization: Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization,
  });

  res.status(result.status).json(result.body);
}
