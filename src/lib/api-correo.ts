import { randomBytes } from 'node:crypto';
import { q } from './db';
import { HttpError, json, safeEqual } from './util';
import { route, body } from './router';
import { canalActivo, getAjuste, setSetting } from './leads';
import { cfgPublica, estadoCorreo, guardarCfg, listo, leerCfg, probarCorreo, procesarFuente, revisarCorreo } from './correo';

async function tokenCron() {
  let t = await getAjuste('correoToken');
  if (!t) {
    t = randomBytes(18).toString('base64url');
    await setSetting('correoToken', t);
  }
  return t;
}

route('GET', '/admin/correo', async ({ req }) => {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const cfg = await cfgPublica();
  const recientes = await q("select id, evento, resultado, creado from eventos_cw where evento = 'correo' order by id desc limit 15");
  return json({
    cfg, activo: await canalActivo('correo'), configurado: listo(await leerCfg()),
    estado: await estadoCorreo(), recientes,
    cronUrl: `${proto}://${host}/api/correo/revisar?token=${await tokenCron()}`,
  });
}, { admin: true });

route('PATCH', '/admin/correo', async ({ req }) => {
  await guardarCfg(await body(req));
  return json({ ok: true, cfg: await cfgPublica() });
}, { admin: true });

route('POST', '/admin/correo/probar', async ({ req }) => json(await probarCorreo(await body(req).catch(() => ({})))), { admin: true });
route('POST', '/admin/correo/revisar', async () => json(await revisarCorreo()), { admin: true });

// Para servidores sin proceso permanente (p. ej. Vercel): una tarea programada llama aquí cada minuto o dos.
route('GET', '/correo/revisar', async ({ url }) => {
  const t = url.searchParams.get('token') || '';
  if (!t || !safeEqual(t, await tokenCron())) throw new HttpError(401, 'Clave no válida');
  if (!(await canalActivo('correo'))) return json({ ok: true, msg: 'Correo desactivado' });
  return json({ ok: true, ...(await revisarCorreo()) });
}, { public: true, webhook: true });

// Pega un correo completo (.eml): pasa por los mismos filtros que el buzón real. Sirve para demostrar y para probar.
route('POST', '/demo/eml', async ({ req }) => {
  const b = await body(req);
  const raw = String(b.raw || '');
  if (raw.length < 20 || raw.length > 6_000_000) throw new HttpError(400, 'Pega el correo completo');
  return json({ resultado: await procesarFuente(raw) });
}, { admin: true });
