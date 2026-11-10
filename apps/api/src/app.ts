import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { errorHandler, notFoundHandler } from './middleware/error';
import auditRoutes from './modules/audit/routes';
import authRoutes from './modules/auth/routes';
import cardRoutes from './modules/cards/routes';
import departmentRoutes from './modules/departments/routes';
import deviceRoutes from './modules/devices/routes';
import periodRoutes from './modules/periods/routes';
import reportRoutes from './modules/reports/routes';
import scanRoutes from './modules/scans/routes';
import userRoutes from './modules/users/routes';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/v1/health', async (_req, res) => {
  let db: 'ok' | 'down' = 'ok';
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    db = 'down';
  }
  res.status(db === 'ok' ? 200 : 503).json({
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    time: new Date().toISOString(),
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cards', cardRoutes);
app.use('/api/v1/periods', periodRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/scans', scanRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/audit-logs', auditRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
