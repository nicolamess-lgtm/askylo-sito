// Tastiera di Yavier — i brani: formato «yavier-brano», lettura dai MIDI, mani, versione facile, tratti.
// Contratto §5.3, DESIGN §6 e §11. Gira anche in Node (test): niente DOM, niente localStorage.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const YT = (G.YT = G.YT || {});

  const EPS = 1e-6;
  const MANI = ['destra', 'sinistra', 'accompagnamento'];
  const COLORI = ['zafferano', 'petrolio', 'inchiostro', 'nebbia', 'corallo'];
  const STRUMENTI = ['pianoforte', 'morbido', 'campane', 'archi'];
  const DEN = [2, 4, 8, 16];
  const COLORE_DI = { destra: 'zafferano', sinistra: 'petrolio', accompagnamento: 'inchiostro' };
  const DO_CENTRALE = 60;
  // Indovinare le mani (DESIGN §6.1): centri di partenza, limiti di una mano, ricordo dei centri
  const DIVIDI = { centroDestra: 67, centroSinistra: 48, maxNote: 5, maxApertura: 14, ricordo: 0.7 };

  const R = () => YT.REGOLE || {};
  const accordoSec = () => ((R().accordo_ms != null ? R().accordo_ms : 40) / 1000);
  const tondo = (x) => Math.round(x * 1e6) / 1e6;
  const intero = (x) => Number.isInteger(x);
  const numero = (x) => typeof x === 'number' && isFinite(x);

  // ---------- mappe del tempo (valgono sia per l'oggetto «yavier-brano» sia per il Brano) ----------

  function _segmentiTempo(oggetto) {
    const segs = [{ mov: 0, bpm: oggetto.bpm }];
    const cambi = (oggetto.cambi || []).filter((c) => numero(c.bpm) && c.bpm > 0).slice().sort((a, b) => a.mov - b.mov);
    for (const c of cambi) {
      if (c.mov <= EPS) segs[0].bpm = c.bpm;
      else if (Math.abs(c.mov - segs[segs.length - 1].mov) < EPS) segs[segs.length - 1].bpm = c.bpm;
      else segs.push({ mov: c.mov, bpm: c.bpm });
    }
    let sec = 0;
    for (let i = 0; i < segs.length; i++) {
      if (i > 0) sec += ((segs[i].mov - segs[i - 1].mov) * 60) / segs[i - 1].bpm;
      segs[i].sec = sec;
    }
    return segs;
  }

  function _tempi(x) { return x.tempi || _segmentiTempo(x); }

  function secDaMov(brano, mov) {
    const segs = _tempi(brano);
    let s = segs[0];
    for (const g of segs) if (g.mov <= mov + EPS) s = g;
    return s.sec + ((mov - s.mov) * 60) / s.bpm;
  }

  function movDaSec(brano, sec) {
    const segs = _tempi(brano);
    let s = segs[0];
    for (const g of segs) if (g.sec <= sec + EPS) s = g;
    return s.mov + ((sec - s.sec) * s.bpm) / 60;
  }

  // Battute in movimenti: [{ n, mov, num, den }], l'ultima voce è la fine (n = ultima + 1)
  function _battuteMov(oggetto, fineMov) {
    const metri = [{ mov: 0, metro: oggetto.metro }];
    for (const c of (oggetto.cambi || []).filter((c) => Array.isArray(c.metro)).slice().sort((a, b) => a.mov - b.mov)) {
      if (c.mov <= EPS) metri[0].metro = c.metro; else metri.push({ mov: c.mov, metro: c.metro });
    }
    const metroA = (mov) => { let m = metri[0].metro; for (const x of metri) if (x.mov <= mov + EPS) m = x.metro; return m; };
    const out = [];
    let inizio = 0, guardia = 0;
    while (guardia++ < 20000) {
      const [num, den] = metroA(inizio);
      out.push({ n: out.length + 1, mov: tondo(inizio), num, den });
      let prossimo = inizio + (num * 4) / den;
      for (const x of metri) if (x.mov > inizio + EPS && x.mov < prossimo - EPS) { prossimo = x.mov; break; }
      inizio = prossimo;
      if (inizio >= fineMov - EPS) break;
    }
    out.push({ n: out.length + 1, mov: tondo(inizio), num: out[out.length - 1].num, den: out[out.length - 1].den });
    return out;
  }

  function _fineMov(oggetto) {
    let f = 0;
    for (const p of oggetto.parti || []) for (const n of p.note || []) f = Math.max(f, n[0] + n[1]);
    return f;
  }

  function _battutaDiMov(battute, mov) {
    let n = 1;
    for (let i = 0; i < battute.length - 1; i++) { if (battute[i].mov <= mov + EPS) n = battute[i].n; else break; }
    return n;
  }

  function battutaDi(brano, sec) {
    const b = brano.battute;
    let n = 1;
    for (let i = 0; i < b.length - 1; i++) { if (b[i].sec <= sec + EPS) n = b[i].n; else break; }
    return n;
  }

  function inizioBattuta(brano, n) {
    const b = brano.battute;
    const i = Math.max(0, Math.min(b.length - 1, Math.round(n) - 1));
    return b[i].sec;
  }

  // Fine del suono di una nota: lo stacco di articolazione (DESIGN §11.2, contratto §5.3)
  function stacco(nota) {
    const s = R().stacco || { frazione: 0.08, max_s: 0.06 };
    return nota.fine - Math.min(s.max_s, (nota.fine - nota.inizio) * s.frazione);
  }

  // ---------- verifica del formato ----------

  function verifica(o) {
    const err = [];
    const e = (m) => { if (err.length < 30) err.push(m); };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return ['Il brano non è un oggetto.'];
    if (o.formato !== 'yavier-brano') e('«formato» deve essere "yavier-brano".');
    if (o.versione !== 1) e('«versione» deve essere 1.');
    if (typeof o.id !== 'string' || !/^[a-z0-9-]+$/.test(o.id)) e('«id» deve contenere solo lettere minuscole, cifre e trattini.');
    if (typeof o.titolo !== 'string' || !o.titolo.trim()) e('Manca il «titolo».');
    if (o.compositore != null && typeof o.compositore !== 'string') e('«compositore» deve essere un testo.');
    if (o.livello != null && !(intero(o.livello) && o.livello >= 1 && o.livello <= 5)) e('«livello» va da 1 a 5.');
    const metroOk = (m) => Array.isArray(m) && m.length === 2 && intero(m[0]) && m[0] > 0 && m[0] <= 32 && DEN.includes(m[1]);
    if (!metroOk(o.metro)) e('«metro» deve essere [numeratore, denominatore] con denominatore 2, 4, 8 o 16.');
    if (!(numero(o.bpm) && o.bpm > 0 && o.bpm <= 1000)) e('«bpm» deve essere un numero positivo.');
    if (o.armatura != null && !(intero(o.armatura) && o.armatura >= -7 && o.armatura <= 7)) e('«armatura» va da -7 a 7.');
    if (o.cambi != null) {
      if (!Array.isArray(o.cambi)) e('«cambi» deve essere un elenco.');
      else o.cambi.forEach((c, i) => {
        if (!c || !numero(c.mov) || c.mov < 0) e('Cambio ' + (i + 1) + ': «mov» non valido.');
        else {
          if (c.bpm == null && c.metro == null) e('Cambio ' + (i + 1) + ': manca «bpm» o «metro».');
          if (c.bpm != null && !(numero(c.bpm) && c.bpm > 0)) e('Cambio ' + (i + 1) + ': «bpm» non valido.');
          if (c.metro != null && !metroOk(c.metro)) e('Cambio ' + (i + 1) + ': «metro» non valido.');
        }
      });
    }
    let totale = 0;
    if (!Array.isArray(o.parti) || !o.parti.length) e('Servono una o più «parti».');
    else {
      const ids = new Set();
      o.parti.forEach((p, i) => {
        const nome = 'Parte ' + (i + 1);
        if (!p || typeof p !== 'object') { e(nome + ': non è un oggetto.'); return; }
        if (typeof p.id !== 'string' || !p.id) e(nome + ': manca «id».');
        else if (ids.has(p.id)) e(nome + ': «id» ripetuto.');
        else ids.add(p.id);
        if (p.mano != null && !MANI.includes(p.mano)) e(nome + ': «mano» deve essere destra, sinistra o accompagnamento.');
        if (p.colore != null && !COLORI.includes(p.colore)) e(nome + ': «colore» non valido.');
        if (p.strumento != null && !STRUMENTI.includes(p.strumento)) e(nome + ': «strumento» non valido.');
        if (!Array.isArray(p.note)) { e(nome + ': «note» deve essere un elenco.'); return; }
        p.note.forEach((n, k) => {
          const dove = nome + ', nota ' + (k + 1) + ': ';
          if (!Array.isArray(n) || n.length < 3 || n.length > 5) { e(dove + 'deve essere [inizio, durata, nota, forza?, dito?].'); return; }
          if (!numero(n[0]) || n[0] < 0) e(dove + '«inizio» non valido.');
          if (!numero(n[1]) || n[1] <= 0) e(dove + '«durata» deve essere positiva.');
          if (!intero(n[2]) || n[2] < 21 || n[2] > 108) e(dove + '«nota» va da 21 a 108.');
          if (n.length > 3 && n[3] != null && !(intero(n[3]) && n[3] >= 1 && n[3] <= 127)) e(dove + '«forza» va da 1 a 127.');
          if (n.length > 4 && n[4] != null && !(intero(n[4]) && n[4] >= 1 && n[4] <= 5)) e(dove + '«dito» va da 1 a 5.');
        });
        totale += p.note.length;
      });
      if (!totale) e('Il brano non ha note.');
    }
    if (o.punti != null) {
      if (!Array.isArray(o.punti)) e('«punti» deve essere un elenco.');
      else o.punti.forEach((p, i) => {
        if (!p || !intero(p.battuta) || p.battuta < 1) e('Punto ' + (i + 1) + ': «battuta» non valida.');
        if (p && p.nome != null && typeof p.nome !== 'string') e('Punto ' + (i + 1) + ': «nome» deve essere un testo.');
      });
    }
    if (o.tratti != null) {
      if (!Array.isArray(o.tratti)) e('«tratti» deve essere un elenco.');
      else o.tratti.forEach((t, i) => {
        if (!t || !intero(t.da) || !intero(t.a) || t.da < 1 || t.a < t.da) e('Tratto ' + (i + 1) + ': «da» e «a» non validi.');
      });
    }
    if (o.provenienza != null && (typeof o.provenienza !== 'object' || Array.isArray(o.provenienza))) e('«provenienza» deve essere un oggetto.');
    return err;
  }

  // ---------- gruppi (accordi) ----------

  // note: elenco con .inizioSec; restituisce gruppi [[nota…]] in ordine di tempo
  function _gruppi(note, chiaveSec) {
    const ord = note.slice().sort((a, b) => chiaveSec(a) - chiaveSec(b));
    const out = [];
    let cur = null, t0 = 0;
    for (const n of ord) {
      const t = chiaveSec(n);
      if (!cur || t - t0 > accordoSec() + EPS) { cur = []; out.push(cur); t0 = t; }
      cur.push(n);
    }
    return out;
  }

  // ---------- mani (DESIGN §6.1) ----------

  const PAROLE_DESTRA = ['destra', 'right', 'treble'];
  const PAROLE_SINISTRA = ['sinistra', 'left', 'bass'];
  const SIGLE_DESTRA = ['rh', 'md'];
  const SIGLE_SINISTRA = ['lh', 'ms'];

  function _manoDalNome(nome) {
    const s = YT.util ? YT.util.semplice(nome) : String(nome || '').toLowerCase();
    const parole = s.split(/[^a-z0-9]+/).filter(Boolean);
    const ha = (lunghe, sigle) => lunghe.some((w) => s.includes(w)) || sigle.some((w) => parole.includes(w));
    const d = ha(PAROLE_DESTRA, SIGLE_DESTRA), si = ha(PAROLE_SINISTRA, SIGLE_SINISTRA);
    if (d && !si) return 'destra';
    if (si && !d) return 'sinistra';
    return null;
  }

  function _media(p) { return p.note.reduce((a, n) => a + n[2], 0) / Math.max(1, p.note.length); }

  // Divide una parte in destra e sinistra, gruppo per gruppo
  function _dividi(oggetto, parte) {
    let cD = DIVIDI.centroDestra, cS = DIVIDI.centroSinistra;
    const destra = [], sinistra = [];
    const gruppi = _gruppi(parte.note, (n) => secDaMov(oggetto, n[0]));
    for (const g of gruppi) {
      const ord = g.slice().sort((a, b) => a[2] - b[2]);
      let migliore = null;
      for (const vincoli of [true, false]) {
        for (let k = 0; k <= ord.length; k++) {
          const sx = ord.slice(0, k), dx = ord.slice(k);
          if (vincoli) {
            if (sx.length > DIVIDI.maxNote || dx.length > DIVIDI.maxNote) continue;
            if (sx.length && sx[sx.length - 1][2] - sx[0][2] > DIVIDI.maxApertura) continue;
            if (dx.length && dx[dx.length - 1][2] - dx[0][2] > DIVIDI.maxApertura) continue;
          }
          const costo = sx.reduce((a, n) => a + Math.abs(n[2] - cS), 0) + dx.reduce((a, n) => a + Math.abs(n[2] - cD), 0);
          const confine = k === 0 ? ord[0][2] - 0.5 : k === ord.length ? ord[k - 1][2] + 0.5 : (ord[k - 1][2] + ord[k][2]) / 2;
          const vicino = Math.abs(confine - DO_CENTRALE);
          if (!migliore || costo < migliore.costo - EPS || (Math.abs(costo - migliore.costo) < EPS && vicino < migliore.vicino)) {
            migliore = { k, costo, vicino };
          }
        }
        if (migliore) break;
      }
      const sx = ord.slice(0, migliore.k), dx = ord.slice(migliore.k);
      sinistra.push(...sx); destra.push(...dx);
      const m = (a) => a.reduce((s, n) => s + n[2], 0) / a.length;
      if (dx.length) cD = DIVIDI.ricordo * cD + (1 - DIVIDI.ricordo) * m(dx);
      if (sx.length) cS = DIVIDI.ricordo * cS + (1 - DIVIDI.ricordo) * m(sx);
    }
    const ordina = (a) => a.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
    return { destra: ordina(destra), sinistra: ordina(sinistra) };
  }

  function assegnaMani(oggetto) {
    const o = YT.util.copia(oggetto);
    let indovinate = false;
    const libere = [];
    for (const p of o.parti) {
      if (MANI.includes(p.mano)) continue;
      if (p.percussione) { p.mano = 'accompagnamento'; continue; }
      const m = _manoDalNome(p.nome);
      if (m) { p.mano = m; continue; }
      if (p.note.length) libere.push(p); else p.mano = 'accompagnamento';
    }
    const prese = () => new Set(o.parti.filter((p) => p.mano === 'destra' || p.mano === 'sinistra').map((p) => p.mano));
    if (libere.length >= 2) {
      indovinate = true;
      const ord = libere.slice().sort((a, b) => _media(a) - _media(b));
      const gia = prese();
      ord.forEach((p) => { p.mano = 'accompagnamento'; p.indovinata = true; });
      if (!gia.has('sinistra')) ord[0].mano = 'sinistra';
      if (!gia.has('destra')) ord[ord.length - 1].mano = 'destra';
    } else if (libere.length === 1) {
      const p = libere[0];
      const gia = prese();
      p.indovinata = true;
      indovinate = true;
      if (gia.has('destra') && gia.has('sinistra')) p.mano = 'accompagnamento';
      else if (gia.has('destra')) p.mano = 'sinistra';
      else if (gia.has('sinistra')) p.mano = 'destra';
      else {
        const altezze = p.note.map((n) => n[2]);
        const min = Math.min(...altezze), max = Math.max(...altezze);
        if (min >= DO_CENTRALE) p.mano = 'destra';
        else if (max < DO_CENTRALE) p.mano = 'sinistra';
        else {
          const { destra, sinistra } = _dividi(o, p);
          if (!sinistra.length) p.mano = 'destra';
          else if (!destra.length) p.mano = 'sinistra';
          else {
            const base = { strumento: p.strumento, percussione: false, indovinata: true };
            const pd = Object.assign({}, base, { id: p.id + '-d', nome: 'Mano destra', mano: 'destra', note: destra });
            const ps = Object.assign({}, base, { id: p.id + '-s', nome: 'Mano sinistra', mano: 'sinistra', note: sinistra });
            if (p.colore) { pd.colore = p.colore; }
            if (!pd.strumento) delete pd.strumento;
            if (!ps.strumento) delete ps.strumento;
            const i = o.parti.indexOf(p);
            o.parti.splice(i, 1, pd, ps);
          }
        }
      }
    }
    return { oggetto: o, indovinate };
  }

  // ---------- livello ----------

  function stimaLivello(oggetto) {
    const parti = oggetto.parti.filter((p) => !p.percussione && p.mano !== 'accompagnamento');
    const note = [];
    for (const p of parti) for (const n of p.note) note.push(n);
    if (!note.length) return 1;
    const inizio = Math.min(...note.map((n) => n[0]));
    const fine = Math.max(...note.map((n) => n[0] + n[1]));
    const durata = Math.max(0.5, secDaMov(oggetto, fine) - secDaMov(oggetto, inizio));
    const d = note.length / durata;
    let gruppi = 0;
    for (const p of parti) gruppi += _gruppi(p.note, (n) => secDaMov(oggetto, n[0])).length;
    const pm = note.length / Math.max(1, gruppi);
    return YT.util.clamp(Math.round(1 + 1.2 * Math.max(0, d - 1) + 1.5 * (pm - 1)), 1, 5);
  }

  // ---------- tratti (DESIGN §11 «I tratti calcolati») ----------

  // divide [da, a] in pezzi da «pezzo» battute, l'ultimo da 2 a pezzo+1
  function _aPezzi(da, a, soglia, pezzo) {
    const out = [];
    if (a - da + 1 <= soglia) return [[da, a]];
    let i = da;
    while (a - i + 1 > pezzo + 1) { out.push([i, i + pezzo - 1]); i += pezzo; }
    out.push([i, a]);
    return out;
  }

  function tratti(brano, override) {
    const regole = R().tratti || { max: 8, pezzo: 4, senzaPunti: 4 };
    const ultima = brano.battute.length - 1;
    let segmenti = [];
    if (Array.isArray(override) && override.length) {
      segmenti = override
        .filter((t) => t && t.da >= 1 && t.da <= ultima)
        .map((t) => ({ da: t.da, a: Math.min(ultima, Math.max(t.da, t.a)), nome: t.nome || '' }))
        .sort((x, y) => x.da - y.da);
    } else {
      const punti = (brano.punti || []).filter((p) => !p.mio && p.battuta >= 1 && p.battuta <= ultima);
      const per = new Map();
      for (const p of punti.slice().sort((x, y) => x.battuta - y.battuta)) if (!per.has(p.battuta)) per.set(p.battuta, p.nome || '');
      const inizi = [...per.keys()];
      if (!inizi.length) {
        for (const [da, a] of _aPezzi(1, ultima, regole.senzaPunti + 1, regole.senzaPunti)) segmenti.push({ da, a, nome: '' });
      } else {
        let grezzi = [];
        if (inizi[0] > 1) grezzi.push({ da: 1, a: inizi[0] - 1, nome: '' });
        inizi.forEach((b, i) => grezzi.push({ da: b, a: i + 1 < inizi.length ? inizi[i + 1] - 1 : ultima, nome: per.get(b) }));
        // un segmento di una battuta si unisce al seguente (o, se è l'ultimo, al precedente)
        let cambiato = true;
        while (cambiato && grezzi.length > 1) {
          cambiato = false;
          for (let i = 0; i < grezzi.length; i++) {
            const s = grezzi[i];
            if (s.a - s.da + 1 !== 1) continue;
            if (i + 1 < grezzi.length) { const p = grezzi[i + 1]; grezzi.splice(i, 2, { da: s.da, a: p.a, nome: s.nome || p.nome }); }
            else { const p = grezzi[i - 1]; grezzi.splice(i - 1, 2, { da: p.da, a: s.a, nome: p.nome || s.nome }); }
            cambiato = true;
            break;
          }
        }
        for (const s of grezzi) for (const [da, a] of _aPezzi(s.da, s.a, regole.max, regole.pezzo)) segmenti.push({ da, a, nome: s.nome });
      }
    }
    return segmenti.map((s, i) => ({
      id: 't' + (i + 1), n: i + 1, da: s.da, a: s.a, nome: s.nome,
      daSec: inizioBattuta(brano, s.da), aSec: inizioBattuta(brano, s.a + 1),
    }));
  }

  // ---------- dal formato al Brano ----------

  function daJSON(oggetto, origine) {
    const errori = verifica(oggetto);
    if (errori.length) throw new Error(errori.join(' '));
    origine = origine || 'incluso';
    if (origine === 'incluso' && !oggetto.provenienza) throw new Error('Un brano incluso deve avere la «provenienza».');
    const { oggetto: o, indovinate } = assegnaMani(oggetto);
    const tempi = _segmentiTempo(o);
    const fineMov = _fineMov(o);
    const battMov = _battuteMov(o, fineMov);
    const brano = {
      id: o.id, origine,
      titolo: o.titolo, compositore: o.compositore || null,
      livello: o.livello || stimaLivello(o),
      bpm: o.bpm, metro: o.metro.slice(), armatura: o.armatura || 0,
      durata: 0, battute: [], parti: [], note: [], punti: [], tratti: [],
      provenienza: o.provenienza ? YT.util.copia(o.provenienza) : null,
      maniIndovinate: indovinate,
      facile: false,
      sorgente: o,
      tempi,
    };
    brano.battute = battMov.map((b) => ({ n: b.n, sec: tondo(secDaMov(brano, b.mov)), num: b.num, den: b.den, mov: b.mov }));
    const note = [];
    for (const p of o.parti) {
      brano.parti.push({
        id: p.id, nome: p.nome || p.id, mano: p.mano,
        colore: p.colore || COLORE_DI[p.mano], strumento: p.strumento || 'pianoforte',
        percussione: !!p.percussione, indovinata: !!p.indovinata,
      });
      for (const n of p.note) {
        note.push({
          id: 0, parte: p.id, nota: n[2],
          inizio: tondo(secDaMov(brano, n[0])), fine: tondo(secDaMov(brano, n[0] + n[1])),
          forza: n[3] != null ? n[3] : 64, dito: n[4] != null ? n[4] : null,
          battuta: _battutaDiMov(battMov, n[0]),
        });
      }
    }
    note.sort((a, b) => a.inizio - b.inizio || a.nota - b.nota);
    note.forEach((n, i) => (n.id = i));
    brano.note = note;
    brano.durata = note.reduce((m, n) => Math.max(m, n.fine), 0);
    const ultima = brano.battute.length - 1;
    brano.punti = (o.punti || [])
      .filter((p) => p.battuta <= ultima)
      .map((p) => ({ battuta: p.battuta, sec: inizioBattuta(brano, p.battuta), nome: p.nome || '', mio: false }))
      .sort((a, b) => a.battuta - b.battuta);
    brano.tratti = tratti(brano, o.tratti || null);
    return brano;
  }

  // ---------- dal MIDI ----------

  function _titoloDaFile(nomeFile) {
    return String(nomeFile || '').replace(/^.*[\\/]/, '').replace(/\.(midi?|kar)$/i, '').replace(/_/g, ' ').trim();
  }

  function daMidi(arrayBuffer, nomeFile, origine, id) {
    origine = origine || 'mio';
    const byte = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const parsed = YT.midi.leggi(byte);
    const titoloFile = _titoloDaFile(nomeFile);
    const s = YT.midi.daFile(parsed, titoloFile);
    const impronta = YT.util.impronta(byte);
    const tempo0 = s.tempos[0];
    const metroOk = (n, d) => intero(n) && n > 0 && n <= 32 && DEN.includes(d);
    const sig0 = s.timeSigs[0];
    const oggetto = {
      formato: 'yavier-brano', versione: 1,
      id: 'midi-' + impronta,
      titolo: s.nomeTraccia0 || titoloFile || 'MIDI',
      compositore: null,
      metro: metroOk(sig0.num, sig0.den) ? [sig0.num, sig0.den] : [4, 4],
      bpm: Math.round(tempo0.bpm * 1000) / 1000,
      armatura: s.keySigs.length ? YT.util.clamp(s.keySigs[0].sf, -7, 7) : 0,
      cambi: [],
      parti: [],
      punti: [],
    };
    const cambi = new Map();
    for (const t of s.tempos.slice(1)) { const k = tondo(t.mov); cambi.set(k, Object.assign(cambi.get(k) || { mov: k }, { bpm: Math.round(t.bpm * 1000) / 1000 })); }
    for (const t of s.timeSigs.slice(1)) {
      if (!metroOk(t.num, t.den)) continue;
      const k = tondo(t.mov); cambi.set(k, Object.assign(cambi.get(k) || { mov: k }, { metro: [t.num, t.den] }));
    }
    oggetto.cambi = [...cambi.values()].sort((a, b) => a.mov - b.mov);
    // una parte per ogni coppia (traccia, canale) con note
    const perParte = new Map();
    const nomiTracce = new Map(s.tracks.map((t) => [t.index, t.name]));
    for (const n of s.notes) {
      if (n.pitch < 21 || n.pitch > 108) continue;
      const k = n.track + ':' + n.ch;
      if (!perParte.has(k)) perParte.set(k, { track: n.track, ch: n.ch, note: [] });
      const durata = Math.max(1 / 64, tondo(n.endMov - n.startMov));
      perParte.get(k).note.push([tondo(n.startMov), durata, n.pitch, YT.util.clamp(n.vel, 1, 127)]);
    }
    const parti = [...perParte.values()].sort((a, b) => a.track - b.track || a.ch - b.ch);
    parti.forEach((p, i) => {
      const parte = { id: 'p' + (i + 1), nome: nomiTracce.get(p.track) || 'Parte ' + (i + 1), note: p.note };
      if (p.ch === 9) { parte.percussione = true; parte.mano = 'accompagnamento'; }
      oggetto.parti.push(parte);
    });
    if (!oggetto.parti.length) throw new Error('Il file MIDI non ha note.');
    // punti dai marcatori
    const battMov = _battuteMov(oggetto, _fineMov(oggetto));
    const visti = new Set();
    for (const m of s.markers) {
      const b = _battutaDiMov(battMov, m.mov + EPS);
      if (visti.has(b)) continue;
      visti.add(b);
      oggetto.punti.push({ battuta: b, nome: m.label });
    }
    const brano = daJSON(oggetto, origine);
    brano.id = id || (origine === 'mio' ? 'mio:' + impronta : origine + ':' + (nomeFile || impronta));
    return brano;
  }

  // ---------- brani inclusi ----------

  let _inclusi = null;
  function inclusi() {
    if (!_inclusi) _inclusi = (YT.datiInclusi || []).map((o) => daJSON(o, 'incluso'));
    return _inclusi;
  }

  // ---------- scelte della persona ----------

  function conScelte(brano, scelta) {
    const b = YT.util.copia(brano);
    const sc = scelta || {};
    const sp = sc.parti || {};
    b.parti = b.parti.map((p) => {
      const s = sp[p.id] || {};
      const q = Object.assign({}, p);
      if (MANI.includes(s.mano) && s.mano !== p.mano) { q.mano = s.mano; q.colore = COLORE_DI[s.mano]; q.indovinata = false; }
      if (COLORI.includes(s.colore)) q.colore = s.colore;
      if (STRUMENTI.includes(s.strumento)) q.strumento = s.strumento;
      return q;
    });
    const ultima = b.battute.length - 1;
    const propri = (sc.punti || [])
      .filter((p) => p && p.battuta >= 1 && p.battuta <= ultima)
      .map((p) => ({ battuta: p.battuta, sec: inizioBattuta(b, p.battuta), nome: p.nome || '', mio: true }));
    b.punti = b.punti.filter((p) => !p.mio).concat(propri).sort((x, y) => x.battuta - y.battuta || (x.mio ? 1 : 0) - (y.mio ? 1 : 0));
    if (Array.isArray(sc.tratti) && sc.tratti.length) b.tratti = tratti(b, sc.tratti);
    return b;
  }

  // ---------- versione facile (DESIGN §6.3) ----------

  function _forte(pos, num, den, toll) {
    const vicino = (x) => Math.abs(pos - x) <= toll + EPS;
    if (vicino(0)) return true;
    if (num === 4 && den === 4 && vicino(2)) return true;
    if (den === 8 && (num === 6 || num === 12)) {
      const k = Math.round(pos / 1.5);
      if (k >= 0 && vicino(k * 1.5)) return true;
    }
    return false;
  }

  function facile(brano) {
    const b = YT.util.copia(brano);
    b.facile = true;
    if (brano.facile) return b;
    const toll = (R().facile || { tolleranzaForte: 0.25 }).tolleranzaForte;
    const manoDi = new Map(b.parti.map((p) => [p.id, p.mano]));
    const tenute = [];
    for (const p of b.parti) {
      const note = b.note.filter((n) => n.parte === p.id);
      if (p.mano === 'accompagnamento' || p.percussione) { tenute.push(...note); continue; }
      const gruppi = _gruppi(note, (n) => n.inizio);
      if (manoDi.get(p.id) === 'destra') {
        for (const g of gruppi) tenute.push(g.reduce((m, n) => (n.nota > m.nota ? n : m)));
        continue;
      }
      // sinistra: il basso sui tempi forti
      const perBattuta = new Map();
      for (const g of gruppi) {
        const basso = g.reduce((m, n) => (n.nota < m.nota ? n : m));
        const bt = b.battute[basso.battuta - 1];
        const pos = movDaSec(b, basso.inizio) - bt.mov;
        if (!perBattuta.has(basso.battuta)) perBattuta.set(basso.battuta, { prima: basso, forti: [] });
        if (_forte(pos, bt.num, bt.den, toll)) perBattuta.get(basso.battuta).forti.push(basso);
      }
      const scelte = [];
      for (const [, v] of [...perBattuta.entries()].sort((x, y) => x[0] - y[0])) scelte.push(...(v.forti.length ? v.forti : [v.prima]));
      scelte.sort((x, y) => x.inizio - y.inizio);
      scelte.forEach((n, i) => {
        const fineBattuta = inizioBattuta(b, n.battuta + 1);
        const prossima = i + 1 < scelte.length ? scelte[i + 1].inizio : Infinity;
        n.fine = tondo(Math.max(n.inizio + 1e-3, Math.min(prossima, fineBattuta)));
      });
      tenute.push(...scelte);
    }
    tenute.sort((x, y) => x.inizio - y.inizio || x.nota - y.nota);
    b.note = tenute;
    return b;
  }

  // ---------- zona della tastiera ----------

  const _bianco = (n) => [0, 2, 4, 5, 7, 9, 11].includes(((n % 12) + 12) % 12);

  function zona(brano, daSec, aSec, partiVisibili) {
    const vis = partiVisibili == null ? null : new Set(partiVisibili instanceof Set ? [...partiVisibili] : partiVisibili);
    let lo = Infinity, hi = -Infinity;
    for (const n of brano.note) {
      if (vis && !vis.has(n.parte)) continue;
      if (n.fine <= daSec + EPS || n.inizio >= aSec - EPS) continue;
      lo = Math.min(lo, n.nota); hi = Math.max(hi, n.nota);
    }
    if (lo === Infinity) { lo = 48; hi = 72; }
    while (!_bianco(lo)) lo--;
    while (!_bianco(hi)) hi++;
    // almeno due ottave, centrate
    while (hi - lo < 24) {
      if (hi - lo < 24) hi++;
      if (hi - lo < 24) lo--;
    }
    while (!_bianco(lo)) lo--;
    while (!_bianco(hi)) hi++;
    if (lo < 21) { hi += 21 - lo; lo = 21; }
    if (hi > 108) { lo -= hi - 108; hi = 108; }
    return [Math.max(21, lo), Math.min(108, hi)];
  }

  YT.brani = {
    verifica, daJSON, daMidi, inclusi, assegnaMani, conScelte, facile, stimaLivello, tratti,
    secDaMov, movDaSec, battutaDi, inizioBattuta, stacco, zona,
  };
})();
