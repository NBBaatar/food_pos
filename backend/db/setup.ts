import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { closePool, executeScript } from '../src/db/pool';

/** schema.sql-ыг ажиллуулна (idempotent — дахин ажиллуулж болно) */
async function main(): Promise<void> {
  const path = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  await executeScript(sql);
  console.log('✓ Schema бэлэн (хүснэгт, индекс, хязгаарлалтууд)');
}

main()
  .catch((error) => {
    console.error('Schema алдаа:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
