// Junta la interfaz (ui/) en un módulo que el servidor puede entregar.
import { readFileSync, writeFileSync } from 'node:fs';
const head = readFileSync('ui/head.html', 'utf8');
const script = readFileSync('ui/script.js', 'utf8');
const login = readFileSync('ui/login.html', 'utf8');
const app = head + '<script>\n' + script + '\n</script>\n</body></html>\n';
writeFileSync('src/lib/ui.ts', '// Archivo generado por scripts/build-ui.mjs. No lo edites a mano.\nexport const APP_HTML = ' + JSON.stringify(app) + ';\nexport const LOGIN_HTML = ' + JSON.stringify(login) + ';\n');
console.log('UI lista:', (app.length / 1024).toFixed(0) + ' KB');
