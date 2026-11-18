import { q } from './db';
import { HttpError, json, uid, str, hoyCR, digits } from './util';
import { route, body } from './router';
import { ETAPA_INICIAL_SQL, logAct } from './leads';
import { procesarMeta, waConfig } from './meta';

/** Simulador para demostraciones (página /demo): hace entrar mensajes como si los mandara un cliente.
 *  Usa exactamente el mismo camino que los avisos reales de Meta. Solo para administradores. */
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cliente';

route('POST', '/demo/mensaje', async ({ req }) => {
  const b = await body(req);
  const canal = String(b.canal || '');
  const nombre = str(b.nombre, 100) || 'Cliente de prueba';
  const texto = str(b.texto, 2000);
  if (!texto) throw new HttpError(400, 'Escribe el mensaje');
  const ts = Math.floor(Date.now() / 1000);

  if (canal === 'whatsapp') {
    let tel = digits(str(b.tel, 30)) || '91112233';
    if (tel.length === 8) tel = '506' + tel;
    if (!/^5069\d{7}$/.test(tel)) throw new HttpError(400, 'En la demo el teléfono debe empezar con 9 (ej. 9111-2233): son números ficticios y no se envía nada a WhatsApp.');
    const r = await procesarMeta({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        metadata: waConfig().phoneId ? { phone_number_id: waConfig().phoneId } : undefined,
        contacts: [{ wa_id: tel, profile: { name: nombre } }],
        messages: [{ from: tel, id: 'wamid.demo' + uid(), timestamp: String(ts), type: 'text', text: { body: texto } }],
      } }] }],
    });
    return json({ resultado: r, leadChat: { canal, id: tel } });
  }

  if (canal === 'instagram' || canal === 'facebook') {
    const sid = 'demo-' + slug(nombre);
    const r = await procesarMeta({
      object: canal === 'instagram' ? 'instagram' : 'page',
      entry: [{ id: 'demo', messaging: [{ sender: { id: sid }, recipient: { id: 'demo' }, timestamp: ts * 1000, message: { mid: 'm.demo' + uid(), text: texto } }] }],
    });
    // Sin conexión real no se conoce el nombre del perfil: se usa el que escribiste.
    await q("update leads set nombre=$1 where chat_canal=$2 and chat_id=$3 and nombre ~ '^(Instagram|Facebook) '", [nombre, canal, sid]);
    return json({ resultado: r, leadChat: { canal, id: sid } });
  }

  if (canal === 'correo') {
    const email = str(b.email, 200).toLowerCase() || slug(nombre) + '@ejemplo.com';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Correo no válido');
    const asunto = str(b.asunto, 150);
    const cuerpo = (asunto ? asunto + '\n\n' : '') + texto;
    let lead: any = (await q('select * from leads where lower(email)=$1 limit 1', [email]))[0];
    let creado = false;
    if (!lead) {
      const dias = parseInt((await q("select valor from ajustes where clave='avisoDias'"))[0]?.valor, 10);
      lead = (await q(
        `insert into leads(id, nombre, email, canal, interes, aviso_dias, creado, auto, etapa)
         values($1,$2,$3,'correo',$4,$5,$6,true,${ETAPA_INICIAL_SQL}) returning *`,
        [uid(), nombre, email, (asunto || texto).slice(0, 500), Number.isNaN(dias) ? 5 : dias, hoyCR()],
      ))[0];
      creado = true;
      await logAct(lead.id, 'creado', 'Lead creado desde un correo (automático)');
    } else await logAct(lead.id, 'mensaje', 'Volvió a escribir por correo');
    await q('insert into notas(id, lead_id, usuario, texto) values($1,$2,$3,$4)', [uid(), lead.id, 'Correo', cuerpo]);
    await q('insert into eventos_cw(evento, payload, resultado) values($1,$2::jsonb,$3)', ['correo', JSON.stringify({ nombre, email }), creado ? 'lead creado (correo)' : 'mensaje agregado (correo)']);
    return json({ resultado: creado ? 'lead creado (correo)' : 'mensaje agregado (correo)', leadChat: null });
  }
  throw new HttpError(400, 'Canal no válido');
}, { admin: true });

/** Mensajes de la conversación de un contacto de demostración (para ver las respuestas del equipo). */
route('GET', '/demo/conversacion', async ({ url }) => {
  const canal = url.searchParams.get('canal') || '';
  const id = url.searchParams.get('id') || '';
  const l = (await q('select id, nombre from leads where chat_id=$1 and chat_canal=$2 limit 1', [id, canal]))[0];
  if (!l) return json({ lead: null, mensajes: [] });
  const m = await q('select direccion, texto, autor, creado from mensajes where lead_id=$1 order by creado, n limit 100', [l.id]);
  return json({ lead: l, mensajes: m });
}, { admin: true });
