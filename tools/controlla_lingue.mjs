// Controlla che ogni dizionario in lingue/ abbia tutti gli id usati da index.html
// e nessuno in più, e che i segni HTML (<em>) tornino come nell'italiano.
// Uso: node tools/controlla_lingue.mjs
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(radice, 'index.html'), 'utf8');

// id messi nell'HTML + id che usa lo script (titolo, descrizione, pulsanti)
const idHtml = new Map();
// il contenuto arriva fino alla chiusura dello stesso tag (dentro può esserci solo <em>)
for (const m of html.matchAll(/<([a-z0-9]+)[^>]*\sdata-t="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) idHtml.set(m[2], m[3].trim());
const idScript = ['meta.titolo', 'meta.desc', 'tema.giorno', 'tema.notte', 'lingua.etichetta'];
const attesi = new Set([...idHtml.keys(), ...idScript]);

// le lingue elencate nel menu
const codici = [...html.matchAll(/\['([a-z]{2})', '[^']+'\]/g)].map((m) => m[1]).filter((c) => c !== 'it');

let errori = 0;
const segna = (...a) => { errori++; console.log('✗', ...a); };
const tag = (s) => (s.match(/<\/?[a-z]+>/g) || []).join('');

for (const cod of codici) {
  let diz;
  try {
    const ctx = { window: {} };
    vm.runInNewContext(readFileSync(join(radice, 'lingue', cod + '.js'), 'utf8'), ctx);
    diz = ctx.window.LINGUE_SITO[cod];
  } catch (e) { segna(cod, 'file mancante o illeggibile:', e.message); continue; }
  if (!diz) { segna(cod, 'il file non definisce LINGUE_SITO.' + cod); continue; }
  for (const id of attesi) if (!(id in diz)) segna(cod, 'manca', id);
  for (const id of Object.keys(diz)) if (!attesi.has(id)) segna(cod, 'id in più', id);
  for (const [id, it] of idHtml) if (diz[id] && tag(diz[id]) !== tag(it)) segna(cod, 'segni HTML diversi in', id);
  for (const [id, v] of Object.entries(diz)) if (!String(v).trim()) segna(cod, 'vuoto', id);
}
const extra = readdirSync(join(radice, 'lingue')).filter((f) => f.endsWith('.js') && !codici.includes(f.slice(0, -3)));
for (const f of extra) segna('lingue/' + f, 'non è nel menu delle lingue');
console.log(errori ? `${errori} problemi` : `a posto: ${attesi.size} testi × ${codici.length} lingue`);
process.exit(errori ? 1 : 0);
