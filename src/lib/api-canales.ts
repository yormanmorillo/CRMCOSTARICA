import { randomBytes } from 'node:crypto';
import { q } from './db';
import { HttpError, json, uid, str, hoyCR, safeEqual, digits } from './util';
import { route } from './router';
import { ETAPA_INICIAL_SQL, canalActivo, getAjuste, setSetting, logAct } from './leads';
import { fbConfig } from './meta';
import { tipoYPais } from './chatwoot';

const base = (req: Request) => {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
};

/* ---------- Instagram y Facebook: estado para el panel Admin ---------- */
route('GET', '/meta/estado', async ({ req }) => {
  const c = fbConfig();
  const recientes = await q("select id, evento, resultado, creado from eventos_cw where evento = 'meta' order by id desc limit 15");
  return json({
    configurado: { pageToken: !!c.token, pageId: !!c.pageId, secreto: !!c.secret, verifyToken: !!c.verify },
    activo: await canalActivo('meta'),
    webhookUrl: `${base(req)}/api/webhooks/meta`,
    verifyToken: c.verify || null,
    recientes,
  });
}, { admin: true });

/* ---------- Formulario de la página web ---------- */
async function tokenWeb(regenerar = false): Promise<string> {
  let t = await getAjuste('webToken');
  if (!t || regenerar) {
    t = randomBytes(18).toString('hex');
    await setSetting('webToken', t);
  }
  return t;
}

route('GET', '/canales/web', async ({ req }) => json({ activo: await canalActivo('web'), token: await tokenWeb(), url: `${base(req)}/api/webhooks/web` }), { admin: true });
route('POST', '/canales/web/token', async ({ req }) => json({ activo: await canalActivo('web'), token: await tokenWeb(true), url: `${base(req)}/api/webhooks/web` }), { admin: true });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
route('OPTIONS', '/webhooks/web', async () => new Response(null, { status: 204, headers: CORS }), { public: true, webhook: true });

// Límite sencillo por dirección IP (por instancia del servidor): 10 envíos cada 10 minutos.
const G = globalThis as any;
const golpes: Map<string, number[]> = (G.__pulsoWebHits ||= new Map());
function limite(ip: string) {
  const ahora = Date.now();
  const l = (golpes.get(ip) || []).filter((t) => ahora - t < 600000);
  if (l.length >= 10) return false;
  l.push(ahora);
  golpes.set(ip, l);
  if (golpes.size > 5000) golpes.clear();
  return true;
}

async function leerForm(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const b = await req.json();
      return b && typeof b === 'object' ? b : {};
    }
    const fd = await req.formData();
    const o: Record<string, any> = {};
    fd.forEach((v, k) => (o[k] = typeof v === 'string' ? v : ''));
    return o;
  } catch {
    return {};
  }
}

route('POST', '/webhooks/web', async ({ req }) => {
  const ok = (extra: object = {}) => json({ ok: true, ...extra }, 200, CORS);
  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  if (!limite(ip)) throw new HttpError(429, 'Demasiados envíos. Intenta más tarde.');
  const b = await leerForm(req);
  const esperado = await getAjuste('webToken');
  if (!esperado || !safeEqual(String(b.token || ''), esperado)) throw new HttpError(401, 'Clave del formulario no válida');
  if (!(await canalActivo('web'))) throw new HttpError(409, 'El formulario web está desactivado');
  if (str(b.website || b._gotcha, 100)) return ok(); // campo trampa para robots: se descarta sin avisar

  const nombre = str(b.nombre || b.name, 100);
  const tel = str(b.tel || b.telefono || b.phone, 40);
  const email = str(b.email || b.correo, 200).toLowerCase();
  const empresa = str(b.empresa || b.company, 100);
  const mensaje = str(b.mensaje || b.message || b.interes, 2000);
  if (!nombre && !tel && !email) throw new HttpError(400, 'Falta al menos el nombre, el teléfono o el correo');

  // ¿Ya es un lead? Se le anota el nuevo mensaje en lugar de duplicarlo.
  const d = digits(tel);
  let lead: any;
  if (email) lead = (await q('select * from leads where lower(email)=$1 limit 1', [email]))[0];
  if (!lead && d.length >= 7) lead = (await q("select * from leads where regexp_replace(tel, '\\D', '', 'g') in ($1, $2) limit 1", [d, d.length === 8 ? '506' + d : d.replace(/^506/, '')]))[0];
  let creado = false;
  if (!lead) {
    const { tipo, pais } = tipoYPais({ id: '', name: nombre, phone: d ? '+' + d : '', email, identifier: '', country: str(b.pais || b.country, 60), countryCode: '' });
    const dias = parseInt((await q("select valor from ajustes where clave='avisoDias'"))[0]?.valor, 10);
    lead = (
      await q(
        `insert into leads(id, nombre, tel, email, empresa, canal, tipo, pais, interes, aviso_dias, creado, auto, etapa)
         values($1,$2,$3,$4,$5,'web',$6,$7,$8,$9,$10,true,${ETAPA_INICIAL_SQL}) returning *`,
        [uid(), nombre || email || tel, tel, email, empresa, tipo, pais, mensaje.slice(0, 500), Number.isNaN(dias) ? 5 : dias, hoyCR()],
      )
    )[0];
    creado = true;
    await logAct(lead.id, 'creado', 'Lead creado desde el formulario de la página web (automático)');
  } else {
    await logAct(lead.id, 'mensaje', 'Volvió a escribir por el formulario de la página web');
  }
  if (mensaje) await q('insert into notas(id, lead_id, usuario, texto) values($1,$2,$3,$4)', [uid(), lead.id, 'Formulario web', mensaje]);
  await q('insert into eventos_cw(evento, payload, resultado) values($1,$2::jsonb,$3)', ['web', JSON.stringify({ nombre, email }), creado ? 'lead creado (web)' : 'mensaje agregado a un lead existente (web)']);
  return ok({ lead: creado ? 'creado' : 'existente' });
}, { public: true, webhook: true });
