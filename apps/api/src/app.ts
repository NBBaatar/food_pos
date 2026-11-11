import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { AppError } from './lib/errors';
import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';
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

// Зөвхөн итгэмжлэгдсэн proxy-н ард ажиллах үед X-Forwarded-For-т итгэнэ.
// (true гэж тавибал халдагч req.ip-г хуурамчаар өгч rate limit-ыг тойрч чадна.)
if (env.TRUST_PROXY) {
  const value = env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value);
}

app.use(securityHeaders);

const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Origin байхгүй = ижил эх сурвалж эсвэл server-to-server (curl, kiosk agent)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, 'Энэ эх сурвалжаас хандахыг зөвшөөрөхгүй', 'CORS_FORBIDDEN'));
    },
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

// Нэвтрэх оролдлогыг хязгаарлана (brute force-аас сэргийлэх)
app.use(
  '/api/v1/auth/login',
  rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 20 }),
);

// Уншигчийн терминалын урсгал — төхөөрөмж тус бүрээр
app.use(
  '/api/v1/scans',
  rateLimit({
    name: 'scan',
    windowMs: 60_000,
    max: 240,
    key: (req) => {
      const deviceCode = (req.body as { deviceCode?: unknown } | undefined)?.deviceCode;
      return typeof deviceCode === 'string' && deviceCode ? `device:${deviceCode}` : `ip:${req.ip ?? 'unknown'}`;
    },
  }),
);

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
