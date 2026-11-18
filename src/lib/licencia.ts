import { createPublicKey, createPrivateKey, sign, verify, randomBytes } from 'node:crypto';
import { q } from './db';
import { LLAVE_PUBLICA } from './llave-publica';

export const PRUEBA_DIAS = 14;
export const GRACIA_DIAS = 7; // días de cortesía después de vencer: el sistema sigue funcionando con aviso

export type DatosLicencia = { v: number; id: string; cliente: string; emitida: string; vence: string | null; usuarios: number };
export type EstadoLic = {
  sistema: boolean; // ¿hay llave pública? Si no, las licencias están desactivadas.
  estado: 'sin_sistema' | 'valida' | 'gracia' | 'vencida' | 'invalida' | 'prueba' | 'prueba_vencida';
  cliente: string;
  emitida: string;
  vence: string | null;
  diasRestantes: number | null;
  usuarios: number; // máximo de usuarios; 0 = sin límite
  puedeEscribir: boolean;
  mensaje: string;
};

const G = globalThis as any;
const b64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function llavePublica(): string {
  const env = (process.env.LICENCIA_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim();
  return env || LLAVE_PUBLICA.trim();
}

/** Lee y verifica una licencia: PULSO1.<datos>.<firma>. La firma Ed25519 se hizo con la llave privada del vendedor. */
export function leerLicencia(token: string): { ok: true; lic: DatosLicencia } | { ok: false; error: string } {
  const pem = llavePublica();
  if (!pem) return { ok: false, error: 'Este sistema no tiene llave pública para verificar licencias.' };
  const partes = String(token || '').trim().split('.');
  if (partes.length !== 3 || partes[0] !== 'PULSO1') return { ok: false, error: 'El texto no tiene el formato de una licencia de Pulso CRM.' };
  try {
    const firmaOk = verify(null, Buffer.from(partes[1]), createPublicKey(pem), b64u(partes[2]));
    if (!firmaOk) return { ok: false, error: 'La firma de la licencia no es válida. Revisa que la copiaste completa.' };
    const lic = JSON.parse(b64u(partes[1]).toString('utf8')) as DatosLicencia;
    if (!lic || lic.v !== 1 || !lic.cliente) return { ok: false, error: 'La licencia está incompleta.' };
    return { ok: true, lic };
  } catch {
    return { ok: false, error: 'No se pudo leer la licencia.' };
  }
}

const hoy = () => new Date().toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);

async function calcular(): Promise<EstadoLic> {
  const base = { cliente: '', emitida: '', vence: null as string | null, diasRestantes: null as number | null, usuarios: 0 };
  if (!llavePublica()) {
    return { ...base, sistema: false, estado: 'sin_sistema', puedeEscribir: true, mensaje: 'Las licencias no están activadas en esta instalación.' };
  }
  const aj = await q("select clave, valor from ajustes where clave in ('licencia','instalado')");
  const m: Record<string, string> = {};
  aj.forEach((r) => (m[r.clave] = r.valor));
  if (!m.instalado) {
    m.instalado = hoy();
    await q("insert into ajustes(clave, valor) values('instalado', $1) on conflict (clave) do nothing", [m.instalado]);
  }
  if (m.licencia) {
    const r = leerLicencia(m.licencia);
    if (r.ok === false) return { ...base, sistema: true, estado: 'invalida', puedeEscribir: false, mensaje: r.error };
    const l = r.lic;
    const d = l.vence ? dias(l.vence, hoy()) : null;
    const info = { cliente: l.cliente, emitida: l.emitida, vence: l.vence, diasRestantes: d, usuarios: Number(l.usuarios) || 0 };
    if (d !== null && d < 0 && -d <= GRACIA_DIAS) return { ...info, sistema: true, estado: 'gracia', puedeEscribir: true, mensaje: `La licencia venció hace ${-d} día(s). Tienes ${GRACIA_DIAS + d} día(s) de cortesía para renovarla antes de que el sistema quede en solo lectura.` };
    if (d !== null && d < 0) return { ...info, sistema: true, estado: 'vencida', puedeEscribir: false, mensaje: `La licencia venció hace ${-d} días. Pide una renovación para seguir editando.` };
    return { ...info, sistema: true, estado: 'valida', puedeEscribir: true, mensaje: d === null ? 'Licencia permanente.' : `La licencia vence en ${d} días.` };
  }
  const resta = PRUEBA_DIAS - dias(hoy(), m.instalado);
  if (resta >= 0) return { ...base, sistema: true, estado: 'prueba', diasRestantes: resta, puedeEscribir: true, mensaje: `Período de prueba: quedan ${resta} días. Después hace falta una licencia.` };
  return { ...base, sistema: true, estado: 'prueba_vencida', puedeEscribir: false, mensaje: 'El período de prueba terminó. Ingresa una licencia para seguir editando.' };
}

/** Estado de la licencia (se guarda 30 segundos para no consultar la base en cada petición). */
export async function estadoLicencia(): Promise<EstadoLic> {
  const c = G.__licCache;
  if (c && Date.now() - c.at < 30000) return c.val;
  const val = await calcular();
  G.__licCache = { at: Date.now(), val };
  return val;
}

export const limpiarCacheLicencia = () => {
  G.__licCache = null;
};

/** Solo funciona en la instalación del VENDEDOR: requiere la variable LICENCIA_PRIVATE_KEY (llave privada PEM). */
export const puedeEmitir = () => !!(process.env.LICENCIA_PRIVATE_KEY || '').trim();

export function emitirLicencia(cliente: string, vence: string | null, usuarios: number): string {
  const pem = (process.env.LICENCIA_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const b = (x: Buffer) => x.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const datos = { v: 1, id: randomBytes(6).toString('hex'), cliente, emitida: hoy(), vence, usuarios };
  const payload = b(Buffer.from(JSON.stringify(datos)));
  return `PULSO1.${payload}.${b(sign(null, Buffer.from(payload), createPrivateKey(pem)))}`;
}
