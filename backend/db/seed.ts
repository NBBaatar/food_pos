import { DEFAULT_PERIODS } from '@shared/meal';
import { env } from '../src/config/env';
import { closePool, execute, one, query } from '../src/db/pool';
import { hashPassword } from '../src/lib/password';
import { addDaysIso, businessDateFor } from '../src/lib/time';
import { hashToken } from '../src/lib/tokens';
import { recordScan } from '../src/modules/scans/decision';

/**
 * Dev seed: 3 түвшний хэрэглэгч, хэлтэс, карт, төхөөрөмж, 35 хоногийн
 * бодит уншилт. Дахин ажиллуулахад гүйлгээний өгөгдлийг цэвэрлээд
 * master өгөгдлийг upsert хийнэ.
 */

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
const HISTORY_DAYS = 35;

const ADMIN_PASSWORD = 'Admin@12345';
const MANAGER_PASSWORD = 'Manager@12345';
const STAFF_PASSWORD = 'User@12345';

if (env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Seed нь production-д ажиллахгүй. Итгэлтэй бол --force нэмнэ үү.');
  process.exit(1);
}

/** Тогтмол PRNG — seed бүр ижил өгөгдөл үүсгэнэ */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261110);

const chance = (p: number): boolean => rand() < p;

/** Бизнес өдөр + локал HH:mm → UTC Date (Улаанбаатар UTC+8, DST-гүй) */
function ubTime(businessIso: string, hour: number, minute: number): Date {
  const localDay = hour < env.DAY_START_HOUR ? addDaysIso(businessIso, 1) : businessIso;
  const [year, month, day] = localDay.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - UB_OFFSET_MS);
}

function isWeekend(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

const LAST_NAMES = [
  'Батбаяр', 'Дорж', 'Сүхбаатар', 'Энхбат', 'Ганбат', 'Мөнхбат', 'Отгонбаяр', 'Төмөр',
  'Наранбаатар', 'Чулуун', 'Алтансүх', 'Болд', 'Цэрэн', 'Хүрэлбаатар', 'Оюун', 'Сарангэрэл',
  'Гэрэлмаа', 'Цэцэгмаа', 'Эрдэнэ', 'Баярмагнай', 'Нямаа', 'Ууганбаяр', 'Мягмар', 'Хонгорзул',
] as const;

const FIRST_NAMES = [
  'Тэмүүлэн', 'Содномдорж', 'Амартүвшин', 'Билгүүн', 'Тэнгис', 'Хангай', 'Мөнх-Эрдэнэ', 'Ануужин',
  'Хулан', 'Номин', 'Сарнай', 'Тунгалаг', 'Энхжин', 'Дөлгөөн', 'Марал', 'Ган-Эрдэнэ',
  'Бат-Эрдэнэ', 'Ирмүүн', 'Өсөхбаяр', 'Азжаргал', 'Хүслэн', 'Мөнхзул', 'Энхжин', 'Уянга',
] as const;

const DEPARTMENTS = [
  { name: 'Удирдлага', code: 'MGMT' },
  { name: 'Үйлдвэрлэл', code: 'PROD' },
  { name: 'Борлуулалт', code: 'SALES' },
  { name: 'Санхүү', code: 'FIN' },
  { name: 'Мэдээлэл технологи', code: 'IT' },
] as const;

const LOCATIONS = [
  { name: '1 давхар, хоолны танхим' },
  { name: '2 давхар, цехийн терминал' },
] as const;

const POSITIONS = ['Мэргэжилтэн', 'Ахлах мэргэжилтэн', 'Ажилтан', 'Инженер'] as const;
const UNITS = ['Удирдлагын нэгж', 'Тайлангийн нэгж', 'Борлуулалтын нэгж', 'Нэгж 1', 'Нэгж 2', 'Нэгж 3'] as const;
const REFERENCE_POSITIONS = [...POSITIONS, 'Системийн админ', 'Менежер'] as const;

const CARD_COUNT = 26;

const AVATAR_BACKGROUNDS = ['#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#0369a1', '#a16207'] as const;
const AVATAR_SHIRTS = ['#334155', '#1e3a8a', '#4c1d95', '#7f1d1d', '#0f766e', '#78350f'] as const;
const AVATAR_SKINS = ['#f2c6a0', '#e0ac82', '#c98b62', '#f7d7bd', '#b9704a'] as const;
const AVATAR_HAIRS = ['#1f2937', '#3f2a1d', '#111827', '#5b4636', '#0f172a'] as const;

/** Seed-ийн демо хэрэглэгчдэд зориулсан, гадаад сүлжээнээс хамааралгүй avatar зураг */
function avatarDataUrl(index: number): string {
  const background = AVATAR_BACKGROUNDS[index % AVATAR_BACKGROUNDS.length]!;
  const shirt = AVATAR_SHIRTS[(index * 3) % AVATAR_SHIRTS.length]!;
  const skin = AVATAR_SKINS[(index * 2) % AVATAR_SKINS.length]!;
  const hair = AVATAR_HAIRS[(index * 5) % AVATAR_HAIRS.length]!;
  const longHair =
    index % 3 === 1
      ? `<path d="M88 156c-8-54 22-96 72-96s80 42 72 96l-10 46h-22l8-54c-8-26-22-40-48-40s-40 14-48 40l8 54h-22z" fill="${hair}"/>`
      : '';
  const glasses =
    index % 5 === 1
      ? '<g fill="none" stroke="#1f2937" stroke-width="4"><rect x="122" y="146" width="30" height="21" rx="8"/><rect x="168" y="146" width="30" height="21" rx="8"/><path d="M152 154h16"/></g>'
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#0b1020"/></linearGradient></defs>
<rect width="320" height="320" fill="url(#bg)"/>
<circle cx="266" cy="54" r="84" fill="#ffffff" opacity=".07"/>
<circle cx="48" cy="278" r="96" fill="#ffffff" opacity=".05"/>
${longHair}
<path d="M34 320c0-64 57-105 126-105s126 41 126 105z" fill="${shirt}"/>
<path d="M136 196h48v62h-48z" fill="${skin}"/>
<ellipse cx="160" cy="150" rx="58" ry="66" fill="${skin}"/>
<circle cx="100" cy="154" r="12" fill="${skin}"/>
<circle cx="220" cy="154" r="12" fill="${skin}"/>
<path d="M100 146c-6-48 24-84 60-84s66 36 60 84c-8-22-18-34-32-40-18-7-38-7-54 0-14 6-26 18-34 40z" fill="${hair}"/>
<path d="M130 158c5-4 13-4 18 0M172 158c5-4 13-4 18 0" stroke="#1f2937" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="141" cy="167" r="4" fill="#1f2937"/>
<circle cx="179" cy="167" r="4" fill="#1f2937"/>
<path d="M148 192c8 6 16 6 24 0" stroke="#9f1239" stroke-width="4" fill="none" stroke-linecap="round"/>
${glasses}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

interface PeriodTiming {
  code: (typeof DEFAULT_PERIODS)[number]['code'];
  probability: number;
  window: [number, number];
}

const PERIOD_TIMING: PeriodTiming[] = [
  { code: 'BREAKFAST', probability: 0.72, window: [6, 10] },
  { code: 'LUNCH', probability: 0.88, window: [11, 15] },
  { code: 'DINNER', probability: 0.58, window: [17, 21] },
  { code: 'NIGHT', probability: 0.34, window: [22, 26] },
];

/** Цонх доторх санамсаргүй цаг (26 = дараа өдрийн 02:00) */
function randomTimeInWindow(businessIso: string, [from, to]: [number, number]): Date {
  const totalMinutes = (to - from) * 60 - 10;
  const minutes = from * 60 + 5 + Math.floor(rand() * totalMinutes);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return ubTime(businessIso, hour, minute);
}

async function main(): Promise<void> {
  console.log('→ Гүйлгээний өгөгдлийг цэвэрлэж байна...');
  await execute(
    'TRUNCATE TABLE meal_records, scan_events, audit_logs, refresh_tokens, card_assignments RESTART IDENTITY CASCADE',
  );

  console.log('→ Хэлтэс...');
  const departments = await Promise.all(
    DEPARTMENTS.map((d) =>
      one<{ id: string; name: string }>(
        `INSERT INTO departments (name, code) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code
         RETURNING id, name`,
        [d.name, d.code],
      ),
    ),
  );
  const departmentIds = departments.map((d) => d!.id);
  const departmentByName = new Map(departments.map((d) => [d!.name, d!.id]));

  console.log('→ Нэгж, албан тушаал...');
  for (const name of UNITS) {
    await execute('INSERT INTO units (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of REFERENCE_POSITIONS) {
    await execute('INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }

  console.log('→ Хоолны цонх...');
  for (const period of DEFAULT_PERIODS) {
    await execute(
      `INSERT INTO meal_periods (code, name, start_time, end_time, crosses_midnight, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
             crosses_midnight = EXCLUDED.crosses_midnight, sort_order = EXCLUDED.sort_order, is_active = true`,
      [period.code, period.name, period.startTime, period.endTime, period.crossesMidnight, period.sortOrder],
    );
  }
  const periods = await query<{ id: string; code: string; startTime: string; endTime: string }>(
    `SELECT id, code, start_time AS "startTime", end_time AS "endTime"
       FROM meal_periods ORDER BY sort_order ASC`,
  );
  const periodsByCode = new Map(periods.map((p) => [p.code, p]));

  console.log('→ Хэрэглэгчид...');
  const [adminHash, managerHash, staffHash] = await Promise.all([
    hashPassword(ADMIN_PASSWORD),
    hashPassword(MANAGER_PASSWORD),
    hashPassword(STAFF_PASSWORD),
  ]);

  const admin = await one<{ id: string }>(
    `INSERT INTO users (employee_no, first_name, last_name, email, phone, password_hash, role, status, can_login,
                        department_id, unit, position, photo_url, must_change_password)
     VALUES ('A-0001', 'Системийн', 'Админ', 'admin@foodpos.mn', '+976 9911 0001', $1, 'ADMIN', 'ACTIVE', true,
             $2::uuid, 'Удирдлагын нэгж', 'Системийн админ', $3, false)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'ADMIN', status = 'ACTIVE', can_login = true, deleted_at = NULL,
           must_change_password = false, failed_login_attempts = 0, locked_until = NULL,
           unit = EXCLUDED.unit, position = EXCLUDED.position, photo_url = EXCLUDED.photo_url
     RETURNING id`,
    [adminHash, departmentIds[0], avatarDataUrl(0)],
  );

  await execute(
    `INSERT INTO users (employee_no, first_name, last_name, email, phone, password_hash, role, status, can_login,
                        department_id, unit, position, photo_url, must_change_password)
     VALUES ('M-0001', 'Тайлангийн', 'Менежер', 'manager@foodpos.mn', '+976 9911 0002', $1, 'MANAGER', 'ACTIVE', true,
             $2::uuid, 'Тайлангийн нэгж', 'Менежер', $3, false)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'MANAGER', status = 'ACTIVE', can_login = true, deleted_at = NULL,
           must_change_password = false, failed_login_attempts = 0, locked_until = NULL,
           unit = EXCLUDED.unit, position = EXCLUDED.position, photo_url = EXCLUDED.photo_url`,
    [managerHash, departmentIds[0], avatarDataUrl(1)],
  );

  await execute(
    `INSERT INTO users (employee_no, first_name, last_name, email, phone, password_hash, role, status, can_login,
                        department_id, unit, position, photo_url, must_change_password)
     VALUES ('U-0001', 'Бүртгэлийн', 'Ажилтан', 'user@foodpos.mn', '+976 9911 0003', $1, 'USER', 'ACTIVE', true,
             $2::uuid, 'Борлуулалтын нэгж', 'Ажилтан', $3, false)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'USER', status = 'ACTIVE', can_login = true, deleted_at = NULL,
           must_change_password = false, failed_login_attempts = 0, locked_until = NULL,
           unit = EXCLUDED.unit, position = EXCLUDED.position, photo_url = EXCLUDED.photo_url`,
    [staffHash, departmentByName.get('Борлуулалт')!, avatarDataUrl(2)],
  );

  const staff: { id: string; cardUid: string; active: boolean }[] = [];

  for (let i = 0; i < CARD_COUNT; i += 1) {
    const lastName = LAST_NAMES[i % LAST_NAMES.length]!;
    const firstName = FIRST_NAMES[(i * 7 + 3) % FIRST_NAMES.length]!;
    const employeeNo = `E-${String(1001 + i)}`;
    const email = `staff${i + 1}@foodpos.mn`;
    const departmentId = departmentIds[i % departmentIds.length]!;
    const inactive = i === 5 || i === 17;
    const unit = `Нэгж ${(i % 3) + 1}`;
    const position = POSITIONS[i % POSITIONS.length]!;

    const user = await one<{ id: string }>(
      `INSERT INTO users (employee_no, first_name, last_name, email, phone, password_hash, role, status, can_login,
                          department_id, unit, position, photo_url, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 'USER', $7, false, $8::uuid, $9, $10, $11, false)
       ON CONFLICT (employee_no) DO UPDATE
         SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email,
             department_id = EXCLUDED.department_id, password_hash = EXCLUDED.password_hash,
             status = EXCLUDED.status, can_login = false, unit = EXCLUDED.unit, position = EXCLUDED.position,
             photo_url = EXCLUDED.photo_url, deleted_at = NULL
       RETURNING id`,
      [
        employeeNo,
        firstName,
        lastName,
        email,
        `+976 ${8800 + i} ${1000 + i}`,
        staffHash,
        inactive ? 'INACTIVE' : 'ACTIVE',
        departmentId,
        unit,
        position,
        avatarDataUrl(i + 3),
      ],
    );

    const uid = `04${(0xa1b2c300 + i * 17).toString(16).toUpperCase().padStart(8, '0')}`;
    const card = await one<{ id: string }>(
      `INSERT INTO cards (uid, label, status) VALUES ($1, $2, 'ACTIVE')
       ON CONFLICT (uid) DO UPDATE SET label = EXCLUDED.label, status = 'ACTIVE'
       RETURNING id`,
      [uid, `${lastName} ${firstName}`],
    );

    await execute(
      `INSERT INTO card_assignments (card_id, user_id, assigned_by_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [card!.id, user!.id, admin!.id],
    );

    staff.push({ id: user!.id, cardUid: uid, active: !inactive });
  }

  // Нэг карт блоклогдсон, нэг карт хэн ч эзэмшээгүй (тестэд хэрэгтэй)
  const blockedUser = staff[3]!;
  await execute(
    `UPDATE cards
        SET status = 'BLOCKED', blocked_at = now(), blocked_by_id = $2::uuid, block_reason = $3, updated_at = now()
      WHERE uid = $1`,
    [blockedUser.cardUid, admin!.id, 'Тест: алдагдсан карт'],
  );

  console.log('→ Байршил...');
  const locations = await Promise.all(
    LOCATIONS.map((location) =>
      one<{ id: string; name: string }>(
        `INSERT INTO locations (name) VALUES ($1)
         ON CONFLICT (upper(name)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [location.name],
      ),
    ),
  );
  const locationIds = locations.map((location) => location!.id);

  console.log('→ Төхөөрөмж...');
  const device = await one<{ id: string; code: string }>(
    `INSERT INTO devices (code, name, location, api_key_hash)
     VALUES ('KIOSK-01', 'Үндсэн хоолны терминал', '1 давхар, хоолны танхим', $1)
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, status = 'ACTIVE', api_key_hash = EXCLUDED.api_key_hash
     RETURNING id, code`,
    [hashToken(env.SEED_DEVICE_KEY)],
  );

  console.log('→ Тохиргоо...');
  for (const [key, value] of Object.entries({
    organizationName: 'Food POS',
    timezone: env.APP_TIMEZONE,
    dayStartHour: env.DAY_START_HOUR,
    currency: 'MNT',
    branding: {
      companyName: 'Food POS',
      footerText: 'Хоолны бүртгэлийн систем',
      copyright: '© 2026 Food POS',
      logoUrl: null,
    },
  })) {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  console.log(`→ ${HISTORY_DAYS} хоногийн уншилт үүсгэж байна...`);
  const today = businessDateFor(new Date(), env.DAY_START_HOUR, env.APP_TIMEZONE);
  const activeStaff = staff.filter((s) => s.active && s.cardUid !== blockedUser.cardUid);

  let accepted = 0;
  let attempted = 0;

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const businessIso = addDaysIso(today, -dayOffset);
    const weekend = isWeekend(businessIso);

    for (const person of activeStaff) {
      for (const timing of PERIOD_TIMING) {
        const base = timing.probability * (weekend ? 0.35 : 1) * (person.id.charCodeAt(0) % 3 === 0 ? 0.9 : 1);
        const period = periodsByCode.get(timing.code);
        if (!period || !chance(base)) continue;

        attempted += 1;
        const scannedAt = randomTimeInWindow(businessIso, timing.window);
        const locationId = locationIds[person.id.charCodeAt(0) % locationIds.length]!;
        const result = await recordScan(
          {
            cardUid: person.cardUid,
            scannedAt: scannedAt.toISOString(),
            source: 'KIOSK',
            deviceCode: device!.code,
            locationId,
          },
          { deviceId: device!.id, deviceCode: device!.code, locationId, allowBackdated: true },
        );
        if (result.decision === 'ACCEPTED') accepted += 1;
      }
    }

    if (dayOffset % 7 === 0) {
      console.log(`   ${businessIso} — нийт хүлээн авсан: ${accepted}`);
    }
  }

  console.log('→ Давхардсан оролдлого, танигдахгүй карт, цаснаас гадуур уншилт...');
  const samplePerson = activeStaff[0]!;
  const lunch = periodsByCode.get('LUNCH')!;
  for (const [hour, minute] of [
    [11, 40],
    [12, 10],
  ] as const) {
    await recordScan(
      {
        cardUid: samplePerson.cardUid,
        scannedAt: ubTime(today, hour, minute).toISOString(),
        source: 'KIOSK',
        locationId: locationIds[0]!,
      },
      { deviceId: device!.id, deviceCode: device!.code, locationId: locationIds[0]!, allowBackdated: true },
    );
  }
  await recordScan(
    {
      cardUid: 'DEADBEEF99',
      scannedAt: ubTime(today, 12, 30).toISOString(),
      source: 'KIOSK',
      locationId: locationIds[0]!,
    },
    { deviceId: device!.id, deviceCode: device!.code, locationId: locationIds[0]!, allowBackdated: true },
  );
  await recordScan(
    {
      cardUid: blockedUser.cardUid,
      scannedAt: ubTime(today, 12, 35).toISOString(),
      source: 'KIOSK',
      locationId: locationIds[0]!,
    },
    { deviceId: device!.id, deviceCode: device!.code, locationId: locationIds[0]!, allowBackdated: true },
  );
  await recordScan(
    {
      cardUid: samplePerson.cardUid,
      scannedAt: ubTime(today, 15, 30).toISOString(),
      source: 'KIOSK',
      locationId: locationIds[1]!,
    },
    { deviceId: device!.id, deviceCode: device!.code, locationId: locationIds[1]!, allowBackdated: true },
  );

  const [mealCount, scanCount, userCount, cardCount] = await Promise.all([
    one<{ n: number }>('SELECT COUNT(*)::int AS n FROM meal_records'),
    one<{ n: number }>('SELECT COUNT(*)::int AS n FROM scan_events'),
    one<{ n: number }>('SELECT COUNT(*)::int AS n FROM users'),
    one<{ n: number }>('SELECT COUNT(*)::int AS n FROM cards'),
  ]);

  console.log('\n✓ Seed дууслаа');
  console.log(`  хэрэглэгч: ${userCount?.n}, карт: ${cardCount?.n}`);
  console.log(`  уншилт: ${scanCount?.n} (хүлээн авсан ${accepted}/${attempted} оролдлого)`);
  console.log(`  хоолны бүртгэл: ${mealCount?.n}`);
  console.log(`  өнөөдрийн бизнес өдөр: ${today}, өдрийн LUNCH цонх: ${lunch.startTime}-${lunch.endTime}`);
  console.log('\n  Нэвтрэх:');
  console.log(`   ADMIN   admin@foodpos.mn / ${ADMIN_PASSWORD}`);
  console.log(`   MANAGER manager@foodpos.mn / ${MANAGER_PASSWORD}`);
  console.log(`   USER    user@foodpos.mn / ${STAFF_PASSWORD}`);
  console.log(`  Төхөөрөмж: ${device!.code}, x-device-key: ${env.SEED_DEVICE_KEY}`);
}

main()
  .catch((error) => {
    console.error('Seed алдаа:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

