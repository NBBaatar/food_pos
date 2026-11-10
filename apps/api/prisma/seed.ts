import { DEFAULT_PERIODS } from '@shared/meal';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
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

const CARD_COUNT = 26;

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
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE meal_records, scan_events, audit_logs, refresh_tokens, card_assignments RESTART IDENTITY CASCADE',
  );

  console.log('→ Хэлтэс...');
  const departments = await Promise.all(
    DEPARTMENTS.map((d) =>
      prisma.department.upsert({
        where: { name: d.name },
        update: { code: d.code },
        create: { name: d.name, code: d.code },
      }),
    ),
  );

  console.log('→ Хоолны цонх...');
  for (const period of DEFAULT_PERIODS) {
    await prisma.mealPeriod.upsert({
      where: { code: period.code },
      update: {
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        crossesMidnight: period.crossesMidnight,
        sortOrder: period.sortOrder,
        isActive: true,
      },
      create: { ...period },
    });
  }
  const periods = await prisma.mealPeriod.findMany({ orderBy: { sortOrder: 'asc' } });
  const periodsByCode = new Map(periods.map((p) => [p.code, p]));

  console.log('→ Хэрэглэгчид...');
  const [adminHash, managerHash, staffHash] = await Promise.all([
    hashPassword(ADMIN_PASSWORD),
    hashPassword(MANAGER_PASSWORD),
    hashPassword(STAFF_PASSWORD),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@foodpos.mn' },
    update: { passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE', deletedAt: null },
    create: {
      employeeNo: 'A-0001',
      firstName: 'Системийн',
      lastName: 'Админ',
      email: 'admin@foodpos.mn',
      phone: '+976 9911 0001',
      passwordHash: adminHash,
      role: 'ADMIN',
      departmentId: departments[0]!.id,
      mustChangePassword: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@foodpos.mn' },
    update: { passwordHash: managerHash, role: 'MANAGER', status: 'ACTIVE', deletedAt: null },
    create: {
      employeeNo: 'M-0001',
      firstName: 'Тайлангийн',
      lastName: 'Менежер',
      email: 'manager@foodpos.mn',
      phone: '+976 9911 0002',
      passwordHash: managerHash,
      role: 'MANAGER',
      departmentId: departments[0]!.id,
      mustChangePassword: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'user@foodpos.mn' },
    update: { passwordHash: staffHash, role: 'USER', status: 'ACTIVE', deletedAt: null },
    create: {
      employeeNo: 'U-0001',
      firstName: 'Бүртгэлийн',
      lastName: 'Ажилтан',
      email: 'user@foodpos.mn',
      phone: '+976 9911 0003',
      passwordHash: staffHash,
      role: 'USER',
      departmentId: departments[2]!.id,
      mustChangePassword: false,
    },
  });

  const staff: { id: string; cardUid: string; active: boolean }[] = [];

  for (let i = 0; i < CARD_COUNT; i += 1) {
    const lastName = LAST_NAMES[i % LAST_NAMES.length]!;
    const firstName = FIRST_NAMES[(i * 7 + 3) % FIRST_NAMES.length]!;
    const employeeNo = `E-${String(1001 + i)}`;
    const email = `staff${i + 1}@foodpos.mn`;
    const department = departments[i % departments.length]!;
    const inactive = i === 5 || i === 17;

    const user = await prisma.user.upsert({
      where: { employeeNo },
      update: {
        firstName,
        lastName,
        email,
        departmentId: department.id,
        passwordHash: staffHash,
        status: inactive ? 'INACTIVE' : 'ACTIVE',
        deletedAt: null,
      },
      create: {
        employeeNo,
        firstName,
        lastName,
        email,
        phone: `+976 ${8800 + i} ${1000 + i}`,
        passwordHash: staffHash,
        role: 'USER',
        status: inactive ? 'INACTIVE' : 'ACTIVE',
        departmentId: department.id,
        mustChangePassword: false,
      },
    });

    const uid = `04${(0xa1b2c300 + i * 17).toString(16).toUpperCase().padStart(8, '0')}`;
    const card = await prisma.card.upsert({
      where: { uid },
      update: { label: `${lastName} ${firstName}`, status: 'ACTIVE' },
      create: { uid, label: `${lastName} ${firstName}`, status: 'ACTIVE' },
    });

    await prisma.cardAssignment.create({
      data: { cardId: card.id, userId: user.id, assignedById: admin.id },
    });

    staff.push({ id: user.id, cardUid: uid, active: !inactive });
  }

  // Нэг карт блоклогдсон, нэг карт хэн ч эзэмшээгүй (тестэд хэрэгтэй)
  const blockedUser = staff[3]!;
  await prisma.card.update({
    where: { uid: blockedUser.cardUid },
    data: { status: 'BLOCKED', blockedAt: new Date(), blockedById: admin.id, blockReason: 'Тест: алдагдсан карт' },
  });

  console.log('→ Төхөөрөмж...');
  const device = await prisma.device.upsert({
    where: { code: 'KIOSK-01' },
    update: { name: 'Үндсэн хоолны терминал', status: 'ACTIVE', apiKeyHash: hashToken(env.SEED_DEVICE_KEY) },
    create: {
      code: 'KIOSK-01',
      name: 'Үндсэн хоолны терминал',
      location: '1 давхар, хоолны танхим',
      apiKeyHash: hashToken(env.SEED_DEVICE_KEY),
    },
  });

  console.log('→ Тохиргоо...');
  for (const [key, value] of Object.entries({
    organizationName: 'Food POS',
    timezone: env.APP_TIMEZONE,
    dayStartHour: env.DAY_START_HOUR,
    currency: 'MNT',
  })) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
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
        const result = await recordScan(
          {
            cardUid: person.cardUid,
            scannedAt: scannedAt.toISOString(),
            source: 'KIOSK',
            deviceCode: device.code,
          },
          { deviceId: device.id, deviceCode: device.code, allowBackdated: true },
        );
        if (result.decision === 'ACCEPTED') accepted += 1;
      }
    }

    if (dayOffset % 7 === 0) {
      console.log(`   ${businessIso} — нийт хүлээн авсан: ${accepted}`);
    }
  }

  console.log('→ Давхардсан оролдлого, танигдахгүй карт, цаснаас гадуур уншилт...');
  const todayIso = today;
  const samplePerson = activeStaff[0]!;
  const lunch = periodsByCode.get('LUNCH')!;
  for (const [hour, minute] of [
    [11, 40],
    [12, 10],
  ] as const) {
    await recordScan(
      { cardUid: samplePerson.cardUid, scannedAt: ubTime(todayIso, hour, minute).toISOString(), source: 'KIOSK' },
      { deviceId: device.id, deviceCode: device.code, allowBackdated: true },
    );
  }
  await recordScan(
    { cardUid: 'DEADBEEF99', scannedAt: ubTime(todayIso, 12, 30).toISOString(), source: 'KIOSK' },
    { deviceId: device.id, deviceCode: device.code, allowBackdated: true },
  );
  await recordScan(
    { cardUid: blockedUser.cardUid, scannedAt: ubTime(todayIso, 12, 35).toISOString(), source: 'KIOSK' },
    { deviceId: device.id, deviceCode: device.code, allowBackdated: true },
  );
  await recordScan(
    { cardUid: samplePerson.cardUid, scannedAt: ubTime(todayIso, 15, 30).toISOString(), source: 'KIOSK' },
    { deviceId: device.id, deviceCode: device.code, allowBackdated: true },
  );

  const [mealCount, scanCount, userCount, cardCount] = await Promise.all([
    prisma.mealRecord.count(),
    prisma.scanEvent.count(),
    prisma.user.count(),
    prisma.card.count(),
  ]);

  console.log('\n✓ Seed дууслаа');
  console.log(`  хэрэглэгч: ${userCount}, карт: ${cardCount}`);
  console.log(`  уншилт: ${scanCount} (хүлээн авсан ${accepted}/${attempted} оролдлого)`);
  console.log(`  хоолны бүртгэл: ${mealCount}`);
  console.log(`  өнөөдрийн бизнес өдөр: ${today}, өдрийн LUNCH цонх: ${lunch.startTime}-${lunch.endTime}`);
  console.log('\n  Нэвтрэх:');
  console.log(`   ADMIN   admin@foodpos.mn / ${ADMIN_PASSWORD}`);
  console.log(`   MANAGER manager@foodpos.mn / ${MANAGER_PASSWORD}`);
  console.log(`   USER    user@foodpos.mn / ${STAFF_PASSWORD}`);
  console.log(`  Төхөөрөмж: ${device.code}, x-device-key: ${env.SEED_DEVICE_KEY}`);

}

main()
  .catch((error) => {
    console.error('Seed алдаа:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
