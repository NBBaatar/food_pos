# food_pos — RFID хоолны бүртгэл ба тайлангийн систем

RFID карт болон уншигчаар өглөө / өдөр / орой / шөнийн хоолыг бүртгэж, өдөр, 7 хоног, сар, улирал, жилээр үнэн зөв тайлан гаргадаг систем.

- **Стек:** Node.js + Express 5 + TypeScript, React 19 + Vite + shadcn/ui (dark luxury glass), PostgreSQL 17 + `pg` (ORM-гүй, шууд SQL)
- **Эрхийн түвшин:** ADMIN (супер), MANAGER (тайлан, мэдээлэл засах), USER (хэрэглэгч нэмэх, картын эрх идэвхгүй болгох) + хэрэглэгч тус бүрийн эрхийн override

## Хурдан эхлэх

```bash
# 1. Homebrew PostgreSQL (нэг удаа)
brew services start postgresql@17
createdb food_pos

# 2. Хамаарал ба өгөгдлийн сан
npm install
cp .env.example .env          # DATABASE_URL, JWT_SECRET-ээ тохируул
npm run db:setup              # backend/db/schema.sql — хүснэгт, индекс, хязгаарлалт
npm run db:seed               # 3 эрх, 26 карт, 35 хоногийн уншилт

# 3. Хөгжүүлэлт
npm run dev                   # API :4000, web :5173
```

`npm run dev` нь API (`http://localhost:4000/api/v1`) болон Vite dev server (`http://localhost:5173`)-ыг зэрэг асаана. Vite нь `/api`-г 4000 порт руу proxy хийнэ. `http://localhost:5173/` нь нээлттэй **карт унших** хуудас — нэвтрэх шаардлагагүй; баруун дээд «Нэвтрэх» товчоор админ/менежер/хэрэглэгч нэвтэрч удирдлагын самбар руу орно.

`schema.sql` бүхэлдээ idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`) тул шинэ хувилбар татаж авсны дараа зөвхөн `npm run db:setup` ажиллуулбал хуучин сан шинэчлэгдэнэ — `db:reset` хийх шаардлагагүй.

## Туршилтын эрхүүд (seed)

| Эрх | И-мэйл | Нууц үг |
|---|---|---|
| ADMIN | admin@foodpos.mn | Admin@12345 |
| MANAGER | manager@foodpos.mn | Manager@12345 |
| USER | user@foodpos.mn | User@12345 |

Kiosk төхөөрөмж: код `KIOSK-01`, түлхүүр нь `.env` дахь `SEED_DEVICE_KEY`. Seed нь 35 хоногийн ~1600 уншилт, 5 хэлтэс, 2 байршил, нэгж/албан тушаалын лавлах, 26 карт (нэг блоклогдсон), хэрэглэгчдийн зураг (data URL) болон footer/лого тохиргоог үүсгэнэ.

## Боломжууд

### Киоск ба RFID уншилт

- **Фокусгүй уншилт:** уншигч нь keyboard төхөөрөмж мэт UID бичээд Enter дардаг тул `KioskPage` дээр `document`-ийн `keydown` listener ажиллана. Курсор товч, Select, холбоос аль ч элемент дээр байсан ч уншилт хураагдана. Картын талбарт фокус байвал input-ийн өөрийн урсгал, бусад `input`/`textarea`/`select`/`contenteditable` дээр бичиж байвал саад болохгүй.
- **Байршил:** уншилт бүр идэвхтэй байршилд бүртгэгдэнэ (`POST /scans` дээр `locationId` заавал). Сонгосон байршил `localStorage`-д хадгалагдаж, дараагийн нээлтэд сэргэнэ. Dropdown-оос байршил солиход **«Байршил солих уу?»** баталгаажуулах dialog гарч, зөвшөөрсний дараа л солигдоно; dialog нээлттэй үед уншилт хүлээж авахгүй.
- **Хэрэглэгчийн байршлын эрх:** хэрэглэгч бүрт «Бүх байршилд уншуулж болно» эсвэл зөвхөн тодорхой байршлуудыг оноож болно (`user_locations`). Хязгаарлалттай хэрэглэгч зөвшөөрөөгүй байршилд карт уншуулбал `WRONG_LOCATION` шийдвэрээр татгалзаж, хоол бүртгэхгүй.
- **Нэг уншилт л тооцогдоно:** нэг хэрэглэгч нэг хоолны цонхонд зөвхөн нэг удаа хоол авна (partial unique index). Дахин уншуулбал `ALREADY_SCANNED` болж, киоск дээр өмнөх уншилтын байршил, цагийг харуулна.
- **Үр дүнгийн карт:** шийдвэр (хүлээн авсан / давхар / цуцлагдсан / танихгүй карт …), ажилтны нэр, кодын доор **туслан гүйцэтгэгч компанийн нэр**, хэлтэс, хоолны цонх.
- **Сүүлийн 10 уншилт:** аватар/зураг, ажилтны код, картын UID, компани/хэлтэс, цаг, шийдвэртэй дэлгэрэнгүй мөрүүд (`GET /scans/recent`, нээлттэй; `locationId` шүүлт, дээд тал нь 20, анхдагч 10).
- **Blink засвар:** `background-attachment: fixed` градиент + `backdrop-filter` хослол нь Chrome/Firefox-д анивчдаг тул fixed attachment-ыг хасаж, байршлын картыг тэгш (solid) гадаргуу болгосон.

### Хэрэглэгч ба зохион байгуулалт

- Хэрэглэгчийн бүртгэлд: ажилтны код, нэр, и-мэйл, утас, **нэгж**, **албан тушаал**, **хэлтэс**, **туслан гүйцэтгэгч компани**, **уншиж болох байршил**, зураг, карт, роль, **системд нэвтрэх эрх** (`canLogin`), нууц үг.
- **Байршлын хязгаарлалт:** «Бүх байршилд» чагттай бол хязгаарлалтгүй (`user_locations` хоосон); чагтыг авч байршил сонговол зөвхөн тэдгээр байршилд уншилт хүлээн авна. Хязгаарлалт нь уншилтын шийдвэр дээр шалгагдана (`WRONG_LOCATION`).
- **Туслан гүйцэтгэгч компани:** `companies` лавлах; хэрэглэгчийг компанид хамааруулж, жагсаалт болон картын үр дүнд компанийн нэр харагдана. Компанийг устгахад хэрэглэгчийн холбоос `ON DELETE SET NULL`-ээр сална.
- **Эрхийн override:** ролийн үндсэн эрх (`shared/src/permissions.ts → ROLE_PERMISSIONS`) дээр хэрэглэгч тус бүрийн зөвшөөрөх/хасах override нэмэгдэнэ (`user_permissions`, зөвхөн ADMIN удирдана, ADMIN-д override үйлчлэхгүй).
- **Профайл:** хэрэглэгч өөрийн нэр, утас, нэгж, албан тушаал, зургийг засварлаж, одоогийн нууц үгээ оруулж шинэ нууц үг тогтоох боломжтой (`PATCH /auth/profile`).
- **Нууц үг сэргээх:** ADMIN/MANAGER нь «Нууц үг сэргээх»-ээр санамсаргүй 10 тэмдэгтийн түр нууц үг үүсгэж, `must_change_password` тавина (түр нууц үг зөвхөн нэг удаа харагдана).

### Тохиргоо (`/settings`)

| Tab | Агуулга | Эрх |
|---|---|---|
| Хоолны цонх | эхлэх/дуусах цаг, идэвхтэй эсэх | `period:manage` |
| Байршил | нэр, идэвхтэй/идэвхгүй | `device:manage` |
| Хэлтэс | нэр, код | ADMIN |
| Туслан гүйцэтгэгч | компанийн нэр, хэрэглэгчийн тоо | ADMIN |
| Нэгж, албан тушаал | лавлах CRUD | ADMIN |
| Footer, лого | компанийн нэр, footer текст, copyright, лого (data URL) | `branding:manage` |
| Аудит | хэн, хэзээ, юу өөрчилсөн (before/after) | `audit:read` |

Footer болон лого нь нээлттэй `GET /settings/branding`-аар бүх хуудсанд харагдана.

### Тайлан

Хуудас нь хоёр tab-тай:

- **Хураангуй:** өдөр / 7 хоног / сар / улирал / жилээр бүлэглэсэн meal-counts, ирцийн тайлан, хэлтэс болон байршлаар задаргаа, өнөөдрийн хураангуй, бүрэн бүтэн байдлын шалгалт, Excel экспорт. Байршил, хэлтэс, хэрэглэгч, цуцлагдсан уншилтыг шүүлтэд оруулна.
- **Дэлгэрэнгүй (ажилтан, компани):** ажилтан бүрийн хүлээн авсан хоол, уншилтын оролдлого, хоол авсан өдөр, сүүлийн уншилт. Шүүлт: огнооны хүрээ, туслан гүйцэтгэгч компани, хэлтэс, байршил, хоолны цонх, **нэр / ажилтны код / картын UID-аар хайх**.
  - Компаниар шүүхэд тухайн компанийн бүх ажилтан (идэвхгүй бүртгэлгүй) 0-тэй мөрүүдтэйгээ хамт гарна.
  - Ажилтан бүрийн хувьд хоолны төрөл тус бүрээр (Өглөө / Өдөр / Орой / Шөнө) **хүлээн авсан** ба **оролдлого** (давхар, цонхны гадна, танихгүй карт г.м. орно)-г тус тусад нь тоолно.
  - Excel (`detailed-report-*.xlsx`) нь 3 хуудастай: **Шүүлт** (хэрэглэсэн шүүлтүүд), **Ажилтнууд** (бүх баганатай нэгтгэл), **Уншилтууд** (шүүлтэд тохирох бүх уншилтын оролдлого — огноо, цаг, ажилтан, компани, хэлтэс, хоол, карт, шийдвэр, шалтгаан, байршил). Максимум 100 000 уншилт.

## API (`/api/v1`)

| Бүлэг | Endpoint | Тэмдэглэл |
|---|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout` | JWT + httpOnly refresh cookie |
| | `GET /auth/me`, `PATCH /auth/profile` | профайл, нууц үг, зураг |
| Users | `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id` | хайлт, шүүлт, хуудаслалт |
| | `GET/PUT /users/:id/permissions` | эрхийн override (PUT — ADMIN) |
| | `PATCH /users/:id/status`, `POST /users/:id/reset-password` | идэвхжүүлэх/унтраах, түр нууц үг |
| Cards | `GET /cards`, `POST /cards`, `POST /cards/:id/assign`, `/release`, `/block`, `/unblock` | |
| Periods | `GET /periods`, `POST /periods`, `PATCH /periods/:id` | |
| Devices | `GET /devices`, `POST /devices`, `PATCH /devices/:id` | төхөөрөмжийн түлхүүр |
| Locations | `GET /locations` (нээлттэй), `POST /locations`, `PATCH /locations/:id` | `device:manage` |
| Companies | `GET /companies`, `POST /companies`, `PATCH /companies/:id` | туслан гүйцэтгэгч |
| Reference | `GET/POST/PATCH/DELETE /reference/:kind` (`units`, `positions`) | бичих — ADMIN |
| Departments | `GET /departments`, `POST/PATCH/DELETE /departments/:id` | бичих — ADMIN |
| Scans | `POST /scans` | `locationId` заавал; төхөөрөмжийн түлхүүр эсвэл `scan:create` |
| | `GET /scans`, `GET /scans/recent` (нээлттэй), `POST /scans/:id/void` | |
| Reports | `GET /reports/{meal-counts,summary,attendance,by-department,by-location,integrity,today}` | |
| | `GET /reports/export` | бакетаар нэгтгэсэн Excel |
| | `GET /reports/detailed`, `GET /reports/export-detailed` | ажилтан/компанийн дэлгэрэнгүй + Excel (3 хуудас) |
| Settings | `GET /settings/branding` (нээлттэй), `PUT /settings/branding` | `branding:manage` |
| Audit | `GET /audit` | `audit:read` |
| Health | `GET /health` | DB-ийн төлөв |

## Бүтэц

```
backend/        Express API (auth, users, cards, periods, scans, reports, devices,
                locations, companies, reference, settings, audit, departments, jobs)
backend/db/     schema.sql (хүснэгт/индекс), setup.ts, seed.ts
frontend/       React SPA (Уншигч, Самбар, Тайлан, Уншилт, Хэрэглэгч, Карт, Тохиргоо, Профайл, Нэвтрэх)
shared/         Төрөл, zod схем, эрх, хоолны тогтмол, формат — API ба web хоёуланд
```

## Өгөгдлийн сан

ORM ашиглахгүй — `pg` (node-postgres) pool + параметржсэн SQL. Схем нь нэг файлд:

- `backend/db/schema.sql` — хүснэгт, `CHECK` хязгаарлалт, индекс, **partial unique index** (давхар уншилт, нэг идэвхтэй карт). Дахин ажиллуулж болно.
- `npm run db:setup` — схем үүсгэх/шинэчлэх; `npm run db:seed` — demo өгөгдөл; `npm run db:reset` — хоёуланг нь.
- Холболт: `DATABASE_URL` (жишээ: `postgresql://localhost:5432/food_pos`); нууц үгийг URL-д эсвэл `PGPASSWORD` орчны хувьсагчаар өгнө.
- Олон мэдэгдэл шаардсан үйлдэл (уншилт бүртгэх) нь `withTransaction()`-оор нэг транзакцад ажиллана; `$1…$n` параметр тул SQL injection-гүй.

| Хүснэгт | Зориулалт |
|---|---|
| `departments`, `units`, `positions`, `companies` | зохион байгуулалтын лавлах |
| `users` | хэрэглэгч; `department_id`, `company_id`, `unit`, `position`, `photo_url`, `can_login`, `failed_login_attempts`, `locked_until` |
| `user_locations` | хэрэглэгч ямар байршилд карт уншуулж болох вэ (мөр байхгүй = бүх байршил) |
| `user_permissions` | хэрэглэгч тус бүрийн эрхийн override |
| `cards`, `card_assignments` | карт ба оноолтын түүх (нэг карт/хэрэглэгчид нэг идэвхтэй оноолт) |
| `meal_periods`, `devices`, `locations` | хоолны цонх, терминал, уншилтын байршил |
| `scan_events` | уншилт; `location_id`, `idempotency_key`, `clock_skew_ms`, `voided_at` |
| `meal_records` | бүртгэгдсэн хоол; бизнес өдөр + цонх |
| `refresh_tokens`, `audit_logs`, `settings` | сесс, аудит, branding/системийн тохиргоо |

## Нарийвчлалын зарчим

1. **Бизнес өдөр:** локал цаг − `DAY_START_HOUR` (04:00). 01:30-ийн уншилт өмнөх өдөрт хамаарна.
2. **Давхардлаас хамгаалалт:** `meal_records` дээр `(user, business_date, period)` partial unique index — зэрэгцээ уншилт ч нэг л бүртгэл үүсгэнэ.
3. **Идемпотент уншилт:** `scan_events.idempotency_key` unique; давхар илгээлт ижил хариу буцаана.
4. **Цагийн зөрүү:** уншигчийн цаг серверээс 5 минут гатлавал серверийн цагийг барина (`clock_skew_ms`-д хадгална).
5. **Тайлан:** `generate_series` + `date_trunc` ашиглаж бакет бүрийг үүсгэдэг тул хоолгүй өдөр/сар 0-ээр гарна; бакетийн хил дэх бүртгэл `GREATEST/LEAST`-ээр таслагдана.
6. **Залруулга:** уншилт устгахгүй — `voided_at` + аудит лог; тайланд цуцлагдсаныг оруулах эсэхийг сонгоно.

## Аюулгүй байдал ба ажиллагаа

- **Нэвтрэх хязгаар:** `POST /auth/login` — IP тутамд 15 минутад 20 оролдлого (429 + `Retry-After`); нэг бүртгэл 5 удаа буруу оролдвол 15 минут түгжинэ (`ACCOUNT_LOCKED`, `users.failed_login_attempts`/`locked_until`; амжилттай нэвтрэхэд тэглэгдэнэ).
- **Уншилтын хязгаар:** `POST /scans` — баталгаажсан төхөөрөмж/хэрэглэгч тутамд минутад 240, IP тутамд 600. Зөвхөн төхөөрөмжийн түлхүүр эсвэл `scan:create` эрхтэй сесс уншилт бүртгэнэ.
- **Зураг:** хэрэглэгчийн зураг болон лого нь `data:image/…;base64` (PNG/JPEG/WebP/GIF/SVG), дээд хэмжээ 1.5 сая тэмдэгт; JSON body-ийн хязгаар 3 MB.
- **Толгойнууд:** `CSP: default-src 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- **CORS:** зөвхөн `WEB_ORIGIN` (таслалаар олон) — бусад origin 403.
- **Proxy:** nginx/Cloudflare-ийн ард ажиллаж байгаа үед л `TRUST_PROXY=1` тавина; эс бөгөөс `X-Forwarded-For` хуурамчаар өгч rate limit-ыг тойрч болно.
- **Төхөөрөмжийн түлхүүр:** `timingSafeEqual`-ээр харьцуулна.
- **Эрх:** рольоос өгөгдсөн үндсэн эрх дээр `user_permissions` override нэмэгдэнэ; override-ыг зөвхөн ADMIN `/users/:id/permissions`-аар удирдана. ADMIN супер хэрэглэгч тул түүнд override үйлчлэхгүй.
- **Цонхны давхцал:** идэвхтэй хоолны цонхнууд давхцвал `409 WINDOW_OVERLAP` — нэг уншилт хоёр хоол болохгүй.
- **Тайлангийн хүрээ:** `from > to` үед 400; дундаж өдрийн тоо ирээдүйн өдрүүдийг тооцохгүй.
- **Цэвэрлэгээ:** 6 цаг тутам `reconcile` — зөрүү шалгаж, хуучин refresh token устгана.

## Шалгах

```bash
npm run typecheck                     # API + web
npm run build                         # API typecheck + web build
npm run test                          # vitest (api)
```

## Өөрчлөлтийн тэмдэглэл

### 2026-11 — Киоск, зохион байгуулалт, тохиргоо

- **Бүтэц:** `apps/api` → `backend`, `apps/web` → `frontend`, `packages/shared` → `shared`; workspace болон tsconfig, vite alias шинэчлэгдсэн.
- **Киоск:** фокусгүй RFID уншилт (`document` keydown), байршил сонгох + солих үед баталгаажуулах dialog, байршлыг `localStorage`-д хадгалах, үр дүнгийн картад компанийн нэр, сүүлийн 10 уншилтын зурагтай дэлгэрэнгүй жагсаалт.
- **Blink засвар:** `background-attachment: fixed` хассан, байршлын картыг solid болгосон.
- **Шинэ модулиуд:** `locations` (байршил + уншилтад `location_id`), `companies` (туслан гүйцэтгэгч), `reference` (нэгж/албан тушаал), `settings` (branding).
- **Хэрэглэгч:** компани/нэгж/албан тушаал/зураг/`can_login`, **уншиж болох байршлын хязгаарлалт**, профайл засах (`PATCH /auth/profile`), эрхийн override (`GET/PUT /users/:id/permissions`).
- **Тайлан:** байршлаар задаргаа (`/reports/by-location`) ба `locationId` шүүлт; ажилтан/компанийн дэлгэрэнгүй тайлан (`/reports/detailed`) ба гурван хуудастай Excel экспорт (`/reports/export-detailed`).
- **Аюулгүй байдал:** бүртгэлийн 15 минутын түгжээ, `scan:create` эрх, scan rate limit-ыг төхөөрөмж/хэрэглэгчээр тоолох, зургийн хэмжээний хязгаар, хэрэглэгчийн байршлын хязгаарлалт (`WRONG_LOCATION`).

## Баримт бичиг

| Файл | Агуулга |
|---|---|
| [PLAN.md](PLAN.md) | Бүрэн төлөвлөгөө: архитектур, DB загвар, API, эрхийн матриц, үе шат |

## Repo

- Remote: `https://github.com/NBBaatar/food_pos.git`
- Үндсэн салбар: `main`
- Commit мессеж: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `test: ...` (Conventional Commits)
