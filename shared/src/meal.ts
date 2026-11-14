export const TIMEZONE = 'Asia/Ulaanbaatar';
export const DAY_START_HOUR = 4;

export const PERIOD_CODES = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT'] as const;
export type PeriodCode = (typeof PERIOD_CODES)[number];

export const PERIOD_LABELS: Record<PeriodCode, string> = {
  BREAKFAST: 'Өглөө',
  LUNCH: 'Өдөр',
  DINNER: 'Орой',
  NIGHT: 'Шөнө',
};

export const PERIOD_FULL_LABELS: Record<PeriodCode, string> = {
  BREAKFAST: 'Өглөөний хоол',
  LUNCH: 'Өдрийн хоол',
  DINNER: 'Оройн хоол',
  NIGHT: 'Шөнийн хоол',
};

/** UI-д ашиглах өнгө (chart / badge) */
export const PERIOD_COLORS: Record<PeriodCode, string> = {
  BREAKFAST: '#E8C07D',
  LUNCH: '#8FD6BD',
  DINNER: '#B79CE8',
  NIGHT: '#7FA6E8',
};

export interface MealPeriodDTO {
  id: string;
  code: PeriodCode;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  sortOrder: number;
}

export const DEFAULT_PERIODS = [
  { code: 'BREAKFAST', name: 'Өглөөний хоол', startTime: '06:00', endTime: '10:00', crossesMidnight: false, sortOrder: 1 },
  { code: 'LUNCH', name: 'Өдрийн хоол', startTime: '11:00', endTime: '15:00', crossesMidnight: false, sortOrder: 2 },
  { code: 'DINNER', name: 'Оройн хоол', startTime: '17:00', endTime: '21:00', crossesMidnight: false, sortOrder: 3 },
  { code: 'NIGHT', name: 'Шөнийн хоол', startTime: '22:00', endTime: '02:00', crossesMidnight: true, sortOrder: 4 },
] as const;

export const SCAN_DECISIONS = [
  'ACCEPTED',
  'ALREADY_SCANNED',
  'UNKNOWN_CARD',
  'BLOCKED_CARD',
  'INACTIVE_USER',
  'OUT_OF_WINDOW',
  'NO_ACTIVE_CARD',
  'WRONG_LOCATION',
] as const;
export type ScanDecision = (typeof SCAN_DECISIONS)[number];

export const DECISION_LABELS: Record<ScanDecision, string> = {
  ACCEPTED: 'Хүлээн авсан',
  ALREADY_SCANNED: 'Давхардсан',
  UNKNOWN_CARD: 'Танихгүй карт',
  BLOCKED_CARD: 'Идэвхгүй карт',
  INACTIVE_USER: 'Идэвхгүй хэрэглэгч',
  OUT_OF_WINDOW: 'Хоолны цагнаас гадуур',
  NO_ACTIVE_CARD: 'Карт оноогдоогүй',
  WRONG_LOCATION: 'Өөр байршилд зөвшөөрөгдөөгүй',
};

export const GROUPINGS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Grouping = (typeof GROUPINGS)[number];

export const GROUPING_LABELS: Record<Grouping, string> = {
  day: 'Өдөр',
  week: '7 хоног',
  month: 'Сар',
  quarter: 'Улирал',
  year: 'Жил',
};
