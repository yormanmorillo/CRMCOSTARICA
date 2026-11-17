import { SignJWT, jwtVerify } from 'jose';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { q } from './db';
import { HttpError, uid } from './util';

export type User = { id: string; email: string; nombre: string; rol: 'admin' | 'vendedor' };

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
  return { id: r.id, email: r.email, nombre: r.nombre, rol: r.rol === 'admin' ? 'admin' : 'vendedor' };
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
    return {
      id: String(payload.sub),
      email: String(payload.email),
      nombre: String(payload.nombre),
      rol: payload.rol === 'admin' ? 'admin' : 'vendedor',
    };
  } catch {
    return null;
  }
}
