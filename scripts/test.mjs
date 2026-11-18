// Prueba de extremo a extremo con un Chatwoot simulado. Uso: node scripts/test.mjs (con el servidor ya encendido)
import { createHmac } from 'node:crypto';
import http from 'node:http';

const BASE = process.env.BASE || 'http://localhost:3100';
const SECRET = process.env.CHATWOOT_WEBHOOK_SECRET || 'secreto-de-prueba';
const WH = process.env.WEBHOOK_TOKEN || 'whtok';
const APPSECRET = process.env.META_APP_SECRET || 'appsecret';
const VERIFY = process.env.META_VERIFY_TOKEN || 'verifytok';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { failN++; console.log('  ✗ FALLÓ:', m); } };

// Chatwoot y Meta (Graph API) simulados: guardan lo que reciben
const recibidos = [];
const waEnviados = [];
const socEnviados = [];
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d));
  req.on('end', () => {
    if (req.url.startsWith('/pub/')) { res.setHeader('content-type', 'image/png'); return res.end(PNG); }
    if (req.url.startsWith('/graph/') || req.url.startsWith('/media/')) {
      const auth = req.headers.authorization;
      res.setHeader('content-type', 'application/json');
      if (auth !== 'Bearer watok') { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: 'token', code: 190 } })); }
      if (req.url.startsWith('/media/')) { res.setHeader('content-type', 'image/png'); return res.end(PNG); }
      if (req.method === 'POST' && req.url === '/graph/PHID/messages') {
        const j = JSON.parse(b); waEnviados.push(j);
        if (j.to === '50670009999') { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: '(#131047) Re-engagement message', code: 131047 } })); }
        return res.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.OUT' + waEnviados.length }] }));
      }
      if (req.method === 'POST' && req.url === '/graph/PAGEID/messages') {
        const j = JSON.parse(b); socEnviados.push({ auth, ...j });
        return res.end(JSON.stringify({ recipient_id: j.recipient.id, message_id: 'mid.OUT' + socEnviados.length }));
      }
      if (/^\/graph\/(IGU|FBU)\d+\?/.test(req.url)) return res.end(JSON.stringify({ name: { IGU1: 'Sofi IG', FBU1: 'Luis FB' }[req.url.split('?')[0].split('/').pop()] || '' }));
      if (req.url.startsWith('/graph/PHID?')) return res.end(JSON.stringify({ display_phone_number: '+506 2222 3333', verified_name: 'Hotel Prueba' }));
      if (req.url === '/graph/MEDIA_ROTO') { res.statusCode = 404; return res.end(JSON.stringify({ error: { message: 'no existe' } })); }
      if (req.url.startsWith('/graph/MEDIA')) return res.end(JSON.stringify({ url: 'http://localhost:4010/media/' + req.url.split('/').pop(), mime_type: 'image/png', file_size: PNG.length }));
      res.statusCode = 404; return res.end('{}');
    }
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
const waPayload = (msgs, { contacts, statuses, phoneId = 'PHID' } = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '50622223333', phone_number_id: phoneId }, contacts, messages: msgs, statuses } }] }],
});
const wm = (o) => ({ from: o.from, id: o.id, timestamp: String(o.ts ?? Math.floor(Date.now() / 1000)), type: o.type || 'text', ...o.extra });
async function waHook(payload, { sign = true, secret = APPSECRET, raw: rawIn } = {}) {
  const raw = rawIn ?? JSON.stringify(payload);
  const headers = sign ? { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') } : {};
  return call('POST', '/api/webhooks/meta', raw, { nocookie: true, headers });
}
const waText = (from, id, text, name, ts) => waPayload([wm({ from, id, ts, extra: { text: { body: text } } })], { contacts: [{ wa_id: from, profile: { name } }] });
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

  console.log('Chatwoot: apagado por defecto, se enciende con un interruptor');
  let st0 = (await call('GET', '/api/state')).json;
  ok(st0.chatwoot.activo === false && st0.whatsapp.activo === true && st0.meta.activo === true && st0.web.activo === true, 'Chatwoot nace apagado y los demás canales encendidos');
  const apagado = await hook(msg({ id: 9, content: 'hola', conv: 9, channel: 'Channel::Whatsapp', sender: { id: 99, name: 'Apagado', type: 'contact' } }));
  ok(apagado.status === 200 && /ignorado/.test(apagado.json.resultado) && !(await call('GET', '/api/state')).json.leads.some((l) => l.nombre === 'Apagado'), 'con Chatwoot apagado sus avisos se ignoran');
  ok((await call('PATCH', '/api/ajustes', { chatwootActivo: true })).status === 200 && (await call('GET', '/api/state')).json.chatwoot.activo === true, 'el admin enciende Chatwoot');

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

  console.log('WhatsApp directo: seguridad');
  const vf = (t) => call('GET', `/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=RETO123`, undefined, { nocookie: true });
  const v1 = await vf(VERIFY);
  ok(v1.status === 200 && v1.text === 'RETO123', 'Meta verifica el webhook y recibe el reto de vuelta');
  ok((await vf('otra')).status === 403, 'una clave de verificación incorrecta se rechaza');
  const base0 = waText('50688887777', 'wamid.A1', 'Hola, quiero precios', 'Carlos Rojas');
  ok((await waHook(base0, { sign: false })).status === 401, 'sin firma de Meta se rechaza');
  ok((await waHook(base0, { secret: 'falsa' })).status === 401, 'firma falsa se rechaza');
  ok((await waHook(null, { raw: '{no es json' })).status === 400, 'JSON inválido (con firma buena) da 400');
  ok((await waHook({ object: 'application', entry: [] })).json.resultado.includes('ignorado'), 'otros tipos de aviso se ignoran sin error');

  console.log('WhatsApp directo: crear leads');
  const a1 = await waHook(base0);
  ok(a1.status === 200 && /lead creado/.test(a1.json.resultado), 'mensaje nuevo crea el lead: ' + a1.json?.resultado);
  ok((await waHook(base0)).json.resultado.includes('repetido'), 'el mismo mensaje dos veces no se duplica');
  st = (await call('GET', '/api/state')).json;
  const carlos = st.leads.find((l) => l.nombre === 'Carlos Rojas');
  ok(carlos && carlos.canal === 'whatsapp' && carlos.tipo === 'cr' && carlos.auto && carlos.tieneChat && carlos.chatCanal === 'whatsapp', 'WhatsApp, costarricense, automático, con chat');
  ok(carlos.tel === '+50688887777' && carlos.esperando && carlos.interes === 'Hola, quiero precios', 'teléfono, esperando respuesta y primera consulta');
  ok(st.whatsapp.configurado === true, 'el estado informa que WhatsApp está conectado');
  ok(carlos.ultimoMsg.txt === 'Hola, quiero precios', 'la lista de chats muestra el último mensaje');
  await waHook(waText('14155550199', 'wamid.A2', 'Hi, do you have rooms in March?', 'Emma Stone'));
  st = (await call('GET', '/api/state')).json;
  const emma = st.leads.find((l) => l.nombre === 'Emma Stone');
  ok(emma && emma.tipo === 'ext' && /Estados Unidos/.test(emma.pais), 'número +1 se marca extranjero con país: ' + emma?.pais);
  // un lead cargado a mano con el mismo teléfono (sin 506) se une
  const man = await call('POST', '/api/leads', { nombre: 'Marta Cargada A Mano', tel: '8888-5555', canal: 'web' });
  const antes = (await call('GET', '/api/state')).json.leads.length;
  await waHook(waText('50688885555', 'wamid.A3', 'Soy Marta, escribo por WhatsApp', 'Marta WA'));
  st = (await call('GET', '/api/state')).json;
  const marta = st.leads.find((l) => l.id === man.json.lead.id);
  ok(st.leads.length === antes && marta.tieneChat && marta.nombre === 'Marta Cargada A Mano', 'se une al lead existente por teléfono, sin duplicar ni cambiar el nombre');
  ok(st.leads.filter((l) => /Marta/.test(l.nombre)).length === 1, 'solo hay una Marta');
  ok((await waHook(waText('50688880000', 'wamid.A4', 'x', 'Otro', undefined), { sign: true })).status === 200, 'otro contacto entra');
  ok((await waHook({ ...waText('50688880001', 'wamid.A5', 'no soy tu número', 'Ajeno'), entry: [{ id: 'W', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'OTRO' }, messages: [wm({ from: '50688880001', id: 'wamid.A5', extra: { text: { body: 'x' } } })] } }] }] })).json.resultado.includes('otro número'), 'avisos de otro número de la misma app se ignoran');

  console.log('WhatsApp directo: tipos de mensaje');
  const ana2 = '50688887777';
  const tipos = waPayload([
    wm({ from: ana2, id: 'wamid.T1', type: 'image', extra: { image: { id: 'MEDIA1', mime_type: 'image/png', caption: 'Miren esta foto' } } }),
    wm({ from: ana2, id: 'wamid.T2', type: 'audio', extra: { audio: { id: 'MEDIA2', mime_type: 'audio/ogg' } } }),
    wm({ from: ana2, id: 'wamid.T3', type: 'location', extra: { location: { latitude: 9.93, longitude: -84.08, name: 'Hotel' } } }),
    wm({ from: ana2, id: 'wamid.T4', type: 'interactive', extra: { interactive: { button_reply: { id: 'b1', title: 'Quiero cotización' } } } }),
    wm({ from: ana2, id: 'wamid.T5', type: 'reaction', extra: { reaction: { emoji: '👍' } } }),
    wm({ from: ana2, id: 'wamid.T6', type: 'document', extra: { document: { id: 'MEDIA_ROTO', filename: 'lista.pdf' } } }),
    wm({ from: ana2, id: 'wamid.T7', type: 'order' }),
  ], { contacts: [{ wa_id: ana2, profile: { name: 'Carlos Rojas' } }] });
  const rt = await waHook(tipos);
  ok(rt.status === 200 && rt.json.resultado.includes('ignorado (reaction)'), 'las reacciones se ignoran: ' + rt.json?.resultado);
  const mc = (await call('GET', `/api/leads/${carlos.id}/mensajes`)).json;
  const por = (t) => mc.mensajes.find((m) => m.texto.includes(t));
  const imgMsg = por('Miren esta foto');
  ok(imgMsg && imgMsg.adjuntos.length === 1 && imgMsg.adjuntos[0].type === 'image' && /^\/api\/medios\/[a-f0-9]+$/.test(imgMsg.adjuntos[0].url), 'la foto se guarda con su texto y su archivo');
  const dlm = await fetch(BASE + imgMsg.adjuntos[0].url, { headers: { cookie } });
  const bytes = Buffer.from(await dlm.arrayBuffer());
  ok(dlm.status === 200 && dlm.headers.get('content-type') === 'image/png' && bytes.equals(PNG), 'el archivo se puede ver y es idéntico al que mandó el cliente');
  ok(dlm.headers.get('x-content-type-options') === 'nosniff', 'el archivo se sirve con protección nosniff');
  ok((await fetch(BASE + imgMsg.adjuntos[0].url)).status !== 200, 'sin sesión no se ve el archivo');
  ok(mc.mensajes.some((m) => m.adjuntos.some((a) => a.type === 'audio')), 'los audios se guardan');
  ok(por('Ubicación') && por('maps.google.com/?q=9.93,-84.08'), 'las ubicaciones llegan con enlace al mapa');
  ok(por('Quiero cotización'), 'las respuestas a botones llegan como texto');
  ok(por('No se pudo guardar el archivo'), 'si Meta no entrega el archivo se avisa en el mensaje (y el mensaje no se pierde)');
  ok(por('todavía no muestra'), 'tipos desconocidos dejan un aviso en vez de perderse');
  ok(!mc.mensajes.some((m) => m.texto.includes('👍')), 'la reacción no se guardó como mensaje');
  const st2 = (await call('GET', '/api/state')).json.leads.find((l) => l.id === carlos.id);
  ok(typeof st2.ultimoMsg.txt === 'string' && st2.ultimoMsg.txt.length > 0, 'el último mensaje tiene vista previa aunque sea un archivo');
  ok(mc.canal === 'whatsapp' && mc.configurado === true && mc.ventana.abierta === true, 'la conversación informa canal, conexión y ventana de 24 h abierta');

  console.log('WhatsApp directo: responder desde Pulso');
  const rw = await call('POST', `/api/leads/${carlos.id}/mensajes`, { texto: 'Hola Carlos, con gusto le ayudo' });
  ok(rw.status === 201 && rw.json.mensaje.estado === 'enviado', 'responder desde el CRM funciona');
  const so = waEnviados.find((x) => x.text?.body === 'Hola Carlos, con gusto le ayudo');
  ok(so && so.to === '50688887777' && so.type === 'text' && so.messaging_product === 'whatsapp', 'llegó a Meta con el número y el formato correctos');
  st = (await call('GET', '/api/state')).json;
  const c2 = st.leads.find((l) => l.id === carlos.id);
  ok(c2.etapa === 'contactado' && c2.esperando === false && c2.atenciones.length === 1 && c2.atenciones[0].auto, 'al responder pasa a Contactado y se anota la atención del día');
  // estados de entrega
  const wamid = 'wamid.OUT' + waEnviados.length;
  const stt = (s, extra = {}) => waPayload(undefined, { statuses: [{ id: wamid, status: s, recipient_id: '50688887777', ...extra }] });
  await waHook(stt('delivered'));
  let ml = (await call('GET', `/api/leads/${carlos.id}/mensajes`)).json.mensajes.find((m) => m.texto.startsWith('Hola Carlos, con gusto'));
  ok(ml.estado === 'entregado', 'aviso de entregado');
  await waHook(stt('read'));
  await waHook(stt('delivered'));
  ml = (await call('GET', `/api/leads/${carlos.id}/mensajes`)).json.mensajes.find((m) => m.texto.startsWith('Hola Carlos, con gusto'));
  ok(ml.estado === 'leido', 'leído, y un aviso de entregado que llega tarde no lo retrocede');
  await waHook(stt('failed', { errors: [{ code: 131047, title: 'Re-engagement message' }] }));
  ml = (await call('GET', `/api/leads/${carlos.id}/mensajes`)).json.mensajes.find((m) => m.texto.startsWith('Hola Carlos, con gusto'));
  ok(/^fallo: .*24 horas/.test(ml.estado), 'si falla la entrega se explica el motivo: ' + ml.estado);
  // regla de las 24 horas
  await waHook(waText('50687770001', 'wamid.V1', 'hola hace dos días', 'Viejo Contacto', Math.floor(Date.now() / 1000) - 2 * 86400));
  const viejo = (await call('GET', '/api/state')).json.leads.find((l) => l.nombre === 'Viejo Contacto');
  const r24 = await call('POST', `/api/leads/${viejo.id}/mensajes`, { texto: 'hola' });
  ok(r24.status === 409 && /24 horas/.test(r24.json.error), 'pasadas 24 horas no se deja enviar y se explica');
  ok(!waEnviados.some((x) => x.to === '50687770001'), 'ni siquiera se intenta enviar a Meta');
  ok((await call('GET', `/api/leads/${viejo.id}/mensajes`)).json.ventana.abierta === false, 'la conversación informa que la ventana está cerrada');
  // Meta rechaza
  await waHook(waText('50670009999', 'wamid.R1', 'hola', 'Rechazado'));
  const rech = (await call('GET', '/api/state')).json.leads.find((l) => l.nombre === 'Rechazado');
  const rr = await call('POST', `/api/leads/${rech.id}/mensajes`, { texto: 'hola' });
  ok(rr.status === 502 && /24 horas/.test(rr.json.error), 'si Meta rechaza se muestra el motivo en español: ' + rr.json?.error);
  ok((await call('POST', `/api/leads/${man.json.lead.id}/mensajes`, { texto: '' })).status === 400, 'mensaje vacío se rechaza');

  console.log('WhatsApp directo: ajustes');
  const we = (await call('GET', '/api/whatsapp/estado')).json;
  ok(we.configurado.token && we.configurado.phoneId && we.configurado.secreto && we.configurado.verifyToken, 'el estado muestra qué variables están listas');
  ok(we.webhookUrl.endsWith('/api/webhooks/meta') && we.verifyToken === VERIFY && we.recientes.length > 0, 'muestra la dirección del webhook, la clave y los avisos recientes');
  ok(!JSON.stringify(we).includes('watok') && !JSON.stringify(we).includes(APPSECRET), 'el estado no revela el token ni el secreto de la app');
  const pb = await call('POST', '/api/whatsapp/probar');
  ok(pb.status === 200 && pb.json.numero === '+506 2222 3333' && pb.json.nombre === 'Hotel Prueba', 'probar la conexión muestra el número conectado');
  ok(!(await call('GET', '/api/chatwoot/estado')).json.recientes.some((e) => e.evento === 'whatsapp'), 'los avisos de WhatsApp no se mezclan con los de Chatwoot');

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
  ok((await call('GET', '/api/whatsapp/estado', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la conexión de WhatsApp');
  ok((await call('POST', '/api/whatsapp/probar', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no puede probar la conexión');
  ok((await call('GET', '/api/state', undefined, { nocookie: true, headers: { cookie: vend } })).status === 200, 'el vendedor sí ve los leads');
  const vm = await fetch(BASE + imgMsg.adjuntos[0].url, { headers: { cookie: vend } });
  ok(vm.status === 200, 'el vendedor sí ve los archivos de las conversaciones');
  ok((await call('PATCH', '/api/ajustes', { negocio: 'Hotel Prueba', avisoDias: 3 })).json.settings.negocio === 'Hotel Prueba', 'el admin cambia el nombre del negocio');
  const est = (await call('GET', '/api/chatwoot/estado')).json;
  ok(est.webhookUrl?.includes('/api/webhooks/chatwoot?token=') && est.configurado.token && est.recientes.length > 0, 'estado de Chatwoot con dirección del webhook y avisos recientes');
  ok((await call('POST', '/api/leads', { nombre: 'Malicioso' }, { headers: { origin: 'https://evil.example' } })).status === 403, 'se bloquean envíos desde otro sitio web');
  ok((await call('GET', '/api/inexistente')).status === 404, 'ruta inexistente da 404');

  {
  console.log('Leads: llamadas manuales, etiquetas, asignación y destacados');
  const me = (await call('GET', '/api/state')).json.me;
  const cl = await call('POST', '/api/leads', { nombre: 'Cliente Llamada', canal: 'llamada', tel: '+50660001111', empresa: 'Hotel X', interes: 'Llamó pidiendo tarifas' });
  ok(cl.status === 201 && cl.json.lead.canal === 'llamada' && cl.json.lead.empresa === 'Hotel X' && cl.json.lead.etapa === 'nuevo', 'se crea un lead por llamada, con empresa, en la etapa inicial');
  ok(cl.json.lead.asignado === me.id, 'el lead queda asignado a quien lo crea');
  const LID = cl.json.lead.id;
  const pt = await call('PATCH', `/api/leads/${LID}`, { etiquetas: ['VIP', 'grupo'], destacado: true });
  ok(pt.json.lead.etiquetas.join() === 'VIP,grupo' && pt.json.lead.destacado === true, 'etiquetas y destacado');
  const vendU = (await call('GET', '/api/usuarios')).json.usuarios.find((u) => u.email === 'v1@prueba.cr');
  ok((await call('PATCH', `/api/leads/${LID}`, { asignado: vendU.id })).json.lead.asignadoNombre === 'Vendedor Uno', 'se reasigna el lead a otro usuario');
  ok((await call('PATCH', `/api/leads/${LID}`, { asignado: 'no-existe' })).status === 400, 'no se asigna a un usuario que no existe');

  console.log('Productos en el lead');
  ok((await call('POST', '/api/productos', { nombre: 'Paquete 3 noches', precio: 150000, moneda: 'CRC' }, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no crea productos');
  const pr = await call('POST', '/api/productos', { nombre: 'Paquete 3 noches', descripcion: 'Con desayuno', precio: 150000, moneda: 'CRC' });
  ok(pr.status === 201, 'el admin crea un producto');
  const PID = pr.json.producto.id;
  const pr2 = await call('POST', '/api/productos', { nombre: 'Tour', precio: 80, moneda: 'USD' });
  const ap = await call('POST', `/api/leads/${LID}/productos`, { productoId: PID, cantidad: 2 });
  ok(ap.status === 201 && ap.json.lead.valor.CRC === 300000 && ap.json.lead.nProductos === 1, 'agregar producto suma el valor del lead');
  await call('POST', `/api/leads/${LID}/productos`, { productoId: pr2.json.producto.id, cantidad: 1, precio: 70 });
  let ex = (await call('GET', `/api/leads/${LID}/extra`)).json;
  ok(ex.productos.length === 2 && ex.productos.some((x) => x.moneda === 'USD' && x.precio === 70), 'precio propio y dos monedas en el mismo lead');
  const lp = ex.productos.find((x) => x.nombre === 'Paquete 3 noches');
  ok((await call('PATCH', `/api/lead-productos/${lp.id}`, { cantidad: 3 })).json.lead.valor.CRC === 450000, 'cambiar cantidad recalcula');
  await call('PATCH', `/api/productos/${PID}`, { precio: 999999 });
  ok((await call('GET', `/api/leads/${LID}/extra`)).json.productos.find((x) => x.id === lp.id).precio === 150000, 'cambiar el catálogo no altera lo ya cotizado');
  ok((await call('POST', `/api/leads/${LID}/productos`, { nombre: '' })).status === 400, 'un producto sin nombre se rechaza');
  ok((await call('DELETE', `/api/lead-productos/${lp.id}`)).json.lead.nProductos === 1, 'quitar producto del lead');
  await call('PATCH', `/api/productos/${pr2.json.producto.id}`, { activo: false });
  ok(!(await call('GET', '/api/state')).json.productos.some((x) => x.nombre === 'Tour'), 'un producto oculto no sale en el catálogo del lead');

  console.log('Notas y línea de tiempo');
  ok((await call('POST', `/api/leads/${LID}/notas`, { texto: '' })).status === 400, 'una nota vacía se rechaza');
  ok((await call('POST', `/api/leads/${LID}/notas`, { texto: 'Prefiere llamadas en la tarde' })).status === 201, 'se guarda una nota');
  ex = (await call('GET', `/api/leads/${LID}/extra`)).json;
  ok(ex.notas.length === 1 && ex.notas[0].usuario && ex.actividad.length >= 3, 'la ficha trae notas y línea de tiempo: ' + ex.actividad.map((a) => a.tipo).join());
  ok((await call('DELETE', `/api/notas/${ex.notas[0].id}`, undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'un vendedor no borra la nota de otro');
  ok((await call('DELETE', `/api/notas/${ex.notas[0].id}`)).status === 200, 'el autor borra su nota');

  console.log('Etapas editables');
  ok((await call('GET', '/api/etapas', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no administra etapas');
  const ne = await call('POST', '/api/etapas', { nombre: 'Reserva confirmada', color: 'ok', tipo: 'abierta' });
  ok(ne.status === 201 && ne.json.etapas.some((e) => e.nombre === 'Reserva confirmada'), 'se agrega una etapa');
  const clave = ne.json.etapas.find((e) => e.nombre === 'Reserva confirmada').clave;
  ok((await call('PATCH', `/api/etapas/${clave}`, { nombre: 'Reservado', color: 'vio' })).json.etapas.find((e) => e.clave === clave).nombre === 'Reservado', 'se renombra y cambia de color');
  const antesE = (await call('GET', '/api/etapas')).json.etapas.map((e) => e.clave);
  const mv = (await call('POST', '/api/etapas/mover', { clave, dir: 'up' })).json.etapas.map((e) => e.clave);
  ok(mv.indexOf(clave) === antesE.indexOf(clave) - 1, 'se sube de posición');
  ok((await call('PATCH', `/api/leads/${LID}`, { etapa: clave })).json.lead.etapa === clave, 'un lead se puede mover a la etapa nueva');
  ok((await call('DELETE', `/api/etapas/${clave}`)).status === 409, 'no se borra una etapa que tiene leads');
  await call('PATCH', `/api/leads/${LID}`, { etapa: 'nuevo' });
  ok((await call('DELETE', `/api/etapas/${clave}`)).status === 200, 'vacía, sí se borra');
  ok((await call('DELETE', '/api/etapas/perdido')).status === 409, 'no se puede quedar sin etapa de perdido');
  ok((await call('PATCH', '/api/etapas/ganado', { tipo: 'abierta' })).status === 409, 'no se puede quedar sin etapa de ganado');
  ok((await call('PATCH', `/api/leads/${LID}`, { etapa: 'inventada' })).status === 400, 'etapa inexistente se rechaza');

  console.log('Motivos de pérdida');
  ok((await call('PATCH', `/api/leads/${LID}`, { etapa: 'perdido' })).status === 400, 'perder un lead sin motivo se rechaza');
  const lost = await call('PATCH', `/api/leads/${LID}`, { etapa: 'perdido', motivoId: 'm-caro', motivoNota: 'Pedía 30% de descuento' });
  ok(lost.status === 200 && lost.json.lead.motivo === 'Le pareció muy caro' && lost.json.lead.motivoNota.includes('30%') && lost.json.lead.perdidoEn, 'se guarda motivo, detalle y fecha');
  ok((await call('PATCH', `/api/leads/${LID}`, { motivoId: 'm-competencia' })).json.lead.motivo === 'Se fue con la competencia', 'se corrige el motivo de un lead ya perdido');
  ok((await call('PATCH', `/api/leads/${LID}`, { motivoId: 'm-caro' })).status === 200, 'volver a dejar "muy caro"');
  ok((await call('DELETE', '/api/motivos/m-caro')).status === 409, 'un motivo ya usado no se borra');
  ok((await call('PATCH', '/api/motivos/m-caro', { nombre: 'Muy caro', activo: false })).status === 200 && !(await call('GET', '/api/state')).json.motivos.some((m) => m.id === 'm-caro'), 'se oculta un motivo');
  const nm = await call('POST', '/api/motivos', { nombre: 'No tenía presupuesto' });
  ok(nm.status === 201 && (await call('GET', '/api/motivos')).json.motivos.some((m) => m.nombre === 'No tenía presupuesto'), 'se agrega un motivo');
  const re = await call('PATCH', `/api/leads/${LID}`, { etapa: 'contactado' });
  ok(re.json.lead.motivo === '' && !re.json.lead.perdidoEn, 'reabrir el lead borra el motivo');

  console.log('Galería de imágenes (admin)');
  const gal = await call('GET', '/api/admin/archivos?origen=todas&limit=10');
  ok(gal.status === 200 && gal.json.total >= 1 && gal.json.items[0].url.startsWith('/api/'), 'la galería lista imágenes: ' + gal.json?.total);
  ok((await call('GET', '/api/admin/archivos?origen=chat')).json.items.every((i) => i.origen === 'chat'), 'filtro por imágenes del chat');
  ok((await call('GET', '/api/admin/archivos', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la galería');
  const chatImg = (await call('GET', '/api/admin/archivos?origen=chat')).json.items[0];
  if (chatImg) ok((await call('DELETE', `/api/medios/${chatImg.id}`)).status === 200 && (await fetch(BASE + chatImg.url, { headers: { cookie } })).status === 404, 'se borra una imagen del chat');

  console.log('Formulario de la página web');
  const wcfg = await call('GET', '/api/canales/web');
  ok(wcfg.status === 200 && wcfg.json.token.length >= 20 && wcfg.json.url.endsWith('/api/webhooks/web'), 'el admin ve la clave y la dirección del formulario');
  ok((await call('GET', '/api/canales/web', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la clave del formulario');
  const WT = wcfg.json.token;
  const fw = (b) => call('POST', '/api/webhooks/web', b, { nocookie: true });
  ok((await fw({ token: 'mala', nombre: 'X' })).status === 401, 'clave incorrecta se rechaza');
  const w1f = await fw({ token: WT, nombre: 'Marie Dupont', email: 'marie@example.fr', tel: '+33612345678', mensaje: 'Quiero reservar 5 noches en abril' });
  ok(w1f.status === 200 && w1f.json.lead === 'creado' && w1f.headers.get('access-control-allow-origin') === '*', 'un envío del formulario crea el lead (con CORS)');
  let stw = (await call('GET', '/api/state')).json;
  const marie = stw.leads.find((l) => l.nombre === 'Marie Dupont');
  ok(marie && marie.canal === 'web' && marie.tipo === 'ext' && marie.auto && marie.interes.includes('5 noches'), 'canal web, extranjero, automático, con su consulta');
  ok((await fw({ token: WT, nombre: 'Marie', email: 'MARIE@example.fr', mensaje: 'Otra pregunta' })).json.lead === 'existente' && (await call('GET', '/api/state')).json.leads.filter((l) => /marie/i.test(l.nombre)).length === 1, 'el mismo correo no duplica el lead');
  ok(((await call('GET', `/api/leads/${marie.id}/extra`)).json.notas || []).length === 2, 'los mensajes del formulario quedan como notas');
  const antesN = (await call('GET', '/api/state')).json.leads.length;
  ok((await fw({ token: WT, nombre: 'Robot', website: 'http://spam' })).status === 200 && (await call('GET', '/api/state')).json.leads.length === antesN, 'el campo trampa descarta a los robots sin crear lead');
  ok((await fw({ token: WT })).status === 400, 'un envío sin datos de contacto se rechaza');
  const fd = new URLSearchParams({ token: WT, nombre: 'Desde HTML', tel: '7123-4567' });
  const rf = await fetch(BASE + '/api/webhooks/web', { method: 'POST', body: fd });
  ok(rf.status === 200 && (await call('GET', '/api/state')).json.leads.some((l) => l.nombre === 'Desde HTML' && l.tipo === 'cr'), 'también acepta un formulario HTML normal');
  const op = await fetch(BASE + '/api/webhooks/web', { method: 'OPTIONS' });
  ok(op.status === 204 && op.headers.get('access-control-allow-origin') === '*', 'responde la consulta previa de CORS');
  await call('PATCH', '/api/ajustes', { webActivo: false });
  ok((await fw({ token: WT, nombre: 'Apagado Web' })).status === 409, 'con el canal web apagado no entra nada');
  await call('PATCH', '/api/ajustes', { webActivo: true });
  const wt2 = (await call('POST', '/api/canales/web/token')).json.token;
  ok(wt2 !== WT && (await fw({ token: WT, nombre: 'Vieja' })).status === 401 && (await fw({ token: wt2, nombre: 'Nueva Clave' })).status === 200, 'al regenerar la clave la anterior deja de servir');

  console.log('Instagram y Facebook directos');
  const msI = (obj, de, mid, extra = {}, ts = Date.now()) => ({ object: obj, entry: [{ id: obj === 'instagram' ? 'IGID' : 'PAGEID', time: ts, messaging: [{ sender: { id: de }, recipient: { id: 'PAGEID' }, timestamp: ts, message: { mid, ...extra } }] }] });
  const mst = (await call('GET', '/api/meta/estado')).json;
  ok(mst.configurado.pageToken && mst.configurado.pageId && mst.webhookUrl.endsWith('/api/webhooks/meta'), 'estado de Instagram y Facebook');
  ok((await waHook(msI('instagram', 'IGU1', 'm_ig0', { text: 'x' }), { sign: false })).status === 401, 'sin firma se rechaza');
  const ig = await waHook(msI('instagram', 'IGU1', 'm_ig1', { text: 'Hola, ¿precios para 2 personas?' }));
  ok(ig.status === 200 && /lead creado \(instagram\)/.test(ig.json.resultado), 'un mensaje de Instagram crea el lead: ' + ig.json?.resultado);
  stw = (await call('GET', '/api/state')).json;
  const sofi = stw.leads.find((l) => l.nombre === 'Sofi IG');
  ok(sofi && sofi.canal === 'instagram' && sofi.chatCanal === 'instagram' && sofi.tieneChat && sofi.esperando && sofi.auto, 'nombre del perfil, canal Instagram y chat propio');
  ok((await waHook(msI('instagram', 'IGU1', 'm_ig1', { text: 'Hola, ¿precios para 2 personas?' }))).json.resultado.includes('repetido'), 'el mismo mensaje no se duplica');
  ok(/propio/.test((await waHook(msI('instagram', 'IGU1', 'm_echo', { text: 'eco', is_echo: true }))).json.resultado), 'los ecos de la página se ignoran');
  const igf = await waHook(msI('instagram', 'IGU1', 'm_ig2', { attachments: [{ type: 'image', payload: { url: 'http://localhost:4010/pub/foto.png' } }] }));
  ok(igf.status === 200 && /mensaje guardado/.test(igf.json.resultado), 'llega una foto');
  const chI = (await call('GET', `/api/leads/${sofi.id}/mensajes`)).json;
  const adjI = chI.mensajes.find((m) => m.adjuntos.length)?.adjuntos[0];
  ok(chI.canal === 'instagram' && chI.configurado && chI.ventana.abierta && adjI?.url.startsWith('/api/medios/'), 'el chat ofrece responder y la foto se guardó');
  ok((await fetch(BASE + adjI.url, { headers: { cookie } })).headers.get('content-type') === 'image/png', 'la foto se descarga con sesión');
  const rpS = await call('POST', `/api/leads/${sofi.id}/mensajes`, { texto: 'Hola Sofi, con gusto' });
  ok(rpS.status === 201 && socEnviados.at(-1)?.recipient.id === 'IGU1' && socEnviados.at(-1).auth === 'Bearer watok' && socEnviados.at(-1).message.text === 'Hola Sofi, con gusto', 'responder sale por la API de Meta con el token de la página');
  ok((await call('GET', `/api/leads/${sofi.id}/mensajes`)).json.mensajes.some((m) => m.direccion === 'out' && m.estado === 'enviado'), 'la respuesta queda en el chat');
  const fb = await waHook(msI('page', 'FBU1', 'm_fb1', { text: 'Buenas tardes' }));
  ok(/lead creado \(facebook\)/.test(fb.json.resultado) && (await call('GET', '/api/state')).json.leads.find((l) => l.nombre === 'Luis FB')?.canal === 'facebook', 'Facebook Messenger crea su lead');
  const viejo = Date.now() - 3 * 86400000;
  await waHook(msI('page', 'FBU2', 'm_fb2', { text: 'Hace días' }, viejo));
  const lv2 = (await call('GET', '/api/state')).json.leads.find((l) => l.chatCanal === 'facebook' && l.nombre !== 'Luis FB');
  const cerr = await call('POST', `/api/leads/${lv2.id}/mensajes`, { texto: 'tarde' });
  ok(cerr.status === 409 && /24 horas/.test(cerr.json.error), 'pasadas 24 horas no se puede responder');
  await call('PATCH', '/api/ajustes', { metaActivo: false });
  ok(/desactivados/.test((await waHook(msI('instagram', 'IGU1', 'm_ig9', { text: 'otra' }))).json.resultado) && (await call('POST', `/api/leads/${sofi.id}/mensajes`, { texto: 'x' })).status === 409, 'con el canal apagado no entra ni sale nada');
  await call('PATCH', '/api/ajustes', { metaActivo: true });

  }
  {
    console.log('Roadmap del lead y almacenamiento');
    const rl = await call('POST', '/api/leads', { nombre: 'Lead Roadmap', canal: 'web' });
    const rid = rl.json.lead.id;
    let ex = (await call('GET', `/api/leads/${rid}/extra`)).json;
    ok(Array.isArray(ex.etapas) && ex.etapas.length === 1, 'un lead nuevo ya tiene su primera etapa en el historial');
    await call('PATCH', `/api/leads/${rid}`, { etapa: 'ganado' });
    await call('PATCH', `/api/leads/${rid}`, { nombre: 'Lead Roadmap 2' });
    ex = (await call('GET', `/api/leads/${rid}/extra`)).json;
    ok(ex.etapas.length === 2 && ex.etapas[1].etapa === 'ganado', 'cada cambio de etapa se anota una sola vez (editar otros datos no suma)');
    const u0 = await call('GET', '/api/admin/almacenamiento');
    ok(u0.status === 200 && u0.json.chat.n >= 1 && u0.json.chat.bytes > 0 && u0.json.retencionDias === 180, 'el panel de almacenamiento cuenta los archivos del chat');
    ok((await call('GET', '/api/admin/almacenamiento', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve el almacenamiento');
    ok((await call('PATCH', '/api/ajustes', { retencionDias: 7 })).status === 400, 'una retención rara se rechaza');
    ok((await call('PATCH', '/api/ajustes', { retencionDias: 90 })).status === 200 && (await call('GET', '/api/admin/almacenamiento')).json.retencionDias === 90, 'se guarda cuánto tiempo conservar los archivos');
    ok((await call('POST', '/api/admin/almacenamiento/limpiar', { dias: 90 })).json.borrados === 0, 'limpiar con 90 días no toca archivos recientes');
    ok((await call('POST', '/api/admin/almacenamiento/limpiar', { dias: 0 })).status === 400, 'borrar todo exige confirmación');
    const lp = await call('POST', '/api/admin/almacenamiento/limpiar', { dias: 0, confirmar: true });
    ok(lp.status === 200 && lp.json.borrados >= 1 && lp.json.uso.chat.n === 0, 'limpiar todo borra los archivos del chat');
    const stF = (await call('GET', '/api/state')).json;
    const carF = stF.leads.find((l) => l.nombre === 'Carlos Rojas');
    const msgs = (await call('GET', `/api/leads/${carF.id}/mensajes`)).json.mensajes || [];
    ok(msgs.some((m) => (m.adjuntos || []).some((a) => a.borrado === true)), 'el mensaje se conserva marcado como archivo eliminado');
  }
  {
    console.log('Simulador de demostración');
    const dm = (canal, extra = {}) => call('POST', '/api/demo/mensaje', { canal, nombre: 'Demo ' + canal, texto: 'Hola desde ' + canal, ...extra });
    ok((await call('POST', '/api/demo/mensaje', { canal: 'whatsapp', texto: 'x' }, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no usa el simulador');
    ok((await dm('whatsapp', { tel: '8888-1111' })).status === 400, 'WhatsApp de demo exige número ficticio (empieza con 9)');
    const w = await dm('whatsapp', { tel: '9111-2233' });
    ok(w.status === 200 && /lead creado/.test(w.json.resultado), 'demo WhatsApp: ' + w.json.resultado);
    ok(/lead creado/.test((await dm('instagram')).json.resultado) && /lead creado/.test((await dm('facebook')).json.resultado), 'demo Instagram y Facebook crean leads');
    const c1 = await dm('correo', { email: 'demo@ejemplo.com', asunto: 'Precios' });
    ok(/lead creado/.test(c1.json.resultado), 'demo correo crea lead');
    ok(/mensaje guardado/.test((await dm('correo', { email: 'demo@ejemplo.com' })).json.resultado), 'segundo correo del mismo cliente no duplica');
    const stD = (await call('GET', '/api/state')).json;
    ok(['whatsapp', 'instagram', 'facebook', 'correo'].every((c) => stD.leads.some((l) => l.nombre === 'Demo ' + c && l.canal === c)), 'los 4 leads de demo aparecen con su canal y el nombre escrito');
    const lw = stD.leads.find((l) => l.nombre === 'Demo whatsapp');
    const rr = await call('POST', `/api/leads/${lw.id}/mensajes`, { texto: 'Hola, con gusto le ayudamos' });
    ok(rr.status === 201, 'responder a un contacto de demo funciona sin enviar nada a Meta');
    const cv = (await call('GET', '/api/demo/conversacion?canal=whatsapp&id=50691112233')).json;
    ok(cv.mensajes.length === 2 && cv.mensajes[1].direccion === 'out', 'el simulador ve la respuesta del equipo');
    const eml = (o = {}) => ['From: ' + (o.from || 'Ana Solís <ana.solis@cliente.cr>'), 'To: ventas@negocio.cr', 'Subject: ' + (o.subj || 'Cotización para 4 personas'), 'Message-ID: <' + (o.id || 'eml1@cliente.cr') + '>', 'Date: Wed, 18 Nov 2026 10:00:00 -0600', 'MIME-Version: 1.0', ...(o.h || []), 'Content-Type: text/plain; charset=utf-8', '', o.body || 'Hola, necesito precios.\n\nEl mié, 17 nov 2026 escribió Hotel:\n> texto viejo citado', ''].join('\r\n');
    const e1 = await call('POST', '/api/demo/eml', { raw: eml() });
    ok(/lead creado \(correo\)/.test(e1.json.resultado), 'un correo real (.eml) crea un lead: ' + e1.json.resultado);
    const stE = (await call('GET', '/api/state')).json;
    const le = stE.leads.find((l) => l.email === 'ana.solis@cliente.cr');
    ok(le && le.nombre === 'Ana Solís' && le.canal === 'correo' && le.tieneChat, 'el lead toma nombre, correo y canal del mensaje');
    const me = (await call('GET', `/api/leads/${le.id}/mensajes`)).json;
    ok(me.mensajes.length === 1 && me.mensajes[0].asunto === 'Cotización para 4 personas' && me.mensajes[0].texto.includes('necesito precios') && !me.mensajes[0].texto.includes('texto viejo'), 'se guarda el asunto y se quita lo citado');
    ok(/repetido/.test((await call('POST', '/api/demo/eml', { raw: eml() })).json.resultado), 'el mismo correo no se guarda dos veces');
    ok(/mensaje guardado/.test((await call('POST', '/api/demo/eml', { raw: eml({ id: 'eml2@cliente.cr', subj: 'Re: Cotización', body: 'Gracias, ¿hay descuento?' }) })).json.resultado), 'un segundo correo del mismo cliente se suma al mismo lead');
    for (const [nom, raw] of [
      ['respuesta automática', eml({ id: 'a1', from: 'Bot <bot@cliente.cr>', h: ['Auto-Submitted: auto-replied'] })],
      ['boletín', eml({ id: 'a2', from: 'Ofertas <ofertas@tienda.com>', h: ['List-Unsubscribe: <mailto:x@y.com>'] })],
      ['no-reply', eml({ id: 'a3', from: 'noreply@banco.com' })],
    ]) ok(/^ignorado/.test((await call('POST', '/api/demo/eml', { raw })).json.resultado), 'se ignora: ' + nom);
    ok(stE.leads.filter((l) => /tienda\.com|banco\.com|bot@/.test(l.email || '')).length === 0, 'los correos automáticos no crean leads');
    const adj = eml({ id: 'adj1', from: 'Luis <luis@cliente.cr>' }).replace(/Content-Type: text\/plain[\s\S]*$/, '') + ['Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: text/plain; charset=utf-8', '', 'Adjunto el pasaporte', '--b1', 'Content-Type: application/pdf; name="pasaporte.pdf"', 'Content-Disposition: attachment; filename="pasaporte.pdf"', 'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-1.4 prueba').toString('base64'), '--b1--', ''].join('\r\n');
    ok(/lead creado/.test((await call('POST', '/api/demo/eml', { raw: adj })).json.resultado), 'correo con PDF adjunto entra');
    const ll = (await call('GET', '/api/state')).json.leads.find((l) => l.email === 'luis@cliente.cr');
    const ml = (await call('GET', `/api/leads/${ll.id}/mensajes`)).json.mensajes[0];
    ok(ml.adjuntos.length === 1 && ml.adjuntos[0].type === 'document' && ml.adjuntos[0].name === 'pasaporte.pdf', 'el adjunto se guarda como documento');
    const cfgG = await call('PATCH', '/api/admin/correo', { imapHost: 'localhost', imapPort: 1, usuario: 'ventas@negocio.cr', pass: 'clave-secreta-xyz', ignorar: '@spam.com\nmalo@x.com' });
    ok(cfgG.status === 200 && cfgG.json.cfg.tienePass === true && !JSON.stringify(cfgG.json).includes('clave-secreta-xyz'), 'la contraseña del buzón se guarda y nunca se devuelve');
    const cg = await call('GET', '/api/admin/correo');
    ok(cg.json.configurado && cg.json.cfg.ignorar.length === 2 && !JSON.stringify(cg.json).includes('clave-secreta-xyz') && /correo\/revisar\?token=/.test(cg.json.cronUrl), 'el panel del correo muestra la configuración sin la contraseña');
    ok(/^ignorado/.test((await call('POST', '/api/demo/eml', { raw: eml({ id: 'ig1', from: 'x@spam.com' }) })).json.resultado), 'la lista de remitentes ignorados funciona');
    const pb = await call('POST', '/api/admin/correo/probar', {});
    ok(pb.status === 400 && /Recibir correos/.test(pb.json.error), 'probar con un servidor que no responde da un error claro: ' + pb.json.error);
    ok((await call('POST', '/api/admin/correo/revisar')).status === 502, 'revisar con el buzón caído avisa del error');
    ok((await call('GET', '/api/admin/correo')).json.estado?.ok === false, 'el estado del buzón queda registrado');
    ok((await call('GET', '/api/correo/revisar?token=mal', undefined, { nocookie: true })).status === 401, 'la visita de la tarea programada exige su clave');
    ok((await call('GET', '/api/admin/correo', undefined, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ve la configuración del correo');
    const pg = await fetch(BASE + '/demo', { headers: { cookie } });
    ok(pg.status === 200 && /Simulador de canales/.test(await pg.text()), 'la página /demo se sirve a quien inició sesión');
    ok((await fetch(BASE + '/demo', { redirect: 'manual' })).status === 302, '/demo sin iniciar sesión redirige al login');
  }
  {
    console.log('Roles, PIN y horario');
    const R = (await call('GET', '/api/roles')).json;
    ok(R.roles.some((r) => r.id === 'admin') && R.roles.some((r) => r.id === 'vendedor') && R.permisos.length >= 3, 'existen los roles Administrador y Vendedor y la lista de permisos');
    const rc = await call('POST', '/api/roles', { nombre: 'Recepción', permisos: ['reportes', 'inventado'] });
    ok(rc.status === 201, 'se crea un rol personalizado');
    const rid = (await call('GET', '/api/roles')).json.roles.find((r) => r.nombre === 'Recepción');
    ok(rid && rid.permisos.length === 1 && rid.permisos[0] === 'reportes', 'solo se guardan permisos válidos');
    ok((await call('PATCH', '/api/roles/admin', { nombre: 'x' })).status === 409, 'el rol Administrador no se edita');
    ok((await call('DELETE', '/api/roles/vendedor')).status === 409, 'el rol Vendedor no se borra');
    const mu = await call('POST', '/api/usuarios', { nombre: 'Rita Recepción', email: 'rita@prueba.cr', password: 'clave-rita-123', rol: rid.id });
    ok(mu.status === 201 && mu.json.usuario.rol === rid.id, 'se crea un usuario con el rol nuevo');
    ok((await call('POST', '/api/usuarios', { nombre: 'X', email: 'x@prueba.cr', password: 'clave-xxx-123', rol: 'no-existe' })).status === 400, 'un rol inexistente se rechaza');
    ok((await call('DELETE', `/api/roles/${rid.id}`)).status === 409, 'no se borra un rol con usuarios');
    const uid2 = mu.json.usuario.id;
    ok((await call('PATCH', `/api/usuarios/${uid2}`, { pin: '12' })).status === 400, 'el PIN debe tener 4 a 6 números');
    ok((await call('PATCH', `/api/usuarios/${uid2}`, { pin: '4821' })).status === 200, 'se asigna un PIN');
    ok((await call('GET', '/api/auth/opciones', undefined, { nocookie: true })).json.pin === true, 'la entrada con PIN está activa por defecto');
    const lp = await call('POST', '/api/auth/pin', { email: 'rita@prueba.cr', pin: '4821' }, { nocookie: true });
    ok(lp.status === 200 && /pulso_session/.test(lp.headers.get('set-cookie') || ''), 'entra con correo y PIN');
    const ckR = (lp.headers.get('set-cookie') || '').split(';')[0];
    const stR = await call('GET', '/api/state', undefined, { nocookie: true, headers: { cookie: ckR } });
    ok(stR.status === 200 && stR.json.me.rol === rid.id && stR.json.me.permisos.join() === 'reportes', 'la sesión trae los permisos del rol');
    const lid = stR.json.leads[0].id;
    ok((await call('DELETE', `/api/leads/${lid}`, undefined, { nocookie: true, headers: { cookie: ckR } })).status === 403, 'sin permiso no puede eliminar leads');
    ok((await call('GET', '/api/roles', undefined, { nocookie: true, headers: { cookie: ckR } })).status === 403, 'un rol personalizado no entra a la administración');
    ok(stR.json.leads.length === 0 || stR.json.leads.every((l) => !l.asignado || l.asignado === stR.json.me.id), 'sin «ver todos» solo ve sus leads y los sin asignar');
    ok((await call('PATCH', `/api/roles/${rid.id}`, { permisos: ['ver_todos', 'eliminar_leads'] })).status === 200, 'se cambian los permisos del rol');
    await new Promise((r) => setTimeout(r, 15500));
    const st2 = await call('GET', '/api/state', undefined, { nocookie: true, headers: { cookie: ckR } });
    ok(st2.json.me.permisos.includes('ver_todos') && st2.json.leads.length >= stR.json.leads.length, 'los permisos nuevos se aplican en segundos, sin volver a entrar');
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/pin', { email: 'rita@prueba.cr', pin: '0000' }, { nocookie: true });
    ok((await call('POST', '/api/auth/pin', { email: 'rita@prueba.cr', pin: '4821' }, { nocookie: true })).status === 401, '5 PIN erróneos bloquean la cuenta 15 minutos');
    ok((await call('POST', '/api/auth/pin', { email: 'admin@prueba.cr', pin: '1234' }, { nocookie: true })).status === 401, 'los administradores no entran con PIN');
    ok((await call('PATCH', '/api/ajustes', { pinActivo: false })).status === 200 && (await call('POST', '/api/auth/pin', { email: 'rita@prueba.cr', pin: '4821' }, { nocookie: true })).status === 403, 'se puede apagar la entrada con PIN');
    await call('PATCH', '/api/ajustes', { pinActivo: true });
    const hz = await call('PATCH', '/api/ajustes', { horario: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ on: d >= 1 && d <= 5, desde: '08:00', hasta: '17:00' })) });
    ok(hz.status === 200 && hz.json.settings.horario[1].on && !hz.json.settings.horario[0].on, 'se guarda el horario de atención');
    ok((await call('PATCH', '/api/ajustes', { horario: [0, 1, 2, 3, 4, 5, 6].map(() => ({ on: true, desde: '18:00', hasta: '09:00' })) })).status === 400, 'un horario con cierre antes de la apertura se rechaza');
    const tOk = await call('POST', '/api/tareas', { titulo: 'Llamar (lunes 10am)', fecha: '2030-01-07', hora: '10:00' });
    ok(tOk.status === 201, 'una tarea dentro del horario se guarda');
    const tNo = await call('POST', '/api/tareas', { titulo: 'Llamar (domingo)', fecha: '2030-01-06', hora: '10:00' });
    ok(tNo.status === 409 && tNo.json.fueraDeHorario && /domingo/.test(tNo.json.error), 'una tarea en día cerrado pide confirmación: ' + tNo.json.error);
    ok((await call('POST', '/api/tareas', { titulo: 'Tarde', fecha: '2030-01-07', hora: '20:00' })).status === 409, 'una tarea fuera de hora pide confirmación');
    ok((await call('POST', '/api/tareas', { titulo: 'Forzada', fecha: '2030-01-06', hora: '10:00', forzar: true })).status === 201, 'con confirmación se guarda igual');
  }
  {
    console.log('Categorías y etapa En pausa');
    ok((await call('POST', '/api/categorias', { nombre: 'Habitaciones' })).status === 201, 'se crea una categoría');
    ok((await call('POST', '/api/categorias', { nombre: 'habitaciones' })).status === 409, 'no se repite el nombre de una categoría');
    const cats = (await call('GET', '/api/productos')).json.categorias;
    const cid = cats.find((c) => c.nombre === 'Habitaciones').id;
    const pc = await call('POST', '/api/productos', { nombre: 'Suite doble', precio: 100, moneda: 'USD', categoriaId: cid });
    ok(pc.status === 201 && pc.json.producto.categoriaId === cid, 'un producto se guarda con su categoría');
    ok((await call('POST', '/api/productos', { nombre: 'Malo', categoriaId: 'zzz' })).status === 400, 'una categoría inexistente se rechaza');
    const stc = (await call('GET', '/api/state')).json;
    ok(stc.categorias.some((c) => c.id === cid) && stc.productos.some((p) => p.nombre === 'Suite doble' && p.categoriaId === cid), 'el estado trae categorías y productos con su categoría');
    ok((await call('DELETE', `/api/categorias/${cid}`)).status === 200 && (await call('GET', '/api/productos')).json.productos.find((p) => p.nombre === 'Suite doble').categoriaId === '', 'al borrar una categoría los productos quedan sin categoría');
    const ep = await call('POST', '/api/etapas', { nombre: 'En pausa', color: 'warn', tipo: 'pausada' });
    ok(ep.status === 201 && ep.json.etapas.find((e) => e.nombre === 'En pausa').tipo === 'pausada', 'se crea una etapa de tipo En pausa');
    const ord = ep.json.etapas.map((e) => e.tipo);
    ok(ord.indexOf('pausada') < ord.indexOf('ganada'), 'la etapa en pausa queda antes de Ganado y Perdido');
    const lp = (await call('POST', '/api/leads', { nombre: 'Lead en pausa', canal: 'web' })).json.lead;
    const mv = await call('PATCH', `/api/leads/${lp.id}`, { etapa: ep.json.etapas.find((e) => e.nombre === 'En pausa').clave });
    ok(mv.status === 200 && mv.json.lead.etapa === 'en-pausa', 'un lead se puede mover a En pausa');
    await call('DELETE', `/api/etapas/en-pausa`);
  }
  if (process.env.LIC_PRIV) {
    console.log('Licencia de uso');
    const { sign, createPrivateKey } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const key = createPrivateKey(readFileSync(process.env.LIC_PRIV));
    const mk = (o = {}) => { const p = Buffer.from(JSON.stringify({ v: 1, id: 't1', cliente: 'Hotel Prueba', emitida: '2026-01-01', vence: null, usuarios: 0, ...o })).toString('base64url'); return 'PULSO1.' + p + '.' + sign(null, Buffer.from(p), key).toString('base64url'); };
    let L = (await call('GET', '/api/state')).json.licencia;
    ok(L.estado === 'prueba' && L.diasRestantes > 0 && L.puedeEscribir, 'sin licencia corre en prueba de 14 días: ' + L.diasRestantes + ' días');
    ok((await call('POST', '/api/licencia', { licencia: 'cualquier cosa' })).status === 400, 'un texto cualquiera no es licencia');
    const buena = mk({ usuarios: 2 });
    ok((await call('POST', '/api/licencia', { licencia: buena.slice(0, -4) + 'AAAA' })).status === 400, 'una licencia alterada se rechaza');
    ok((await call('POST', '/api/licencia', { licencia: buena }, { nocookie: true, headers: { cookie: vend } })).status === 403, 'el vendedor no ingresa licencias');
    const ok1 = await call('POST', '/api/licencia', { licencia: buena });
    ok(ok1.status === 200 && ok1.json.licencia.estado === 'valida' && ok1.json.licencia.cliente === 'Hotel Prueba', 'una licencia firmada se activa');
    const tercero = await call('POST', '/api/usuarios', { nombre: 'Tercero', email: 't3@prueba.cr', password: 'otra-clave-123' });
    ok(tercero.status === 402 && /2 usuarios/.test(tercero.json.error), 'la licencia limita la cantidad de usuarios');
    ok((await call('POST', '/api/licencia', { licencia: mk({ vence: '2020-01-01' }) })).json.licencia.estado === 'vencida', 'una licencia vencida se reconoce');
    ok((await call('POST', '/api/leads', { nombre: 'Bloqueado' })).status === 402, 'vencida: no se puede escribir');
    ok((await call('GET', '/api/state')).status === 200, 'vencida: sí se puede ver todo');
    const rw = await waHook(waText('50660009999', 'wamid.LIC', 'hola con licencia vencida', 'Cliente Lic'));
    ok(rw.status === 200, 'vencida: los mensajes de clientes siguen entrando');
    ok((await call('POST', '/api/licencia', { licencia: mk({ usuarios: 0 }) })).json.licencia.estado === 'valida' && (await call('POST', '/api/leads', { nombre: 'Ya puede' })).status === 201, 'al ingresar una licencia buena vuelve a funcionar');
  }

  console.log(`\n${pass} pruebas bien, ${failN} con fallo`);
  fake.close();
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); fake.close(); process.exit(2); });
