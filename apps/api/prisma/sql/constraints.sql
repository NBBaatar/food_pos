-- Prisma-аар илэрхийлэх боломжгүй хязгаарлалтууд (partial unique index).
-- prisma db push хийсний дараа `npm run db:constraints`-оор ажиллуулна.

-- Нэг карт нэг бизнес өдрийн нэг хоолонд зөвхөн нэг удаа (цуцлагдаагүй бол)
CREATE UNIQUE INDEX IF NOT EXISTS meal_records_active_card_period
  ON meal_records (card_id, business_date, period_id)
  WHERE voided_at IS NULL;

-- Нэг хэрэглэгч нэг хоолонд зөвхөн нэг удаа (карт солигдсон ч)
CREATE UNIQUE INDEX IF NOT EXISTS meal_records_active_user_period
  ON meal_records (user_id, business_date, period_id)
  WHERE voided_at IS NULL;

-- Нэг карт дээр нэг л идэвхтэй оноолт
CREATE UNIQUE INDEX IF NOT EXISTS card_assignments_one_active_per_card
  ON card_assignments (card_id)
  WHERE released_at IS NULL;

-- Нэг хэрэглэгч дээр нэг л идэвхтэй карт
CREATE UNIQUE INDEX IF NOT EXISTS card_assignments_one_active_per_user
  ON card_assignments (user_id)
  WHERE released_at IS NULL;

-- Картын UID-г том/жижиг үсгийн ялгаагүй давхардуулахгүй
CREATE UNIQUE INDEX IF NOT EXISTS cards_uid_upper
  ON cards (upper(uid));
