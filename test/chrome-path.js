/* El Chromium del entorno de pruebas cambia de versión (y de carpeta): se busca solo.
   Con CHROME=/ruta/al/chrome se puede forzar uno. */
const fs = require('fs');
const path = require('path');
function find() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]); } catch (e) {}
  for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const p = path.join(base, d, sub);
    if (fs.existsSync(p)) return p;
  }
  return undefined;   /* que Playwright use el suyo */
}
module.exports = find();
