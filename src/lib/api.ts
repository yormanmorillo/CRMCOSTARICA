import { q } from './db';
import { HttpError, json, uid, hoyCR, isDate, str, clamp, safeEqual } from './util';
import { login, sessionCookie, clearCookie, hashPassword } from './auth';
import { loadState, loadLead, getSettings, setSetting, mapTarea, getEtapas, logAct, canalActivo, siguienteEtapa, ETAPA_INICIAL_SQL, CANALES, TIPOS } from './leads';
import { cwConfig, enviarMensaje, verifySignature } from './chatwoot';
import { procesarEvento, registrarRespuesta } from './webhook';
import { enviarWhatsApp, enviarSocial, fbConfig, probarWhatsApp, procesarMeta, verifyMetaSignature, ventanaWhatsApp, waConfig } from './meta';
import { route, body, oneOf, mustLead } from './router';
import { estadoLicencia } from './licencia';
import { limpiezaAutomatica } from './almacen';
import './api-admin';
import './api-canales';

export { dispatch } from './router';

/* ---------- Sesión ---------- */
route('POST', '/auth/login', async ({ req }) => {
  const b = await body(req);
  const user = await login(String(b.email || ''), String(b.password || ''));
  return json({ ok: true, user }, 200, { 'set-cookie': await sessionCookie(user, req) });
}, { public: true });

route('POST', '/auth/logout', async ({ req }) => json({ ok: true }, 200, { 'set-cookie': clearCookie(req) }), { public: true });

route('GET', '/state', async ({ user }) => {
  limpiezaAutomatica().catch(() => {});
  return json(await loadState(user!));
});

/* ---------- Leads ---------- */
const etiquetasValidas = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  const out: string[] = [];
  for (const x of arr) {
    const t = str(x, 30);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 12);
};

route('POST', '/leads', async ({ req, user }) => {
  const b = await body(req);
  const nombre = str(b.nombre, 200);
  if (!nombre) throw new HttpError(400, 'El nombre es obligatorio');
  const s = await getSettings();
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'cr';
  const llegada = isDate(b.llegada) ? b.llegada : '';
  const canal = CANALES.includes(b.canal) ? b.canal : 'otro';
  const id = uid();
  await q(
    `insert into leads(id,nombre,tel,email,canal,tipo,cedula,provincia,pais,pasaporte,interes,llegada,aviso_dias,creado,empresa,asignado,etiquetas,etapa)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,${ETAPA_INICIAL_SQL})`,
    [
      id, nombre, str(b.tel, 40), str(b.email, 200), canal, tipo,
      tipo === 'cr' ? str(b.cedula, 40) : '', tipo === 'cr' ? str(b.provincia, 40) : '',
      tipo === 'ext' ? str(b.pais, 80) : '', tipo === 'ext' ? str(b.pasaporte, 40) : '',
      str(b.interes, 1000), llegada, clamp(b.avisoDias, 0, 90, s.avisoDias), hoyCR(),
      str(b.empresa, 120), user!.id, JSON.stringify(etiquetasValidas(b.etiquetas)),
    ],
  );
  await logAct(id, 'creado', canal === 'llamada' ? 'Lead creado a mano (llamada)' : 'Lead creado a mano', user!.nombre);
  return json({ lead: await loadLead(id) }, 201);
});

route('PATCH', '/leads/:id', async ({ req, params, user }) => {
  const cur = await mustLead(params.id);
  const b = await body(req);
  const cols: string[] = [];
  const vals: any[] = [];
  const set = (c: string, v: any, cast = '') => {
    vals.push(v);
    cols.push(`${c}=$${vals.length}${cast}`);
  };
  const log: [string, string][] = [];
  const texto: [string, string, number][] = [
    ['nombre', 'nombre', 200], ['tel', 'tel', 40], ['email', 'email', 200], ['cedula', 'cedula', 40], ['empresa', 'empresa', 120],
    ['provincia', 'provincia', 40], ['pais', 'pais', 80], ['pasaporte', 'pasaporte', 40], ['interes', 'interes', 1000],
  ];
  for (const [k, col, max] of texto) if (k in b) set(col, str(b[k], max));
  if ('canal' in b) set('canal', oneOf(b.canal, CANALES, 'canal'));
  if ('tipo' in b) set('tipo', oneOf(b.tipo, TIPOS, 'tipo'));
  if ('destacado' in b) set('destacado', !!b.destacado);
  if ('etiquetas' in b) set('etiquetas', JSON.stringify(etiquetasValidas(b.etiquetas)), '::jsonb');
  if ('asignado' in b) {
    const a = String(b.asignado || '');
    let nombre = 'nadie';
    if (a) {
      const u = (await q('select nombre from usuarios where id=$1', [a]))[0];
      if (!u) throw new HttpError(400, 'Ese usuario no existe');
      nombre = u.nombre;
    }
    if (a !== (cur.asignado || '')) {
      set('asignado', a || null);
      log.push(['asignado', `Asignado a ${nombre}`]);
    }
  }
  if ('etapa' in b && String(b.etapa) !== cur.etapa) {
    const et = await getEtapas();
    const dest = et.find((e) => e.clave === String(b.etapa));
    if (!dest) throw new HttpError(400, 'Valor no válido en etapa');
    set('etapa', dest.clave);
    set('etapa_en', new Date(), '::timestamptz');
    if (dest.tipo === 'perdida') {
      const mot = (await q('select id, nombre from motivos_perdida where id=$1', [String(b.motivoId || '')]))[0];
      const hayMotivos = (await q('select 1 from motivos_perdida where activo=true limit 1')).length > 0;
      if (hayMotivos && !mot) throw new HttpError(400, 'Elige por qué no se concretó este lead.');
      set('motivo_id', mot ? mot.id : null);
      set('motivo_nota', str(b.motivoNota, 500));
      set('perdido_en', new Date(), '::timestamptz');
      log.push(['perdido', `Marcado como ${dest.nombre}${mot ? ': ' + mot.nombre : ''}${b.motivoNota ? ' (' + str(b.motivoNota, 200) + ')' : ''}`]);
    } else {
      set('motivo_id', null);
      set('motivo_nota', '');
      set('perdido_en', null);
      const antes = et.find((e) => e.clave === cur.etapa);
      log.push([dest.tipo === 'ganada' ? 'ganado' : 'etapa', `Etapa: ${antes ? antes.nombre : cur.etapa} → ${dest.nombre}`]);
    }
  } else if ('motivoId' in b && cur.perdido_en) {
    // Corregir el motivo de un lead que ya estaba perdido.
    const mot = (await q('select id, nombre from motivos_perdida where id=$1', [String(b.motivoId || '')]))[0];
    if (!mot) throw new HttpError(400, 'Ese motivo no existe');
    set('motivo_id', mot.id);
    if ('motivoNota' in b) set('motivo_nota', str(b.motivoNota, 500));
    log.push(['perdido', `Motivo corregido: ${mot.nombre}`]);
  }
  if ('llegada' in b) {
    const v = String(b.llegada || '');
    if (v && !isDate(v)) throw new HttpError(400, 'Fecha de llegada no válida');
    set('llegada', v);
    if (v !== cur.llegada && !('avisado' in b)) set('avisado', false);
  }
  if ('avisoDias' in b) set('aviso_dias', clamp(b.avisoDias, 0, 90, 5));
  if ('avisado' in b) set('avisado', !!b.avisado);
  if (cols.length) {
    vals.push(params.id);
    await q(`update leads set ${cols.join(', ')}, actualizado=now() where id=$${vals.length}`, vals);
    for (const [t, x] of log) await logAct(params.id, t, x, user!.nombre);
  }
  return json({ lead: await loadLead(params.id) });
});

route('DELETE', '/leads/:id', async ({ params }) => {
  await mustLead(params.id);
  await q('delete from leads where id=$1', [params.id]);
  return json({ ok: true });
});

/* ---------- Atenciones ---------- */
route('POST', '/leads/:id/atenciones', async ({ req, params, user }) => {
  const lead = await mustLead(params.id);
  const b = await body(req);
  const nota = str(b.nota, 2000);
  if (!nota) throw new HttpError(400, 'Escribe qué se habló');
  const fecha = isDate(b.fecha) ? b.fecha : hoyCR();
  const canal = str(b.canal, 30);
  await q('insert into atenciones(id, lead_id, fecha, canal, nota) values($1,$2,$3,$4,$5)', [uid(), lead.id, fecha, canal, nota]);
  const sig = await siguienteEtapa(lead.etapa);
  if (sig) await q('update leads set etapa=$2, etapa_en=now(), actualizado=now() where id=$1', [lead.id, sig]);
  await logAct(lead.id, 'atencion', `Atención${canal ? ' por ' + canal : ''}: ${nota.slice(0, 140)}`, user!.nombre);
  return json({ lead: await loadLead(lead.id) }, 201);
});

route('DELETE', '/atenciones/:id', async ({ params }) => {
  const r = await q('delete from atenciones where id=$1 returning lead_id', [params.id]);
  if (!r.length) throw new HttpError(404, 'Atención no encontrada');
  return json({ lead: await loadLead(r[0].lead_id) });
});

/* ---------- Tareas ---------- */
route('POST', '/tareas', async ({ req }) => {
  const b = await body(req);
  const titulo = str(b.titulo, 300);
  if (!titulo) throw new HttpError(400, 'Escribe la tarea');
  if (!isDate(b.fecha)) throw new HttpError(400, 'Elige una fecha');
  let leadId: string | null = null;
  if (b.leadId) leadId = (await mustLead(String(b.leadId))).id;
  const hora = /^\d{2}:\d{2}$/.test(String(b.hora || '')) ? b.hora : '';
  const id = uid();
  await q('insert into tareas(id, lead_id, titulo, fecha, hora) values($1,$2,$3,$4,$5)', [id, leadId, titulo, b.fecha, hora]);
  const t = (await q('select * from tareas where id=$1', [id]))[0];
  return json({ tarea: mapTarea(t) }, 201);
});

route('PATCH', '/tareas/:id', async ({ req, params }) => {
  const b = await body(req);
  const r = await q('update tareas set hecha=$1 where id=$2 returning *', [!!b.hecha, params.id]);
  if (!r.length) throw new HttpError(404, 'Tarea no encontrada');
  return json({ tarea: mapTarea(r[0]) });
});

route('DELETE', '/tareas/:id', async ({ params }) => {
  await q('delete from tareas where id=$1', [params.id]);
  return json({ ok: true });
});

/* ---------- Archivos (imágenes) ---------- */
route('POST', '/leads/:id/archivos', async ({ req, params }) => {
  await mustLead(params.id);
  const b = await body(req);
  const data = String(b.data || '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, 'Solo se aceptan imágenes JPG, PNG o WebP');
  if (data.length > 2_500_000) throw new HttpError(413, 'La imagen es demasiado pesada');
  const id = uid();
  const nombre = str(b.nombre, 120) || 'imagen';
  await q('insert into archivos(id, lead_id, nombre, data) values($1,$2,$3,$4)', [id, params.id, nombre, data]);
  return json({ archivo: { id, nombre } }, 201);
});

route('GET', '/archivos/:id', async ({ params }) => {
  const r = (await q('select data from archivos where id=$1', [params.id]))[0];
  if (!r) throw new HttpError(404, 'Archivo no encontrado');
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(r.data);
  if (!m) throw new HttpError(500, 'Archivo dañado');
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=86400' } });
});

route('DELETE', '/archivos/:id', async ({ params }) => {
  await q('delete from archivos where id=$1', [params.id]);
  return json({ ok: true });
});

/* ---------- Conversaciones ---------- */
const tieneChat = (l: any) => !!(l.chat_id || l.cw_conversation_id);
const porWhatsApp = (l: any) => l.chat_canal === 'whatsapp' && !!l.chat_id;
const porSocial = (l: any) => (l.chat_canal === 'instagram' || l.chat_canal === 'facebook') && !!l.chat_id;

route('GET', '/leads/:id/mensajes', async ({ params }) => {
  const lead = await mustLead(params.id);
  const rows = await q(
    'select id, direccion, texto, autor, adjuntos, estado, creado from mensajes where lead_id=$1 order by creado asc, n asc limit 300',
    [params.id],
  );
  const wa = porWhatsApp(lead);
  const so = porSocial(lead);
  return json({
    mensajes: rows,
    tieneChat: tieneChat(lead),
    canal: wa ? 'whatsapp' : so ? lead.chat_canal : lead.cw_conversation_id ? 'chatwoot' : '',
    configurado: wa ? waConfig().ok && (await canalActivo('whatsapp')) : so ? fbConfig().ok && (await canalActivo('meta')) : cwConfig().ok && (await canalActivo('chatwoot')),
    ventana: wa || so ? await ventanaWhatsApp(lead.id) : null,
  });
});

route('POST', '/leads/:id/mensajes', async ({ req, params, user }) => {
  const lead = await mustLead(params.id);
  const texto = str((await body(req)).texto, 4000);
  if (!texto) throw new HttpError(400, 'Escribe el mensaje');
  if (!tieneChat(lead)) throw new HttpError(400, 'Este lead todavía no tiene una conversación');

  if (porWhatsApp(lead)) {
    if (!(await canalActivo('whatsapp'))) throw new HttpError(409, 'La conexión directa de WhatsApp está desactivada en Admin, Canales.');
    const v = await ventanaWhatsApp(lead.id);
    if (!v.abierta) {
      throw new HttpError(409, 'Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo permite responder después con una plantilla aprobada por Meta. Espera a que el cliente escriba de nuevo.');
    }
    const wamid = await enviarWhatsApp(lead.chat_id, texto);
    const rows = await q(
      `insert into mensajes(id, lead_id, meta_id, direccion, texto, autor, estado)
       values($1,$2,$3,'out',$4,$5,'enviado')
       on conflict do nothing
       returning id, direccion, texto, autor, adjuntos, estado, creado`,
      [uid(), lead.id, wamid || null, texto, user!.nombre],
    );
    await registrarRespuesta(lead, user!.nombre);
    return json({ mensaje: rows[0] || null }, 201);
  }

  if (porSocial(lead)) {
    const nombre = lead.chat_canal === 'instagram' ? 'Instagram' : 'Facebook';
    if (!(await canalActivo('meta'))) throw new HttpError(409, 'Instagram y Facebook están desactivados en Admin, Canales.');
    const v = await ventanaWhatsApp(lead.id);
    if (!v.abierta) throw new HttpError(409, `Pasaron más de 24 horas desde el último mensaje del cliente. ${nombre} solo permite responder dentro de ese tiempo. Espera a que el cliente escriba de nuevo.`);
    const mid = await enviarSocial(lead.chat_canal, lead.chat_id, texto);
    const rows = await q(
      `insert into mensajes(id, lead_id, meta_id, direccion, texto, autor, estado)
       values($1,$2,$3,'out',$4,$5,'enviado')
       on conflict do nothing
       returning id, direccion, texto, autor, adjuntos, estado, creado`,
      [uid(), lead.id, mid || null, texto, user!.nombre],
    );
    await registrarRespuesta(lead, user!.nombre);
    return json({ mensaje: rows[0] || null }, 201);
  }

  if (!(await canalActivo('chatwoot'))) throw new HttpError(409, 'Chatwoot está desactivado. Actívalo en Admin, Canales.');
  const r = await enviarMensaje(lead.cw_conversation_id, texto);
  const cwId = r?.id != null ? String(r.id) : null;
  const id = uid();
  const rows = await q(
    `insert into mensajes(id, lead_id, cw_message_id, cw_conversation_id, direccion, texto, autor)
     values($1,$2,$3,$4,'out',$5,$6)
     on conflict (cw_message_id) do update set autor = excluded.autor
     returning id, direccion, texto, autor, adjuntos, estado, creado`,
    [id, lead.id, cwId, lead.cw_conversation_id, texto, user!.nombre],
  );
  await registrarRespuesta(lead, user!.nombre);
  return json({ mensaje: rows[0] }, 201);
});

/* ---------- Archivos que mandan los clientes por WhatsApp ---------- */
const MIME_VISIBLE = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp)|application\/pdf)$/;

route('GET', '/medios/:id', async ({ params }) => {
  const r = (await q('select mime, nombre, data from medios where id=$1', [params.id]))[0];
  if (!r) throw new HttpError(404, 'Archivo no encontrado');
  const visible = MIME_VISIBLE.test(r.mime);
  const nombre = String(r.nombre || 'archivo').replace(/[^\w.\- ]/g, '_');
  return new Response(Buffer.from(r.data, 'base64'), {
    headers: {
      'content-type': visible ? r.mime : 'application/octet-stream',
      'content-disposition': `${visible ? 'inline' : 'attachment'}; filename="${nombre}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
      'cache-control': 'private, max-age=86400',
    },
  });
});

/* ---------- Ajustes y usuarios ---------- */
const TOGGLES: Record<string, string> = { chatwootActivo: 'chatwoot', whatsappActivo: 'whatsapp', metaActivo: 'meta', webActivo: 'web' };
route('PATCH', '/ajustes', async ({ req }) => {
  const b = await body(req);
  if ('negocio' in b) await setSetting('negocio', str(b.negocio, 80) || 'Pulso CRM');
  if ('avisoDias' in b) await setSetting('avisoDias', clamp(b.avisoDias, 0, 90, 5));
  if ('retencionDias' in b) {
    const d = Number(b.retencionDias);
    if (![0, 30, 90, 180, 365].includes(d)) throw new HttpError(400, 'Elige 0, 30, 90, 180 o 365 días');
    await setSetting('retencionDias', d);
  }
  for (const [k, canal] of Object.entries(TOGGLES)) if (k in b) await setSetting('canal_' + canal, b[k] ? '1' : '0');
  const st = await getSettings();
  return json({ settings: st, canales: { chatwoot: await canalActivo('chatwoot'), whatsapp: await canalActivo('whatsapp'), meta: await canalActivo('meta'), web: await canalActivo('web') } });
}, { admin: true });

route('GET', '/usuarios', async () => {
  return json({ usuarios: await q('select id, email, nombre, rol from usuarios order by creado') });
}, { admin: true });

route('POST', '/usuarios', async ({ req }) => {
  const b = await body(req);
  const email = str(b.email, 200).toLowerCase();
  const nombre = str(b.nombre, 100);
  const password = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Correo no válido');
  if (!nombre) throw new HttpError(400, 'Escribe el nombre');
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  const lic = await estadoLicencia();
  if (lic.usuarios > 0) {
    const n = (await q('select count(*)::int as n from usuarios'))[0].n;
    if (n >= lic.usuarios) throw new HttpError(402, `Tu licencia permite ${lic.usuarios} usuarios. Pide una licencia con más usuarios para agregar otro.`);
  }
  const rol = b.rol === 'admin' ? 'admin' : 'vendedor';
  const rows = await q(
    'insert into usuarios(id, email, nombre, rol, hash) values($1,$2,$3,$4,$5) on conflict (email) do nothing returning id, email, nombre, rol',
    [uid(), email, nombre, rol, hashPassword(password)],
  );
  if (!rows.length) throw new HttpError(409, 'Ya existe un usuario con ese correo');
  return json({ usuario: rows[0] }, 201);
}, { admin: true });

route('PATCH', '/usuarios/:id', async ({ req, params, user }) => {
  const b = await body(req);
  const cur = (await q('select * from usuarios where id=$1', [params.id]))[0];
  if (!cur) throw new HttpError(404, 'Usuario no encontrado');
  const cols: string[] = [];
  const vals: any[] = [];
  const set = (c: string, v: any) => {
    vals.push(v);
    cols.push(`${c}=$${vals.length}`);
  };
  if ('nombre' in b) {
    const n = str(b.nombre, 100);
    if (!n) throw new HttpError(400, 'Escribe el nombre');
    set('nombre', n);
  }
  if ('rol' in b) {
    const rol = b.rol === 'admin' ? 'admin' : 'vendedor';
    if (rol !== 'admin' && cur.rol === 'admin') {
      const admins = (await q("select count(*)::int as n from usuarios where rol='admin'"))[0].n;
      if (admins <= 1) throw new HttpError(409, 'Tiene que quedar al menos un administrador.');
    }
    set('rol', rol);
  }
  if (b.password) {
    if (String(b.password).length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
    set('hash', hashPassword(String(b.password)));
  }
  if (cols.length) {
    vals.push(params.id);
    await q(`update usuarios set ${cols.join(', ')} where id=$${vals.length}`, vals);
  }
  void user;
  return json({ usuario: (await q('select id, email, nombre, rol from usuarios where id=$1', [params.id]))[0] });
}, { admin: true });

route('DELETE', '/usuarios/:id', async ({ params, user }) => {
  if (params.id === user!.id) throw new HttpError(409, 'No puedes eliminar tu propio usuario.');
  const cur = (await q('select rol from usuarios where id=$1', [params.id]))[0];
  if (!cur) throw new HttpError(404, 'Usuario no encontrado');
  if (cur.rol === 'admin') {
    const admins = (await q("select count(*)::int as n from usuarios where rol='admin'"))[0].n;
    if (admins <= 1) throw new HttpError(409, 'Tiene que quedar al menos un administrador.');
  }
  await q('update leads set asignado=null where asignado=$1', [params.id]);
  await q('delete from usuarios where id=$1', [params.id]);
  return json({ ok: true });
}, { admin: true });

/* ---------- Chatwoot ---------- */
route('GET', '/chatwoot/estado', async ({ req }) => {
  const c = cwConfig();
  const token = process.env.WEBHOOK_TOKEN || '';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const recientes = await q("select id, evento, resultado, creado from eventos_cw where evento not in ('whatsapp','meta','web') order by id desc limit 15");
  return json({
    configurado: {
      url: c.url,
      cuenta: !!c.account,
      token: !!c.token,
      webhookToken: !!token,
      firma: !!process.env.CHATWOOT_WEBHOOK_SECRET,
    },
    activo: await canalActivo('chatwoot'),
    webhookUrl: token ? `${proto}://${host}/api/webhooks/chatwoot?token=${token}` : null,
    recientes,
  });
}, { admin: true });

async function guardarEvento(payload: any, resultado: string, evento?: string) {
  await q('insert into eventos_cw(evento, payload, resultado) values($1,$2::jsonb,$3)', [
    evento || String(payload?.event || ''),
    JSON.stringify(payload).slice(0, 60000) === JSON.stringify(payload) ? JSON.stringify(payload) : JSON.stringify({ recortado: true }),
    resultado,
  ]);
  await q('delete from eventos_cw where id < (select coalesce(max(id), 0) - 50 from eventos_cw)');
}

route('POST', '/webhooks/chatwoot', async ({ req, url }) => {
  const esperado = process.env.WEBHOOK_TOKEN || '';
  if (!esperado) throw new HttpError(503, 'Falta la variable WEBHOOK_TOKEN');
  if (!safeEqual(url.searchParams.get('token') || '', esperado)) throw new HttpError(401, 'Token no válido');
  const raw = await req.text();
  if (process.env.CHATWOOT_WEBHOOK_SECRET && !verifySignature(raw, req.headers)) throw new HttpError(401, 'Firma no válida');
  if (!(await canalActivo('chatwoot'))) return json({ ok: true, resultado: 'ignorado (Chatwoot está desactivado en Admin)' });
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON no válido');
  }
  let resultado = '';
  try {
    resultado = await procesarEvento(payload);
  } catch (e: any) {
    await guardarEvento(payload, 'error: ' + (e?.message || 'desconocido')).catch(() => {});
    throw e;
  }
  await guardarEvento(payload, resultado);
  return json({ ok: true, resultado });
}, { public: true, webhook: true });

/* ---------- WhatsApp (conexión directa con Meta) ---------- */
route('GET', '/whatsapp/estado', async ({ req }) => {
  const c = waConfig();
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const recientes = await q("select id, evento, resultado, creado from eventos_cw where evento = 'whatsapp' order by id desc limit 15");
  return json({
    configurado: { token: !!c.token, phoneId: !!c.phoneId, secreto: !!c.secret, verifyToken: !!c.verify },
    activo: await canalActivo('whatsapp'),
    webhookUrl: `${proto}://${host}/api/webhooks/meta`,
    verifyToken: c.verify || null,
    recientes,
  });
}, { admin: true });

route('POST', '/whatsapp/probar', async () => json(await probarWhatsApp()), { admin: true });

// Meta llama a esta dirección una sola vez, al guardar el webhook, para comprobar que la clave coincide.
route('GET', '/webhooks/meta', async ({ url }) => {
  const { verify } = waConfig();
  if (!verify) throw new HttpError(503, 'Falta la variable META_VERIFY_TOKEN');
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && safeEqual(url.searchParams.get('hub.verify_token') || '', verify);
  if (!ok) throw new HttpError(403, 'Clave de verificación no válida');
  return new Response(url.searchParams.get('hub.challenge') || '', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}, { public: true, webhook: true });

route('POST', '/webhooks/meta', async ({ req }) => {
  if (!waConfig().secret) throw new HttpError(503, 'Falta la variable META_APP_SECRET');
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers)) throw new HttpError(401, 'Firma no válida');
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON no válido');
  }
  let resultado = '';
  try {
    resultado = await procesarMeta(payload);
  } catch (e: any) {
    await guardarEvento(payload, 'error: ' + (e?.message || 'desconocido'), payload?.object === 'whatsapp_business_account' ? 'whatsapp' : 'meta').catch(() => {});
    // Meta reintenta los avisos que no reciben 200. Los mensajes repetidos se descartan solos.
    throw e;
  }
  await guardarEvento(payload, resultado, payload?.object === 'whatsapp_business_account' ? 'whatsapp' : 'meta');
  return json({ ok: true, resultado });
}, { public: true, webhook: true });

