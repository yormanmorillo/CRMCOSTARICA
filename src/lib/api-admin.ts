import { usoAlmacen, limpiarMedios } from './almacen';
import { q } from './db';
import { HttpError, json, uid, str } from './util';
import { loadLead, getEtapas, logAct, COLORES, TIPOS_ETAPA, MONEDAS } from './leads';
import { route, body, mustLead } from './router';
import { estadoLicencia, leerLicencia, limpiarCacheLicencia } from './licencia';
import { setSetting } from './leads';

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/* ---------- Datos extra de la ficha: productos, notas y línea de tiempo ---------- */
const mapItem = (r: any) => ({ id: r.id, productoId: r.producto_id || '', nombre: r.nombre, cantidad: Number(r.cantidad), precio: Number(r.precio), moneda: r.moneda });

route('GET', '/leads/:id/extra', async ({ params }) => {
  await mustLead(params.id);
  const [notas, items, act, etapas] = await Promise.all([
    q('select id, usuario, usuario_id, texto, creado from notas where lead_id=$1 order by creado desc', [params.id]),
    q('select id, producto_id, nombre, cantidad, precio, moneda from lead_productos where lead_id=$1 order by creado', [params.id]),
    q('select n, tipo, texto, usuario, creado from actividad where lead_id=$1 order by n desc limit 80', [params.id]),
    q('select n, etapa, entrada from lead_etapas where lead_id=$1 order by n', [params.id]),
  ]);
  return json({ notas, productos: items.map(mapItem), actividad: act, etapas });
});

route('POST', '/leads/:id/notas', async ({ req, params, user }) => {
  await mustLead(params.id);
  const texto = str((await body(req)).texto, 2000);
  if (!texto) throw new HttpError(400, 'Escribe la nota');
  await q('insert into notas(id, lead_id, usuario, usuario_id, texto) values($1,$2,$3,$4,$5)', [uid(), params.id, user!.nombre, user!.id, texto]);
  await logAct(params.id, 'nota', `Nota: ${texto.slice(0, 140)}`, user!.nombre);
  return json({ ok: true }, 201);
});

route('DELETE', '/notas/:id', async ({ params, user }) => {
  const n = (await q('select usuario_id from notas where id=$1', [params.id]))[0];
  if (!n) throw new HttpError(404, 'Nota no encontrada');
  if (user!.rol !== 'admin' && n.usuario_id !== user!.id) throw new HttpError(403, 'Solo puedes borrar tus propias notas');
  await q('delete from notas where id=$1', [params.id]);
  return json({ ok: true });
});

/* ---------- Catálogo de productos ---------- */
const mapProducto = (p: any) => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: Number(p.precio), moneda: p.moneda, activo: p.activo, categoriaId: p.categoria_id || '' });

route('GET', '/productos', async () => json({
  productos: (await q('select id, nombre, descripcion, precio, moneda, activo, categoria_id from productos order by nombre')).map(mapProducto),
  categorias: await q('select c.id, c.nombre, c.orden, (select count(*) from productos p where p.categoria_id=c.id)::int as productos from categorias c order by c.orden, c.nombre'),
}), { admin: true });

/* ---------- Categorías de productos ---------- */
const catValida = async (v: unknown) => {
  const id = String(v || '');
  if (!id) return null;
  if (!(await q('select 1 from categorias where id=$1', [id])).length) throw new HttpError(400, 'Esa categoría no existe');
  return id;
};
route('POST', '/categorias', async ({ req }) => {
  const nombre = str((await body(req)).nombre, 60);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre de la categoría');
  if ((await q('select 1 from categorias where lower(nombre)=lower($1)', [nombre])).length) throw new HttpError(409, 'Ya existe una categoría con ese nombre');
  const max = (await q('select coalesce(max(orden),0)::int as m from categorias'))[0].m;
  await q('insert into categorias(id, nombre, orden) values($1,$2,$3)', [uid(), nombre, max + 1]);
  return json({ ok: true }, 201);
}, { admin: true });
route('PATCH', '/categorias/:id', async ({ req, params }) => {
  const nombre = str((await body(req)).nombre, 60);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre de la categoría');
  const r = await q('update categorias set nombre=$2 where id=$1 returning id', [params.id, nombre]);
  if (!r.length) throw new HttpError(404, 'Categoría no encontrada');
  return json({ ok: true });
}, { admin: true });
route('DELETE', '/categorias/:id', async ({ params }) => {
  await q('update productos set categoria_id=null where categoria_id=$1', [params.id]); // los productos quedan «sin categoría»
  await q('delete from categorias where id=$1', [params.id]);
  return json({ ok: true });
}, { admin: true });

route('POST', '/productos', async ({ req }) => {
  const b = await body(req);
  const nombre = str(b.nombre, 120);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre del producto');
  const moneda = MONEDAS.includes(b.moneda) ? b.moneda : 'CRC';
  const id = uid();
  await q('insert into productos(id, nombre, descripcion, precio, moneda, categoria_id) values($1,$2,$3,$4,$5,$6)', [id, nombre, str(b.descripcion, 300), num(b.precio, 0, 1e10, 0), moneda, await catValida(b.categoriaId)]);
  return json({ producto: mapProducto((await q('select * from productos where id=$1', [id]))[0]) }, 201);
}, { admin: true });

route('PATCH', '/productos/:id', async ({ req, params }) => {
  const b = await body(req);
  const cur = (await q('select * from productos where id=$1', [params.id]))[0];
  if (!cur) throw new HttpError(404, 'Producto no encontrado');
  const nombre = 'nombre' in b ? str(b.nombre, 120) : cur.nombre;
  if (!nombre) throw new HttpError(400, 'Escribe el nombre del producto');
  await q('update productos set nombre=$2, descripcion=$3, precio=$4, moneda=$5, activo=$6, categoria_id=$7 where id=$1', [
    params.id, nombre, 'descripcion' in b ? str(b.descripcion, 300) : cur.descripcion,
    'precio' in b ? num(b.precio, 0, 1e10, 0) : cur.precio, MONEDAS.includes(b.moneda) ? b.moneda : cur.moneda, 'activo' in b ? !!b.activo : cur.activo,
    'categoriaId' in b ? await catValida(b.categoriaId) : cur.categoria_id,
  ]);
  return json({ producto: mapProducto((await q('select * from productos where id=$1', [params.id]))[0]) });
}, { admin: true });

route('DELETE', '/productos/:id', async ({ params }) => {
  await q('delete from productos where id=$1', [params.id]); // los leads conservan el nombre y el precio con que se agregó
  return json({ ok: true });
}, { admin: true });

/* ---------- Productos dentro de un lead ---------- */
route('POST', '/leads/:id/productos', async ({ req, params, user }) => {
  await mustLead(params.id);
  const b = await body(req);
  let nombre = str(b.nombre, 120);
  let precio = num(b.precio, 0, 1e10, 0);
  let moneda = MONEDAS.includes(b.moneda) ? b.moneda : 'CRC';
  let productoId: string | null = null;
  if (b.productoId) {
    const p = (await q('select * from productos where id=$1', [String(b.productoId)]))[0];
    if (!p) throw new HttpError(404, 'Ese producto ya no existe');
    productoId = p.id;
    nombre = p.nombre;
    if (!('precio' in b) || b.precio === '' || b.precio == null) precio = Number(p.precio);
    if (!b.moneda) moneda = p.moneda;
  }
  if (!nombre) throw new HttpError(400, 'Elige un producto o escribe el nombre');
  const cantidad = num(b.cantidad, 0.01, 99999, 1);
  await q('insert into lead_productos(id, lead_id, producto_id, nombre, cantidad, precio, moneda) values($1,$2,$3,$4,$5,$6,$7)', [uid(), params.id, productoId, nombre, cantidad, precio, moneda]);
  await logAct(params.id, 'producto', `Producto agregado: ${nombre} × ${cantidad}`, user!.nombre);
  return json({ lead: await loadLead(params.id) }, 201);
});

route('PATCH', '/lead-productos/:id', async ({ req, params }) => {
  const b = await body(req);
  const cur = (await q('select * from lead_productos where id=$1', [params.id]))[0];
  if (!cur) throw new HttpError(404, 'Producto no encontrado en el lead');
  await q('update lead_productos set cantidad=$2, precio=$3 where id=$1', [
    params.id, 'cantidad' in b ? num(b.cantidad, 0.01, 99999, 1) : cur.cantidad, 'precio' in b ? num(b.precio, 0, 1e10, 0) : cur.precio,
  ]);
  return json({ lead: await loadLead(cur.lead_id) });
});

route('DELETE', '/lead-productos/:id', async ({ params, user }) => {
  const r = (await q('delete from lead_productos where id=$1 returning lead_id, nombre', [params.id]))[0];
  if (!r) throw new HttpError(404, 'Producto no encontrado en el lead');
  await logAct(r.lead_id, 'producto', `Producto quitado: ${r.nombre}`, user!.nombre);
  return json({ lead: await loadLead(r.lead_id) });
});

/* ---------- Etapas del embudo ---------- */
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'etapa';

async function normalizarOrden() {
  const et = await getEtapas();
  for (let i = 0; i < et.length; i++) if (et[i].orden !== i + 1) await q('update etapas set orden=$2 where clave=$1', [et[i].clave, i + 1]);
}

/** Tiene que haber al menos una etapa inicial, una ganada y una perdida. */
async function validarEtapas() {
  const et = await getEtapas();
  for (const t of ['inicial', 'ganada', 'perdida']) {
    if (!et.some((e) => e.tipo === t)) {
      const nombres: Record<string, string> = { inicial: 'inicial (donde entran los leads nuevos)', ganada: 'de ganado', perdida: 'de perdido' };
      throw new HttpError(409, `Tiene que haber al menos una etapa ${nombres[t]}.`);
    }
  }
}

route('GET', '/etapas', async () => {
  const cont = await q('select etapa, count(*)::int as n from leads group by etapa');
  const m = new Map(cont.map((c) => [c.etapa, c.n]));
  return json({ etapas: (await getEtapas()).map((e) => ({ ...e, leads: m.get(e.clave) || 0 })) });
}, { admin: true });

route('POST', '/etapas', async ({ req }) => {
  const b = await body(req);
  const nombre = str(b.nombre, 40);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre de la etapa');
  const tipo = TIPOS_ETAPA.includes(b.tipo) ? b.tipo : 'abierta';
  const color = COLORES.includes(b.color) ? b.color : 'accent';
  const et = await getEtapas();
  let clave = slug(nombre);
  for (let i = 2; et.some((e) => e.clave === clave); i++) clave = `${slug(nombre)}-${i}`;
  let orden = et.length + 1;
  if (tipo === 'abierta' || tipo === 'inicial' || tipo === 'pausada') {
    // Las etapas nuevas del embudo van antes de Ganado y Perdido.
    const cierre = et.find((e) => e.tipo === 'ganada' || e.tipo === 'perdida');
    if (cierre) {
      orden = cierre.orden;
      await q('update etapas set orden=orden+1 where orden>=$1', [orden]);
    }
  }
  await q('insert into etapas(clave, nombre, orden, color, tipo) values($1,$2,$3,$4,$5)', [clave, nombre, orden, color, tipo]);
  await normalizarOrden();
  return json({ etapas: await getEtapas() }, 201);
}, { admin: true });

route('PATCH', '/etapas/:clave', async ({ req, params }) => {
  const b = await body(req);
  const cur = (await getEtapas()).find((e) => e.clave === params.clave);
  if (!cur) throw new HttpError(404, 'Etapa no encontrada');
  const nombre = 'nombre' in b ? str(b.nombre, 40) : cur.nombre;
  if (!nombre) throw new HttpError(400, 'Escribe el nombre de la etapa');
  const color = 'color' in b ? (COLORES.includes(b.color) ? b.color : cur.color) : cur.color;
  const tipo = 'tipo' in b ? (TIPOS_ETAPA.includes(b.tipo) ? b.tipo : cur.tipo) : cur.tipo;
  await q('update etapas set nombre=$2, color=$3, tipo=$4 where clave=$1', [params.clave, nombre, color, tipo]);
  try {
    await validarEtapas();
  } catch (e) {
    await q('update etapas set nombre=$2, color=$3, tipo=$4 where clave=$1', [params.clave, cur.nombre, cur.color, cur.tipo]);
    throw e;
  }
  return json({ etapas: await getEtapas() });
}, { admin: true });

route('POST', '/etapas/mover', async ({ req }) => {
  const b = await body(req);
  const et = await getEtapas();
  const i = et.findIndex((e) => e.clave === String(b.clave));
  if (i < 0) throw new HttpError(404, 'Etapa no encontrada');
  const j = b.dir === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < et.length) {
    await q('update etapas set orden=$2 where clave=$1', [et[i].clave, et[j].orden]);
    await q('update etapas set orden=$2 where clave=$1', [et[j].clave, et[i].orden]);
    await normalizarOrden();
  }
  return json({ etapas: await getEtapas() });
}, { admin: true });

route('DELETE', '/etapas/:clave', async ({ params }) => {
  const cur = (await getEtapas()).find((e) => e.clave === params.clave);
  if (!cur) throw new HttpError(404, 'Etapa no encontrada');
  const n = (await q('select count(*)::int as n from leads where etapa=$1', [params.clave]))[0].n;
  if (n > 0) throw new HttpError(409, `Hay ${n} lead${n === 1 ? '' : 's'} en esta etapa. Muévelos a otra etapa antes de eliminarla.`);
  await q('delete from etapas where clave=$1', [params.clave]);
  try {
    await validarEtapas();
  } catch (e) {
    await q('insert into etapas(clave, nombre, orden, color, tipo) values($1,$2,$3,$4,$5)', [cur.clave, cur.nombre, cur.orden, cur.color, cur.tipo]);
    throw e;
  }
  await normalizarOrden();
  return json({ etapas: await getEtapas() });
}, { admin: true });

/* ---------- Motivos por los que no se concretó un lead ---------- */
route('GET', '/motivos', async () => {
  const cont = await q('select motivo_id, count(*)::int as n from leads where motivo_id is not null group by motivo_id');
  const m = new Map(cont.map((c) => [c.motivo_id, c.n]));
  const rows = await q('select id, nombre, orden, activo from motivos_perdida order by orden, nombre');
  return json({ motivos: rows.map((r) => ({ ...r, leads: m.get(r.id) || 0 })) });
}, { admin: true });

route('POST', '/motivos', async ({ req }) => {
  const nombre = str((await body(req)).nombre, 80);
  if (!nombre) throw new HttpError(400, 'Escribe el motivo');
  const max = (await q('select coalesce(max(orden),0)::int as m from motivos_perdida'))[0].m;
  await q('insert into motivos_perdida(id, nombre, orden) values($1,$2,$3)', [uid(), nombre, max + 1]);
  return json({ ok: true }, 201);
}, { admin: true });

route('PATCH', '/motivos/:id', async ({ req, params }) => {
  const b = await body(req);
  const cur = (await q('select * from motivos_perdida where id=$1', [params.id]))[0];
  if (!cur) throw new HttpError(404, 'Motivo no encontrado');
  const nombre = 'nombre' in b ? str(b.nombre, 80) : cur.nombre;
  if (!nombre) throw new HttpError(400, 'Escribe el motivo');
  await q('update motivos_perdida set nombre=$2, activo=$3 where id=$1', [params.id, nombre, 'activo' in b ? !!b.activo : cur.activo]);
  if (b.dir === 'up' || b.dir === 'down') {
    const rows = await q('select id, orden from motivos_perdida order by orden, nombre');
    const i = rows.findIndex((r) => r.id === params.id);
    const j = b.dir === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < rows.length) {
      const lista = rows.map((r) => r.id);
      [lista[i], lista[j]] = [lista[j], lista[i]];
      for (let k = 0; k < lista.length; k++) await q('update motivos_perdida set orden=$2 where id=$1', [lista[k], k + 1]);
    }
  }
  return json({ ok: true });
}, { admin: true });

route('DELETE', '/motivos/:id', async ({ params }) => {
  const n = (await q('select count(*)::int as n from leads where motivo_id=$1', [params.id]))[0].n;
  if (n > 0) throw new HttpError(409, `${n} lead${n === 1 ? '' : 's'} usa${n === 1 ? '' : 'n'} este motivo. Desactívalo en vez de eliminarlo: así deja de ofrecerse pero se conserva el historial.`);
  await q('delete from motivos_perdida where id=$1', [params.id]);
  return json({ ok: true });
}, { admin: true });

/* ---------- Licencia ---------- */
route('GET', '/licencia', async () => {
  const n = (await q('select count(*)::int as n from usuarios'))[0].n;
  return json({ licencia: await estadoLicencia(), usuariosActuales: n });
}, { admin: true });

route('POST', '/licencia', async ({ req }) => {
  const token = String((await body(req)).licencia || '').trim();
  const r = leerLicencia(token);
  if (r.ok === false) throw new HttpError(400, r.error);
  await setSetting('licencia', token);
  limpiarCacheLicencia();
  const n = (await q('select count(*)::int as n from usuarios'))[0].n;
  return json({ licencia: await estadoLicencia(), usuariosActuales: n });
}, { admin: true, libre: true });

/* ---------- Galería de imágenes ---------- */
route('GET', '/admin/archivos', async ({ url }) => {
  const origen = url.searchParams.get('origen') || 'todas';
  const limit = Math.min(96, Math.max(1, parseInt(url.searchParams.get('limit') || '48', 10) || 48));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const partes: string[] = [];
  if (origen !== 'chat') partes.push("select 'lead' as origen, a.id, a.nombre, a.lead_id, l.nombre as lead_nombre, a.creado, '/api/archivos/' || a.id as url from archivos a join leads l on l.id = a.lead_id");
  if (origen !== 'lead') partes.push("select 'chat' as origen, m.id, m.nombre, m.lead_id, l.nombre as lead_nombre, m.creado, '/api/medios/' || m.id as url from medios m join leads l on l.id = m.lead_id where m.mime like 'image/%'");
  const union = partes.join(' union all ');
  const total = (await q(`select count(*)::int as n from (${union}) t`))[0].n;
  const items = await q(`select * from (${union}) t order by creado desc limit ${limit} offset ${offset}`);
  return json({ items, total });
}, { admin: true });

route('DELETE', '/medios/:id', async ({ params }) => {
  const r = (await q('delete from medios where id=$1 returning lead_id', [params.id]))[0];
  if (!r) throw new HttpError(404, 'Archivo no encontrado');
  await q("update mensajes set adjuntos = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(adjuntos) e where e->>'url' <> $1) where lead_id=$2", ['/api/medios/' + params.id, r.lead_id]);
  return json({ ok: true });
}, { admin: true });

/* ---------- Espacio usado por imágenes y archivos ---------- */
route('GET', '/admin/almacenamiento', async () => json(await usoAlmacen()), { admin: true });
route('POST', '/admin/almacenamiento/limpiar', async ({ req }) => {
  const b = await body(req);
  const dias = Number(b.dias);
  if (!Number.isInteger(dias) || dias < 0 || dias > 3650) throw new HttpError(400, 'Días no válidos');
  if (dias === 0 && b.confirmar !== true) throw new HttpError(400, 'Confirma que quieres borrar todas las imágenes del chat');
  const r = await limpiarMedios(dias);
  return json({ ...r, uso: await usoAlmacen() });
}, { admin: true });
