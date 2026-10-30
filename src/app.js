import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import projectRoutes from './routes/projects.js';
import reportRoutes from './routes/reports.js';
import taskRoutes from './routes/tasks.js';
import userRoutes from './routes/users.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/projects', requireAuth, projectRoutes);
  app.use('/api/tasks', requireAuth, taskRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/reports', requireAuth, reportRoutes);
  app.use('/api', notFound);

  // In production the server also serves the built client.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.isProduction && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
