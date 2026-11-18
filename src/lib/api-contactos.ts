import { q } from './db';
import { HttpError, json, str, digits, clamp } from './util';
import { route, body } from './router';
import type { User } from './auth';

/** Contactos: la libreta de personas. Se llena sola con cada lead (cualquier canal) y se conserva aunque el lead se elimine. */
const veTodo = (u: User) => u.rol === 'admin' || u.permisos.includes('ver_todos');
// Condición de leads visibles para el usuario (parámetro $1 = su id).
const VISIBLE = "(l.asignado is null or l.asignado = $1)";

const fila = (r: any) => ({ id: r.id, nombre: r.nombre, tel: r.tel, email: r.email, empresa: r.empresa, pais: r.pais, notas: r.notas, creado: r.creado, leads: r.leads ?? 0, abiertos: r.abiertos ?? 0, canales: r.canales ?? [], ultimo: r.ultimo ?? null });

route('GET', '/contactos', async ({ url, user }) => {
  const busca = str(url.searchParams.get('q'), 80).toLowerCase();
  const limit = clamp(url.searchParams.get('limit'), 1, 300, 100);
  const offset = clamp(url.searchParams.get('offset'), 0, 1000000, 0);
  const todo = veTodo(user!);
  const P: any[] = [user!.id];
  let where = todo ? 'true' : 'count(l.id) > 0';
  const filtro: string[] = [];
  if (busca) {
    P.push('%' + busca + '%');
    filtro.push(`(lower(c.nombre) like $${P.length} or lower(c.email) like $${P.length} or lower(c.empresa) like $${P.length} or c.tel like $${P.length} or c.tel_d like $${P.length})`);
  }
  const join = todo ? 'left join leads l on l.contacto_id = c.id and $1::text is not null' : `left join leads l on l.contacto_id = c.id and ${VISIBLE}`;
  const base = `from contactos c ${join} ${filtro.length ? 'where ' + filtro.join(' and ') : ''} group by c.id having ${where}`;
  const total = (await q(`select count(*)::int as n from (select c.id ${base}) t`, P))[0].n;
  const rows = await q(
    `select c.*, count(l.id)::int as leads,
       count(l.id) filter (where e.tipo in ('inicial','abierta','pausada'))::int as abiertos,
       coalesce(array_agg(distinct l.canal) filter (where l.canal is not null), '{}') as canales,
       max(l.actualizado) as ultimo
     from contactos c ${join} left join etapas e on e.clave = l.etapa
     ${filtro.length ? 'where ' + filtro.join(' and ') : ''}
     group by c.id having ${where}
     order by max(l.actualizado) desc nulls last, c.nombre
     limit ${limit} offset ${offset}`, P);
  return json({ contactos: rows.map(fila), total });
}, { libre: true });

// Exportación a CSV (se abre en Excel). Los textos que empiezan con = + - @ se protegen contra fórmulas.
route('GET', '/contactos.csv', async ({ user }) => {
  if (!veTodo(user!)) throw new HttpError(403, 'Tu rol no puede exportar todos los contactos.');
  const rows = await q('select c.*, (select count(*) from leads l where l.contacto_id = c.id)::int as leads from contactos c order by c.nombre');
  const cel = (v: any) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^\+?[\d\s()-]+$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lineas = [['Nombre', 'Teléfono', 'Correo', 'Empresa', 'País', 'Leads', 'Notas', 'Creado'].map(cel).join(',')];
  rows.forEach((r: any) => lineas.push([r.nombre, r.tel, r.email, r.empresa, r.pais, r.leads, r.notas, new Date(r.creado).toISOString().slice(0, 10)].map(cel).join(',')));
  return new Response('\uFEFF' + lineas.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="contactos.csv"', 'cache-control': 'no-store' } });
}, { libre: true });

async function cargar(id: string, user: User) {
  const c = (await q('select * from contactos where id=$1', [id]))[0];
  if (!c) throw new HttpError(404, 'Contacto no encontrado');
  const leads = await q(
    `select l.id, l.nombre, l.canal, l.etapa, e.nombre as etapa_nombre, e.color as etapa_color, l.creado, l.actualizado, u.nombre as asignado_nombre
     from leads l left join etapas e on e.clave = l.etapa left join usuarios u on u.id = l.asignado
     where l.contacto_id = $2 ${veTodo(user) ? 'and $1::text is not null' : 'and ' + VISIBLE} order by l.actualizado desc`, [user.id, id]);
  if (!veTodo(user) && !leads.length) throw new HttpError(404, 'Contacto no encontrado');
  return { c, leads };
}

route('GET', '/contactos/:id', async ({ params, user }) => {
  const { c, leads } = await cargar(params.id, user!);
  return json({ contacto: fila({ ...c, leads: leads.length }), leads: leads.map((l: any) => ({ id: l.id, nombre: l.nombre, canal: l.canal, etapa: l.etapa, etapaNombre: l.etapa_nombre || l.etapa, etapaColor: l.etapa_color || 'muted', creado: l.creado, actualizado: l.actualizado, asignado: l.asignado_nombre || '' })) });
}, { libre: true });

route('PATCH', '/contactos/:id', async ({ req, params, user }) => {
  await cargar(params.id, user!);
  const b = await body(req);
  const cols: string[] = [];
  const vals: any[] = [];
  const set = (c: string, v: any) => { vals.push(v); cols.push(`${c}=$${vals.length}`); };
  if ('nombre' in b) { const n = str(b.nombre, 120); if (!n) throw new HttpError(400, 'Escribe el nombre'); set('nombre', n); }
  if ('tel' in b) { const t = str(b.tel, 40); set('tel', t); { let d = digits(t); if (d.length === 11 && d.startsWith('506')) d = d.slice(3); set('tel_d', d); } }
  if ('email' in b) {
    const e = str(b.email, 200).toLowerCase();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, 'Correo no válido');
    set('email', e);
  }
  if ('empresa' in b) set('empresa', str(b.empresa, 120));
  if ('pais' in b) set('pais', str(b.pais, 60));
  if ('notas' in b) set('notas', str(b.notas, 2000));
  if (cols.length) { vals.push(params.id); await q(`update contactos set ${cols.join(', ')}, actualizado=now() where id=$${vals.length}`, vals); }
  const { c, leads } = await cargar(params.id, user!);
  return json({ contacto: fila({ ...c, leads: leads.length }) });
});

route('DELETE', '/contactos/:id', async ({ params }) => {
  const n = (await q('select count(*)::int as n from leads where contacto_id=$1', [params.id]))[0].n;
  if (n > 0) throw new HttpError(409, 'Este contacto tiene leads. Elimina primero sus leads.');
  const r = await q('delete from contactos where id=$1 returning id', [params.id]);
  if (!r.length) throw new HttpError(404, 'Contacto no encontrado');
  return json({ ok: true });
}, { admin: true });
