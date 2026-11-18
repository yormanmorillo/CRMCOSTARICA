import { createHmac } from 'node:crypto';
import { q } from './db';
import { optimizarImagen } from './almacen';
import { HttpError, digits, hoyCR, safeEqual, toDate, uid } from './util';
import { tipoYPais } from './chatwoot';
import { ETAPA_INICIAL_SQL, canalActivo, logAct } from './leads';

/* ---------- Configuración ---------- */
export function graphUrl() {
  return (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/+$/, '');
}

export function waConfig() {
  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_ID || '').trim();
  const secret = (process.env.META_APP_SECRET || '').trim();
  const verify = (process.env.META_VERIFY_TOKEN || '').trim();
  return { token, phoneId, secret, verify, ok: !!(token && phoneId), recibe: !!(secret && verify) };
}

/** Instagram y Facebook (Messenger) usan el token de la página de Facebook. */
export function fbConfig() {
  const token = (process.env.META_PAGE_TOKEN || '').trim();
  const pageId = (process.env.META_PAGE_ID || '').trim();
  const secret = (process.env.META_APP_SECRET || '').trim();
  const verify = (process.env.META_VERIFY_TOKEN || '').trim();
  return { token, pageId, secret, verify, ok: !!token, recibe: !!(secret && verify) };
}

/** Meta firma cada aviso con la clave secreta de la app: X-Hub-Signature-256 = sha256=HMAC(cuerpo). */
export function verifyMetaSignature(raw: string, h: Headers) {
  const { secret } = waConfig();
  const sig = h.get('x-hub-signature-256') || '';
  if (!secret || !sig) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(sig, expected);
}

/* ---------- Envío ---------- */
const MOTIVOS: Record<number, string> = {
  131047: 'Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo permite responder después con una plantilla aprobada por Meta.',
  131030: 'Ese número no está en la lista de destinatarios permitidos (la cuenta de WhatsApp todavía está en modo de prueba).',
  131026: 'El mensaje no se pudo entregar: ese número no tiene WhatsApp o no aceptó el mensaje.',
  190: 'El token de WhatsApp venció o no es válido. Genera uno nuevo en Meta y cámbialo en WHATSAPP_TOKEN.',
};

function motivoMeta(data: any, status: number) {
  const e = data?.error || {};
  const code = Number(e.code ?? e.error_subcode);
  const base = MOTIVOS[code] || e.error_data?.details || e.message || `respondió ${status}`;
  return code && !MOTIVOS[code] ? `${base} (código ${code})` : base;
}

/** Envía un mensaje de texto por WhatsApp. Devuelve el id del mensaje (wamid). */
/** Contactos de la página /demo: no se envía nada a Meta (números 5069… y ids demo-…). */
export const esDemoId = (id: string) => /^demo-/.test(id || '') || /^5069\d{7}$/.test(id || '');

export async function enviarWhatsApp(para: string, texto: string): Promise<string> {
  if (esDemoId(para)) return 'demo-' + Date.now();
  const c = waConfig();
  if (!c.ok) throw new HttpError(503, 'WhatsApp no está conectado: faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID.');
  let r: Response;
  try {
    r = await fetch(`${graphUrl()}/${encodeURIComponent(c.phoneId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: false, body: texto } }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new HttpError(502, 'No se pudo contactar a WhatsApp: ' + (e?.message || 'sin respuesta'));
  }
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'WhatsApp no aceptó el mensaje: ' + motivoMeta(data, r.status));
  return String(data?.messages?.[0]?.id || '');
}

/** Pregunta a Meta qué número está conectado. Sirve para comprobar que el token y el id son correctos. */
export async function probarWhatsApp(): Promise<{ numero: string; nombre: string }> {
  const c = waConfig();
  if (!c.ok) throw new HttpError(400, 'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID.');
  let r: Response;
  try {
    r = await fetch(`${graphUrl()}/${encodeURIComponent(c.phoneId)}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new HttpError(502, 'No se pudo contactar a Meta: ' + (e?.message || 'sin respuesta'));
  }
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'Meta no aceptó la conexión: ' + motivoMeta(data, r.status));
  return { numero: String(data.display_phone_number || ''), nombre: String(data.verified_name || '') };
}

/** WhatsApp solo deja responder libremente durante las 24 horas siguientes al último mensaje del cliente. */
export async function ventanaWhatsApp(leadId: string): Promise<{ abierta: boolean; hasta: string | null }> {
  const r = (await q("select max(creado) as ult from mensajes where lead_id=$1 and direccion='in'", [leadId]))[0];
  if (!r?.ult) return { abierta: false, hasta: null };
  const hasta = new Date(new Date(r.ult).getTime() + 24 * 3600 * 1000);
  return { abierta: hasta.getTime() > Date.now(), hasta: hasta.toISOString() };
}

/* ---------- Archivos que manda el cliente ---------- */
const MAX_MEDIO = 4 * 1024 * 1024; // las respuestas de Vercel no pasan de 4,5 MB

async function descargarMedio(mediaId: string): Promise<{ mime: string; data: Buffer } | { error: string }> {
  const c = waConfig();
  const auth = { authorization: `Bearer ${c.token}` };
  try {
    const r1 = await fetch(`${graphUrl()}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(15000) });
    const meta: any = await r1.json().catch(() => ({}));
    if (!r1.ok || !meta.url) return { error: 'Meta no entregó el archivo' };
    // Solo https. (La excepción es para las pruebas, cuando META_GRAPH_URL apunta a un servidor local simulado.)
    if (!/^https:\/\//.test(meta.url) && !graphUrl().startsWith('http://')) return { error: 'dirección de archivo no válida' };
    if (Number(meta.file_size) > MAX_MEDIO) return { error: 'el archivo es muy pesado para guardarlo aquí' };
    const r2 = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(25000) });
    if (!r2.ok) return { error: 'no se pudo descargar' };
    const buf = Buffer.from(await r2.arrayBuffer());
    if (buf.length > MAX_MEDIO) return { error: 'el archivo es muy pesado para guardarlo aquí' };
    return { mime: String(meta.mime_type || r2.headers.get('content-type') || 'application/octet-stream').split(';')[0], data: buf };
  } catch (e: any) {
    return { error: e?.message || 'no se pudo descargar' };
  }
}

/* ---------- Recepción ---------- */
type Medio = { id: string; tipo: 'image' | 'audio' | 'video' | 'document'; nombre: string };

/** Convierte un mensaje de WhatsApp en texto y archivos. null = no hay nada que guardar (por ejemplo, una reacción). */
function extraer(m: any): { texto: string; medios: Medio[] } | null {
  const t = String(m.type || '');
  const media = (tipo: Medio['tipo'], o: any): { texto: string; medios: Medio[] } => ({
    texto: String(o?.caption || ''),
    medios: o?.id ? [{ id: String(o.id), tipo, nombre: String(o.filename || '') }] : [],
  });
  switch (t) {
    case 'text':
      return { texto: String(m.text?.body || ''), medios: [] };
    case 'image':
      return media('image', m.image);
    case 'sticker':
      return media('image', m.sticker);
    case 'audio':
      return media('audio', m.audio);
    case 'video':
      return media('video', m.video);
    case 'document':
      return media('document', m.document);
    case 'location': {
      const l = m.location || {};
      const pin = `https://maps.google.com/?q=${l.latitude},${l.longitude}`;
      return { texto: `📍 Ubicación${l.name ? ': ' + l.name : ''}${l.address ? ' · ' + l.address : ''}\n${pin}`, medios: [] };
    }
    case 'contacts': {
      const nombres = (m.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(', ');
      return { texto: `👤 Contacto compartido${nombres ? ': ' + nombres : ''}`, medios: [] };
    }
    case 'button':
      return { texto: String(m.button?.text || m.button?.payload || ''), medios: [] };
    case 'interactive': {
      const i = m.interactive || {};
      return { texto: String(i.button_reply?.title || i.list_reply?.title || ''), medios: [] };
    }
    case 'reaction':
      return null;
    default:
      return { texto: '[Mensaje de un tipo que Pulso CRM todavía no muestra. Ábrelo en WhatsApp.]', medios: [] };
  }
}

async function buscarOCrearWa(wa: string, nombre: string, texto: string) {
  let lead: any = (await q("select * from leads where chat_canal='whatsapp' and chat_id=$1", [wa]))[0];
  if (!lead) {
    // ¿Ya existe un lead cargado a mano con este teléfono? (con o sin el 506)
    const cand = [wa];
    if (wa.startsWith('506') && wa.length === 11) cand.push(wa.slice(3));
    lead = (await q("select * from leads where chat_id is null and regexp_replace(tel, '\\D', '', 'g') = any($1::text[]) order by creado desc limit 1", [cand]))[0];
  }
  if (lead) {
    const sets: string[] = [];
    const vals: any[] = [];
    const set = (col: string, v: any) => {
      vals.push(v);
      sets.push(`${col}=$${vals.length}`);
    };
    if (!lead.chat_id) {
      set('chat_canal', 'whatsapp');
      set('chat_id', wa);
    }
    if (!lead.tel) set('tel', '+' + wa);
    if (!lead.interes && texto) set('interes', texto.slice(0, 500));
    if (sets.length) {
      vals.push(lead.id);
      lead = (await q(`update leads set ${sets.join(', ')}, actualizado=now() where id=$${vals.length} returning *`, vals))[0];
    }
    return { lead, creado: false };
  }

  const tel = '+' + wa;
  const { tipo, pais } = tipoYPais({ id: '', name: nombre, phone: tel, email: '', identifier: '', country: '', countryCode: '' });
  const dias = parseInt((await q("select valor from ajustes where clave='avisoDias'"))[0]?.valor, 10);
  const rows = await q(
    `insert into leads(id, nombre, tel, canal, tipo, pais, interes, aviso_dias, creado, auto, chat_canal, chat_id, etapa)
     values($1,$2,$3,'whatsapp',$4,$5,$6,$7,$8,true,'whatsapp',$9,${ETAPA_INICIAL_SQL})
     on conflict (chat_canal, chat_id) where chat_id is not null do nothing
     returning *`,
    [uid(), nombre || tel, tel, tipo, pais, texto.slice(0, 500), Number.isNaN(dias) ? 5 : dias, hoyCR(), wa],
  );
  if (!rows.length) return { lead: (await q("select * from leads where chat_canal='whatsapp' and chat_id=$1", [wa]))[0], creado: false };
  await logAct(rows[0].id, 'creado', 'Lead creado desde WhatsApp (automático)');
  return { lead: rows[0], creado: true };
}

async function recibirWa(m: any, nombre: string): Promise<string> {
  const wa = digits(m.from);
  if (!wa) return 'ignorado (mensaje sin remitente)';
  const msgId = String(m.id || '');
  if (msgId && (await q('select 1 from mensajes where meta_id=$1', [msgId])).length) return 'mensaje repetido, ignorado';
  const ex = extraer(m);
  if (!ex) return `ignorado (${m.type})`;

  const { lead, creado } = await buscarOCrearWa(wa, nombre, ex.texto);

  const adjuntos: any[] = [];
  let texto = ex.texto;
  for (const med of ex.medios) {
    const r = await descargarMedio(med.id);
    if ('error' in r) {
      texto += `${texto ? '\n' : ''}[No se pudo guardar el archivo: ${r.error}. Ábrelo en WhatsApp.]`;
      continue;
    }
    const id = uid();
    const o = await optimizarImagen(r.mime, r.data);
    await q('insert into medios(id, lead_id, mime, nombre, data) values($1,$2,$3,$4,$5)', [id, lead.id, o.mime, med.nombre, o.data.toString('base64')]);
    adjuntos.push({ type: med.tipo, url: `/api/medios/${id}`, name: med.nombre || '', mime: o.mime });
  }

  const ins = await q(
    `insert into mensajes(id, lead_id, meta_id, direccion, texto, autor, adjuntos, creado)
     values($1,$2,$3,'in',$4,'',$5::jsonb,$6)
     on conflict do nothing
     returning id`,
    [uid(), lead.id, msgId || null, texto, JSON.stringify(adjuntos), toDate(m.timestamp)],
  );
  if (!ins.length) return 'mensaje repetido, ignorado';
  return creado ? 'lead creado (whatsapp) y mensaje guardado' : 'mensaje guardado (whatsapp)';
}

const RANGO: Record<string, number> = { enviado: 1, entregado: 2, leido: 3 };
const ESTADO: Record<string, string> = { sent: 'enviado', delivered: 'entregado', read: 'leido' };

async function actualizarEstado(s: any): Promise<string> {
  const id = String(s?.id || '');
  if (!id) return '';
  let estado = ESTADO[String(s.status)] || '';
  if (s.status === 'failed') {
    const e = s.errors?.[0] || {};
    estado = 'fallo: ' + (MOTIVOS[Number(e.code)] || e.error_data?.details || e.title || e.message || 'no se entregó');
  }
  if (!estado) return '';
  const cur = (await q('select estado from mensajes where meta_id=$1', [id]))[0];
  if (!cur) return '';
  // Los avisos pueden llegar en desorden: nunca se retrocede (leído no vuelve a entregado).
  if ((RANGO[estado] || 0) && (RANGO[estado] || 0) <= (RANGO[cur.estado] || 0)) return '';
  await q('update mensajes set estado=$1 where meta_id=$2', [estado.slice(0, 300), id]);
  return `estado ${estado.split(':')[0]}`;
}

/* ---------- Instagram y Facebook Messenger (misma app de Meta, token de la página) ---------- */
type CanalSocial = 'instagram' | 'facebook';

/** Envía un mensaje por Messenger o Instagram. Devuelve el id del mensaje. Solo se puede responder dentro de las 24 h. */
export async function enviarSocial(canal: CanalSocial, para: string, texto: string): Promise<string> {
  if (esDemoId(para)) return 'demo-' + Date.now();
  const c = fbConfig();
  if (!c.ok) throw new HttpError(503, 'Instagram y Facebook no están conectados: falta META_PAGE_TOKEN.');
  let r: Response;
  try {
    r = await fetch(`${graphUrl()}/${encodeURIComponent(c.pageId || 'me')}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ recipient: { id: para }, messaging_type: 'RESPONSE', message: { text: texto } }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new HttpError(502, `No se pudo contactar a ${canal === 'instagram' ? 'Instagram' : 'Facebook'}: ` + (e?.message || 'sin respuesta'));
  }
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = Number(data?.error?.code);
    const msg = code === 190 ? 'El token de la página venció o no es válido. Genera uno nuevo en Meta y cámbialo en META_PAGE_TOKEN.' : data?.error?.message || `respondió ${r.status}`;
    throw new HttpError(502, `${canal === 'instagram' ? 'Instagram' : 'Facebook'} no aceptó el mensaje: ${msg}`);
  }
  return String(data?.message_id || '');
}

async function nombrePerfil(canal: CanalSocial, id: string): Promise<string> {
  const c = fbConfig();
  try {
    const r = await fetch(`${graphUrl()}/${encodeURIComponent(id)}?fields=${canal === 'instagram' ? 'name,username' : 'name'}`, {
      headers: { authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(8000),
    });
    const d: any = await r.json().catch(() => ({}));
    return String(d.name || d.username || '');
  } catch {
    return '';
  }
}

async function descargarUrl(url: string): Promise<{ mime: string; data: Buffer } | { error: string }> {
  try {
    if (!/^https:\/\//.test(url) && !graphUrl().startsWith('http://')) return { error: 'dirección de archivo no válida' };
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return { error: 'no se pudo descargar' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_MEDIO) return { error: 'el archivo es muy pesado para guardarlo aquí' };
    return { mime: String(r.headers.get('content-type') || 'application/octet-stream').split(';')[0], data: buf };
  } catch (e: any) {
    return { error: e?.message || 'no se pudo descargar' };
  }
}

async function recibirSocial(canal: CanalSocial, ev: any): Promise<string> {
  const de = String(ev?.sender?.id || '');
  const m = ev?.message;
  if (!de || !m) return ''; // entregas, lecturas y otros avisos no se guardan
  if (m.is_echo) return 'ignorado (mensaje propio)';
  const mid = String(m.mid || '');
  if (mid && (await q('select 1 from mensajes where meta_id=$1', [mid])).length) return 'mensaje repetido, ignorado';

  let texto = String(m.text || '');
  const adj: { tipo: string; url: string; nombre: string }[] = [];
  for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
    const t = String(a?.type || '');
    if (t === 'location') {
      const co = a.payload?.coordinates || {};
      texto += `${texto ? '\n' : ''}📍 Ubicación\nhttps://maps.google.com/?q=${co.lat},${co.long}`;
    } else if (a?.payload?.url) {
      adj.push({ tipo: ['image', 'audio', 'video'].includes(t) ? t : 'document', url: String(a.payload.url), nombre: '' });
    } else if (t) texto += `${texto ? '\n' : ''}[${t}]`;
  }
  if (!texto && !adj.length) return 'ignorado (sin contenido)';

  let lead: any = (await q('select * from leads where chat_canal=$1 and chat_id=$2', [canal, de]))[0];
  let creado = false;
  if (!lead) {
    const etiqueta = canal === 'instagram' ? 'Instagram' : 'Facebook';
    const nombre = (await nombrePerfil(canal, de)) || `${etiqueta} ${de.slice(-4)}`;
    const dias = parseInt((await q("select valor from ajustes where clave='avisoDias'"))[0]?.valor, 10);
    const rows = await q(
      `insert into leads(id, nombre, canal, interes, aviso_dias, creado, auto, chat_canal, chat_id, etapa)
       values($1,$2,$3,$4,$5,$6,true,$3,$7,${ETAPA_INICIAL_SQL})
       on conflict (chat_canal, chat_id) where chat_id is not null do nothing
       returning *`,
      [uid(), nombre, canal, texto.slice(0, 500), Number.isNaN(dias) ? 5 : dias, hoyCR(), de],
    );
    lead = rows[0] || (await q('select * from leads where chat_canal=$1 and chat_id=$2', [canal, de]))[0];
    creado = !!rows.length;
    if (creado) await logAct(lead.id, 'creado', `Lead creado desde ${etiqueta} (automático)`);
  }

  const adjuntos: any[] = [];
  for (const a of adj) {
    const r = await descargarUrl(a.url);
    if ('error' in r) {
      texto += `${texto ? '\n' : ''}[No se pudo guardar el archivo: ${r.error}.]`;
      continue;
    }
    const id = uid();
    const o = await optimizarImagen(r.mime, r.data);
    await q('insert into medios(id, lead_id, mime, nombre, data) values($1,$2,$3,$4,$5)', [id, lead.id, o.mime, a.nombre, o.data.toString('base64')]);
    adjuntos.push({ type: a.tipo, url: `/api/medios/${id}`, name: a.nombre, mime: o.mime });
  }
  const ins = await q(
    `insert into mensajes(id, lead_id, meta_id, direccion, texto, autor, adjuntos, creado)
     values($1,$2,$3,'in',$4,'',$5::jsonb,$6)
     on conflict do nothing
     returning id`,
    [uid(), lead.id, mid || null, texto, JSON.stringify(adjuntos), toDate(Number(ev.timestamp) ? Math.floor(Number(ev.timestamp) / 1000) : undefined)],
  );
  if (!ins.length) return 'mensaje repetido, ignorado';
  return creado ? `lead creado (${canal}) y mensaje guardado` : `mensaje guardado (${canal})`;
}

async function procesarSocial(p: any): Promise<string> {
  const canal: CanalSocial = p.object === 'instagram' ? 'instagram' : 'facebook';
  if (!(await canalActivo('meta'))) return 'ignorado (Instagram y Facebook están desactivados en Admin)';
  const res: string[] = [];
  for (const e of Array.isArray(p.entry) ? p.entry : []) {
    for (const ev of Array.isArray(e.messaging) ? e.messaging : []) {
      const r = await recibirSocial(canal, ev);
      if (r) res.push(r);
    }
  }
  return res.length ? res.join('; ') : 'sin mensajes';
}

/** Procesa un aviso (webhook) de Meta: WhatsApp, Instagram o Facebook. Devuelve un texto corto para el registro de avisos. */
export async function procesarMeta(p: any): Promise<string> {
  if (p?.object === 'page' || p?.object === 'instagram') return procesarSocial(p);
  if (p?.object !== 'whatsapp_business_account') return `ignorado (${p?.object || 'sin tipo'})`;
  if (!(await canalActivo('whatsapp'))) return 'ignorado (WhatsApp directo está desactivado en Admin)';
  const mi = waConfig().phoneId;
  const res: string[] = [];
  for (const e of Array.isArray(p.entry) ? p.entry : []) {
    for (const ch of Array.isArray(e.changes) ? e.changes : []) {
      if (ch.field !== 'messages') continue;
      const v = ch.value || {};
      // Si la app recibe avisos de varios números, solo se atiende el configurado.
      if (mi && v.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== mi) {
        res.push('ignorado (es de otro número)');
        continue;
      }
      const nombres = new Map<string, string>();
      for (const c of v.contacts || []) nombres.set(digits(c.wa_id), String(c.profile?.name || ''));
      for (const m of v.messages || []) res.push(await recibirWa(m, nombres.get(digits(m.from)) || ''));
      for (const s of v.statuses || []) {
        const r = await actualizarEstado(s);
        if (r) res.push(r);
      }
    }
  }
  return res.length ? res.join('; ') : 'sin mensajes';
}
