import type { ZodError } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function zodMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Оруулсан мэдээлэл буруу байна';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}
