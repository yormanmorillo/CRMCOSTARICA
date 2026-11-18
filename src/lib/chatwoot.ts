import { createHmac } from 'node:crypto';
import { HttpError, digits, safeEqual } from './util';

export function cwConfig() {
  const url = (process.env.CHATWOOT_URL || 'https://app.chatwoot.com').replace(/\/+$/, '');
  const account = (process.env.CHATWOOT_ACCOUNT_ID || '').trim();
  const token = (process.env.CHATWOOT_API_TOKEN || '').trim();
  // Dirección pública del panel de Chatwoot, para mostrarlo dentro de Pulso CRM.
  const pub = (process.env.CHATWOOT_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const panelBase = /^https:\/\//.test(pub) ? pub : '';
  const panelUrl = panelBase ? panelBase + (account ? `/app/accounts/${account}/dashboard` : '/app/') : '';
  return { url, account, token, ok: !!(account && token), panelUrl };
}

/** Verifica la firma HMAC opcional que Chatwoot agrega a los webhooks (X-Chatwoot-Signature). */
export function verifySignature(raw: string, h: Headers) {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET || '';
  const sig = h.get('x-chatwoot-signature') || '';
  const ts = h.get('x-chatwoot-timestamp') || '';
  if (!secret || !sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return safeEqual(sig, expected);
}

/** Envía una respuesta a la conversación de Chatwoot (sale por el canal original: WhatsApp, Instagram, etc.). */
export async function enviarMensaje(conversationId: string, texto: string): Promise<any> {
  const c = cwConfig();
  if (!c.ok) throw new HttpError(503, 'Chatwoot no está conectado: faltan CHATWOOT_ACCOUNT_ID y CHATWOOT_API_TOKEN en Vercel.');
  let r: Response;
  try {
    r = await fetch(`${c.url}/api/v1/accounts/${c.account}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', api_access_token: c.token },
      body: JSON.stringify({ content: texto, message_type: 'outgoing', private: false }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new HttpError(502, 'No se pudo contactar a Chatwoot: ' + (e?.message || 'sin respuesta'));
  }
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new HttpError(502, `Chatwoot respondió ${r.status}: ${data?.message || data?.error || 'no aceptó el mensaje'}`);
  }
  return data;
}

/** 'in' = escribió el cliente, 'out' = respondió el negocio, null = mensaje de actividad (se ignora). */
export function normType(v: any): 'in' | 'out' | null {
  if (v === 0 || v === '0' || v === 'incoming') return 'in';
  if (v === 1 || v === '1' || v === 'outgoing') return 'out';
  if (v === 3 || v === '3' || v === 'template') return 'out';
  return null;
}

export function detectCanal(p: any): string {
  const convo = p.conversation || {};
  const ch = String(convo.channel || p.channel || p.meta?.channel || convo.meta?.channel || p.inbox?.channel_type || '');
  const name = String(p.inbox?.name || convo.inbox?.name || '');
  const t = `${ch} ${name}`.toLowerCase();
  if (t.includes('whatsapp')) return 'whatsapp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('facebook') || t.includes('messenger')) return 'facebook';
  if (t.includes('webwidget') || t.includes('website') || t.includes('web') || t.includes('sitio')) return 'web';
  return 'otro';
}

export type Contacto = {
  id: string;
  name: string;
  phone: string;
  email: string;
  identifier: string;
  country: string;
  countryCode: string;
};

/** Junta los datos del contacto desde los distintos lugares donde Chatwoot los puede enviar. */
export function pickContact(p: any, dir: 'in' | 'out' | null): Contacto {
  const convo = p.conversation || {};
  const cands = [
    convo.meta?.sender,
    p.meta?.sender,
    p.sender?.type === 'contact' || (dir === 'in' && p.sender && p.sender.type !== 'user' && p.sender.type !== 'agent_bot') ? p.sender : null,
    convo.contact,
    p.contact,
  ].filter(Boolean);
  const out: Contacto = { id: '', name: '', phone: '', email: '', identifier: '', country: '', countryCode: '' };
  for (const c of cands as any[]) {
    out.id ||= c.id != null ? String(c.id) : '';
    out.name ||= c.name || '';
    out.phone ||= c.phone_number || '';
    out.email ||= c.email || '';
    out.identifier ||= c.identifier || '';
    const a = c.additional_attributes || {};
    out.country ||= a.country || '';
    out.countryCode ||= a.country_code || '';
  }
  return out;
}

const CODES: [string, string][] = [
  ['1', 'Estados Unidos / Canadá'], ['506', 'Costa Rica'], ['507', 'Panamá'], ['505', 'Nicaragua'], ['504', 'Honduras'],
  ['503', 'El Salvador'], ['502', 'Guatemala'], ['52', 'México'], ['57', 'Colombia'], ['58', 'Venezuela'], ['51', 'Perú'],
  ['54', 'Argentina'], ['56', 'Chile'], ['55', 'Brasil'], ['34', 'España'], ['33', 'Francia'], ['49', 'Alemania'],
  ['44', 'Reino Unido'], ['31', 'Países Bajos'], ['39', 'Italia'], ['41', 'Suiza'],
];

export function paisPorTelefono(d: string) {
  let best: [string, string] | null = null;
  for (const c of CODES) if (d.startsWith(c[0]) && (!best || c[0].length > best[0].length)) best = c;
  return best ? best[1] : '';
}

/** Adivina si es costarricense o extranjero. Se puede corregir a mano en la ficha del lead. */
export function tipoYPais(c: Contacto): { tipo: 'cr' | 'ext'; pais: string } {
  const d = digits(c.phone);
  if (c.countryCode) {
    return c.countryCode.toUpperCase() === 'CR' ? { tipo: 'cr', pais: '' } : { tipo: 'ext', pais: c.country || '' };
  }
  if (d) {
    if (d.startsWith('506') || d.length === 8) return { tipo: 'cr', pais: '' };
    return { tipo: 'ext', pais: paisPorTelefono(d) };
  }
  if (c.country) return /costa rica/i.test(c.country) ? { tipo: 'cr', pais: '' } : { tipo: 'ext', pais: c.country };
  return { tipo: 'cr', pais: '' };
}
