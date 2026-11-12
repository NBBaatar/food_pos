-- food_pos — PostgreSQL schema (Prisma-гүй, шууд SQL)
-- `npm run db:setup` энэ файлыг нэг удаа ажиллуулна. Дахин ажиллуулж болно (idempotent).

CREATE TABLE IF NOT EXISTS departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  code       text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no          text NOT NULL UNIQUE,
  first_name           text NOT NULL,
  last_name            text NOT NULL,
  email                text NOT NULL UNIQUE,
  phone                text,
  password_hash        text NOT NULL,
  role                 text NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'MANAGER', 'USER')),
  status               text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  must_change_password boolean NOT NULL DEFAULT false,
  department_id        uuid REFERENCES departments (id),
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS users_department_id_idx ON users (department_id);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

CREATE TABLE IF NOT EXISTS cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid           text NOT NULL UNIQUE,
  label         text,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'LOST')),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  blocked_at    timestamptz,
  blocked_by_id uuid REFERENCES users (id),
  block_reason  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- UID-г том/жижиг үсгийн ялгаагүй давхардуулахгүй
CREATE UNIQUE INDEX IF NOT EXISTS cards_uid_upper ON cards (upper(uid));

CREATE TABLE IF NOT EXISTS card_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id        uuid NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz,
  assigned_by_id uuid
);
CREATE INDEX IF NOT EXISTS card_assignments_card_id_idx ON card_assignments (card_id);
CREATE INDEX IF NOT EXISTS card_assignments_user_id_idx ON card_assignments (user_id);
-- Нэг карт дээр нэг л идэвхтэй оноолт
CREATE UNIQUE INDEX IF NOT EXISTS card_assignments_one_active_per_card
  ON card_assignments (card_id) WHERE released_at IS NULL;
-- Нэг хэрэглэгч дээр нэг л идэвхтэй карт
CREATE UNIQUE INDEX IF NOT EXISTS card_assignments_one_active_per_user
  ON card_assignments (user_id) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS meal_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code IN ('BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT')),
  name             text NOT NULL,
  start_time       text NOT NULL,
  end_time         text NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  location     text,
  api_key_hash text,
  status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text UNIQUE,
  device_id       uuid REFERENCES devices (id),
  card_uid        text NOT NULL,
  card_id         uuid REFERENCES cards (id),
  user_id         uuid REFERENCES users (id),
  scanned_at      timestamptz(3) NOT NULL,
  received_at     timestamptz(3) NOT NULL DEFAULT now(),
  business_date   date NOT NULL,
  period_id       uuid REFERENCES meal_periods (id),
  decision        text NOT NULL CHECK (decision IN (
                    'ACCEPTED', 'ALREADY_SCANNED', 'UNKNOWN_CARD', 'BLOCKED_CARD',
                    'INACTIVE_USER', 'OUT_OF_WINDOW', 'NO_ACTIVE_CARD')),
  reason          text,
  clock_skew_ms   integer,
  raw_payload     jsonb
);
CREATE INDEX IF NOT EXISTS scan_events_business_date_period_id_idx ON scan_events (business_date, period_id);
CREATE INDEX IF NOT EXISTS scan_events_user_id_business_date_idx ON scan_events (user_id, business_date);
CREATE INDEX IF NOT EXISTS scan_events_card_uid_idx ON scan_events (card_uid);
CREATE INDEX IF NOT EXISTS scan_events_received_at_idx ON scan_events (received_at);

CREATE TABLE IF NOT EXISTS meal_records (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_event_id bigint NOT NULL UNIQUE REFERENCES scan_events (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id),
  card_id       uuid NOT NULL REFERENCES cards (id),
  period_id     uuid NOT NULL REFERENCES meal_periods (id),
  business_date date NOT NULL,
  scanned_at    timestamptz(3) NOT NULL,
  source        text NOT NULL DEFAULT 'KIOSK',
  voided_at     timestamptz(3),
  voided_by_id  uuid,
  void_reason   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_records_business_date_idx ON meal_records (business_date);
CREATE INDEX IF NOT EXISTS meal_records_business_date_period_id_idx ON meal_records (business_date, period_id);
CREATE INDEX IF NOT EXISTS meal_records_user_id_business_date_idx ON meal_records (user_id, business_date);
-- Нэг карт нэг бизнес өдрийн нэг хоолонд зөвхөн нэг удаа (цуцлагдаагүй бол)
CREATE UNIQUE INDEX IF NOT EXISTS meal_records_active_card_period
  ON meal_records (card_id, business_date, period_id) WHERE voided_at IS NULL;
-- Нэг хэрэглэгч нэг хоолонд зөвхөн нэг удаа (карт солигдсон ч)
CREATE UNIQUE INDEX IF NOT EXISTS meal_records_active_user_period
  ON meal_records (user_id, business_date, period_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES users (id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
