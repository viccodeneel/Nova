import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables before initializing dependencies
dotenv.config({ override: true });
const backendEnvPath = path.resolve(__dirname, 'backend/.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
}

import { createServer as createViteServer } from 'vite';
import { initializeDatabase, isDatabaseConnected } from './database/db.ts';
import accountsRouter from './backend/routes/accounts.ts';
import tradesRouter from './backend/routes/trades.ts';
import connectorRouter from './backend/routes/connector.ts';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Initialize PostgreSQL schema if configured
  await initializeDatabase();

  // API Routes
  app.use('/api/accounts', accountsRouter);
  app.use('/api/trades', tradesRouter);
  app.use('/api/connector', connectorRouter);

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'UP',
      time: new Date().toISOString(),
      database_connected: isDatabaseConnected(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Mount Vite or static build
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NOVA Backend] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[NOVA Backend] Database status: ${isDatabaseConnected() ? 'CONNECTED (PostgreSQL)' : 'STANDALONE (In-Memory Repository)'}`);
  });
}

startServer().catch((err) => {
  console.error('[NOVA Backend] Fatal server initialization error:', err);
  process.exit(1);
});
