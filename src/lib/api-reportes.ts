import { q } from './db';
import { HttpError, json, hoyCR, isDate } from './util';
import { route } from './router';

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const sumar = (a: string, n: number) => new Date(Date.parse(a) + n * 86400000).toISOString().slice(0, 10);
const lunes = (f: string) => sumar(f, -((new Date(f + 'T00:00:00Z').getUTCDay() + 6) % 7));

/** Reportes: todo se calcula con los leads creados (o cerrados) dentro del rango de fechas elegido. */
route('GET', '/reportes', async ({ url }) => {
  const hoy = hoyCR();
  let hasta = url.searchParams.get('hasta') || hoy;
  let desde = url.searchParams.get('desde') || sumar(hoy, -29);
  if (!isDate(desde) || !isDate(hasta)) throw new HttpError(400, 'Fechas no válidas');
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (dias(desde, hasta) > 800) throw new HttpError(400, 'El rango máximo es de unos 2 años');
  const P = [desde, hasta];
  const CR = "(l.etapa_en at time zone 'America/Costa_Rica')::date::text";

  const [nuevos, ganados, perdidos, abiertos, porCanal, embudo, porDia, vend, motivos, prods, valores, etapas] = await Promise.all([
    q('select count(*)::int as n from leads where creado between $1 and $2', P),
    q(`select l.id, l.creado, ${CR} as cierre, l.canal, l.asignado from leads l join etapas e on e.clave=l.etapa where e.tipo='ganada' and ${CR} between $1 and $2`, P),
    q(`select l.id, l.motivo_id from leads l join etapas e on e.clave=l.etapa where e.tipo='perdida' and ${CR} between $1 and $2`, P),
    q("select l.id from leads l join etapas e on e.clave=l.etapa where e.tipo in ('inicial','abierta','pausada')"),
    q(`select l.canal, count(*)::int as nuevos,
         count(*) filter (where e.tipo='ganada')::int as ganados,
         count(*) filter (where e.tipo='perdida')::int as perdidos
       from leads l join etapas e on e.clave=l.etapa where l.creado between $1 and $2 group by l.canal order by 2 desc`, P),
    q(`select e.clave, e.nombre, e.color, e.tipo, e.orden, count(distinct h.lead_id)::int as llegaron
       from etapas e
       left join (select h.lead_id, h.etapa from lead_etapas h join leads l on l.id=h.lead_id where l.creado between $1 and $2) h on h.etapa=e.clave
       where e.tipo in ('inicial','abierta','ganada') group by e.clave, e.nombre, e.color, e.tipo, e.orden order by e.orden`, P),
    q(`select creado as dia, count(*)::int as n from leads where creado between $1 and $2 group by creado order by creado`, P),
    q(`select u.id, u.nombre,
         count(l.id)::int as leads,
         count(l.id) filter (where e.tipo='ganada')::int as ganados,
         count(l.id) filter (where e.tipo='perdida')::int as perdidos
       from leads l join etapas e on e.clave=l.etapa left join usuarios u on u.id=l.asignado
       where l.creado between $1 and $2 group by u.id, u.nombre order by 3 desc`, P),
    q(`select coalesce(m.nombre,'Sin motivo') as motivo, count(*)::int as n
       from leads l join etapas e on e.clave=l.etapa left join motivos_perdida m on m.id=l.motivo_id
       where e.tipo='perdida' and ${CR} between $1 and $2 group by 1 order by 2 desc`, P),
    q(`select lp.nombre, coalesce(c.nombre,'Sin categoría') as categoria, lp.moneda,
         sum(lp.cantidad)::float8 as cantidad, sum(lp.cantidad*lp.precio)::float8 as total
       from lead_productos lp join leads l on l.id=lp.lead_id join etapas e on e.clave=l.etapa
       left join productos p on p.id=lp.producto_id left join categorias c on c.id=p.categoria_id
       where e.tipo='ganada' and ${CR} between $1 and $2 group by lp.nombre, 2, lp.moneda order by total desc`, P),
    q(`select l.id, l.asignado, e.tipo, lp.moneda, sum(lp.cantidad*lp.precio)::float8 as total
       from leads l join etapas e on e.clave=l.etapa join lead_productos lp on lp.lead_id=l.id
       group by l.id, l.asignado, e.tipo, lp.moneda`),
    q('select clave, nombre, tipo from etapas order by orden'),
  ]);
  void etapas;

  const idsG = new Set(ganados.map((g: any) => g.id));
  const idsA = new Set(abiertos.map((g: any) => g.id));
  const ventas: Record<string, number> = {};
  const pipeline: Record<string, number> = {};
  const ventasVend = new Map<string, Record<string, number>>();
  for (const v of valores) {
    if (idsG.has(v.id)) {
      ventas[v.moneda] = (ventas[v.moneda] || 0) + v.total;
      const k = v.asignado || '';
      const o = ventasVend.get(k) || {};
      o[v.moneda] = (o[v.moneda] || 0) + v.total;
      ventasVend.set(k, o);
    }
    if (idsA.has(v.id)) pipeline[v.moneda] = (pipeline[v.moneda] || 0) + v.total;
  }
  const cierres = ganados.map((g: any) => Math.max(0, dias(g.creado, g.cierre)));
  const cerrados = ganados.length + perdidos.length;

  // Tendencia: por día si el rango es corto; por semana si es largo.
  const n = dias(desde, hasta) + 1;
  const porSemana = n > 45;
  const serie: { k: string; n: number; g: number }[] = [];
  const idx = new Map<string, number>();
  for (let d = desde; d <= hasta; d = sumar(d, porSemana ? 7 : 1)) {
    const k = porSemana ? lunes(d) : d;
    if (!idx.has(k)) { idx.set(k, serie.length); serie.push({ k, n: 0, g: 0 }); }
  }
  const lugar = (f: string) => idx.get(porSemana ? lunes(f) : f);
  for (const r of porDia) { const i = lugar(r.dia); if (i != null) serie[i].n += r.n; }
  for (const g of ganados) { const i = lugar(g.cierre); if (i != null) serie[i].g += 1; }

  return json({
    desde, hasta, agrupa: porSemana ? 'semana' : 'dia',
    kpis: {
      nuevos: nuevos[0].n, ganados: ganados.length, perdidos: perdidos.length, abiertos: abiertos.length,
      conversion: cerrados ? Math.round((ganados.length / cerrados) * 1000) / 10 : null,
      diasCierre: cierres.length ? Math.round((cierres.reduce((a: number, b: number) => a + b, 0) / cierres.length) * 10) / 10 : null,
      ventas, pipeline,
    },
    serie, porCanal, embudo,
    vendedores: vend.map((v: any) => ({ id: v.id || '', nombre: v.nombre || 'Sin asignar', leads: v.leads, ganados: v.ganados, perdidos: v.perdidos, ventas: ventasVend.get(v.id || '') || {} })),
    motivos,
    productos: prods.slice(0, 12),
    categorias: Object.values(prods.reduce((m: any, p: any) => { const k = p.categoria + '|' + p.moneda; (m[k] = m[k] || { categoria: p.categoria, moneda: p.moneda, total: 0 }).total += p.total; return m; }, {})).sort((a: any, b: any) => b.total - a.total),
  });
}, { perm: 'reportes' });
