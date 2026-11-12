import type { Request } from 'express';
import { execute } from '../db/pool';

interface AuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await execute(
    `INSERT INTO audit_logs (actor_id, action, entity, entity_id, before, after, ip, user_agent)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      input.actorId,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.req?.ip ?? null,
      input.req?.headers['user-agent'] ?? null,
    ],
  );
}
