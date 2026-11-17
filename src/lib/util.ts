import { randomBytes, timingSafeEqual } from 'node:crypto';

export const uid = () => randomBytes(6).toString('hex');

/** Fecha de hoy (AAAA-MM-DD) en hora de Costa Rica. */
export const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
export const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? def : Math.min(max, Math.max(min, n));
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Acepta segundos Unix, milisegundos o texto ISO. */
export const toDate = (v: any): Date => {
  if (v == null || v === '') return new Date();
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};
