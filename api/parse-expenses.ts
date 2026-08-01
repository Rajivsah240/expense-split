import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processParseExpenses } from '../server-lib/parse-expenses';

export async function parseExpenses(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return processParseExpenses(req, res);
}

export default parseExpenses;
