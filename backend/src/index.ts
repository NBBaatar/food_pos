import './lib/bigint';
import { createServer } from 'node:http';
import app from './app';
import { env } from './config/env';
import { closePool, query } from './db/pool';
import { startScheduler } from './jobs/reconcile';

const server = createServer(app);

async function main(): Promise<void> {
  await query('SELECT 1');
  server.listen(env.PORT, () => {
    console.log(`[api] http://localhost:${env.PORT}/api/v1  (${env.NODE_ENV})`);
  });
  startScheduler();
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} — хааж байна...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

main().catch(async (error) => {
  console.error('[api] Эхлүүлэхэд алдаа:', error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
