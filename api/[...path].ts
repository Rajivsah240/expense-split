import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApi } from '../server-lib/api';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath : rawPath ? [rawPath] : [];
  return handleApi(req, res, path);
}
