import { q } from './db';
import { getAjuste } from './leads';

export const RETENCION_DEFECTO = 180; // días que se conservan las fotos y archivos que llegan por chat

/** Reduce las fotos que llegan por chat (máx. 1600 px, JPEG): suelen pasar de varios MB a cientos de KB.
 *  Usa "sharp" si está disponible; si no, guarda el archivo tal cual. */
export async function optimizarImagen(mime: string, data: Buffer): Promise<{ mime: string; data: Buffer }> {
  if (!/^image\/(jpe?g|png|webp)$/i.test(mime)) return { mime, data };
  try {
    const nombre = 'sharp';
    const mod: any = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ nombre);
    const sharp = mod.default || mod;
    const out: Buffer = await sharp(data, { failOn: 'none' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    if (out.length < data.length) return { mime: 'image/jpeg', data: out };
  } catch {}
  return { mime, data };
}

const bytes = (b64len: number) => Math.round((Number(b64len) || 0) * 0.75);

export async function usoAlmacen() {
  const [m, a, dbs, ret] = await Promise.all([
    q('select count(*)::int as n, coalesce(sum(length(data)),0)::float8 as b, min(creado) as desde from medios'),
    q('select count(*)::int as n, coalesce(sum(length(data)),0)::float8 as b from archivos'),
    q('select pg_database_size(current_database())::float8 as b').catch(() => [{ b: null }]),
    getAjuste('retencionDias'),
  ]);
  const dias = parseInt(ret ?? '', 10);
  return {
    chat: { n: m[0].n, bytes: bytes(m[0].b), desde: m[0].desde },
    adjuntos: { n: a[0].n, bytes: bytes(a[0].b) },
    base: dbs[0]?.b == null ? null : Math.round(dbs[0].b),
    retencionDias: Number.isNaN(dias) ? RETENCION_DEFECTO : dias,
  };
}

/** Borra los archivos del chat con más de `dias` días (0 = todos). Los mensajes se conservan y muestran "archivo eliminado". */
export async function limpiarMedios(dias: number): Promise<{ borrados: number; bytes: number }> {
  let borrados = 0;
  let liberado = 0;
  for (;;) {
    const rows = dias > 0
      ? await q("select id, lead_id, length(data)::float8 as len from medios where creado < now() - ($1::int * interval '1 day') order by creado limit 200", [dias])
      : await q('select id, lead_id, length(data)::float8 as len from medios order by creado limit 200');
    if (!rows.length) break;
    for (const r of rows) {
      const url = '/api/medios/' + r.id;
      await q(
        `update mensajes set adjuntos = (select coalesce(jsonb_agg(case when a->>'url' = $2 then a || '{"borrado":true}'::jsonb else a end), '[]'::jsonb) from jsonb_array_elements(adjuntos) a)
         where lead_id = $1 and adjuntos::text like '%' || $2 || '%'`,
        [r.lead_id, url],
      );
      await q('delete from medios where id=$1', [r.id]);
      borrados++;
      liberado += bytes(r.len);
    }
    if (rows.length < 200) break;
  }
  return { borrados, bytes: liberado };
}

// La limpieza automática corre como máximo una vez por hora por instancia, cuando alguien usa el sistema.
let ultimo = 0;
export async function limpiezaAutomatica() {
  if (Date.now() - ultimo < 3600000) return;
  ultimo = Date.now();
  const v = parseInt((await getAjuste('retencionDias')) ?? '', 10);
  const dias = Number.isNaN(v) ? RETENCION_DEFECTO : v;
  if (dias > 0) await limpiarMedios(dias);
}
