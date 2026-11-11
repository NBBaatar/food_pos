import type { Grouping, PeriodCode } from '@shared/meal';
import type {
  AttendanceRow,
  AuthUser,
  CardListItem,
  DepartmentReportRow,
  IntegrityReport,
  Paged,
  ReportBucketRow,
  ReportSummary,
  ScanResult,
  ScanRow,
  UserListItem,
} from '@shared/types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

let accessToken: string | null = null;
let refreshing: Promise<AuthUser | null> | null = null;
/** Boot-ийн давхар дуудлага (React StrictMode) refresh-ийг хоёр удаа эргүүлэхээс сэргийлнэ */
let sessionCache: { user: AuthUser | null; at: number } | null = null;
const SESSION_CACHE_MS = 5_000;

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { message?: string; code?: string } };
    return new ApiError(res.status, data.error?.message ?? 'Алдаа гарлаа', data.error?.code ?? 'ERROR');
  } catch {
    return new ApiError(res.status, `Алдаа гарлаа (${res.status})`);
  }
}

async function rawRequest(path: string, init: RequestInit, retry: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && retry && accessToken) {
    const user = await refreshOnce();
    if (user) return rawRequest(path, init, false);
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await rawRequest(path, init, retry);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function refreshOnce(): Promise<AuthUser | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as { accessToken: string; user: AuthUser };
      accessToken = data.accessToken;
      return data.user;
    } catch {
      accessToken = null;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/* ---------------- Auth ---------------- */

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await request<{ accessToken: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  accessToken = data.accessToken;
  sessionCache = { user: data.user, at: Date.now() };
  return data.user;
}

export async function restoreSession(): Promise<AuthUser | null> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_CACHE_MS) return sessionCache.user;
  const user = await refreshOnce();
  sessionCache = { user, at: Date.now() };
  return user;
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    accessToken = null;
    sessionCache = null;
  }
}

/* ---------------- Reports ---------------- */

export interface ReportQueryParams {
  from?: string;
  to?: string;
  groupBy?: Grouping;
  period?: PeriodCode;
  departmentId?: string;
  includeVoided?: boolean;
}

function reportQuery(params: ReportQueryParams): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.groupBy) search.set('groupBy', params.groupBy);
  if (params.period) search.set('period', params.period);
  if (params.departmentId) search.set('departmentId', params.departmentId);
  if (params.includeVoided) search.set('includeVoided', 'true');
  return search.toString();
}

export interface MealCountsResponse {
  groupBy: Grouping;
  from: string;
  to: string;
  rows: ReportBucketRow[];
  totals: { total: number; BREAKFAST: number; LUNCH: number; DINNER: number; NIGHT: number };
}

export interface TodayResponse {
  businessDate: string;
  total: number;
  holders: number;
  byPeriod: Record<PeriodCode, number>;
  periods: {
    code: PeriodCode;
    name: string;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    isActive: boolean;
  }[];
  trend: ReportBucketRow[];
}

export const reportsApi = {
  today: () => request<TodayResponse>('/reports/today'),
  mealCounts: (params: ReportQueryParams) =>
    request<MealCountsResponse>(`/reports/meal-counts?${reportQuery(params)}`),
  summary: (params: ReportQueryParams) => request<ReportSummary>(`/reports/summary?${reportQuery(params)}`),
  attendance: (params: ReportQueryParams) => request<{ rows: AttendanceRow[] }>(`/reports/attendance?${reportQuery(params)}`),
  byDepartment: (params: ReportQueryParams) =>
    request<{ rows: DepartmentReportRow[] }>(`/reports/by-department?${reportQuery(params)}`),
  integrity: () => request<IntegrityReport>('/reports/integrity'),
  async exportCsv(params: ReportQueryParams): Promise<{ blob: Blob; filename: string }> {
    const res = await rawRequest(`/reports/export?${reportQuery(params)}`, {}, true);
    if (!res.ok) throw await parseError(res);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await res.blob(), filename: match?.[1] ?? 'meal-report.csv' };
  },
};

/* ---------------- Users ---------------- */

export interface UserListParams {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const usersApi = {
  list: (params: UserListParams = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<Paged<UserListItem>>(`/users?${search.toString()}`);
  },
  create: (input: Record<string, unknown>) =>
    request<{ user: UserListItem; temporaryPassword?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Record<string, unknown>) =>
    request<{ user: UserListItem }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  toggleStatus: (id: string) => request<{ user: UserListItem }>(`/users/${id}/status`, { method: 'PATCH' }),
  resetPassword: (id: string) =>
    request<{ temporaryPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),
};

/* ---------------- Cards ---------------- */

export interface CardListParams {
  search?: string;
  status?: string;
  assigned?: string;
  page?: number;
  pageSize?: number;
}

export const cardsApi = {
  list: (params: CardListParams = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<Paged<CardListItem>>(`/cards?${search.toString()}`);
  },
  create: (input: Record<string, unknown>) =>
    request<{ card: CardListItem }>('/cards', { method: 'POST', body: JSON.stringify(input) }),
  assign: (id: string, userId: string) =>
    request<{ card: CardListItem }>(`/cards/${id}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
  release: (id: string) => request<{ ok: true }>(`/cards/${id}/release`, { method: 'POST' }),
  block: (id: string, reason: string) =>
    request<{ card: CardListItem }>(`/cards/${id}/block`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unblock: (id: string) => request<{ card: CardListItem }>(`/cards/${id}/unblock`, { method: 'POST' }),
};

/* ---------------- Scans ---------------- */

export interface ScanListParams {
  from?: string;
  to?: string;
  decision?: string;
  period?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const scansApi = {
  list: (params: ScanListParams = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<Paged<ScanRow>>(`/scans?${search.toString()}`);
  },
  void: (id: string, reason: string) =>
    request<{ ok: true; mealId: string }>(`/scans/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

export async function submitScan(payload: {
  cardUid: string;
  deviceCode: string;
  deviceKey: string;
}): Promise<ScanResult> {
  const res = await fetch(`${BASE}/scans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-key': payload.deviceKey },
    body: JSON.stringify({ cardUid: payload.cardUid, deviceCode: payload.deviceCode }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ScanResult;
}

/* ---------------- Periods / Devices / Departments / Audit ---------------- */

export interface PeriodItem {
  id: string;
  code: PeriodCode;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface DeviceItem {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string | null;
  userCount: number;
}

export interface AuditItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string;
  actorEmail: string | null;
  ip: string | null;
  createdAt: string;
}

export const periodsApi = {
  list: () => request<{ items: PeriodItem[] }>('/periods'),
  update: (id: string, input: Record<string, unknown>) =>
    request<{ period: PeriodItem }>(`/periods/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export const devicesApi = {
  list: () => request<{ items: DeviceItem[] }>('/devices'),
  create: (input: { code: string; name: string; location?: string }) =>
    request<{ device: DeviceItem; apiKey: string }>('/devices', { method: 'POST', body: JSON.stringify(input) }),
  rotate: (id: string) => request<{ id: string; apiKey: string }>(`/devices/${id}/rotate-key`, { method: 'POST' }),
};

export const departmentsApi = {
  list: () => request<{ items: DepartmentItem[] }>('/departments'),
  create: (input: { name: string; code?: string }) =>
    request<{ department: { id: string; name: string } }>('/departments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const auditApi = {
  list: (page = 1, pageSize = 20) =>
    request<Paged<AuditItem>>(`/audit-logs?page=${page}&pageSize=${pageSize}`),
};
