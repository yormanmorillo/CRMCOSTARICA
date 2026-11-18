import { q } from './db';
import { HttpError, json } from './util';
import { getUser, type User } from './auth';
import { estadoLicencia } from './licencia';

export type Ctx = { req: Request; url: URL; params: Record<string, string>; user: User | null };
type Handler = (c: Ctx) => Promise<Response>;
type Opts = { public?: boolean; admin?: boolean; webhook?: boolean; libre?: boolean };
type Route = { method: string; re: RegExp; keys: string[]; h: Handler } & Opts;

const routes: Route[] = [];
/** public = sin sesión; admin = solo administrador; webhook = sin control de origen ni de licencia; libre = se permite aunque la licencia esté vencida. */
export function route(method: string, path: string, h: Handler, opts: Opts = {}) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, h, ...opts });
}

export const body = async (req: Request): Promise<any> => {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
};
export const oneOf = (v: unknown, list: string[], campo: string) => {
  const s = String(v ?? '');
  if (!list.includes(s)) throw new HttpError(400, `Valor no válido en ${campo}`);
  return s;
};
export async function mustLead(id: string) {
  const r = (await q('select * from leads where id=$1', [id]))[0];
  if (!r) throw new HttpError(404, 'Lead no encontrado');
  return r;
}

function checkOrigin(req: Request) {
  const o = req.headers.get('origin');
  if (!o) return;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  let oh = '';
  try {
    oh = new URL(o).host;
  } catch {}
  if (oh !== host) throw new HttpError(403, 'Origen no permitido');
}

export async function dispatch(req: Request, segs: string[]): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = '/' + segs.join('/');
    const method = req.method.toUpperCase();
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let user: User | null = null;
      if (!r.public) {
        user = await getUser(req);
        if (!user) throw new HttpError(401, 'Tu sesión venció. Entra de nuevo.');
        if (r.admin && user.rol !== 'admin') throw new HttpError(403, 'Solo el administrador puede hacer esto');
      }
      if (method !== 'GET' && !r.webhook) {
        checkOrigin(req);
        if (!r.public && !r.libre) {
          const lic = await estadoLicencia();
          if (!lic.puedeEscribir) throw new HttpError(402, lic.mensaje);
        }
      }
      return await r.h({ req, url, params, user });
    }
    throw new HttpError(404, 'No encontrado');
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Error interno: ' + (e?.message || 'desconocido') }, 500);
  }
}
