import { q } from './db';
import { HttpError, json, uid, str } from './util';
import { route, body } from './router';
import { enviarMail } from './mail';
import { getSettings } from './leads';

/** Ayuda (helpdesk): cualquier usuario reporta un fallo; queda guardado y se envía al correo de soporte. */
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const ESTADOS = ['abierto', 'en_curso', 'resuelto'];
const MODULOS = ['Leads', 'Conversaciones', 'Calendario', 'Reportes', 'Admin', 'Canales (WhatsApp, redes, correo)', 'Inicio de sesión', 'Otro'];

const fila = (r: any) => ({ id: r.id, numero: r.numero, usuario: r.usuario_nombre, email: r.usuario_email, asunto: r.asunto, descripcion: r.descripcion, prioridad: r.prioridad, modulo: r.modulo, estado: r.estado, enviado: r.enviado, error: r.error, creado: r.creado, actualizado: r.actualizado });

async function despachar(id: string) {
  const t = (await q('select * from tickets where id=$1', [id]))[0];
  if (!t) return;
  const aj = await getSettings();
  const para = aj.soporteEmail;
  let error = '';
  if (!para) error = 'Falta el correo de soporte (Admin, Negocio).';
  else {
    const cuerpo = `Ticket #${t.numero} — prioridad ${t.prioridad.toUpperCase()}\nNegocio: ${aj.negocio}\nReportado por: ${t.usuario_nombre} <${t.usuario_email}>\nMódulo: ${t.modulo || '—'}\nPágina: ${t.pagina || '—'}\n\n${t.descripcion || '(sin descripción)'}\n`;
    try { await enviarMail(para, `[Ticket #${t.numero}] ${t.asunto}`, cuerpo, { responder: t.usuario_email }); }
    catch (e: any) { error = e?.message || 'No se pudo enviar'; }
  }
  await q('update tickets set enviado=$2, error=$3, actualizado=now() where id=$1', [id, !error, error]);
  return error;
}

route('GET', '/tickets', async ({ user }) => {
  const rows = user!.rol === 'admin'
    ? await q('select * from tickets order by creado desc limit 200')
    : await q('select * from tickets where usuario_id=$1 order by creado desc limit 100', [user!.id]);
  return json({ tickets: rows.map(fila), modulos: MODULOS, soporte: !!(await getSettings()).soporteEmail });
}, { libre: true });

route('POST', '/tickets', async ({ req, user }) => {
  const b = await body(req);
  const asunto = str(b.asunto, 150);
  if (asunto.length < 3) throw new HttpError(400, 'Escribe un título corto del problema.');
  const prioridad = PRIORIDADES.includes(b.prioridad) ? b.prioridad : 'media';
  const id = uid();
  const u = (await q('select email from usuarios where id=$1', [user!.id]))[0];
  await q('insert into tickets(id, usuario_id, usuario_nombre, usuario_email, asunto, descripcion, prioridad, modulo, pagina) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, user!.id, user!.nombre, u?.email || '', asunto, str(b.descripcion, 4000), prioridad, str(b.modulo, 80), str(b.pagina, 200)]);
  const error = await despachar(id);
  const t = (await q('select * from tickets where id=$1', [id]))[0];
  return json({ ticket: fila(t), enviado: !error, aviso: error || '' }, 201);
}, { libre: true });

route('POST', '/tickets/:id/reenviar', async ({ params, user }) => {
  const t = (await q('select * from tickets where id=$1', [params.id]))[0];
  if (!t || (user!.rol !== 'admin' && t.usuario_id !== user!.id)) throw new HttpError(404, 'Ticket no encontrado');
  const error = await despachar(params.id);
  return json({ enviado: !error, aviso: error || '' });
}, { libre: true });

route('PATCH', '/tickets/:id', async ({ req, params }) => {
  const b = await body(req);
  if (!ESTADOS.includes(b.estado)) throw new HttpError(400, 'Estado no válido');
  const r = await q('update tickets set estado=$2, actualizado=now() where id=$1 returning id', [params.id, b.estado]);
  if (!r.length) throw new HttpError(404, 'Ticket no encontrado');
  return json({ ok: true });
}, { admin: true, libre: true });
