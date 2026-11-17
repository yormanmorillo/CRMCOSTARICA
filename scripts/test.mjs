// Prueba de extremo a extremo con un Chatwoot simulado. Uso: node scripts/test.mjs (con el servidor ya encendido)
import { createHmac } from 'node:crypto';
import http from 'node:http';

const BASE = process.env.BASE || 'http://localhost:3100';
const SECRET = process.env.CHATWOOT_WEBHOOK_SECRET || 'secreto-de-prueba';
const WH = process.env.WEBHOOK_TOKEN || 'whtok';
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { failN++; console.log('  ✗ FALLÓ:', m); } };

// Chatwoot simulado: guarda lo que recibe
const recibidos = [];
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d));
  req.on('end', () => {
    recibidos.push({ url: req.url, token: req.headers['api_access_token'], body: b ? JSON.parse(b) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url.includes('/conversations/999/')) { res.statusCode = 422; return res.end(JSON.stringify({ message: 'Fuera de la ventana de 24 horas' })); }
    res.end(JSON.stringify({ id: 7000 + recibidos.length, content: 'ok' }));
  });
}).listen(4010);

let cookie = '';
async function call(method, path, body, opt = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opt.nocookie ? {} : { cookie }), ...(opt.headers || {}) },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    redirect: 'manual',
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t, headers: r.headers };
}
async function hook(payload, { sign = true, token = WH } = {}) {
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = {};
  if (sign) { headers['x-chatwoot-timestamp'] = ts; headers['x-chatwoot-signature'] = 'sha256=' + createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex'); }
  return call('POST', `/api/webhooks/chatwoot?token=${token}`, raw, { nocookie: true, headers });
}
const msg = (o) => ({
  event: 'message_created', id: o.id, content: o.content, message_type: o.type ?? 'incoming', private: false, created_at: Math.floor(Date.now() / 1000),
  sender: o.sender, conversation: { id: o.conv, inbox_id: o.inbox ?? 1, channel: o.channel, meta: o.meta }, inbox: { id: o.inbox ?? 1, name: o.inboxName || '' }, attachments: o.attachments,
});

(async () => {
  console.log('Acceso');
  ok((await call('GET', '/api/state', undefined, { nocookie: true })).status === 401, 'sin sesión no se ve nada');
  ok((await call('POST', '/api/auth/login', { email: 'admin@prueba.cr', password: 'mala' }, { nocookie: true })).status === 401, 'contraseña incorrecta se rechaza');
  const lg = await call('POST', '/api/auth/login', { email: 'admin@prueba.cr', password: 'clave-segura-123' }, { nocookie: true });
  ok(lg.status === 200, 'el administrador entra');
  cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
  ok((await call('GET', '/', undefined, { nocookie: true })).status === 302, 'la página principal redirige al login si no hay sesión');
  ok((await call('GET', '/')).text.includes('Pulso CRM'), 'la página principal carga con sesión');
  ok((await call('GET', '/login')).status === 302, 'el login redirige si ya hay sesión');

  console.log('Webhook: seguridad');
  const base = msg({ id: 1, content: 'hola', conv: 10, channel: 'Channel::Whatsapp', sender: { id: 100, name: 'X', type: 'contact' } });
  ok((await hook(base, { token: 'malo' })).status === 401, 'token incorrecto se rechaza');
  ok((await hook(base, { sign: false })).status === 401, 'sin firma se rechaza');

  console.log('Webhook: WhatsApp costarricense');
  const w1 = msg({ id: 501, content: 'Hola, quiero precios para 4 personas', conv: 10, channel: 'Channel::Whatsapp', inboxName: 'WhatsApp Tienda',
    sender: { id: 100, name: 'Ana Mora', phone_number: '+50688881234', type: 'contact' }, meta: { sender: { id: 100, name: 'Ana Mora', phone_number: '+50688881234' } } });
  const r1 = await hook({ event: 'conversation_created', id: 10, inbox_id: 1, channel: 'Channel::Whatsapp', meta: { sender: { id: 100, name: 'Ana Mora', phone_number: '+50688881234' } }, messages: [] });
  ok(r1.status === 200 && /lead creado/.test(r1.json.resultado), 'conversation_created crea el lead: ' + r1.json?.resultado);
  const r2 = await hook(w1);
  ok(r2.status === 200, 'message_created entra');
  let st = (await call('GET', '/api/state')).json;
  let ana = st.leads.find((l) => l.nombre === 'Ana Mora');
  ok(st.leads.length === 1, 'hay un solo lead (sin duplicar)');
  ok(ana && ana.canal === 'whatsapp' && ana.tipo === 'cr' && ana.auto && ana.tieneChat, 'canal WhatsApp, costarricense, automático, con chat');
  ok(ana && ana.esperando === true, 'queda marcado como esperando respuesta');
  ok(ana && ana.interes.includes('precios'), 'guarda el primer mensaje como consulta');
  ok((await hook(w1)).json.resultado.includes('repetido'), 'el mismo mensaje enviado dos veces no se duplica');

  console.log('Webhook: extranjero por WhatsApp (formato numérico de message_type)');
  const w2 = msg({ id: 502, content: 'Hi, availability in March?', type: 0, conv: 11, channel: 'Channel::Whatsapp',
    sender: { id: 101, name: 'Emily Carter', phone_number: '+14155550148', type: 'contact' } });
  ok((await hook(w2)).status === 200, 'acepta message_type numérico');
  st = (await call('GET', '/api/state')).json;
  const em = st.leads.find((l) => l.nombre === 'Emily Carter');
  ok(em && em.tipo === 'ext' && /Estados Unidos/.test(em.pais), 'prefijo +1 se marca extranjero con país: ' + em?.pais);

  console.log('Webhook: Instagram y Facebook sin teléfono');
  const w3 = msg({ id: 503, content: 'Info por favor', conv: 12, channel: 'Channel::Instagram', inboxName: 'Instagram',
    sender: { id: 102, name: 'sofia.travels', type: 'contact' } });
  ok((await hook(w3)).status === 200, 'Instagram entra');
  const w4 = msg({ id: 504, content: 'Buenas', conv: 13, channel: 'Channel::FacebookPage', inboxName: 'Facebook Messenger',
    sender: { id: 103, name: 'Luis Vargas', type: 'contact' } });
  ok((await hook(w4)).status === 200, 'Facebook entra');
  const w5 = msg({ id: 505, content: 'Formulario web', conv: 14, channel: 'Channel::WebWidget', inboxName: 'Sitio web',
    sender: { id: 104, name: 'Pierre', email: 'pierre@example.fr', additional_attributes: { country_code: 'FR', country: 'France' }, type: 'contact' } });
  ok((await hook(w5)).status === 200, 'Web entra');
  st = (await call('GET', '/api/state')).json;
  const by = (n) => st.leads.find((l) => l.nombre === n);
  ok(by('sofia.travels')?.canal === 'instagram', 'canal Instagram detectado');
  ok(by('Luis Vargas')?.canal === 'facebook', 'canal Facebook detectado');
  ok(by('Pierre')?.canal === 'web' && by('Pierre')?.tipo === 'ext' && by('Pierre')?.pais === 'France', 'canal web y país extranjero por datos del contacto');

  console.log('Webhook: misma persona vuelve a escribir y respuesta del equipo');
  ok((await hook(msg({ id: 506, content: 'Somos 4 y llegamos en 20 días', conv: 10, channel: 'Channel::Whatsapp', sender: { id: 100, name: 'Ana Mora', phone_number: '+50688881234', type: 'contact' } }))).status === 200, 'segundo mensaje');
  st = (await call('GET', '/api/state')).json;
  ok(st.leads.filter((l) => l.nombre === 'Ana Mora').length === 1, 'sigue habiendo un solo lead de Ana');
  // mismo teléfono pero otro contacto de Chatwoot (otro canal): se une al lead por teléfono
  ok((await hook(msg({ id: 507, content: 'Ahora por WA 2', conv: 15, channel: 'Channel::Whatsapp', sender: { id: 555, name: 'Ana M.', phone_number: '+506 8888 1234', type: 'contact' } }))).status === 200, 'mismo teléfono, otro contacto');
  st = (await call('GET', '/api/state')).json;
  ok(st.leads.filter((l) => /Ana/.test(l.nombre)).length === 1, 'se une por teléfono al lead existente');
  const out = msg({ id: 508, content: 'Hola Ana, con gusto', type: 'outgoing', conv: 15, channel: 'Channel::Whatsapp', sender: { id: 1, name: 'Vendedor 1', type: 'user' }, meta: { sender: { id: 555, name: 'Ana M.', phone_number: '+506 8888 1234' } } });
  ok((await hook(out)).status === 200, 'respuesta del equipo entra');
  st = (await call('GET', '/api/state')).json;
  ana = st.leads.find((l) => l.nombre === 'Ana Mora');
  ok(ana.etapa === 'contactado', 'el lead pasa de Nuevo a Contactado');
  ok(ana.atenciones.length === 1 && ana.atenciones[0].auto, 'se registra una atención automática del día');
  ok(ana.esperando === false, 'ya no está esperando respuesta');
  ok((await hook(msg({ id: 509, content: 'otra respuesta', type: 'outgoing', conv: 15, channel: 'Channel::Whatsapp', sender: { id: 1, name: 'Vendedor 1', type: 'user' }, meta: { sender: { id: 555, name: 'Ana M.', phone_number: '+506 8888 1234' } } }))).status === 200, 'segunda respuesta el mismo día');
  st = (await call('GET', '/api/state')).json;
  ok(st.leads.find((l) => l.nombre === 'Ana Mora').atenciones.length === 1, 'no repite la atención del mismo día');
  ok((await hook({ ...msg({ id: 510, content: 'nota interna', conv: 15, channel: 'x', sender: { id: 1, type: 'user' } }), private: true })).json.resultado.includes('privada'), 'las notas privadas se ignoran');
  ok((await hook({ ...msg({ id: 511, content: '', type: 2, conv: 15, channel: 'x', sender: { id: 1, type: 'user' } }) })).json.resultado.includes('actividad'), 'mensajes de actividad se ignoran');
  ok((await hook({ event: 'conversation_status_changed', id: 1 })).status === 200, 'eventos desconocidos no rompen');
  const conAdj = msg({ id: 512, content: '', conv: 11, channel: 'Channel::Whatsapp', sender: { id: 101, name: 'Emily Carter', phone_number: '+14155550148', type: 'contact' }, attachments: [{ file_type: 'image', data_url: 'https://example.com/a.jpg' }, { file_type: 'image', data_url: 'javascript:alert(1)' }] });
  ok((await hook(conAdj)).status === 200, 'mensaje con imagen entra');

  console.log('Conversación dentro del CRM');
  const emId = em.id;
  const ms = (await call('GET', `/api/leads/${emId}/mensajes`)).json;
  ok(ms.mensajes.length === 2, 'se ven los mensajes del lead (' + ms.mensajes.length + ')');
  ok(ms.mensajes[1].adjuntos.length === 1, 'solo se guardan adjuntos con dirección http(s)');
  const rp = await call('POST', `/api/leads/${emId}/mensajes`, { texto: 'Hola Emily, claro que sí' });
  ok(rp.status === 201, 'responder desde el CRM funciona');
  const sent = recibidos.find((x) => x.body?.content === 'Hola Emily, claro que sí');
  ok(sent && sent.url === '/api/v1/accounts/1/conversations/11/messages' && sent.token === 'tok', 'llegó a Chatwoot con la ruta y el token correctos');
  ok(sent && sent.body.message_type === 'outgoing' && sent.body.private === false, 'se envía como mensaje saliente público');
  const rpErr = await call('POST', `/api/leads/${by('Pierre').id}/mensajes`, { texto: 'x' });
  ok(rpErr.status === 201, 'respuesta a la web también');
  // simulamos el eco del webhook de ese mismo mensaje: no debe duplicarse
  const idEco = sent ? 7000 + recibidos.indexOf(sent) + 1 : 0;
  await hook(msg({ id: idEco, content: 'Hola Emily, claro que sí', type: 'outgoing', conv: 11, channel: 'Channel::Whatsapp', sender: { id: 1, name: 'Vendedor 1', type: 'user' }, meta: { sender: { id: 101, name: 'Emily Carter', phone_number: '+14155550148' } } }));
  const ms2 = (await call('GET', `/api/leads/${emId}/mensajes`)).json;
  ok(ms2.mensajes.filter((m) => m.texto === 'Hola Emily, claro que sí').length === 1, 'el eco del webhook no duplica el mensaje');
  // error de Chatwoot
  await hook(msg({ id: 600, content: 'hola', conv: 999, channel: 'Channel::Whatsapp', sender: { id: 800, name: 'Ventana Vencida', phone_number: '+50670000000', type: 'contact' } }));
  const v = (await call('GET', '/api/state')).json.leads.find((l) => l.nombre === 'Ventana Vencida');
  const bad = await call('POST', `/api/leads/${v.id}/mensajes`, { texto: 'hola' });
  ok(bad.status === 502 && /24 horas/.test(bad.json.error), 'si Chatwoot rechaza, se muestra su motivo: ' + bad.json?.error);
  const manual = await call('POST', '/api/leads', { nombre: 'Manual Sin Chat', canal: 'web' });
  ok((await call('POST', `/api/leads/${manual.json.lead.id}/mensajes`, { texto: 'hola' })).status === 400, 'un lead manual no puede responder por chat');

  console.log('Funciones del CRM');
  const nl = await call('POST', '/api/leads', { nombre: 'Prueba Extranjero', tipo: 'ext', pais: 'Canadá', cedula: 'no-debe-guardarse', llegada: '2030-01-20', avisoDias: 5, canal: 'instagram' });
  ok(nl.status === 201 && nl.json.lead.cedula === '' && nl.json.lead.pais === 'Canadá', 'crear lead extranjero (limpia campos de costarricense)');
  const id = nl.json.lead.id;
  ok((await call('PATCH', `/api/leads/${id}`, { avisado: true })).json.lead.avisado === true, 'marcar como avisado');
  ok((await call('PATCH', `/api/leads/${id}`, { llegada: '2030-02-01' })).json.lead.avisado === false, 'cambiar la fecha de llegada reactiva el aviso');
  ok((await call('PATCH', `/api/leads/${id}`, { etapa: 'inexistente' })).status === 400, 'etapa inválida se rechaza');
  ok((await call('PATCH', `/api/leads/${id}`, { llegada: 'mañana' })).status === 400, 'fecha inválida se rechaza');
  const at = await call('POST', `/api/leads/${id}/atenciones`, { fecha: '2030-01-10', canal: 'instagram', nota: 'Pidió precios' });
  ok(at.status === 201 && at.json.lead.etapa === 'contactado' && at.json.lead.atenciones.length === 1, 'registrar atención mueve a Contactado');
  const tk = await call('POST', '/api/tareas', { leadId: id, titulo: 'Llamar', fecha: '2030-01-11', hora: '09:00' });
  ok(tk.status === 201, 'crear tarea');
  ok((await call('PATCH', `/api/tareas/${tk.json.tarea.id}`, { hecha: true })).json.tarea.hecha === true, 'completar tarea');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call('POST', `/api/leads/${id}/archivos`, { nombre: 'foto.png', data: png });
  ok(up.status === 201, 'subir imagen');
  const dl = await fetch(BASE + `/api/archivos/${up.json.archivo.id}`, { headers: { cookie } });
  ok(dl.status === 200 && dl.headers.get('content-type') === 'image/png', 'descargar imagen');
  ok((await call('POST', `/api/leads/${id}/archivos`, { nombre: 'x.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status === 400, 'rechaza SVG y otros formatos');
  ok((await call('DELETE', `/api/leads/${id}`)).status === 200, 'eliminar lead');
  st = (await call('GET', '/api/state')).json;
  ok(!st.tasks.some((t) => t.titulo === 'Llamar'), 'al eliminar el lead se eliminan sus tareas');

  console.log('Usuarios y permisos');
  ok((await call('POST', '/api/usuarios', { nombre: 'Vendedor Uno', email: 'v1@prueba.cr', password: 'corta' })).status === 400, 'contraseña corta se rechaza');
  ok((await call('POST', '/api/usuarios', { nombre: 'Vendedor Uno', email: 'v1@prueba.cr', password: 'otra-clave-123' })).status === 201, 'el admin crea un vendedor');
  const lv = await call('POST', '/api/auth/login', { email: 'v1@prueba.cr', password: 'otra-clave-123' }, { nocookie: true });
  ok(lv.status === 200, 'el vendedor entra');
  const vend = (lv.headers.get('set-cookie') || '').split(';')[0];
  ok((await call('PATCH', '/api/ajustes', { negocio: 'X' }, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no puede cambiar ajustes');
  ok((await call('GET', '/api/usuarios', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la lista de usuarios');
  ok((await call('GET', '/api/chatwoot/estado', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la conexión de Chatwoot');
  ok((await call('GET', '/api/state', undefined, { nocookie: true, headers: { cookie: vend } })).status === 200, 'el vendedor sí ve los leads');
  ok((await call('PATCH', '/api/ajustes', { negocio: 'Hotel Prueba', avisoDias: 3 })).json.settings.negocio === 'Hotel Prueba', 'el admin cambia el nombre del negocio');
  const est = (await call('GET', '/api/chatwoot/estado')).json;
  ok(est.webhookUrl?.includes('/api/webhooks/chatwoot?token=') && est.configurado.token && est.recientes.length > 0, 'estado de Chatwoot con dirección del webhook y avisos recientes');
  ok((await call('POST', '/api/leads', { nombre: 'Malicioso' }, { headers: { origin: 'https://evil.example' } })).status === 403, 'se bloquean envíos desde otro sitio web');
  ok((await call('GET', '/api/inexistente')).status === 404, 'ruta inexistente da 404');

  console.log(`\n${pass} pruebas bien, ${failN} con fallo`);
  fake.close();
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); fake.close(); process.exit(2); });
