import { q } from './db';
import { uid, hoyCR, digits, toDate } from './util';
import { getSettings } from './leads';
import { detectCanal, normType, pickContact, tipoYPais, type Contacto } from './chatwoot';

const NOMBRE_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp', web: 'la web', instagram: 'Instagram', facebook: 'Facebook', otro: 'otro canal',
};

/** Cuando el negocio responde: el lead pasa de Nuevo a Contactado y se anota la atención del día (una vez por día). */
export async function registrarRespuesta(lead: { id: string; etapa: string; canal: string }) {
  const hoy = hoyCR();
  if (lead.etapa === 'nuevo') await q("update leads set etapa='contactado', actualizado=now() where id=$1", [lead.id]);
  const ya = await q('select 1 from atenciones where lead_id=$1 and fecha=$2 and auto=true limit 1', [lead.id, hoy]);
  if (!ya.length) {
    await q('insert into atenciones(id, lead_id, fecha, canal, nota, auto) values($1,$2,$3,$4,$5,true)', [
      uid(), lead.id, hoy, lead.canal, 'Se respondió desde la conversación en Pulso CRM.',
    ]);
  }
}

async function buscarOCrear(c: Contacto, canal: string, convId: string, inboxId: string, texto: string) {
  const dig = digits(c.phone);
  let lead: any = null;
  if (c.id) lead = (await q('select * from leads where cw_contact_id=$1', [c.id]))[0];
  if (!lead && dig.length >= 7) {
    lead = (await q("select * from leads where regexp_replace(tel, '\\D', '', 'g') = $1 order by creado desc limit 1", [dig]))[0];
  }
  if (!lead && c.email) {
    lead = (await q('select * from leads where lower(email) = lower($1) order by creado desc limit 1', [c.email]))[0];
  }

  if (lead) {
    const sets: string[] = [];
    const vals: any[] = [];
    const set = (col: string, v: any) => {
      vals.push(v);
      sets.push(`${col}=$${vals.length}`);
    };
    if (!lead.cw_contact_id && c.id) set('cw_contact_id', c.id);
    if (!lead.tel && c.phone) set('tel', c.phone);
    if (!lead.email && c.email) set('email', c.email);
    if (!lead.interes && texto) set('interes', texto.slice(0, 500));
    if (convId) set('cw_conversation_id', convId);
    if (inboxId) set('cw_inbox_id', inboxId);
    if (sets.length) {
      vals.push(lead.id);
      lead = (await q(`update leads set ${sets.join(', ')}, actualizado=now() where id=$${vals.length} returning *`, vals))[0];
    }
    return { lead, creado: false };
  }

  const { tipo, pais } = tipoYPais(c);
  const s = await getSettings();
  const nombre = c.name || c.phone || c.email || `Contacto de ${NOMBRE_CANAL[canal] || 'Chatwoot'}`;
  const rows = await q(
    `insert into leads(id, nombre, tel, email, canal, tipo, pais, interes, aviso_dias, creado, auto, cw_contact_id, cw_conversation_id, cw_inbox_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)
     on conflict (cw_contact_id) where cw_contact_id is not null do nothing
     returning *`,
    [uid(), nombre, c.phone, c.email, canal, tipo, pais, texto.slice(0, 500), s.avisoDias, hoyCR(), c.id || null, convId || null, inboxId || null],
  );
  if (!rows.length) {
    // Otro aviso llegó al mismo tiempo y ya creó el lead.
    return { lead: (await q('select * from leads where cw_contact_id=$1', [c.id]))[0], creado: false };
  }
  return { lead: rows[0], creado: true };
}

/** Procesa un aviso (webhook) de Chatwoot. Devuelve un texto corto que se guarda en el registro de avisos. */
export async function procesarEvento(p: any): Promise<string> {
  const ev = String(p?.event || '');
  if (ev !== 'message_created' && ev !== 'conversation_created') return `ignorado (${ev || 'sin evento'})`;

  let dir: 'in' | 'out' | null = 'in';
  let convId = '';
  let inboxId = '';
  let texto = '';
  if (ev === 'message_created') {
    dir = normType(p.message_type);
    if (dir === null) return 'ignorado (mensaje de actividad)';
    if (p.private) return 'ignorado (nota privada)';
    convId = String(p.conversation?.id ?? p.conversation_id ?? '');
    inboxId = String(p.inbox?.id ?? p.conversation?.inbox_id ?? '');
    texto = String(p.content ?? '');
  } else {
    convId = String(p.id ?? '');
    inboxId = String(p.inbox_id ?? '');
    texto = String(p.messages?.[0]?.content ?? '');
  }

  const contacto = pickContact(p, dir);
  if (!contacto.id && !contacto.phone && !contacto.email) return 'ignorado (el aviso no trae datos del contacto)';

  const canal = detectCanal(p);
  const { lead, creado } = await buscarOCrear(contacto, canal, convId, inboxId, dir === 'in' ? texto : '');

  if (ev === 'conversation_created') return creado ? `lead creado (${canal})` : 'conversación nueva de un lead existente';

  const adjuntos = (Array.isArray(p.attachments) ? p.attachments : [])
    .map((a: any) => ({ type: a.file_type || 'file', url: a.data_url || a.thumb_url || '', name: a.fallback_title || a.name || '' }))
    .filter((a: any) => /^https?:\/\//.test(a.url));

  const ins = await q(
    `insert into mensajes(id, lead_id, cw_message_id, cw_conversation_id, direccion, texto, autor, adjuntos, creado)
     values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     on conflict (cw_message_id) do nothing
     returning id`,
    [uid(), lead.id, p.id != null ? String(p.id) : null, convId, dir, texto, dir === 'out' ? String(p.sender?.name || '') : '', JSON.stringify(adjuntos), toDate(p.created_at)],
  );
  const nuevo = ins.length > 0;
  if (nuevo && dir === 'out' && p.sender?.type === 'user') await registrarRespuesta(lead);

  if (creado) return `lead creado (${canal}) y mensaje guardado`;
  return nuevo ? `mensaje guardado (${canal})` : 'mensaje repetido, ignorado';
}
