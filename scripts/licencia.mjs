#!/usr/bin/env node
// Herramienta del VENDEDOR para crear licencias de Pulso CRM. No se instala en el servidor del cliente.
//
//   node scripts/licencia.mjs claves                      Crea tu par de llaves (una sola vez) y deja la llave pública en el código.
//   node scripts/licencia.mjs emitir --cliente "Hotel Sol" --vence 2027-12-31 --usuarios 5
//                                                          Imprime la licencia para pegar en Admin, Licencia. Sin --vence es permanente; --usuarios 0 es ilimitado.
//   node scripts/licencia.mjs ver <licencia>              Muestra lo que dice una licencia.
//
// IMPORTANTE: la llave privada (licencias/privada.pem) es lo que te permite emitir licencias. Guárdala en un lugar seguro
// y haz copia. Nunca la subas a GitHub ni la pongas en el servidor del cliente. Si la pierdes, tendrás que generar otra
// y reemplazar la llave pública en cada instalación.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PRIVADA = 'licencias/privada.pem';
const PUBLICA_TS = 'src/lib/llave-publica.ts';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const falla = (m) => { console.error('Error: ' + m); process.exit(1); };

const cmd = process.argv[2];

if (cmd === 'claves') {
  if (existsSync(PRIVADA) && !process.argv.includes('--forzar')) falla(`Ya existe ${PRIVADA}. Si de verdad quieres reemplazarla, agrega --forzar (las licencias anteriores dejarán de funcionar).`);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  mkdirSync('licencias', { recursive: true });
  writeFileSync(PRIVADA, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).trim();
  writeFileSync(PUBLICA_TS, `// Llave pública para verificar las licencias de uso. La genera \`node scripts/licencia.mjs claves\`.\nexport const LLAVE_PUBLICA = ${JSON.stringify(pem)};\n`);
  console.log(`Listo.\n- Llave privada: ${PRIVADA}  (GUÁRDALA y haz copia; no la subas a GitHub)\n- Llave pública: ${PUBLICA_TS}  (esta sí va en el código)\nAhora compila y despliega Pulso CRM de nuevo para que las licencias queden activadas.`);
} else if (cmd === 'emitir') {
  if (!existsSync(PRIVADA)) falla(`No existe ${PRIVADA}. Primero ejecuta: node scripts/licencia.mjs claves`);
  const cliente = arg('cliente');
  if (!cliente) falla('Falta --cliente "Nombre del cliente"');
  const vence = arg('vence') || null;
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) falla('--vence debe tener el formato AAAA-MM-DD');
  const usuarios = parseInt(arg('usuarios') ?? '0', 10);
  if (Number.isNaN(usuarios) || usuarios < 0) falla('--usuarios debe ser un número (0 = ilimitado)');
  const datos = { v: 1, id: randomBytes(6).toString('hex'), cliente, emitida: new Date().toISOString().slice(0, 10), vence, usuarios };
  const payload = b64u(JSON.stringify(datos));
  const firma = sign(null, Buffer.from(payload), createPrivateKey(readFileSync(PRIVADA)));
  console.log(`PULSO1.${payload}.${b64u(firma)}`);
  console.error(`\nLicencia para ${cliente}: ${vence ? 'vence ' + vence : 'permanente'}, ${usuarios ? usuarios + ' usuarios' : 'usuarios ilimitados'} (id ${datos.id}).`);
} else if (cmd === 'ver') {
  const t = process.argv[3] || '';
  const [pre, payload, firma] = t.split('.');
  if (pre !== 'PULSO1' || !payload || !firma) falla('Eso no parece una licencia de Pulso CRM.');
  console.log(JSON.parse(deb64u(payload).toString('utf8')));
  if (existsSync(PRIVADA)) {
    const pub = createPublicKey(createPrivateKey(readFileSync(PRIVADA)));
    console.log('Firma:', verify(null, Buffer.from(payload), pub, deb64u(firma)) ? 'válida (hecha con tu llave)' : 'NO válida con tu llave');
  }
} else {
  console.log('Uso: node scripts/licencia.mjs claves | emitir --cliente "X" [--vence AAAA-MM-DD] [--usuarios N] | ver <licencia>');
}
