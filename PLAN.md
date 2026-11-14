# Хоолны RFID бүртгэл, тайлангийн систем — Төлөвлөгөө ба төслийн бүтэц

Стек: **Node.js + Express + TypeScript**, **React (Vite) + shadcn/ui + Tailwind**, **PostgreSQL 17**, `pg` (node-postgres, ORM-гүй шууд SQL), Redis (сонголтоор: rate-limit / кэш).

---

## 1. Гол зорилго ба "үнэн зөв" гэдгийн тодорхойлолт

Системийн гол үнэ цэнэ нь **тайлангийн тоо буруу гарахгүй байх** юм. Тиймээс архитектурыг дараах 6 зарчимд тулгуурлана:

| # | Зарчим | Хэрэгжүүлэлт |
|---|---|---|
| 1 | **Давхар бүртгэл физик түвшинд хориглоно** | `UNIQUE (card_id, business_date, meal_period_id) WHERE voided_at IS NULL` — 2 уншилт зэрэг ирсэн ч DB өөрөө нэгийг л хүлээж авна |
| 2 | **Цаг серверээс тодорхойлогдоно** | `scanned_at` (төхөөрөмжийн цаг) ба `received_at` (серверийн цаг) хоёрыг тусдаа хадгална; эцсийн шийдвэр серверийн цагаар |
| 3 | **Event sourcing — устгахгүй, цуцална** | `scan_events` хэзээ ч UPDATE/DELETE хийгдэхгүй (append-only). Алдааг `voided_at` + шалтгаанаар залруулна → тайлан эргэн тохируулж болно |
| 4 | **Idempotency** | Төхөөрөмж/киоск бүр `idempotency_key` (UUID) илгээнэ; сүлжээ тасарч дахин илгээсэн ч давхардал үүсэхгүй |
| 5 | **Бизнес өдрийн хил нь тохиргоо** | `day_start_hour` (анхдагч 04:00) ба Asia/Ulaanbaatar TZ — шөнийн ээлжийн хоол зөв өдөрт хамаарна |
| 6 | **Өөрөө шалгах ажиллагаа** | Шөнө бүр reconcile job: `scan_events` ↔ `meal_records` ↔ `meal_daily_summary` гурвыг тулгаж, зөрүүг "Data integrity" тайланд гаргана |

### Бизнес өдөр (business_date) тооцох дүрэм

```
business_date = (scanned_at AT TIME ZONE 'Asia/Ulaanbaatar' - interval '{day_start_hour} hours')::date
```
- `day_start_hour = 04:00` үед: 11-р сарын 10-ны 22:30 → 11-10; 11-р сарын 11-ний 01:30 → 11-10. (шөнийн хоол зөв өдөртөө орно)
- Дээр нь тухайн цаг нь **аль нэг идэвхтэй `meal_period`-ийн цонхонд** байх ёстой. Цонхонд ороогүй бол `REJECTED / OUT_OF_WINDOW` гэж бүртгэгдэнэ (тиймээс "алдсан" уншилт ч мөрдөгдөнө).

---

## 2. Хэрэглэгчийн түвшин ба эрхийн матриц

> Анхаар: таны тайлбарт "хэрэглэгч" түвшин нь **хэрэглэгч нэмэх + карт эзэмшигчийн эрхийг идэвхгүй болгох** эрхтэй гэж байна. Энэ нь уламжлалт "зөвхөн уншина" түвшнээс өргөн тул кодыг **permission-д суурилсан** (role → permissions) байдлаар бичнэ. Ингэснээр дараа нь эрхийг тохиргооноос өөрчлөх боломжтой бөгөөд эрхийн хэтрэлт (жишээ нь хэрэглэгч өөрөө админ үүсгэх) хаагдана.

| Үйлдэл | ADMIN | MANAGER | USER |
|---|:--:|:--:|:--:|
| Хэрэглэгч харах | ✅ | ✅ | ✅ (зөвхөн үндсэн мэдээлэл) |
| Хэрэглэгч нэмэх | ✅ | ✅ | ✅ (зөвхөн USER түвшинд) |
| Хэрэглэгчийн мэдээлэл засах | ✅ | ✅ | ❌ |
| Хэрэглэгч идэвхгүй болгох / устгах | ✅ | ✅ | ⚠️ зөвхөн картын эрх идэвхгүй болгох |
| Карт нэмэх / оноох / салгах | ✅ | ✅ | ❌ |
| Карт блоклох / солих | ✅ | ✅ | ✅ (идэвхгүй болгох) |
| Уншилт (scan) харах | ✅ | ✅ | ❌ |
| Уншилт цуцлах / залруулах | ✅ | ✅ | ❌ |
| Тайлан (өдөр/7 хоног/сар/улирал/жил) | ✅ | ✅ | ❌ |
| Тайлан экспорт (CSV/XLSX) | ✅ | ✅ | ❌ |
| Хоолны цагийн цонх, төхөөрөмж тохируулах | ✅ | ❌ | ❌ |
| Хэрэглэгчийн түвшин/эрх өөрчлөх | ✅ | ❌ | ❌ |
| Audit log харах | ✅ | ❌ | ❌ |
| Системийн тохиргоо, нөөц хуулбар | ✅ | ❌ | ❌ |

Хэрэгжүүлэлт: `requirePermission('report:read')` middleware + `ROLE_PERMISSIONS` (ролийн үндсэн эрх) + `user_permissions` хүснэгтийн override. Override-ыг зөвхөн ADMIN `/users/:id/permissions`-аар удирдана; ADMIN супер хэрэглэгч тул override хүлээж авахгүй.

---

## 3. Өгөгдлийн сангийн загвар (PostgreSQL)

```
departments(id, name, code, parent_id)
units(id, name UNIQUE)          -- нэгж лавлах
positions(id, name UNIQUE)      -- албан тушаал лавлах
companies(id, name UNIQUE)      -- туслан гүйцэтгэгч компани
users(id, employee_no UNIQUE, first_name, last_name, email UNIQUE, phone,
      password_hash, role, status, department_id, company_id, unit, position,
      photo_url, can_login, must_change_password,
      failed_login_attempts, locked_until,
      last_login_at, created_at, updated_at, deleted_at)
    -- 5 удаа буруу нэвтрэлт → locked_until = now() + 15 мин
-- Ролийн үндсэн эрх: shared/src/permissions.ts → ROLE_PERMISSIONS (код дотор)
user_permissions(user_id, permission_code, allow)   -- хэрэглэгч тус бүрийн override
user_locations(user_id, location_id)                -- зөвшөөрөгдсөн байршил; хоосон = бүгд
refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, ip, user_agent)

cards(id, uid UNIQUE, label, type, status, issued_at, blocked_at,
      blocked_by, block_reason, note, created_at, updated_at)
card_assignments(id, card_id, user_id, assigned_at, released_at, assigned_by)
    -- partial unique: нэг карт дээр 1 идэвхтэй, нэг хэрэглэгч дээр 1 идэвхтэй карт

meal_periods(id, code UNIQUE, name, start_time, end_time, crosses_midnight,
             is_active, sort_order, allow_multiple)   -- BREAKFAST/LUNCH/DINNER/NIGHT
devices(id, code UNIQUE, name, location, api_key_hash, status,
        last_seen_at, firmware, notes)                 -- RFID уншигч / киоск
locations(id, name UNIQUE, status)                     -- уншилтын байршил; scan_events.location_id
settings(key PK, value jsonb, updated_at, updated_by)   -- day_start_hour, tz, ...

scan_events(                              -- APPEND-ONLY, бүх оролдлого
  id BIGSERIAL PK,
  idempotency_key UUID UNIQUE,
  device_id, card_uid, card_id, user_id,
  scanned_at TIMESTAMPTZ,                 -- төхөөрөмжийн цаг
  received_at TIMESTAMPTZ DEFAULT now(),  -- серверийн цаг
  business_date DATE NOT NULL,
  period_id,
  decision TEXT,        -- ACCEPTED | ALREADY_SCANNED | UNKNOWN_CARD | BLOCKED_CARD
                        -- | INACTIVE_USER | OUT_OF_WINDOW | NO_ACTIVE_CARD
  reason TEXT,
  clock_skew_ms INT,
  raw_payload JSONB
)
  INDEX (business_date, period_id), INDEX (user_id, business_date), INDEX (card_uid)

meal_records(                             -- Зөвхөн хүлээн авсан, тайлангийн эх сурвалж
  id BIGSERIAL PK,
  scan_event_id BIGINT UNIQUE REFERENCES scan_events(id),
  user_id, card_id, period_id, business_date DATE,
  scanned_at TIMESTAMPTZ, source TEXT,    -- KIOSK | READER_AGENT | MANUAL
  voided_at, voided_by, void_reason,
  created_at
)
  UNIQUE (card_id, business_date, period_id) WHERE voided_at IS NULL
  UNIQUE (user_id, business_date, period_id) WHERE voided_at IS NULL
  INDEX (business_date), INDEX (user_id, business_date)

meal_daily_summary(                       -- materialized view / summary table
  business_date, period_id, department_id, meal_count, unique_holders, updated_at)

audit_logs(id, actor_id, action, entity, entity_id, before JSONB, after JSONB,
           ip, user_agent, created_at)
report_exports(id, requested_by, params JSONB, format, file_path, created_at)
```

Гол санаа: **`scan_events` = бүрэн түүх (аудит), `meal_records` = хүчинтэй хоол, `meal_daily_summary` = хурдан тайлан.** Гурвуулаа нэг эх сурвалжаас гаралтай тул зөрүү гарах боломжгүй, гарвал reconcile job илрүүлнэ.

---

## 4. RFID уншигчийн интеграцийн 2 зам

| Хувилбар | Тайлбар | Хэзээ сонгох |
|---|---|---|
| **A. HID "keyboard wedge" уншигч** (хамгийн түгээмэл, EM4100 / Mifare USB) | Уншигч нь гарын курсор шиг картын UID-г бичээд Enter дарна. Кiosk горимд `/kiosk` хуудас нээлттэй, далд input фокуслагдсан байна → `POST /api/scans` руу шууд илгээнэ. Нэмэлт драйвер, програм шаардлагагүй. | **Анхдагч сонголт** |
| **B. Serial / PC-SC / node-hid agent** | `backend/reader-agent` — Node процесс `serialport`/`node-hid`-ээр уншаад локал API руу илгээнэ. Офлайн дараалал (SQLite) + дахин илгээх боломжтой. | Сүлжээ тогтворгүй, эсвэл уншигч keyboard горимгүй бол |

Уншигчийн бодит модель тодорхой болмол зөвхөн нэг замыг хэрэгжүүлнэ. Хоёр замын API нь ижил (`/api/scans`) тул backend өөрчлөгдөхгүй.

**Киоск аюулгүй байдал:** төхөөрөмж бүр `X-Device-Key` (hash нь `devices.api_key_hash`), IP whitelist, rate-limit (30 req/min), replay хамгаалалт (idempotency key 24 цаг хүчинтэй).

---

## 5. API дизайн (REST, `/api/v1`)

```
POST   /auth/login                  → httpOnly cookie (access 15m + refresh 7d)
POST   /auth/refresh  /auth/logout
GET    /auth/me                     → хэрэглэгч + permissions[]
PATCH  /auth/profile                → нэр, утас, нэгж, албан тушаал, зураг, нууц үг

GET    /users?search&role&status&departmentId&page
POST   /users                       ← 'user:create'
GET    /users/:id                   → карт, сүүлийн уншилт, статистик
PATCH  /users/:id                   ← 'user:update'
PATCH  /users/:id                   body: { ..., locationIds: [] }  (хоосон = бүх байршил)
GET    /users/:id/permissions       ← 'user:read'  (үндсэн эрх + override)
PUT    /users/:id/permissions       ← ADMIN        (override-уудыг бүхэлд нь солино)
PATCH  /users/:id/status            ← 'user:deactivate'
POST   /users/:id/reset-password

GET    /cards?status&assigned        POST /cards
POST   /cards/:id/assign  /cards/:id/release
POST   /cards/:id/block   /cards/:id/unblock
GET    /cards/:id/history

POST   /scans                       ← төхөөрөмж/киоск (device key эсвэл 'scan:create')
       body: { cardUid, scannedAt, deviceCode, idempotencyKey, locationId }
       res:  { decision, user?, companyName?, period?, businessDate, message }
GET    /scans?from&to&period&decision&userId&deviceId&locationId&page
GET    /scans/recent?locationId&limit     → киоскын сүүлийн уншилт (нээлттэй)
POST   /scans/:id/void              ← 'scan:correct'  (шалтгаан заавал)
GET    /scans/live                  ← SSE, dashboard-ийн шууд урсгал

GET    /reports/meal-counts?from&to&groupBy=day|week|month|quarter|year
                        &period&departmentId&userId&includeVoided=false
GET    /reports/attendance          → хэн хэдэн хоол идсэн, идээгүй хүмүүс
GET    /reports/by-department
GET    /reports/by-location
GET    /reports/detailed            → ажилтан/компани/хэлтэс/байршил/хоол/нэрээр шүүсэн дэлгэрэнгүй + байршлын задаргаа
GET    /reports/export-detailed     → Excel: Шүүлт, Ажилтнууд, Байршил, Уншилтууд
GET    /reports/comparison          → өмнөх үетэй харьцуулалт (%, diff)
GET    /reports/integrity           → scan_events ↔ meal_records зөрүү
GET    /reports/export?format=csv|xlsx   → streaming, 100k мөр хүртэл

GET/POST/PATCH /meal-periods
GET/POST/PATCH /devices   POST /devices/:id/rotate-key
GET    /locations (нээлттэй)  POST/PATCH /locations
GET/POST/PATCH /companies
GET/POST/PATCH/DELETE /reference/:kind   (units | positions, бичих — ADMIN)
GET/PATCH /departments
GET    /settings/branding (нээлттэй)  PUT /settings/branding
GET    /audit-logs
GET    /health  /health/ready
```

**Тайлангийн SQL-ийн гол хэсэг** (өдөргүй өдрийг ч 0-ээр харуулна):

```sql
SELECT g.bucket::date AS bucket,
       COUNT(*) FILTER (WHERE mr.period_id = $b) AS breakfast,
       COUNT(*) FILTER (WHERE mr.period_id = $l) AS lunch,
       COUNT(*) FILTER (WHERE mr.period_id = $d) AS dinner,
       COUNT(*) FILTER (WHERE mr.period_id = $n) AS night,
       COUNT(*) AS total
FROM generate_series($from, $to, '1 day') g(bucket)
LEFT JOIN meal_records mr
       ON mr.business_date = g.bucket::date AND mr.voided_at IS NULL
GROUP BY 1 ORDER BY 1;
```
- долоо хоног → `date_trunc('week', ...)` (ISO, Даваа гарагаас)
- сар → `date_trunc('month')`, улирал → `date_trunc('quarter')`, жил → `date_trunc('year')`
- Бүх бакет дээр `generate_series` ашиглана → хоолгүй өдөр/сар тайланд алга болохгүй.

---

## 6. Төслийн бүтэц (npm workspaces monorepo)

```
food_pos/
├─ package.json                  # workspaces: backend, frontend, shared
├─ docker-compose.yml            # (төлөвлөсөн) postgres, api, web(nginx), (redis)
├─ .env.example
├─ PLAN.md  README.md
├─ backend/                       # Express 5 + TypeScript API
│  ├─ db/
│  │  ├─ schema.sql
│  │  ├─ migrations/              # (төлөвлөсөн)
│  │  └─ seed.ts                  # admin, period, demo users/cards
│  ├─ src/
│  │  ├─ index.ts                 # bootstrap, graceful shutdown
│  │  ├─ app.ts                   # express app, middleware, routes
│  │  ├─ config/env.ts            # zod-аар шалгасан env
│  │  ├─ db/pool.ts
│  │  ├─ modules/
│  │  │  ├─ auth/       users/     cards/
│  │  │  ├─ scans/      reports/   periods/
│  │  │  ├─ devices/    audit/     departments/
│  │  │  ├─ locations/  companies/ reference/
│  │  │  └─ settings/             # branding (footer, лого)
│  │  ├─ middleware/              # auth, rbac, deviceAuth, validate, error, rateLimit, security
│  │  ├─ lib/                     # time (бизнес өдөр/цонх), tokens, password, loginLock,
│  │  │                           # permissions, sql, audit, dto, bigint
│  │  ├─ jobs/reconcile.ts        # 6 цаг тутам зөрүү шалгах
│  │  └─ types/
│  └─ tests/                      # time, windows, rateLimit, loginLock, permissions
├─ frontend/                      # React 19 + Vite + TS + shadcn/ui
│  ├─ index.html  vite.config.ts  tailwind.config.ts
│  └─ src/
│     ├─ main.tsx  App.tsx
│     ├─ components/              # ui (shadcn), layout (AppShell), common
│     ├─ pages/                   # Kiosk (нээлттэй), Dashboard, Reports, Scans,
│     │                           # Users, Cards, Settings, Profile, Login
│     ├─ lib/                     # api, auth, utils, image (зураг resize/data URL)
│     └─ types/
├─ shared/                        # API contracts (zod) — api & web хоёулаа импортолно
│  └─ src/{types.ts, schemas.ts, meal.ts, permissions.ts, format.ts, index.ts}
└─ docs/                          # (төлөвлөсөн)
   ├─ API.md  DB.md  RFID-SETUP.md  DEPLOY.md
```

**Яагаад monorepo + shared:** `shared` доторх zod schemas нь backend-ийн validation ба frontend-ийн form validation-ийг нэг эх сурвалжаас гаргана → API болон UI хэзээ ч зөрөхгүй.

---

## 7. Хэрэгжүүлэх үе шат (milestones)

| Үе | Агуулга | Дуусах шалгуур (acceptance) |
|---|---|---|
| **P0. Суурь** (2–3 хоног) | monorepo, TS, ESLint/Prettier, docker-compose, SQL schema, `.env`, health endpoint, shadcn суулгах | `docker compose up` → API `/health` 200, web ачаална |
| **P1. Auth + RBAC** (3–4 хоног) | role-based эрх + хэрэглэгч тус бүрийн override, login/refresh/logout, scrypt, requirePermission, audit log, seed admin | 3 түвшний хэрэглэгчээр нэвтэрч, роль болон override-оор зөвхөн зөв цэс/endpoint харагдана (rbac тест) |
| **P2. Хэрэглэгч ба карт** (4–5 хоног) | user CRUD (+эрхийн хязгаар), card CRUD, assign/release, block/unblock, түүх | "USER" түвшин зөвхөн USER нэмж, карт идэвхгүй болгож чадна; өөр үйлдэл 403 |
| **P3. Уншилт ба хоолны логик** (5–7 хоног) | `businessDate.ts`, period тодорхойлогч, decision engine, `POST /scans`, unique constraint, idempotency, kiosk хуудас, эхний HID уншигчтай туршилт | Ижил картыг 2 удаа уншуулахад 1 meal_record; өөр өдөр/өөр хоолд шинээр бүртгэгдэнэ; 00:30-ийн уншилт өмнөх өдөрт орно |
| **P4. Тайлан** (6–8 хоног) | meal-counts (5 бүлэглэл), attendance, department, comparison, export CSV/XLSX, summary refresh job, график | 5 хугацааны бүлэглэл тус бүр гараар тооцсонтой таарна (fixture тест); хоолгүй өдөр 0-ээр харагдана |
| **P5. Хатууруулалт** (3–4 хоног) | reconcile job, integrity тайлан, rate-limit, device key rotate, audit log UI, backup cron, pino + request-id | Санаатай зөрүү үүсгэхэд reconcile илрүүлнэ; 10k scan-ийн ачаалалд p95 < 300ms |
| **P6. Ашиглалт** (2–3 хоног) | docs, seed demo, Playwright e2e (login → report → export), nginx + HTTPS, экспорт, сургалт | Бодит уншигчтай 1 өдрийн пилот амжилттай, тайлан 100% таарна |

Нийт: **~25–34 хөгжүүлэгч-өдөр** (1 хөгжүүлэгч, ойролцоо тооцоо). P0–P3 нь MVP; P4-гүйгээр систем утгагүй тул MVP = P0–P4.

---

## 8. Тайлангийн төрлүүд (шаардлагын шууд хариу)

1. **Өдрийн тайлан** — өдөр × 4 хоол, нийт, давхардсан оролдлого, татгалзсан шалтгаанууд.
2. **7 хоногийн** — ISO долоо хоног (Даваа–Ням), өдөр тус бүрийн багана + долоо хоногийн дундаж.
3. **Сарын** — өдөр тус бүр + сарын нийт, ажлын өдрийн дундаж, хамгийн их/бага өдөр.
4. **Улирлын** — 3 сарын харьцуулалт (`date_trunc('quarter')`).
5. **Жилийн** — 12 сар + улирлын нэгтгэл, өмнөх онтой харьцуулалт.
6. **Хүн тус бүрийн** — хэн хэдэн удаа, аль хоолыг алгассан, сүүлийн 30 хоногийн идэвх.
7. **Хэлтэс/байгууллагын** — хэлтсээр нэгтгэсэн.
8. **Data integrity** — зөрүү, цагийн зөрүү (clock skew), давхардсан оролдлого, буруу карт.

Бүх тайлан нь: огнооны хүрээ, хоолны төрөл, хэлтэс, хэрэглэгч, төхөөрөмжөөр шүүгдэнэ; **voided бичлэг анхдагчаар хасагдана** (сонголтоор оруулж болно); экспорт CSV/XLSX.

---

## 9. Аюулгүй байдал ба ажиллагаа

- **Нэвтрэх**: JWT access (15 мин, httpOnly + SameSite) + refresh rotation (7 хоног), scrypt, 5 удаагийн буруу оролдлогоор 15 минут түр түгжих.
- **Эрх**: route бүр дээр `requirePermission`, UI дээр `RoleGate` (UX-ийн хувьд; хамгаалалт backend дээр).
- **Аудит**: хэн, хэзээ, юу өөрчилсөн (before/after JSONB) — засах эрхтэй MANAGER/ADMIN-ийн бүх үйлдэл.
- **Нөөц**: `pg_dump` өдөр бүр 02:00, 30 хоног хадгална; сар бүр restore тест.
- **Ажиглалт**: pino JSON лог + request-id, `/health/ready` (DB ping).
- **Хугацаа**: бүх DB цаг `timestamptz`, UI нь `Asia/Ulaanbaatar`, сервер UTC.
- **Тест**: unit (businessDate, decision), integration (давхардал, RBAC, тайлангийн цоорхой), e2e (Playwright 1 урсгал).

---

## 10. Тодруулах шаардлагатай асуудлууд

1. **Хоолны цагийн цонх** яг хэд вэ? (жишээ: 06–10 / 11–15 / 17–21 / 22–02) — шөнийн цаг хэдэн цагт эхлэх вэ?
2. **Хэдэн хоолны газар/уншигч** байх вэ? (1 гуанз эсвэл салбар тус бүр)
3. RFID уншигчийн **брэнд/модель**? (HID keyboard эсвэл serial) — интеграцийн замыг сонгоход хэрэгтэй.
4. Карт нь **ажилтны үнэмлэх** мөн үү, эсвэл зөвхөн хоолны карт уу? (нэг хүнд олон карт зөвшөөрөх эсэх)
5. "Хэрэглэгч" түвшин үнэхээр хэрэглэгч нэмэх эрхтэй байх уу, эсвэл зөвхөн **картын эрх идэвхгүй болгох** уу? (аюулгүй байдлын үүднээс санал: зөвхөн карт)
6. Тайлангийн **экспорт** ямар формат хэрэгтэй вэ? (CSV, Excel, PDF)
7. Сүлжээ тасрах үед **офлайн уншилт** шаардлагатай юу?
