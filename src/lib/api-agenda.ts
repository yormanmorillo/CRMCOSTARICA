import { randomBytes } from 'node:crypto';
import { q } from './db';
import { HttpError, json, str, hoyCR, isDate } from './util';
import { route, body } from './router';
import { permisosDe, type User } from './auth';
import { getSettings, logAct } from './leads';
import { enviarMail } from './mail';

/* ---------- Calendario: archivo .ics y suscripción (Google Calendar, Outlook, Apple) ---------- */
const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (l: string) => { const out: string[] = []; let s = l; while (Buffer.byteLength(s) > 74) { let n = 72; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = ' ' + s.slice(n); } out.push(s); return out.join('\r\n'); };
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dia = (f: string) => f.replace(/-/g, '');
const sumarDia = (f: string, n: number) => new Date(Date.parse(f + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function construirIcs(user: { id: string; rol: string; permisos: string[] }, negocio: string) {
  const todo = user.rol === 'admin' || user.permisos.includes('ver_todos');
  const desde = sumarDia(hoyCR(), -30);
  const P: any[] = [desde];
  let vis = '';
  if (!todo) { P.push(user.id); vis = 'and (l.id is null or l.asignado is null or l.asignado = $2)'; }
  const tareas = await q(`select t.*, l.nombre as lead_nombre, l.tel as lead_tel from tareas t left join leads l on l.id = t.lead_id where t.fecha >= $1 ${vis} order by t.fecha limit 1500`, P);
  const llegadas = await q(`select l.id, l.nombre, l.tel, l.llegada from leads l where l.llegada ~ '^\\d{4}-\\d{2}-\\d{2}$' and l.llegada >= $1 ${todo ? '' : 'and (l.asignado is null or l.asignado = $2)'} limit 800`, P);
  const ahora = utc(new Date());
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulso CRM//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(negocio + ' – Pulso CRM'), 'X-WR-TIMEZONE:America/Costa_Rica'];
  for (const t of tareas) {
    const desc = [t.lead_nombre ? 'Lead: ' + t.lead_nombre : '', t.lead_tel ? 'Tel: ' + t.lead_tel : ''].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:tarea-${t.id}@pulso-crm`, 'DTSTAMP:' + ahora);
    if (/^\d{2}:\d{2}$/.test(t.hora || '')) {
      const [h, m] = t.hora.split(':').map(Number);
      const [y, mo, d] = t.fecha.split('-').map(Number);
      const ini = new Date(Date.UTC(y, mo - 1, d, h + 6, m)); // Costa Rica = UTC-6 todo el año
      L.push('DTSTART:' + utc(ini), 'DTEND:' + utc(new Date(ini.getTime() + 30 * 60000)));
    } else L.push('DTSTART;VALUE=DATE:' + dia(t.fecha), 'DTEND;VALUE=DATE:' + dia(sumarDia(t.fecha, 1)));
    L.push('SUMMARY:' + esc((t.hecha ? '✓ ' : '') + t.titulo + (t.lead_nombre ? ' – ' + t.lead_nombre : '')));
    if (desc) L.push('DESCRIPTION:' + esc(desc));
    if (t.hecha) L.push('STATUS:CONFIRMED', 'TRANSP:TRANSPARENT');
    L.push('END:VEVENT');
  }
  for (const l of llegadas) {
    L.push('BEGIN:VEVENT', `UID:llegada-${l.id}@pulso-crm`, 'DTSTAMP:' + ahora, 'DTSTART;VALUE=DATE:' + dia(l.llegada), 'DTEND;VALUE=DATE:' + dia(sumarDia(l.llegada, 1)), 'SUMMARY:' + esc('Llegada: ' + l.nombre), 'DESCRIPTION:' + esc(l.tel ? 'Tel: ' + l.tel : ''), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

const ICS = (cuerpo: string, nombre = 'calendario.ics') => new Response(cuerpo, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `inline; filename="${nombre}"`, 'cache-control': 'private, max-age=300' } });

async function tokenDe(id: string, regenerar = false) {
  let t = (await q('select cal_token from usuarios where id=$1', [id]))[0]?.cal_token;
  if (!t || regenerar) { t = randomBytes(24).toString('base64url'); await q('update usuarios set cal_token=$2 where id=$1', [id, t]); }
  return t as string;
}
const baseUrl = (req: Request) => {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
};

// Dirección privada de suscripción del usuario (sirve para Google Calendar, Outlook y Apple Calendar).
route('GET', '/calendario/enlace', async ({ req, user }) => {
  const t = await tokenDe(user!.id);
  const url = `${baseUrl(req)}/api/calendario/feed/${t}.ics`;
  return json({ url, webcal: url.replace(/^https?:/, 'webcal:') });
}, { libre: true });

route('POST', '/calendario/enlace', async ({ req, user }) => {
  const t = await tokenDe(user!.id, true);
  return json({ url: `${baseUrl(req)}/api/calendario/feed/${t}.ics` });
});

route('GET', '/calendario.ics', async ({ user }) => ICS(await construirIcs(user!, (await getSettings()).negocio)), { libre: true });

route('GET', '/calendario/feed/:token', async ({ params }) => {
  const t = params.token.replace(/\.ics$/i, '');
  const u = t.length >= 20 ? (await q('select id, rol from usuarios where cal_token=$1', [t]))[0] : null;
  if (!u) throw new HttpError(404, 'Calendario no encontrado');
  return ICS(await construirIcs({ id: u.id, rol: u.rol, permisos: await permisosDe(u.rol) }, (await getSettings()).negocio));
}, { public: true, webhook: true });

route('POST', '/calendario/enviar', async ({ req, user }) => {
  const b = await body(req);
  const para = str(b.para, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw new HttpError(400, 'Escribe un correo válido');
  const aj = await getSettings();
  const ics = await construirIcs(user!, aj.negocio);
  await enviarMail(para, `Calendario de ${user!.nombre} – ${aj.negocio}`, `${user!.nombre} te comparte su calendario de ${aj.negocio}.\n\nAbre el archivo adjunto (calendario.ics) para agregarlo a Google Calendar, Outlook o Apple Calendar.\n${str(b.nota, 500) ? '\nNota: ' + str(b.nota, 500) + '\n' : ''}`, { adjuntos: [{ filename: 'calendario.ics', content: ics, contentType: 'text/calendar; charset=utf-8' }] });
  return json({ ok: true });
}, { libre: true });

/* ---------- Compartir un lead por correo ---------- */
route('POST', '/leads/:id/compartir', async ({ req, params, user }) => {
  const b = await body(req);
  let para = '';
  let aQuien = '';
  if (b.usuarioId) {
    const u = (await q('select email, nombre from usuarios where id=$1', [String(b.usuarioId)]))[0];
    if (!u) throw new HttpError(400, 'Ese usuario no existe');
    para = u.email; aQuien = u.nombre;
  } else {
    para = str(b.email, 200).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw new HttpError(400, 'Elige un compañero o escribe un correo válido');
    aQuien = para;
  }
  const l = (await q('select l.*, e.nombre as etapa_nombre, u.nombre as asignado_nombre from leads l left join etapas e on e.clave = l.etapa left join usuarios u on u.id = l.asignado where l.id=$1', [params.id]))[0];
  if (!l) throw new HttpError(404, 'Lead no encontrado');
  const [prods, aten, aj] = await Promise.all([
    q('select nombre, cantidad, precio, moneda from lead_productos where lead_id=$1', [l.id]),
    q('select fecha, canal, nota from atenciones where lead_id=$1 and auto=false order by fecha desc, creado desc limit 3', [l.id]),
    getSettings(),
  ]);
  const money = (n: number, m: string) => (m === 'USD' ? '$' : '₡') + Number(n).toLocaleString('es-CR');
  const nota = str(b.nota, 1000);
  const cuerpo = [
    `${user!.nombre} te comparte un lead de ${aj.negocio}.`,
    nota ? `\nMensaje: ${nota}` : '',
    '\n— DATOS —',
    `Nombre: ${l.nombre}`,
    l.tel ? `Teléfono: ${l.tel}` : '', l.email ? `Correo: ${l.email}` : '', l.empresa ? `Empresa: ${l.empresa}` : '',
    `Canal: ${l.canal}`, `Etapa: ${l.etapa_nombre || l.etapa}`, l.asignado_nombre ? `Asignado a: ${l.asignado_nombre}` : '',
    l.interes ? `Interés: ${l.interes}` : '', l.llegada ? `Llegada: ${l.llegada}` : '',
    prods.length ? '\n— PRODUCTOS —\n' + prods.map((p: any) => `• ${p.nombre} x${p.cantidad} (${money(p.precio, p.moneda)})`).join('\n') : '',
    aten.length ? '\n— ÚLTIMAS ATENCIONES —\n' + aten.map((a: any) => `• ${a.fecha} (${a.canal || '—'}): ${a.nota}`).join('\n') : '',
    `\nAbre el CRM: ${baseUrl(req)}/`,
  ].filter((x) => x !== '').join('\n');
  await enviarMail(para, `Lead compartido: ${l.nombre}`, cuerpo, { responder: (await q('select email from usuarios where id=$1', [user!.id]))[0]?.email });
  await logAct(l.id, 'compartido', `Compartido por correo con ${aQuien}`, user!.nombre);
  return json({ ok: true, para: aQuien });
});

void isDate;
