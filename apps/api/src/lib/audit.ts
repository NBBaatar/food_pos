import type { Request } from 'express';
import { prisma } from '../db/prisma';

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
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      ip: input.req?.ip ?? null,
      userAgent: input.req?.headers['user-agent'] ?? null,
    },
  });
}
