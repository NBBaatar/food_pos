import pg from 'pg';
import type { PoolClient } from 'pg';
import { env } from '../config/env';

const { Pool } = pg;

/**
 * Homebrew/local PostgreSQL-тэй шууд ажиллах connection pool.
 * DATABASE_URL-д нууц үг оруулахгүй бол pg нь PGPASSWORD орчны хувьсагчийг уншина.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  console.error('[db] pool-ийн алдаа:', error);
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(sql, params as unknown[]);
  return result.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE — өөрчлөгдсөн мөрийн тоог буцаана */
export async function execute(sql: string, params: readonly unknown[] = []): Promise<number> {
  const result = await pool.query(sql, params as unknown[]);
  return result.rowCount ?? 0;
}

/** Олон мэдэгдэл нэг дор (schema.sql гэх мэт) */
export async function executeScript(sql: string): Promise<void> {
  await pool.query(sql);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
