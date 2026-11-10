# food_pos — RFID хоолны бүртгэл ба тайлангийн систем

RFID карт болон уншигчаар өглөө / өдөр / орой / шөнийн хоолыг бүртгэж, өдөр, 7 хоног, сар, улирал, жилээр үнэн зөв тайлан гаргадаг систем.

- **Стек:** Node.js + Express 5 + TypeScript, React 19 + Vite + shadcn/ui (dark luxury glass), PostgreSQL + Prisma 7
- **Эрхийн түвшин:** ADMIN (супер), MANAGER (тайлан, мэдээлэл засах), USER (хэрэглэгч нэмэх, картын эрх идэвхгүй болгох)

## Хурдан эхлэх

```bash
# 1. Postgres (төсөл доторх dev кластер, порт 5433)
pg_ctl -D .pgdata -l .pgdata/server.log -o "-p 5433 -k /tmp" start

# 2. Хамаарал ба өгөгдлийн сан
npm install
cp .env.example .env          # JWT_SECRET-ээ соль
npm run db:setup              # schema push + partial index + seed

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
apps/web       React SPA (Самбар, Уншигч, Тайлан, Уншилт, Хэрэглэгч, Карт, Тохиргоо)
packages/shared  Төрөл, zod схем, эрх, хоолны тогтмол, формат — API ба web хоёуланд
```

## Нарийвчлалын зарчим

1. **Бизнес өдөр:** локал цаг − `DAY_START_HOUR` (04:00). 01:30-ийн уншилт өмнөх өдөрт хамаарна.
2. **Давхардлаас хамгаалалт:** `meal_records` дээр `(user, business_date, period)` partial unique index — зэрэгцээ уншилт ч нэг л бүртгэл үүсгэнэ.
3. **Идемпотент уншилт:** `scan_events.idempotency_key` unique; давхар илгээлт ижил хариу буцаана.
4. **Цагийн зөрүү:** уншигчийн цаг серверээс 5 минут гатлавал серверийн цагийг барина (`clock_skew_ms`-д хадгална).
5. **Тайлан:** `generate_series` + `date_trunc` ашиглаж бакет бүрийг үүсгэдэг тул хоолгүй өдөр/сар 0-ээр гарна; бакетийн хил дэх бүртгэл `GREATEST/LEAST`-ээр таслагдана.
6. **Залруулга:** уншилт устгахгүй — `voided_at` + аудит лог; тайланд цуцлагдсаныг оруулах эсэхийг сонгоно.

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
