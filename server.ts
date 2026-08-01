import 'dotenv/config';
import dns from 'dns';

// Ensure Node.js uses reliable public DNS servers for MongoDB SRV resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  // Ignore fallback if custom DNS setup fails
}

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { handleApi } from './server-lib/api.js';
import { processParseExpenses } from './server-lib/parse-expenses.js';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post("/api/parse-expenses", (req, res) => {
    return processParseExpenses(req, res);
  });

  // All remaining API endpoints are served by the MongoDB-backed API handler.
  app.all('/api/*', (req, res) => {
    const pathParts = req.path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return handleApi(req, res, pathParts);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
