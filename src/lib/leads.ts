import { q } from './db';
import { cwConfig } from './chatwoot';
import { waConfig, fbConfig } from './meta';
import { estadoLicencia } from './licencia';
import type { User } from './auth';

export const CANALES = ['whatsapp', 'web', 'instagram', 'facebook', 'correo', 'llamada', 'otro'];
export const TIPOS = ['cr', 'ext'];
export const COLORES = ['accent', 'fb', 'warn', 'vio', 'ok', 'muted', 'ig', 'crit', 'wa'];
export const TIPOS_ETAPA = ['inicial', 'abierta', 'pausada', 'ganada', 'perdida'];
export const MONEDAS = ['CRC', 'USD'];

/** Etapa en la que entra un lead nuevo (la primera de tipo "inicial"). Se usa dentro de los INSERT. */
export const ETAPA_INICIAL_SQL = "coalesce((select clave from etapas where tipo='inicial' order by orden limit 1), 'nuevo')";

export const getEtapas = () => q('select clave, nombre, orden, color, tipo from etapas order by orden, clave');

/** Al responder por primera vez, un lead en la etapa inicial pasa a la siguiente etapa abierta. */
export async function siguienteEtapa(actual: string): Promise<string | null> {
  const et = await getEtapas();
  const i = et.findIndex((e) => e.clave === actual);
  if (i < 0 || et[i].tipo !== 'inicial') return null;
  const sig = et.slice(i + 1).find((e) => e.tipo === 'abierta');
  return sig ? sig.clave : null;
}

export async function getSettings() {
  const rows = await q('select clave, valor from ajustes');
  const m: Record<string, string> = {};
  rows.forEach((r) => (m[r.clave] = r.valor));
  const dias = parseInt(m.avisoDias, 10);
  return { negocio: m.negocio || 'Pulso CRM', avisoDias: Number.isNaN(dias) ? 5 : dias, pinActivo: m.pinActivo !== '0', horario: leerHorario(m.horario), soporteEmail: m.soporteEmail || process.env.SOPORTE_EMAIL || '' };
}

export type DiaHorario = { on: boolean; desde: string; hasta: string };
/** Horario de atención por día de la semana (0 = domingo … 6 = sábado). Por defecto, lunes a viernes de 8:00 a 17:00. */
export function leerHorario(raw?: string): DiaHorario[] {
  const base: DiaHorario[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ on: d >= 1 && d <= 5, desde: '08:00', hasta: '17:00' }));
  try {
    const j = JSON.parse(raw || '[]');
    if (Array.isArray(j) && j.length === 7) {
      return j.map((x: any, i: number) => ({
        on: !!x?.on,
        desde: /^\d{2}:\d{2}$/.test(x?.desde) ? x.desde : base[i].desde,
        hasta: /^\d{2}:\d{2}$/.test(x?.hasta) ? x.hasta : base[i].hasta,
      }));
    }
  } catch {}
  return base;
}
/** ¿La fecha (AAAA-MM-DD) y hora (HH:MM, opcional) caen dentro del horario de atención? */
export function dentroDeHorario(h: DiaHorario[], fecha: string, hora?: string): { ok: boolean; motivo: string } {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const x = h[dia];
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  if (!x.on) return { ok: false, motivo: `El ${nombres[dia]} no se atiende.` };
  if (hora && (hora < x.desde || hora > x.hasta)) return { ok: false, motivo: `El ${nombres[dia]} se atiende de ${x.desde} a ${x.hasta}.` };
  return { ok: true, motivo: '' };
}

export async function setSetting(clave: string, valor: string | number) {
  await q('insert into ajustes(clave, valor) values($1, $2) on conflict (clave) do update set valor = excluded.valor', [
    clave,
    String(valor),
  ]);
}

export async function getAjuste(clave: string): Promise<string | undefined> {
  return (await q('select valor from ajustes where clave=$1', [clave]))[0]?.valor;
}

export type CanalConexion = 'whatsapp' | 'meta' | 'chatwoot' | 'web' | 'correo';

/** Interruptor de cada conexión. Chatwoot nace apagado; las demás nacen encendidas (solo actúan si están configuradas). */
export async function canalActivo(n: CanalConexion): Promise<boolean> {
  const v = await getAjuste('canal_' + n);
  if (v === '1') return true;
  if (v === '0') return false;
  return n !== 'chatwoot';
}

function mapLead(r: any, atenciones: any[], archivos: any[], ult: any, valor: any, nombres: Map<string, string>, motivos: Map<string, string>) {
  return {
    id: r.id,
    nombre: r.nombre,
    tel: r.tel,
    email: r.email,
    empresa: r.empresa || '',
    canal: r.canal,
    tipo: r.tipo,
    cedula: r.cedula,
    provincia: r.provincia,
    pais: r.pais,
    pasaporte: r.pasaporte,
    interes: r.interes,
    etapa: r.etapa,
    etapaEn: r.etapa_en,
    llegada: r.llegada,
    avisoDias: r.aviso_dias,
    avisado: r.avisado,
    creado: r.creado,
    auto: r.auto,
    asignado: r.asignado || '',
    asignadoNombre: r.asignado ? nombres.get(r.asignado) || '' : '',
    etiquetas: Array.isArray(r.etiquetas) ? r.etiquetas : [],
    destacado: !!r.destacado,
    motivoId: r.motivo_id || '',
    motivo: r.motivo_id ? motivos.get(r.motivo_id) || '' : '',
    motivoNota: r.motivo_nota || '',
    perdidoEn: r.perdido_en || null,
    valor: valor?.v || {},
    nProductos: valor?.n || 0,
    tieneChat: !!(r.chat_id || r.cw_conversation_id),
    chatCanal: r.chat_id ? r.chat_canal || '' : r.cw_conversation_id ? 'chatwoot' : '',
    esperando: !!ult && ult.direccion === 'in',
    ultimoMsg: ult ? { dir: ult.direccion, at: ult.creado, txt: ult.txt || ({ image: '📷 Foto', audio: '🎤 Audio', video: '🎥 Video', document: '📄 Documento' } as Record<string, string>)[ult.adj] || '' } : null,
    atenciones,
    archivos,
  };
}

const mapAtencion = (a: any) => ({ id: a.id, fecha: a.fecha, canal: a.canal, nota: a.nota, auto: a.auto });
const mapTarea = (t: any) => ({
  id: t.id,
  leadId: t.lead_id || '',
  titulo: t.titulo,
  fecha: t.fecha,
  hora: t.hora,
  hecha: t.hecha,
});

const SQL_VALOR = 'select lead_id, moneda, sum(cantidad*precio)::float8 as total, count(*)::int as n from lead_productos group by lead_id, moneda';
const SQL_ULT = "select distinct on (lead_id) lead_id, direccion, creado, left(texto, 90) as txt, adjuntos->0->>'type' as adj from mensajes order by lead_id, creado desc, n desc";

function agruparValores(rows: any[]) {
  const m = new Map<string, { v: Record<string, number>; n: number }>();
  rows.forEach((r) => {
    const x = m.get(r.lead_id) || { v: {}, n: 0 };
    x.v[r.moneda] = Number(r.total) || 0;
    x.n += Number(r.n) || 0;
    m.set(r.lead_id, x);
  });
  return m;
}

export async function loadState(user: User) {
  const [leads, aten, arch, tareas, ult, settings, etapas, motivos, productos, categorias, usuarios, valores, lic, wa, mt, cw, web, co, ccfg] = await Promise.all([
    q('select * from leads order by creado desc, actualizado desc'),
    q('select id, lead_id, fecha, canal, nota, auto from atenciones order by fecha, creado'),
    q('select id, lead_id, nombre from archivos order by creado'),
    q('select * from tareas order by fecha, hora'),
    q(SQL_ULT),
    getSettings(),
    getEtapas(),
    q('select id, nombre, orden, activo from motivos_perdida order by orden, nombre'),
    q('select id, nombre, descripcion, precio::float8 as precio, moneda, activo, categoria_id from productos order by nombre'),
    q('select id, nombre from categorias order by orden, nombre'),
    q('select id, nombre, rol from usuarios order by creado'),
    q(SQL_VALOR),
    estadoLicencia(),
    canalActivo('whatsapp'),
    canalActivo('meta'),
    canalActivo('chatwoot'),
    canalActivo('web'),
    canalActivo('correo'),
    getAjuste('correo_cfg'),
  ]);
  const veTodo = user.rol === 'admin' || user.permisos.includes('ver_todos');
  const visibles = veTodo ? leads : leads.filter((r: any) => !r.asignado || r.asignado === user.id);
  const idsVis = new Set(visibles.map((r: any) => r.id));
  const tareasV = veTodo ? tareas : tareas.filter((t: any) => !t.lead_id || idsVis.has(t.lead_id));
  let correoOk = false;
  try {
    const j = JSON.parse(ccfg || '{}');
    correoOk = !!(j.imapHost && j.usuario && j.passEnc);
  } catch {}
  const group = (rows: any[], f: (r: any) => any) => {
    const m = new Map<string, any[]>();
    rows.forEach((r) => {
      const a = m.get(r.lead_id) || [];
      a.push(f(r));
      m.set(r.lead_id, a);
    });
    return m;
  };
  const gA = group(aten, mapAtencion);
  const gF = group(arch, (r) => ({ id: r.id, nombre: r.nombre }));
  const gU = new Map(ult.map((u) => [u.lead_id, u]));
  const gV = agruparValores(valores);
  const nombres = new Map<string, string>(usuarios.map((u) => [u.id, u.nombre]));
  const mots = new Map<string, string>(motivos.map((m) => [m.id, m.nombre]));
  return {
    me: user,
    settings,
    etapas,
    motivos: motivos.filter((m) => m.activo),
    productos: productos.filter((p) => p.activo).map((p: any) => ({ ...p, categoriaId: p.categoria_id || '' })),
    categorias,
    usuarios: usuarios.map((u) => ({ id: u.id, nombre: u.nombre })),
    licencia: { estado: lic.estado, mensaje: lic.mensaje, puedeEscribir: lic.puedeEscribir, diasRestantes: lic.diasRestantes },
    chatwoot: { configurado: cwConfig().ok, activo: cw },
    whatsapp: { configurado: waConfig().ok && wa, activo: wa },
    meta: { configurado: fbConfig().ok && mt, activo: mt },
    web: { activo: web },
    correo: { configurado: correoOk, activo: co },
    leads: visibles.map((r: any) => mapLead(r, gA.get(r.id) || [], gF.get(r.id) || [], gU.get(r.id), gV.get(r.id), nombres, mots)),
    tasks: tareasV.map(mapTarea),
  };
}

export async function loadLead(id: string) {
  const r = (await q('select * from leads where id=$1', [id]))[0];
  if (!r) return null;
  const [aten, arch, ult, valores, usuarios, motivos] = await Promise.all([
    q('select id, lead_id, fecha, canal, nota, auto from atenciones where lead_id=$1 order by fecha, creado', [id]),
    q('select id, nombre from archivos where lead_id=$1 order by creado', [id]),
    q("select direccion, creado, left(texto, 90) as txt, adjuntos->0->>'type' as adj from mensajes where lead_id=$1 order by creado desc, n desc limit 1", [id]),
    q('select lead_id, moneda, sum(cantidad*precio)::float8 as total, count(*)::int as n from lead_productos where lead_id=$1 group by lead_id, moneda', [id]),
    q('select id, nombre from usuarios'),
    q('select id, nombre from motivos_perdida'),
  ]);
  return mapLead(
    r,
    aten.map(mapAtencion),
    arch,
    ult[0],
    agruparValores(valores).get(id),
    new Map<string, string>(usuarios.map((u) => [u.id, u.nombre])),
    new Map<string, string>(motivos.map((m) => [m.id, m.nombre])),
  );
}

/** Anota un hecho en la línea de tiempo del lead. Nunca debe romper la acción principal. */
export async function logAct(leadId: string, tipo: string, texto: string, usuario = '') {
  try {
    await q('insert into actividad(lead_id, tipo, texto, usuario) values($1,$2,$3,$4)', [leadId, tipo, texto.slice(0, 500), usuario]);
  } catch {}
}

export { mapTarea };
