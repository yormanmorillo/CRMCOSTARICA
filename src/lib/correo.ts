import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { q } from './db';
import { HttpError, uid, hoyCR } from './util';
import { ETAPA_INICIAL_SQL, canalActivo, getAjuste, logAct, setSetting } from './leads';
import { optimizarImagen } from './almacen';

/* ---------------- Configuración (la contraseña se guarda cifrada) ---------------- */
export type CfgCorreo = {
  imapHost: string; imapPort: number; imapSecure: boolean;
  smtpHost: string; smtpPort: number; smtpSecure: boolean;
  usuario: string; pass: string; nombre: string; ignorar: string[];
};
const VACIA: CfgCorreo = { imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true, usuario: '', pass: '', nombre: '', ignorar: [] };

const llave = () => {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 16) throw new HttpError(500, 'Falta la variable AUTH_SECRET (mínimo 16 caracteres).');
  return createHash('sha256').update('correo:' + s).digest();
};
const cifrar = (t: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(), iv);
  const d = Buffer.concat([c.update(t, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), d].map((b) => b.toString('base64')).join('.');
};
const descifrar = (t: string) => {
  try {
    const [iv, tag, d] = t.split('.').map((x) => Buffer.from(x, 'base64'));
    const c = createDecipheriv('aes-256-gcm', llave(), iv);
    c.setAuthTag(tag);
    return Buffer.concat([c.update(d), c.final()]).toString('utf8');
  } catch {
    return '';
  }
};

export async function leerCfg(): Promise<CfgCorreo> {
  try {
    const j = JSON.parse((await getAjuste('correo_cfg')) || '{}');
    return { ...VACIA, ...j, pass: j.passEnc ? descifrar(j.passEnc) : '' };
  } catch {
    return { ...VACIA };
  }
}
export async function cfgPublica() {
  const c = await leerCfg();
  const { pass, ...resto } = c;
  return { ...resto, tienePass: !!pass };
}
const texto = (v: any, max = 200) => String(v ?? '').trim().slice(0, max);
const puerto = (v: any, def: number) => {
  const n = parseInt(v, 10);
  return n > 0 && n < 65536 ? n : def;
};
export async function guardarCfg(b: any) {
  const a = await leerCfg();
  const ign = (Array.isArray(b.ignorar) ? b.ignorar : String(b.ignorar ?? '').split(/[\n,;]+/)).map((x: string) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 200);
  const nueva: CfgCorreo = {
    imapHost: texto(b.imapHost ?? a.imapHost),
    imapPort: puerto(b.imapPort, a.imapPort),
    imapSecure: b.imapSecure != null ? !!b.imapSecure : 'imapPort' in b ? puerto(b.imapPort, 993) !== 143 : a.imapSecure,
    smtpHost: texto(b.smtpHost ?? a.smtpHost),
    smtpPort: puerto(b.smtpPort, a.smtpPort),
    smtpSecure: b.smtpSecure != null ? !!b.smtpSecure : 'smtpPort' in b ? puerto(b.smtpPort, 465) === 465 : a.smtpSecure,
    usuario: texto(b.usuario ?? a.usuario),
    pass: b.pass ? String(b.pass).slice(0, 300) : a.pass,
    nombre: texto(b.nombre ?? a.nombre, 80),
    ignorar: 'ignorar' in b ? ign : a.ignorar,
  };
  const { pass, ...rest } = nueva;
  await setSetting('correo_cfg', JSON.stringify({ ...rest, passEnc: pass ? cifrar(pass) : '' }));
  // Solo entran los correos recibidos desde que se configuró el buzón: no se importa el historial.
  if (!(await getAjuste('correo_desde')) && listo(nueva)) await setSetting('correo_desde', new Date().toISOString());
}
export const listo = (c: CfgCorreo) => !!(c.imapHost && c.usuario && c.pass);

export async function estadoCorreo() {
  try {
    return JSON.parse((await getAjuste('correo_estado')) || 'null');
  } catch {
    return null;
  }
}
const guardarEstado = (e: { ok: boolean; msg: string; nuevos?: number }) => setSetting('correo_estado', JSON.stringify({ ...e, cuando: new Date().toISOString() }));

/** Correos del simulador (/demo): no se envía nada de verdad. */
export const esDemoCorreo = (e: string) => /@(ejemplo\.com|demo\.test)$/i.test(e || '');

/* ---------------- Lectura de un correo ---------------- */
const aTexto = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Quita lo citado de mensajes anteriores, para guardar solo lo nuevo. */
export function limpiarCuerpo(t: string) {
  const L = t.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const l of L) {
    if (/^(El .{5,120} escribi[oó]:|On .{5,120} wrote:|-{2,}\s*(Original Message|Mensaje original)|_{5,}|De:\s.+|From:\s.+)\s*$/i.test(l.trim())) break;
    if (/^>/.test(l.trim())) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
}

const PERMITIDOS = /^(image\/(jpe?g|png|webp|gif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel)|text\/(plain|csv))$/i;
const MAX_ADJ = 4 * 1024 * 1024;

export type Entrante = {
  de: string; nombre?: string; asunto?: string; texto: string; messageId?: string; fecha?: Date;
  adjuntos?: { mime: string; nombre: string; data: Buffer }[];
};

export async function recibirCorreo(m: Entrante): Promise<string> {
  const email = m.de.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'ignorado (remitente no válido)';
  const mid = (m.messageId || '').trim() || 'sin-id-' + uid();
  if ((await q('select 1 from mensajes where meta_id=$1', [mid])).length) return 'mensaje repetido, ignorado';
  const asunto = (m.asunto || '').trim().slice(0, 200);
  let cuerpo = m.texto;

  let lead: any = (await q("select * from leads where chat_canal='correo' and chat_id=$1", [email]))[0];
  if (!lead) lead = (await q('select * from leads where lower(email)=$1 order by creado limit 1', [email]))[0];
  let creado = false;
  if (!lead) {
    const dias = parseInt((await getAjuste('avisoDias')) ?? '', 10);
    const nombre = (m.nombre || '').trim() || email.split('@')[0];
    const rows = await q(
      `insert into leads(id, nombre, email, canal, interes, aviso_dias, creado, auto, chat_canal, chat_id, etapa)
       values($1,$2,$3,'correo',$4,$5,$6,true,'correo',$3,${ETAPA_INICIAL_SQL})
       on conflict (chat_canal, chat_id) where chat_id is not null do nothing
       returning *`,
      [uid(), nombre.slice(0, 100), email, (asunto || cuerpo).slice(0, 500), Number.isNaN(dias) ? 5 : dias, hoyCR()],
    );
    lead = rows[0] || (await q("select * from leads where chat_canal='correo' and chat_id=$1", [email]))[0];
    creado = !!rows.length;
    if (creado) await logAct(lead.id, 'creado', 'Lead creado desde un correo (automático)');
  } else if (!lead.chat_id) {
    // Ya era un lead conocido (por teléfono, formulario…): desde ahora también se le responde por correo.
    await q("update leads set chat_canal='correo', chat_id=$1 where id=$2 and chat_id is null", [email, lead.id]);
  }

  const adjuntos: any[] = [];
  let n = 0;
  for (const a of m.adjuntos || []) {
    if (++n > 5 || !PERMITIDOS.test(a.mime) || a.data.length > MAX_ADJ) {
      cuerpo += `\n[adjunto no guardado: ${a.nombre || 'archivo'}]`;
      continue;
    }
    const o = await optimizarImagen(a.mime, a.data);
    const id = uid();
    await q('insert into medios(id, lead_id, mime, nombre, data) values($1,$2,$3,$4,$5)', [id, lead.id, o.mime, a.nombre || '', o.data.toString('base64')]);
    adjuntos.push({ type: /^image\//.test(o.mime) ? 'image' : 'document', url: `/api/medios/${id}`, name: a.nombre || '', mime: o.mime });
  }
  const ins = await q(
    `insert into mensajes(id, lead_id, meta_id, direccion, texto, autor, adjuntos, asunto, canal, creado)
     values($1,$2,$3,'in',$4,'',$5::jsonb,$6,'correo',$7)
     on conflict do nothing returning id`,
    [uid(), lead.id, mid, cuerpo.trim(), JSON.stringify(adjuntos), asunto, m.fecha && !isNaN(+m.fecha) ? m.fecha : new Date()],
  );
  if (!ins.length) return 'mensaje repetido, ignorado';
  return creado ? 'lead creado (correo) y mensaje guardado' : 'mensaje guardado (correo)';
}

function esAutomatico(p: any, de: string, cfg: CfgCorreo): string {
  const h = (k: string) => String(p.headers?.get?.(k) ?? '').toLowerCase();
  if (cfg.usuario && de === cfg.usuario.toLowerCase()) return 'es del propio buzón';
  if (/^(mailer-daemon|postmaster)@/.test(de) || /(^|[._+-])(no-?reply|do-?not-?reply|notificaciones?|notifications?)@/.test(de)) return 'remitente automático';
  const au = h('auto-submitted');
  if (au && au !== 'no') return 'respuesta automática';
  if (/bulk|junk|list/.test(h('precedence')) || h('x-autoreply') || h('x-autorespond') || p.headers?.has?.('list-unsubscribe') || p.headers?.has?.('list')) return 'boletín o lista';
  for (const r of cfg.ignorar) {
    const x = r.replace(/^@/, '');
    if (de === r || de.endsWith('@' + x)) return 'en la lista de ignorados';
  }
  return '';
}

/** Procesa un correo completo (el mismo camino para el buzón real y para pegar un .eml en la demo). */
export async function procesarFuente(raw: Buffer | string, cfgIn?: CfgCorreo): Promise<string> {
  const { simpleParser } = await import('mailparser');
  const cfg = cfgIn || (await leerCfg());
  const p: any = await simpleParser(raw as any);
  const de = String(p.from?.value?.[0]?.address || '').toLowerCase();
  if (!de) return 'ignorado (sin remitente)';
  const motivo = esAutomatico(p, de, cfg);
  if (motivo) return `ignorado (${motivo})`;
  const cuerpo = limpiarCuerpo(p.text || (p.html ? aTexto(String(p.html)) : ''));
  const adjuntos = (p.attachments || [])
    .filter((a: any) => !(a.related && /^image\//.test(a.contentType) && a.size < 20000))
    .map((a: any) => ({ mime: a.contentType || 'application/octet-stream', nombre: a.filename || '', data: a.content as Buffer }));
  if (!cuerpo && !adjuntos.length && !p.subject) return 'ignorado (sin contenido)';
  return recibirCorreo({ de, nombre: p.from?.value?.[0]?.name, asunto: p.subject, texto: cuerpo, messageId: p.messageId, fecha: p.date, adjuntos });
}

/* ---------------- Buzón (IMAP) ---------------- */
const opcionesImap = (c: CfgCorreo) => ({
  host: c.imapHost, port: c.imapPort, secure: c.imapSecure,
  auth: { user: c.usuario, pass: c.pass },
  logger: false as const, emitLogs: false, socketTimeout: 30000, greetingTimeout: 15000, connectionTimeout: 15000,
});
const msgError = (e: any) => {
  const t = String(e?.responseText || e?.message || e || '');
  if (/AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(t)) return 'Usuario o contraseña incorrectos. En Gmail y Microsoft 365 hace falta una contraseña de aplicación.';
  if (/ENOTFOUND|EAI_AGAIN/.test(t)) return 'No se encontró el servidor. Revisa la dirección.';
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(t)) return 'No se pudo conectar al servidor. Revisa la dirección, el puerto y si usa SSL.';
  return t.slice(0, 200) || 'No se pudo conectar';
};

let revisando = false;
export async function revisarCorreo(): Promise<{ nuevos: number; ignorados: number; msg: string }> {
  const cfg = await leerCfg();
  if (!listo(cfg)) throw new HttpError(400, 'Falta configurar el buzón de correo.');
  if (revisando) return { nuevos: 0, ignorados: 0, msg: 'Ya se está revisando' };
  revisando = true;
  let nuevos = 0, ignorados = 0;
  try {
    const { ImapFlow } = await import('imapflow');
    const cli = new ImapFlow(opcionesImap(cfg));
    cli.on('error', () => {});
    await cli.connect();
    const lock = await cli.getMailboxLock('INBOX');
    try {
      const desde = new Date((await getAjuste('correo_desde')) || Date.now());
      const uids: number[] = ((await cli.search({ seen: false, since: new Date(desde.getTime() - 86400000) }, { uid: true })) as number[]) || [];
      for (const u of uids.slice(0, 40)) {
        const m: any = await cli.fetchOne(String(u), { source: true, internalDate: true }, { uid: true });
        if (!m?.source) continue;
        if (m.internalDate && new Date(m.internalDate) < desde) continue;
        const r = await procesarFuente(m.source, cfg).catch((e) => 'error: ' + e.message);
        if (/^(lead creado|mensaje guardado)/.test(r)) nuevos++; else ignorados++;
        await q('insert into eventos_cw(evento, payload, resultado) values($1,$2::jsonb,$3)', ['correo', JSON.stringify({ uid: u }), r]);
        await cli.messageFlagsAdd(String(u), ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
    await cli.logout();
    const msg = nuevos ? `${nuevos} correo(s) nuevo(s)` : 'Sin correos nuevos';
    await guardarEstado({ ok: true, msg, nuevos });
    return { nuevos, ignorados, msg };
  } catch (e: any) {
    const msg = msgError(e);
    await guardarEstado({ ok: false, msg });
    throw new HttpError(502, msg);
  } finally {
    revisando = false;
  }
}

export async function probarCorreo(b?: any) {
  const base = await leerCfg();
  const cfg: CfgCorreo = b && Object.keys(b).length ? { ...base, ...b, pass: b.pass || base.pass } : base;
  if (!listo(cfg)) throw new HttpError(400, 'Completa servidor, usuario y contraseña.');
  const res: any = {};
  try {
    const { ImapFlow } = await import('imapflow');
    const cli = new ImapFlow(opcionesImap(cfg));
    cli.on('error', () => {});
    await cli.connect();
    await cli.logout();
    res.imap = 'ok';
  } catch (e: any) {
    throw new HttpError(400, 'Recibir correos: ' + msgError(e));
  }
  try {
    const nm = await import('nodemailer');
    const t = nm.createTransport({ host: cfg.smtpHost || cfg.imapHost.replace(/^imap\./, 'smtp.'), port: cfg.smtpPort, secure: cfg.smtpSecure, auth: { user: cfg.usuario, pass: cfg.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    await t.verify();
    res.smtp = 'ok';
  } catch (e: any) {
    res.smtp = 'error: ' + msgError(e);
  }
  return res;
}

/* ---------------- Envío (SMTP) ---------------- */
export async function enviarCorreo(para: string, asunto: string, cuerpo: string, ref?: { id?: string; refs?: string }): Promise<string> {
  if (esDemoCorreo(para)) return '<demo-' + uid() + '@demo.test>';
  const cfg = await leerCfg();
  if (!listo(cfg)) throw new HttpError(503, 'El correo no está conectado. Un administrador debe configurarlo en Admin, Canales.');
  const nm = await import('nodemailer');
  const t = nm.createTransport({ host: cfg.smtpHost || cfg.imapHost.replace(/^imap\./, 'smtp.'), port: cfg.smtpPort, secure: cfg.smtpSecure, auth: { user: cfg.usuario, pass: cfg.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try {
    const r = await t.sendMail({
      from: cfg.nombre ? { name: cfg.nombre, address: cfg.usuario } : cfg.usuario,
      to: para, subject: asunto, text: cuerpo,
      ...(ref?.id ? { inReplyTo: ref.id, references: ref.refs ? ref.refs + ' ' + ref.id : ref.id } : {}),
    });
    return String(r.messageId || '');
  } catch (e: any) {
    throw new HttpError(502, 'No se pudo enviar el correo: ' + msgError(e));
  }
}

/* ---------------- Revisión automática ---------------- */
let ultimo = 0;
/** Revisa el buzón como máximo una vez por minuto, cuando alguien usa el sistema o cuando lo pide la tarea programada. */
export async function revisionAutomatica() {
  if (Date.now() - ultimo < 60000) return;
  ultimo = Date.now();
  if (!(await canalActivo('correo')) || !listo(await leerCfg())) return;
  await revisarCorreo().catch(() => {});
}
let timer: any;
export function iniciarRevision() {
  if (timer || process.env.VERCEL) return; // en Vercel no hay procesos permanentes: se usa la tarea programada
  timer = setInterval(() => { revisionAutomatica().catch(() => {}); }, 90000);
  timer.unref?.();
}
