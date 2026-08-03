/**
 * Local development / self-hosted server: the same API dispatcher as production,
 * with Vite middleware in front of it for the client.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest, segmentsFromPath } from './server/api.js';

const PORT = Number(process.env.PORT || 3000);
// A flag rather than NODE_ENV, so `npm start` behaves the same on Windows and POSIX.
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const app = express();
  app.disable('x-powered-by');
  // Receipt photos travel as base64 data URLs, so allow a generous JSON body.
  app.use(express.json({ limit: '12mb' }));

  app.all('/api/*', async (req, res) => {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      query[key] = Array.isArray(value) ? String(value[0]) : String(value ?? '');
    }

    const result = await handleApiRequest({
      method: req.method,
      segments: segmentsFromPath(req.path),
      query,
      body: req.body,
      authorization: req.headers.authorization,
    });

    res.status(result.status).json(result.body);
  });

  if (isProduction) {
    const distDir = path.join(rootDir, 'dist');
    app.use(express.static(distDir, { index: false, maxAge: '1y' }));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Expense Split ready on http://localhost:${PORT}`);
    console.log(`  Open it on your phone via your machine's LAN address on port ${PORT}.\n`);
  });
}

start().catch(error => {
  console.error('Failed to start the server:', error);
  process.exit(1);
});
