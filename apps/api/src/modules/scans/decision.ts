import type { ScanInput } from '@shared/schemas';
import { PERIOD_FULL_LABELS, type PeriodCode } from '@shared/meal';
import type { ScanResult } from '@shared/types';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../generated/prisma/client';
import { businessDateFor, findPeriod, localClock } from '../../lib/time';

/** Төхөөрөмжийн цаг серверийн цагаас 5 минутаас их зөрвөл серверийн цагийг барина */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface RecordScanContext {
  deviceId?: string | null;
  deviceCode?: string | null;
  /** Уншигч түүхэн огноог зөв илгээж байгаа бол (seed / backfill) цагийн зөрүүг үл харгалзана */
  allowBackdated?: boolean;
}

function messageFor(decision: ScanResult['decision'], opts: { name?: string; period?: string; clock?: string }): string {
  switch (decision) {
    case 'ACCEPTED':
      return `${opts.name ?? ''} — ${opts.period ?? ''} бүртгэгдлээ`;
    case 'ALREADY_SCANNED':
      return `${opts.name ?? 'Карт'} энэ хоолыг аль хэдийн авсан байна`;
    case 'UNKNOWN_CARD':
      return 'Карт бүртгэгдээгүй байна. Админтай холбогдоно уу.';
    case 'BLOCKED_CARD':
      return 'Картын эрх идэвхгүй байна';
    case 'INACTIVE_USER':
      return 'Хэрэглэгч идэвхгүй байна';
    case 'NO_ACTIVE_CARD':
      return 'Карт хэрэглэгчид оноогдоогүй байна';
    case 'OUT_OF_WINDOW':
      return `Хоолны цагнаас гадуур (${opts.clock ?? ''})`;
    default:
      return 'Бүртгэл хийгдсэн';
  }
}

interface ScanOutcome {
  decision: ScanResult['decision'];
  businessDate: string;
  scannedAt: Date;
  periodCode: PeriodCode | null;
  periodId: string | null;
  userId: string | null;
  userName: string | null;
  employeeNo: string | null;
  cardId: string | null;
  reason: string | null;
}

export async function recordScan(input: ScanInput, context: RecordScanContext = {}): Promise<ScanResult> {
  const cardUid = input.cardUid.trim().toUpperCase();
  const serverNow = new Date();
  const parsed = input.scannedAt ? new Date(input.scannedAt) : serverNow;
  const reportedAt = Number.isNaN(parsed.getTime()) ? serverNow : parsed;
  // clock_skew_ms нь int4 — хэт их зөрүүг мужад багтаана
  const clockSkewMs = Math.max(-2_147_483_647, Math.min(2_147_483_647, reportedAt.getTime() - serverNow.getTime()));
  // Цагийн зөрүү хэт их бол серверийн цагийг барина (backfill-д зөвшөөрнө)
  const effectiveAt =
    !context.allowBackdated && Math.abs(clockSkewMs) > CLOCK_SKEW_TOLERANCE_MS ? serverNow : reportedAt;

  const businessDateIso = businessDateFor(effectiveAt, env.DAY_START_HOUR, env.APP_TIMEZONE);

  // Idempotency: ижил түлхүүрээр дахин ирвэл өмнөх хариуг буцаана
  if (input.idempotencyKey) {
    const existing = await prisma.scanEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { period: true, user: true },
    });
    if (existing) return toResult(existing, existing.period?.code ?? null);
  }

  const periods = await prisma.mealPeriod.findMany({ orderBy: { sortOrder: 'asc' } });
  const period = findPeriod(periods, effectiveAt, env.APP_TIMEZONE);

  const card = await prisma.card.findUnique({
    where: { uid: cardUid },
    include: {
      assignments: {
        where: { releasedAt: null },
        include: { user: true },
        take: 1,
      },
    },
  });

  const assignment = card?.assignments[0];
  const user = assignment?.user ?? null;
  const userName = user ? `${user.lastName} ${user.firstName}` : null;

  let outcome!: ScanOutcome;

  if (!period) {
    outcome = {
      decision: 'OUT_OF_WINDOW',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      periodCode: null,
      periodId: null,
      userId: user?.id ?? null,
      userName,
      employeeNo: user?.employeeNo ?? null,
      cardId: card?.id ?? null,
      reason: `Локал цаг ${localClock(effectiveAt, env.APP_TIMEZONE)}`,
    };
  } else if (!card) {
    outcome = {
      decision: 'UNKNOWN_CARD',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      periodCode: period.code,
      periodId: period.id,
      userId: null,
      userName: null,
      employeeNo: null,
      cardId: null,
      reason: `UID ${cardUid}`,
    };
  } else if (card.status !== 'ACTIVE') {
    outcome = {
      decision: 'BLOCKED_CARD',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      periodCode: period.code,
      periodId: period.id,
      userId: user?.id ?? null,
      userName,
      employeeNo: user?.employeeNo ?? null,
      cardId: card.id,
      reason: card.blockReason ?? card.status,
    };
  } else if (!assignment || !user) {
    outcome = {
      decision: 'NO_ACTIVE_CARD',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      periodCode: period.code,
      periodId: period.id,
      userId: null,
      userName: null,
      employeeNo: null,
      cardId: card.id,
      reason: 'Идэвхтэй оноолт байхгүй',
    };
  } else if (user.status !== 'ACTIVE' || user.deletedAt) {
    outcome = {
      decision: 'INACTIVE_USER',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      periodCode: period.code,
      periodId: period.id,
      userId: user.id,
      userName,
      employeeNo: user.employeeNo,
      cardId: card.id,
      reason: 'Хэрэглэгч идэвхгүй',
    };
  } else {
    const businessDate = new Date(`${businessDateIso}T00:00:00.000Z`);
    const existingMeal = await prisma.mealRecord.findFirst({
      where: { userId: user.id, businessDate, periodId: period.id, voidedAt: null },
      select: { id: true },
    });

    if (existingMeal) {
      outcome = {
        decision: 'ALREADY_SCANNED',
        businessDate: businessDateIso,
        scannedAt: effectiveAt,
        periodCode: period.code,
        periodId: period.id,
        userId: user.id,
        userName,
        employeeNo: user.employeeNo,
        cardId: card.id,
        reason: `Meal #${existingMeal.id.toString()}`,
      };
    } else {
      // Хүлээн авах оролдлого — DB-ийн partial unique index эцсийн хамгаалалт болно
      try {
        const accepted = await prisma.$transaction(async (tx) => {
          const scanEvent = await tx.scanEvent.create({
            data: {
              idempotencyKey: input.idempotencyKey ?? null,
              deviceId: context.deviceId ?? null,
              cardUid,
              cardId: card.id,
              userId: user.id,
              scannedAt: effectiveAt,
              businessDate,
              periodId: period.id,
              decision: 'ACCEPTED',
              clockSkewMs,
              rawPayload: {
                source: input.source,
                reportedAt: reportedAt.toISOString(),
                ...(context.allowBackdated ? { backfill: true } : {}),
              },
            },
            include: { period: true, user: true },
          });
          await tx.mealRecord.create({
            data: {
              scanEventId: scanEvent.id,
              userId: user.id,
              cardId: card.id,
              periodId: period.id,
              businessDate,
              scannedAt: effectiveAt,
              source: input.source,
            },
          });
          return scanEvent;
        });

        await prisma.device
          .update({ where: { id: context.deviceId ?? '' }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);

        return {
          decision: 'ACCEPTED',
          message: messageFor('ACCEPTED', {
            name: userName ?? undefined,
            period: PERIOD_FULL_LABELS[period.code as PeriodCode],
          }),
          businessDate: businessDateIso,
          scannedAt: effectiveAt.toISOString(),
          periodCode: period.code as PeriodCode,
          userName,
          employeeNo: user.employeeNo,
          cardUid,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          outcome = {
            decision: 'ALREADY_SCANNED',
            businessDate: businessDateIso,
            scannedAt: effectiveAt,
            periodCode: period.code,
            periodId: period.id,
            userId: user.id,
            userName,
            employeeNo: user.employeeNo,
            cardId: card.id,
            reason: 'Зэрэгцээ уншилт — unique index',
          };
        } else {
          throw error;
        }
      }
    }
  }

  const finalOutcome = outcome;
  try {
    const created = await prisma.scanEvent.create({
      data: {
        idempotencyKey: input.idempotencyKey ?? null,
        deviceId: context.deviceId ?? null,
        cardUid,
        cardId: finalOutcome.cardId,
        userId: finalOutcome.userId,
        scannedAt: finalOutcome.scannedAt,
        businessDate: new Date(`${finalOutcome.businessDate}T00:00:00.000Z`),
        periodId: finalOutcome.periodId,
        decision: finalOutcome.decision,
        reason: finalOutcome.reason,
        clockSkewMs,
        rawPayload: {
          source: input.source,
          reportedAt: reportedAt.toISOString(),
          ...(context.allowBackdated ? { backfill: true } : {}),
        },
      },
      include: { period: true, user: true },
    });
    return toResult(created, finalOutcome.periodCode);
  } catch (error) {
    // Ижил idempotency key зэрэг ирсэн бол өмнөх хариуг буцаана
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && input.idempotencyKey) {
      const existing = await prisma.scanEvent.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
        include: { period: true, user: true },
      });
      return toResult(existing, existing.period?.code ?? null);
    }
    throw error;
  }
}

interface ScanLike {
  decision: string;
  businessDate: Date;
  scannedAt: Date;
  cardUid: string;
  user?: { firstName: string; lastName: string; employeeNo: string } | null;
}

function toResult(scan: ScanLike, periodCode: PeriodCode | null): ScanResult {
  return {
    decision: scan.decision as ScanResult['decision'],
    message: messageFor(scan.decision as ScanResult['decision'], {
      name: scan.user ? `${scan.user.lastName} ${scan.user.firstName}` : undefined,
      period: periodCode ? PERIOD_FULL_LABELS[periodCode] : undefined,
    }),
    businessDate: scan.businessDate.toISOString().slice(0, 10),
    scannedAt: scan.scannedAt.toISOString(),
    periodCode,
    userName: scan.user ? `${scan.user.lastName} ${scan.user.firstName}` : null,
    employeeNo: scan.user?.employeeNo ?? null,
    cardUid: scan.cardUid,
  };
}
