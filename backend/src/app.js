import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { attachUser } from './middleware/auth.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  // Log ids only — never donor PII (privacy rules §4).
  app.use((req, _res, next) => {
    if (!req.path.endsWith('/health')) console.log(`[api] ${req.method} ${req.path}`);
    next();
  });
  app.use(attachUser);
  app.use('/api', routes);
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[api] error', err);
    res.status(status).json({ error: err.message || 'Server error', details: err.details || null });
  });
  return app;
}
