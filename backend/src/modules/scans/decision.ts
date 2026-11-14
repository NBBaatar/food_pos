import type { ScanInput } from '@shared/schemas';
import { PERIOD_FULL_LABELS, type PeriodCode } from '@shared/meal';
import type { ScanResult } from '@shared/types';
import { env } from '../../config/env';
import { execute, one, query, withTransaction } from '../../db/pool';
import { isUniqueViolation } from '../../lib/sql';
import { businessDateFor, findPeriod, localClock, type PeriodWindow } from '../../lib/time';

/** Төхөөрөмжийн цаг серверийн цагаас 5 минутаас их зөрвөл серверийн цагийг барина */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export interface RecordScanContext {
  deviceId?: string | null;
  deviceCode?: string | null;
  locationId?: string | null;
  /** Уншигч түүхэн огноог зөв илгээж байгаа бол (seed / backfill) цагийн зөрүүг үл харгалзана */
  allowBackdated?: boolean;
}

type Decision = ScanResult['decision'];

interface PeriodRow extends PeriodWindow {
  id: string;
  name: string;
}

interface CardRow {
  cardId: string;
  cardStatus: string;
  blockReason: string | null;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  employeeNo: string | null;
  departmentName: string | null;
  companyName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  userStatus: string | null;
  deletedAt: Date | null;
}

interface ExistingMealRow {
  id: string;
  scannedAt: Date;
  locationId: string | null;
  locationName: string | null;
}

interface ScanLike {
  decision: string;
  businessDate: string;
  scannedAt: Date;
  cardUid: string;
  periodCode: PeriodCode | null;
  userName: string | null;
  employeeNo: string | null;
  departmentName: string | null;
  companyName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  previousLocationId?: string | null;
  previousLocationName?: string | null;
  previousScannedAt?: Date | null;
}

function messageFor(decision: Decision, opts: { name?: string; period?: string; clock?: string }): string {
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

function toResult(scan: ScanLike): ScanResult {
  return {
    decision: scan.decision as Decision,
    message: messageFor(scan.decision as Decision, {
      name: scan.userName ?? undefined,
      period: scan.periodCode ? PERIOD_FULL_LABELS[scan.periodCode] : undefined,
    }),
    businessDate: scan.businessDate,
    scannedAt: scan.scannedAt.toISOString(),
    periodCode: scan.periodCode,
    userName: scan.userName,
    employeeNo: scan.employeeNo,
    departmentName: scan.departmentName,
    companyName: scan.companyName ?? null,
    unit: scan.unit,
    position: scan.position,
    photoUrl: scan.photoUrl,
    cardUid: scan.cardUid,
    previousLocationId: scan.previousLocationId ?? null,
    previousLocationName: scan.previousLocationName ?? null,
    previousScannedAt: scan.previousScannedAt?.toISOString() ?? null,
  };
}

async function findExistingMeal(userId: string, businessDate: string, periodId: string): Promise<ExistingMealRow | null> {
  return one<ExistingMealRow>(
    `SELECT m.id::text AS id,
            m.scanned_at AS "scannedAt",
            l.id::text AS "locationId",
            l.name AS "locationName"
       FROM meal_records m
       LEFT JOIN scan_events s ON s.id = m.scan_event_id
       LEFT JOIN locations l ON l.id = s.location_id
      WHERE m.user_id = $1::uuid AND m.business_date = $2::date AND m.period_id = $3::uuid
        AND m.voided_at IS NULL
      LIMIT 1`,
    [userId, businessDate, periodId],
  );
}

async function findExistingByKey(idempotencyKey: string): Promise<ScanLike | null> {
  return one<ScanLike>(
    `SELECT s.decision,
            to_char(s.business_date, 'YYYY-MM-DD') AS "businessDate",
            s.scanned_at AS "scannedAt",
            s.card_uid AS "cardUid",
            p.code AS "periodCode",
            CASE WHEN u.id IS NULL THEN NULL ELSE u.last_name || ' ' || u.first_name END AS "userName",
            u.employee_no AS "employeeNo",
            d.name AS "departmentName", co.name AS "companyName", u.unit, u.position, u.photo_url AS "photoUrl"
       FROM scan_events s
       LEFT JOIN meal_periods p ON p.id = s.period_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN companies co ON co.id = u.company_id
      WHERE s.idempotency_key = $1`,
    [idempotencyKey],
  );
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
  const rawPayload = JSON.stringify({
    source: input.source,
    reportedAt: reportedAt.toISOString(),
    ...(context.allowBackdated ? { backfill: true } : {}),
  });

  // Idempotency: ижил түлхүүрээр дахин ирвэл өмнөх хариуг буцаана
  if (input.idempotencyKey) {
    const existing = await findExistingByKey(input.idempotencyKey);
    if (existing) return toResult(existing);
  }

  const periods = await query<PeriodRow>(
    `SELECT id, code, name, start_time AS "startTime", end_time AS "endTime",
            crosses_midnight AS "crossesMidnight", is_active AS "isActive"
       FROM meal_periods
      ORDER BY sort_order ASC`,
  );
  const period = findPeriod(periods, effectiveAt, env.APP_TIMEZONE);

  const card = await one<CardRow>(
    `SELECT c.id AS "cardId", c.status AS "cardStatus", c.block_reason AS "blockReason",
            u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName",
            u.employee_no AS "employeeNo", u.unit, u.position, u.photo_url AS "photoUrl",
            d.name AS "departmentName", co.name AS "companyName", u.status AS "userStatus", u.deleted_at AS "deletedAt"
       FROM cards c
       LEFT JOIN LATERAL (
         SELECT ca.user_id
           FROM card_assignments ca
          WHERE ca.card_id = c.id AND ca.released_at IS NULL
          LIMIT 1
       ) a ON true
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN companies co ON co.id = u.company_id
      WHERE upper(c.uid) = $1`,
    [cardUid],
  );

  const user = card?.userId
    ? { id: card.userId, firstName: card.firstName ?? '', lastName: card.lastName ?? '', employeeNo: card.employeeNo ?? '' }
    : null;
  const userName = user ? `${user.lastName} ${user.firstName}`.trim() : null;
  const profile = {
    departmentName: card?.departmentName ?? null,
    companyName: card?.companyName ?? null,
    unit: card?.unit ?? null,
    position: card?.position ?? null,
    photoUrl: card?.photoUrl ?? null,
  };

  let outcome: ScanLike;
  let outcomeReason: string | null = null;
  let outcomeCardId: string | null = null;
  let outcomeUserId: string | null = null;

  if (!period) {
    outcome = {
      decision: 'OUT_OF_WINDOW',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      cardUid,
      periodCode: null,
      userName,
      employeeNo: user?.employeeNo ?? null,
      ...profile,
    };
    outcomeReason = `Локал цаг ${localClock(effectiveAt, env.APP_TIMEZONE)}`;
    outcomeCardId = card?.cardId ?? null;
    outcomeUserId = user?.id ?? null;
  } else if (!card) {
    outcome = {
      decision: 'UNKNOWN_CARD',
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      cardUid,
      periodCode: period.code,
      userName: null,
      employeeNo: null,
      ...profile,
    };
    outcomeReason = `UID ${cardUid}`;
  } else {
    outcomeCardId = card.cardId;
    outcomeUserId = user?.id ?? null;
    const base = {
      businessDate: businessDateIso,
      scannedAt: effectiveAt,
      cardUid,
      periodCode: period.code,
      userName,
      employeeNo: user?.employeeNo ?? null,
      ...profile,
    };

    if (card.cardStatus !== 'ACTIVE') {
      outcome = { ...base, decision: 'BLOCKED_CARD' };
      outcomeReason = card.blockReason ?? card.cardStatus;
    } else if (!user) {
      outcome = { ...base, decision: 'NO_ACTIVE_CARD' };
      outcomeReason = 'Идэвхтэй оноолт байхгүй';
      outcomeUserId = null;
    } else if (card.userStatus !== 'ACTIVE' || card.deletedAt) {
      outcome = { ...base, decision: 'INACTIVE_USER' };
      outcomeReason = 'Хэрэглэгч идэвхгүй';
    } else {
      const existingMeal = await findExistingMeal(user.id, businessDateIso, period.id);

      if (existingMeal) {
        outcome = {
          ...base,
          decision: 'ALREADY_SCANNED',
          previousLocationId: existingMeal.locationId,
          previousLocationName: existingMeal.locationName,
          previousScannedAt: existingMeal.scannedAt,
        };
        outcomeReason = `Meal #${existingMeal.id}`;
      } else {
        // Хүлээн авах оролдлого — DB-ийн partial unique index эцсийн хамгаалалт болно
        try {
          await withTransaction(async (client) => {
            const scan = await client.query<{ id: string }>(
              `INSERT INTO scan_events
                 (idempotency_key, device_id, location_id, card_uid, card_id, user_id, scanned_at, business_date,
                  period_id, decision, clock_skew_ms, raw_payload)
               VALUES ($1, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8::date, $9::uuid, 'ACCEPTED', $10, $11::jsonb)
               RETURNING id::text AS id`,
              [
                input.idempotencyKey ?? null,
                context.deviceId ?? null,
                context.locationId ?? null,
                cardUid,
                card.cardId,
                user.id,
                effectiveAt,
                businessDateIso,
                period.id,
                clockSkewMs,
                rawPayload,
              ],
            );
            await client.query(
              `INSERT INTO meal_records
                 (scan_event_id, user_id, card_id, period_id, business_date, scanned_at, source)
               VALUES ($1::bigint, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7)`,
              [scan.rows[0]!.id, user.id, card.cardId, period.id, businessDateIso, effectiveAt, input.source],
            );
          });

          if (context.deviceId) {
            await execute('UPDATE devices SET last_seen_at = now() WHERE id = $1::uuid', [context.deviceId]).catch(
              () => undefined,
            );
          }

          return {
            decision: 'ACCEPTED',
            message: messageFor('ACCEPTED', {
              name: userName ?? undefined,
              period: PERIOD_FULL_LABELS[period.code as PeriodCode],
            }),
            businessDate: businessDateIso,
            scannedAt: effectiveAt.toISOString(),
            periodCode: period.code,
            userName,
            employeeNo: user.employeeNo,
            ...profile,
            cardUid,
          };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // Зэрэгцээ ижил idempotency key ирсэн бол өмнөх хариуг буцаана
          if (input.idempotencyKey) {
            const existing = await findExistingByKey(input.idempotencyKey);
            if (existing) return toResult(existing);
          }
          const existingMeal = await findExistingMeal(user.id, businessDateIso, period.id);
          outcome = {
            ...base,
            decision: 'ALREADY_SCANNED',
            previousLocationId: existingMeal?.locationId ?? null,
            previousLocationName: existingMeal?.locationName ?? null,
            previousScannedAt: existingMeal?.scannedAt ?? null,
          };
          outcomeReason = 'Зэрэгцээ уншилт — unique index';
        }
      }
    }
  }

  try {
    await execute(
      `INSERT INTO scan_events
         (idempotency_key, device_id, location_id, card_uid, card_id, user_id, scanned_at, business_date,
          period_id, decision, reason, clock_skew_ms, raw_payload)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8::date, $9::uuid, $10, $11, $12, $13::jsonb)`,
      [
        input.idempotencyKey ?? null,
        context.deviceId ?? null,
        context.locationId ?? null,
        cardUid,
        outcomeCardId,
        outcomeUserId,
        outcome.scannedAt,
        outcome.businessDate,
        period?.id ?? null,
        outcome.decision,
        outcomeReason,
        clockSkewMs,
        rawPayload,
      ],
    );
  } catch (error) {
    // Ижил idempotency key зэрэг ирсэн бол өмнөх хариуг буцаана
    if (isUniqueViolation(error) && input.idempotencyKey) {
      const existing = await findExistingByKey(input.idempotencyKey);
      if (existing) return toResult(existing);
    }
    throw error;
  }

  return toResult(outcome);
}
