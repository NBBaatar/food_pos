# food_pos — RFID хоолны бүртгэл ба тайлангийн систем

RFID карт болон уншигчаар өглөө / өдөр / орой / шөнийн хоолыг бүртгэж, өдөр, 7 хоног, сар, улирал, жилээр үнэн зөв тайлан гаргадаг систем.

- **Стек:** Node.js + Express 5 + TypeScript, React 19 + Vite + shadcn/ui (dark luxury glass), PostgreSQL 17 + `pg` (ORM-гүй, шууд SQL)
- **Эрхийн түвшин:** ADMIN (супер), MANAGER (тайлан, мэдээлэл засах), USER (хэрэглэгч нэмэх, картын эрх идэвхгүй болгох)

## Хурдан эхлэх

```bash
# 1. Homebrew PostgreSQL (нэг удаа)
brew services start postgresql@17
createdb food_pos

# 2. Хамаарал ба өгөгдлийн сан
npm install
cp .env.example .env          # DATABASE_URL, JWT_SECRET-ээ тохируул
npm run db:setup              # apps/api/db/schema.sql — хүснэгт, индекс, хязгаарлалт
npm run db:seed               # 3 эрх, 26 карт, 35 хоногийн уншилт

# 3. Хөгжүүлэлт
npm run dev                   # API :4000, web :5173
```

`npm run dev` нь API (`http://localhost:4000/api/v1`) болон Vite dev server (`http://localhost:5173`)-ыг зэрэг асаана. Vite нь `/api`-г 4000 порт руу proxy хийнэ.

## Туршилтын эрхүүд (seed)

| Эрх | И-мэйл | Нууц үг |
|---|---|---|
| ADMIN | admin@foodpos.mn | Admin@12345 |
| MANAGER | manager@foodpos.mn | Manager@12345 |
| USER | user@foodpos.mn | User@12345 |

Kiosk төхөөрөмж: код `KIOSK-01`, түлхүүр нь `.env` дахь `SEED_DEVICE_KEY`. Seed нь 35 хоногийн ~1600 уншилт, 5 хэлтэс, 26 карт (нэг блоклогдсон) үүсгэнэ.

## Бүтэц

```
apps/api       Express API (auth, users, cards, periods, scans, reports, devices, audit, jobs)
apps/api/db    schema.sql (хүснэгт/индекс), setup.ts, seed.ts
apps/web       React SPA (Самбар, Уншигч, Тайлан, Уншилт, Хэрэглэгч, Карт, Тохиргоо)
packages/shared  Төрөл, zod схем, эрх, хоолны тогтмол, формат — API ба web хоёуланд
```

## Өгөгдлийн сан

ORM ашиглахгүй — `pg` (node-postgres) pool + параметржсэн SQL. Схем нь нэг файлд:

- `apps/api/db/schema.sql` — хүснэгт, `CHECK` хязгаарлалт, индекс, **partial unique index** (давхар уншилт, нэг идэвхтэй карт). Дахин ажиллуулж болно.
- `npm run db:setup` — схем үүсгэх/шинэчлэх; `npm run db:seed` — demo өгөгдөл; `npm run db:reset` — хоёуланг нь.
- Холболт: `DATABASE_URL` (жишээ: `postgresql://localhost:5432/food_pos`); нууц үгийг URL-д эсвэл `PGPASSWORD` орчны хувьсагчаар өгнө.
- Олон мэдэгдэл шаардсан үйлдэл (уншилт бүртгэх) нь `withTransaction()`-оор нэг транзакцад ажиллана; `$1…$n` параметр тул SQL injection-гүй.

## Нарийвчлалын зарчим

1. **Бизнес өдөр:** локал цаг − `DAY_START_HOUR` (04:00). 01:30-ийн уншилт өмнөх өдөрт хамаарна.
2. **Давхардлаас хамгаалалт:** `meal_records` дээр `(user, business_date, period)` partial unique index — зэрэгцээ уншилт ч нэг л бүртгэл үүсгэнэ.
3. **Идемпотент уншилт:** `scan_events.idempotency_key` unique; давхар илгээлт ижил хариу буцаана.
4. **Цагийн зөрүү:** уншигчийн цаг серверээс 5 минут гатлавал серверийн цагийг барина (`clock_skew_ms`-д хадгална).
5. **Тайлан:** `generate_series` + `date_trunc` ашиглаж бакет бүрийг үүсгэдэг тул хоолгүй өдөр/сар 0-ээр гарна; бакетийн хил дэх бүртгэл `GREATEST/LEAST`-ээр таслагдана.
6. **Залруулга:** уншилт устгахгүй — `voided_at` + аудит лог; тайланд цуцлагдсаныг оруулах эсэхийг сонгоно.

## Аюулгүй байдал ба ажиллагаа

- **Нэвтрэх хязгаар:** `POST /auth/login` — IP тутамд 15 минутад 20 оролдлого (429 + `Retry-After`).
- **Уншилтын хязгаар:** `POST /scans` — төхөөрөмж тутамд минутад 240.
- **Толгойнууд:** `CSP: default-src 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- **CORS:** зөвхөн `WEB_ORIGIN` (таслалаар олон) — бусад origin 403.
- **Proxy:** nginx/Cloudflare-ийн ард ажиллаж байгаа үед л `TRUST_PROXY=1` тавина; эс бөгөөс `X-Forwarded-For` хуурамчаар өгч rate limit-ыг тойрч болно.
- **Төхөөрөмжийн түлхүүр:** `timingSafeEqual`-ээр харьцуулна.
- **Цонхны давхцал:** идэвхтэй хоолны цонхнууд давхцвал `409 WINDOW_OVERLAP` — нэг уншилт хоёр хоол болохгүй.
- **Тайлангийн хүрээ:** `from > to` үед 400; дундаж өдрийн тоо ирээдүйн өдрүүдийг тооцохгүй.
- **Цэвэрлэгээ:** 6 цаг тутам `reconcile` — зөрүү шалгаж, хуучин refresh token устгана.

## Шалгах

```bash
npm run typecheck                     # API + web
npm run build                         # API typecheck + web build
npm run test                          # vitest (api)
```

## Баримт бичиг

| Файл | Агуулга |
|---|---|
| [PLAN.md](PLAN.md) | Бүрэн төлөвлөгөө: архитектур, DB загвар, API, эрхийн матриц, үе шат |

## Repo

- Remote: `https://github.com/NBBaatar/food_pos.git`
- Үндсэн салбар: `main`
- Commit мессеж: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `test: ...` (Conventional Commits)
