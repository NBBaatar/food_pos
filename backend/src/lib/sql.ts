/** Дараагийн байрлалын параметрийг ($1, $2, …) үүсгэж, утгыг жагсаалтад нэмнэ */
export function param(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

/** pg-ийн unique violation (23505) эсэх */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** LIMIT/OFFSET-ийг параметргүй, шалгагдсан бүхэл тоогоор оруулна */
export function limitOffset(page: number, pageSize: number): string {
  return `LIMIT ${Math.max(1, Math.trunc(pageSize))} OFFSET ${Math.max(0, (Math.max(1, Math.trunc(page)) - 1) * Math.trunc(pageSize))}`;
}
