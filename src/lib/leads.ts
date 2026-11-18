import { q } from './db';
import { cwConfig } from './chatwoot';
import type { User } from './auth';

export const CANALES = ['whatsapp', 'web', 'instagram', 'facebook', 'otro'];
export const ETAPAS = ['nuevo', 'contactado', 'cotizado', 'negociacion', 'ganado', 'perdido'];
export const TIPOS = ['cr', 'ext'];

export async function getSettings() {
  const rows = await q('select clave, valor from ajustes');
  const m: Record<string, string> = {};
  rows.forEach((r) => (m[r.clave] = r.valor));
  const dias = parseInt(m.avisoDias, 10);
  return { negocio: m.negocio || 'Pulso CRM', avisoDias: Number.isNaN(dias) ? 5 : dias };
}

export async function setSetting(clave: string, valor: string | number) {
  await q('insert into ajustes(clave, valor) values($1, $2) on conflict (clave) do update set valor = excluded.valor', [
    clave,
    String(valor),
  ]);
}

function mapLead(r: any, atenciones: any[], archivos: any[], ult: any) {
  return {
    id: r.id,
    nombre: r.nombre,
    tel: r.tel,
    email: r.email,
    canal: r.canal,
    tipo: r.tipo,
    cedula: r.cedula,
    provincia: r.provincia,
    pais: r.pais,
    pasaporte: r.pasaporte,
    interes: r.interes,
    etapa: r.etapa,
    llegada: r.llegada,
    avisoDias: r.aviso_dias,
    avisado: r.avisado,
    creado: r.creado,
    auto: r.auto,
    tieneChat: !!r.cw_conversation_id,
    esperando: !!ult && ult.direccion === 'in',
    ultimoMsg: ult ? { dir: ult.direccion, at: ult.creado } : null,
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

export async function loadState(user: User) {
  const [leads, aten, arch, tareas, ult, settings] = await Promise.all([
    q('select * from leads order by creado desc, actualizado desc'),
    q('select id, lead_id, fecha, canal, nota, auto from atenciones order by fecha, creado'),
    q('select id, lead_id, nombre from archivos order by creado'),
    q('select * from tareas order by fecha, hora'),
    q('select distinct on (lead_id) lead_id, direccion, creado from mensajes order by lead_id, creado desc, n desc'),
    getSettings(),
  ]);
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
  return {
    me: user,
    settings,
    chatwoot: { configurado: cwConfig().ok, panelUrl: cwConfig().panelUrl },
    leads: leads.map((r) => mapLead(r, gA.get(r.id) || [], gF.get(r.id) || [], gU.get(r.id))),
    tasks: tareas.map(mapTarea),
  };
}

export async function loadLead(id: string) {
  const r = (await q('select * from leads where id=$1', [id]))[0];
  if (!r) return null;
  const [aten, arch, ult] = await Promise.all([
    q('select id, lead_id, fecha, canal, nota, auto from atenciones where lead_id=$1 order by fecha, creado', [id]),
    q('select id, nombre from archivos where lead_id=$1 order by creado', [id]),
    q('select direccion, creado from mensajes where lead_id=$1 order by creado desc, n desc limit 1', [id]),
  ]);
  return mapLead(r, aten.map(mapAtencion), arch, ult[0]);
}

export { mapTarea };
