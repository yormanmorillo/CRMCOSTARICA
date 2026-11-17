import { q } from './db';
import { HttpError, json, uid, hoyCR, isDate, str, clamp, safeEqual } from './util';
import { getUser, login, sessionCookie, clearCookie, hashPassword, type User } from './auth';
import { loadState, loadLead, getSettings, setSetting, mapTarea, CANALES, ETAPAS, TIPOS } from './leads';
import { cwConfig, enviarMensaje, verifySignature } from './chatwoot';
import { procesarEvento, registrarRespuesta } from './webhook';

type Ctx = { req: Request; url: URL; params: Record<string, string>; user: User | null };
type Handler = (c: Ctx) => Promise<Response>;
type Route = { method: string; re: RegExp; keys: string[]; h: Handler; public?: boolean; admin?: boolean; webhook?: boolean };

const routes: Route[] = [];
function route(method: string, path: string, h: Handler, opts: { public?: boolean; admin?: boolean; webhook?: boolean } = {}) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, h, ...opts });
}

const body = async (req: Request): Promise<any> => {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
};
const oneOf = (v: unknown, list: string[], campo: string) => {
  const s = String(v ?? '');
  if (!list.includes(s)) throw new HttpError(400, `Valor no válido en ${campo}`);
  return s;
};
async function mustLead(id: string) {
  const r = (await q('select * from leads where id=$1', [id]))[0];
  if (!r) throw new HttpError(404, 'Lead no encontrado');
  return r;
}

/* ---------- Sesión ---------- */
route('POST', '/auth/login', async ({ req }) => {
  const b = await body(req);
  const user = await login(String(b.email || ''), String(b.password || ''));
  return json({ ok: true, user }, 200, { 'set-cookie': await sessionCookie(user, req) });
}, { public: true });

route('POST', '/auth/logout', async ({ req }) => json({ ok: true }, 200, { 'set-cookie': clearCookie(req) }), { public: true });

route('GET', '/state', async ({ user }) => json(await loadState(user!)));

/* ---------- Leads ---------- */
route('POST', '/leads', async ({ req }) => {
  const b = await body(req);
  const nombre = str(b.nombre, 200);
  if (!nombre) throw new HttpError(400, 'El nombre es obligatorio');
  const s = await getSettings();
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'cr';
  const llegada = isDate(b.llegada) ? b.llegada : '';
  const id = uid();
  await q(
    `insert into leads(id,nombre,tel,email,canal,tipo,cedula,provincia,pais,pasaporte,interes,llegada,aviso_dias,creado)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, nombre, str(b.tel, 40), str(b.email, 200), CANALES.includes(b.canal) ? b.canal : 'otro', tipo,
      tipo === 'cr' ? str(b.cedula, 40) : '', tipo === 'cr' ? str(b.provincia, 40) : '',
      tipo === 'ext' ? str(b.pais, 80) : '', tipo === 'ext' ? str(b.pasaporte, 40) : '',
      str(b.interes, 1000), llegada, clamp(b.avisoDias, 0, 90, s.avisoDias), hoyCR(),
    ],
  );
  return json({ lead: await loadLead(id) }, 201);
});

route('PATCH', '/leads/:id', async ({ req, params }) => {
  const cur = await mustLead(params.id);
  const b = await body(req);
  const cols: string[] = [];
  const vals: any[] = [];
  const set = (c: string, v: any) => {
    vals.push(v);
    cols.push(`${c}=$${vals.length}`);
  };
  const texto: [string, string, number][] = [
    ['nombre', 'nombre', 200], ['tel', 'tel', 40], ['email', 'email', 200], ['cedula', 'cedula', 40],
    ['provincia', 'provincia', 40], ['pais', 'pais', 80], ['pasaporte', 'pasaporte', 40], ['interes', 'interes', 1000],
  ];
  for (const [k, col, max] of texto) if (k in b) set(col, str(b[k], max));
  if ('canal' in b) set('canal', oneOf(b.canal, CANALES, 'canal'));
  if ('tipo' in b) set('tipo', oneOf(b.tipo, TIPOS, 'tipo'));
  if ('etapa' in b) set('etapa', oneOf(b.etapa, ETAPAS, 'etapa'));
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
  }
  return json({ lead: await loadLead(params.id) });
});

route('DELETE', '/leads/:id', async ({ params }) => {
  await mustLead(params.id);
  await q('delete from leads where id=$1', [params.id]);
  return json({ ok: true });
});

/* ---------- Atenciones ---------- */
route('POST', '/leads/:id/atenciones', async ({ req, params }) => {
  const lead = await mustLead(params.id);
  const b = await body(req);
  const nota = str(b.nota, 2000);
  if (!nota) throw new HttpError(400, 'Escribe qué se habló');
  const fecha = isDate(b.fecha) ? b.fecha : hoyCR();
  await q('insert into atenciones(id, lead_id, fecha, canal, nota) values($1,$2,$3,$4,$5)', [uid(), lead.id, fecha, str(b.canal, 30), nota]);
  if (lead.etapa === 'nuevo') await q("update leads set etapa='contactado', actualizado=now() where id=$1", [lead.id]);
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
route('GET', '/leads/:id/mensajes', async ({ params }) => {
  const lead = await mustLead(params.id);
  const rows = await q(
    'select id, direccion, texto, autor, adjuntos, creado from mensajes where lead_id=$1 order by creado asc, n asc limit 300',
    [params.id],
  );
  return json({ mensajes: rows, tieneChat: !!lead.cw_conversation_id, configurado: cwConfig().ok });
});

route('POST', '/leads/:id/mensajes', async ({ req, params, user }) => {
  const lead = await mustLead(params.id);
  const texto = str((await body(req)).texto, 4000);
  if (!texto) throw new HttpError(400, 'Escribe el mensaje');
  if (!lead.cw_conversation_id) throw new HttpError(400, 'Este lead no tiene una conversación de Chatwoot');
  const r = await enviarMensaje(lead.cw_conversation_id, texto);
  const cwId = r?.id != null ? String(r.id) : null;
  const id = uid();
  const rows = await q(
    `insert into mensajes(id, lead_id, cw_message_id, cw_conversation_id, direccion, texto, autor)
     values($1,$2,$3,$4,'out',$5,$6)
     on conflict (cw_message_id) do update set autor = excluded.autor
     returning id, direccion, texto, autor, adjuntos, creado`,
    [id, lead.id, cwId, lead.cw_conversation_id, texto, user!.nombre],
  );
  await registrarRespuesta(lead);
  return json({ mensaje: rows[0] }, 201);
});

/* ---------- Ajustes y usuarios ---------- */
route('PATCH', '/ajustes', async ({ req }) => {
  const b = await body(req);
  if ('negocio' in b) await setSetting('negocio', str(b.negocio, 80) || 'Pulso CRM');
  if ('avisoDias' in b) await setSetting('avisoDias', clamp(b.avisoDias, 0, 90, 5));
  return json({ settings: await getSettings() });
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
  const rol = b.rol === 'admin' ? 'admin' : 'vendedor';
  const rows = await q(
    'insert into usuarios(id, email, nombre, rol, hash) values($1,$2,$3,$4,$5) on conflict (email) do nothing returning id, email, nombre, rol',
    [uid(), email, nombre, rol, hashPassword(password)],
  );
  if (!rows.length) throw new HttpError(409, 'Ya existe un usuario con ese correo');
  return json({ usuario: rows[0] }, 201);
}, { admin: true });

/* ---------- Chatwoot ---------- */
route('GET', '/chatwoot/estado', async ({ req }) => {
  const c = cwConfig();
  const token = process.env.WEBHOOK_TOKEN || '';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const recientes = await q('select id, evento, resultado, creado from eventos_cw order by id desc limit 15');
  return json({
    configurado: {
      url: c.url,
      cuenta: !!c.account,
      token: !!c.token,
      webhookToken: !!token,
      firma: !!process.env.CHATWOOT_WEBHOOK_SECRET,
    },
    webhookUrl: token ? `${proto}://${host}/api/webhooks/chatwoot?token=${token}` : null,
    recientes,
  });
}, { admin: true });

async function guardarEvento(payload: any, resultado: string) {
  await q('insert into eventos_cw(evento, payload, resultado) values($1,$2::jsonb,$3)', [
    String(payload?.event || ''),
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

/* ---------- Despachador ---------- */
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
      if (method !== 'GET' && !r.webhook) checkOrigin(req);
      return await r.h({ req, url, params, user });
    }
    throw new HttpError(404, 'No encontrado');
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Error interno: ' + (e?.message || 'desconocido') }, 500);
  }
}
