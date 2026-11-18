import { SignJWT, jwtVerify } from 'jose';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { q } from './db';
import { HttpError, uid } from './util';

export type User = { id: string; email: string; nombre: string; rol: string; permisos: string[] };

export const PERMISOS: [string, string][] = [
  ['ver_todos', 'Ver todos los leads (si no, solo los suyos y los sin asignar)'],
  ['eliminar_leads', 'Eliminar leads'],
  ['reportes', 'Ver reportes'],
];

let cacheRoles: { t: number; m: Map<string, string[]> } | null = null;
export const limpiarCacheRoles = () => (cacheRoles = null);
/** Permisos de un rol. El administrador lo puede todo. Se consulta a la base como máximo cada 15 segundos. */
export async function permisosDe(rol: string): Promise<string[]> {
  if (rol === 'admin') return PERMISOS.map((p) => p[0]);
  if (!cacheRoles || Date.now() - cacheRoles.t > 15000) {
    const rows = await q('select id, permisos from roles');
    cacheRoles = { t: Date.now(), m: new Map(rows.map((r: any) => [r.id, Array.isArray(r.permisos) ? r.permisos : []])) };
  }
  return cacheRoles.m.get(rol) || [];
}

const COOKIE = 'pulso_session';

const key = () => {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 16) throw new HttpError(500, 'Falta la variable AUTH_SECRET (mínimo 16 caracteres).');
  return new TextEncoder().encode(s);
};

export function hashPassword(p: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(p, salt, 64).toString('hex')}`;
}

export function checkPassword(p: string, stored: string) {
  const [t, salt, h] = String(stored).split('$');
  if (t !== 'scrypt' || !salt || !h) return false;
  const a = Buffer.from(h, 'hex');
  const b = scryptSync(p, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Valida el correo y la contraseña. Si todavía no hay usuarios, crea el administrador con ADMIN_EMAIL / ADMIN_PASSWORD. */
export async function login(email: string, password: string): Promise<User> {
  email = email.trim().toLowerCase();
  const n = await q('select count(*)::int as n from usuarios');
  if (n[0].n === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await q(
      'insert into usuarios(id,email,nombre,rol,hash) values($1,$2,$3,$4,$5) on conflict (email) do nothing',
      [uid(), process.env.ADMIN_EMAIL.trim().toLowerCase(), 'Administrador', 'admin', hashPassword(process.env.ADMIN_PASSWORD)],
    );
  }
  const r = (await q('select * from usuarios where email=$1', [email]))[0];
  if (!r || !checkPassword(password, r.hash)) {
    await new Promise((res) => setTimeout(res, 400));
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  return { id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, permisos: await permisosDe(r.rol) };
}

/** Entrada rápida con correo y PIN (4 a 6 números). Los administradores no pueden usarla. 5 intentos fallidos bloquean 15 minutos. */
export async function loginPin(email: string, pin: string): Promise<User> {
  email = email.trim().toLowerCase();
  const r = (await q('select * from usuarios where email=$1', [email]))[0];
  const malo = async (msg = 'Correo o PIN incorrectos') => {
    await new Promise((res) => setTimeout(res, 500));
    throw new HttpError(401, msg);
  };
  if (!r || !r.pin_hash || r.rol === 'admin') return malo();
  if (r.pin_hasta && new Date(r.pin_hasta) > new Date()) return malo('Demasiados intentos. Espera 15 minutos o entra con tu contraseña.');
  if (!checkPassword(pin, r.pin_hash)) {
    const f = (r.pin_fallos || 0) + 1;
    await q('update usuarios set pin_fallos=$1, pin_hasta=$2 where id=$3', [f >= 5 ? 0 : f, f >= 5 ? new Date(Date.now() + 15 * 60000) : null, r.id]);
    return malo();
  }
  await q('update usuarios set pin_fallos=0, pin_hasta=null where id=$1', [r.id]);
  return { id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, permisos: await permisosDe(r.rol) };
}

const secure = (req: Request) =>
  new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

export async function sessionCookie(u: User, req: Request) {
  const jwt = await new SignJWT({ email: u.email, nombre: u.nombre, rol: u.rol })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key());
  return `${COOKIE}=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure(req) ? '; Secure' : ''}`;
}

export const clearCookie = (req: Request) =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req) ? '; Secure' : ''}`;

export async function getUser(req: Request): Promise<User | null> {
  const m = /(?:^|;\s*)pulso_session=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], key());
    const rol = String(payload.rol || 'vendedor');
    return { id: String(payload.sub), email: String(payload.email), nombre: String(payload.nombre), rol, permisos: await permisosDe(rol) };
  } catch {
    return null;
  }
}
