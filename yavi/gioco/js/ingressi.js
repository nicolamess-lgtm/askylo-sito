// Yavier Game — da dove arrivano le note: i tasti disegnati (tocco e mouse, più dita insieme),
// la tastiera del computer, una tastiera MIDI (Web MIDI, solo in entrata, solo dopo il pulsante)
// e, solo nell'app di Yavier sul Mac, il pianoforte vero (GET /api/piano/stato + /api/piano/eventi).
// Ogni nota arriva a chi ascolta come giu({ nota, forza, fonte, chiave }) e su({ nota, fonte, chiave }).
// fonte: 'tocco' | 'tasti' | 'midi' | 'piano'. Qui non si manda niente a nessuno.
(function () {
  'use strict';
  const G = window;
  const YG = (G.YG = G.YG || {});
  const L = YG.logica;
  const S = YG.SOGLIE;
  const ora = () => performance.now();

  const ascoltatori = { giu: [], su: [], stato: [], tastiera: [] };
  function emetti(tipo, dati) {
    for (const fn of ascoltatori[tipo]) { try { fn(dati); } catch (e) { console.warn('[Game]', e); } }
  }
  function ascolta(tipo, fn) { ascoltatori[tipo].push(fn); }

  // ---------- doppioni tra fonti (la stessa tastiera sentita da due strade) ----------
  const ultimi = new Map();
  const scartate = new Set();   // 'fonte:nota' scartate: si scarta anche il loro «su»
  function giu(nota, forza, fonte, chiave) {
    if (!(nota >= 0 && nota <= 127)) return;
    if (L.doppione(ultimi, nota, fonte, ora(), S.doppio_ms)) { scartate.add(fonte + ':' + nota); return; }
    emetti('giu', { nota, forza, fonte, chiave: chiave || fonte + ':' + nota, ms: ora() });
  }
  function su(nota, fonte, chiave) {
    if (scartate.delete(fonte + ':' + nota)) return;
    emetti('su', { nota, fonte, chiave: chiave || fonte + ':' + nota, ms: ora() });
  }

  // ---------- i tasti disegnati ----------
  // button: un <button> vero. Ogni dito (pointerId) tiene il suo tasto finché si alza.
  function collegaTasto(button, nota) {
    const dita = new Set();
    const alza = (e) => {
      if (!dita.has(e.pointerId)) return;
      dita.delete(e.pointerId);
      su(nota, 'tocco', 'tocco:' + nota + ':' + e.pointerId);
    };
    button.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;      // solo il tasto principale del mouse
      e.preventDefault();                                // niente zoom, niente selezione, niente focus rubato
      if (YG.suono) YG.suono.sblocca();
      try { button.setPointerCapture(e.pointerId); } catch (err) { /* vecchi browser */ }
      dita.add(e.pointerId);
      giu(nota, S.forza_tocco, 'tocco', 'tocco:' + nota + ':' + e.pointerId);
    });
    button.addEventListener('pointerup', alza);
    button.addEventListener('pointercancel', alza);
    button.addEventListener('lostpointercapture', alza);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
    // con la tastiera: Tab fino al tasto, poi Invio o Spazio
    let tenuto = false;
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || tenuto) return;
      tenuto = true;
      if (YG.suono) YG.suono.sblocca();
      giu(nota, S.forza_tocco, 'tasti', 'invio:' + nota);
    });
    button.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!tenuto) return;
      tenuto = false;
      su(nota, 'tasti', 'invio:' + nota);
    });
    button.addEventListener('blur', () => { if (tenuto) { tenuto = false; su(nota, 'tasti', 'invio:' + nota); } });
  }

  // ---------- la tastiera del computer ----------
  let mappa = {};                  // codice fisico → nota
  const tenuti = new Map();        // codice → nota
  function usaMappa(m) { rilasciaTasti(); mappa = Object.assign({}, m || {}); }
  function rilasciaTasti() {
    for (const [code, nota] of tenuti) su(nota, 'tasti', 'tasti:' + code);
    tenuti.clear();
  }
  G.addEventListener('keydown', (e) => {
    const nota = L.notaDaTasto(e, mappa);
    if (nota == null) return;
    e.preventDefault();
    if (e.repeat || tenuti.has(e.code)) return;
    tenuti.set(e.code, nota);
    if (YG.suono) YG.suono.sblocca();
    emetti('tastiera', null);
    giu(nota, S.forza_tocco, 'tasti', 'tasti:' + e.code);
  });
  G.addEventListener('keyup', (e) => {
    if (!tenuti.has(e.code)) return;
    const nota = tenuti.get(e.code);
    tenuti.delete(e.code);
    e.preventDefault();
    su(nota, 'tasti', 'tasti:' + e.code);
  });
  G.addEventListener('blur', rilasciaTasti);

  // ---------- Web MIDI (solo in entrata, solo dopo il pulsante) ----------
  const stato = { midi: 'spento', porte: [], piano: false };   // midi: spento | chiedo | attivo | negato | manca
  let accesso = null;
  const fantasmiMidi = new Set();
  const midiPossibile = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

  function aggancia() {
    if (!accesso) return;
    const porte = [];
    accesso.inputs.forEach((p) => {
      if (p.state === 'disconnected') { p.onmidimessage = null; return; }
      const delPiano = stato.piano && L.portaDelPiano(p.name, ponte.ingresso);
      if (!delPiano) porte.push(p.name || 'Tastiera MIDI');
      p.onmidimessage = (m) => {
        if (stato.piano && L.portaDelPiano(p.name, ponte.ingresso)) return;   // lo sento già dal ponte
        const d = m.data;
        if (!d || d.length < 2) return;
        const tipo = d[0] & 0xf0;
        const chiave = 'midi:' + p.id + ':' + d[1];
        if (tipo === 0x90 && d[2] > 0) {
          if (L.fantasma(d[2])) { fantasmiMidi.add(chiave); return; }
          giu(d[1], d[2], 'midi', chiave);
        } else if (tipo === 0x80 || (tipo === 0x90 && d[2] === 0)) {
          if (fantasmiMidi.delete(chiave)) return;
          su(d[1], 'midi', chiave);
        }
      };
    });
    stato.porte = porte;
    emetti('stato', Object.assign({}, stato));
  }

  async function attivaMidi() {
    if (!midiPossibile()) { stato.midi = 'manca'; emetti('stato', Object.assign({}, stato)); return stato.midi; }
    if (accesso) return stato.midi;
    stato.midi = 'chiedo'; emetti('stato', Object.assign({}, stato));
    try {
      accesso = await navigator.requestMIDIAccess({ sysex: false });
      accesso.onstatechange = aggancia;
      stato.midi = 'attivo';
      aggancia();
    } catch (e) {
      accesso = null;
      stato.midi = 'negato';
      emetti('stato', Object.assign({}, stato));
    }
    return stato.midi;
  }

  // ---------- il pianoforte vero, solo nell'app di Yavier sul Mac ----------
  const ponte = { ingresso: null, occupato: false, flusso: null, attesa: 2000, timer: 0, avviato: false };
  const fantasmiPiano = new Set();

  async function leggiStatoPonte() {
    const r = await fetch('/api/piano/stato', { cache: 'no-store' });
    if (!r.ok) throw new Error('no');
    const j = await r.json();
    if (!j || typeof j !== 'object' || !('simula' in j)) throw new Error('no');
    ponte.ingresso = j.ingresso || null;
    ponte.occupato = !!j.occupato;   // sta suonando un brano di Yavier: quelle note non sono tue
    return j;
  }

  function apriFlusso() {
    if (ponte.flusso || typeof EventSource !== 'function') return;
    let es;
    try { es = new EventSource('/api/piano/eventi'); } catch (e) { return riprovaPiu(); }
    ponte.flusso = es;
    es.onopen = () => {
      ponte.attesa = 2000;
      if (!stato.piano) { stato.piano = true; aggancia(); emetti('stato', Object.assign({}, stato)); }
    };
    es.onmessage = (m) => {
      let ev = null;
      try { ev = JSON.parse(m.data); } catch (e) { return; }
      if (!ev || ponte.occupato) return;
      const nota = Number(ev.nota);
      if (ev.t === 'on') {
        if (L.fantasma(ev.forza)) { fantasmiPiano.add(nota); return; }
        giu(nota, Number(ev.forza) || 64, 'piano', 'piano:' + nota);
      } else if (ev.t === 'off') {
        if (fantasmiPiano.delete(nota)) return;
        su(nota, 'piano', 'piano:' + nota);
      }
    };
    es.onerror = () => {
      // il flusso è caduto (Yavier chiuso o riavviato): si riprova in silenzio, con calma
      es.close();
      if (ponte.flusso === es) ponte.flusso = null;
      if (stato.piano) { stato.piano = false; aggancia(); emetti('stato', Object.assign({}, stato)); }
      riprovaPiu();
    };
  }

  function riprovaPiu() {
    clearTimeout(ponte.timer);
    const t = ponte.attesa;
    ponte.attesa = Math.min(30000, ponte.attesa * 2);
    ponte.timer = setTimeout(controllaPonte, t);
  }

  async function controllaPonte() {
    try {
      await leggiStatoPonte();
      if (ponte.ingresso) apriFlusso();
      else riprovaPiu();   // il pianoforte si può accendere dopo
    } catch (e) {
      riprovaPiu();
    }
  }

  function avviaPonte() {
    if (ponte.avviato || !L.servitoDaYavier(G.location)) return;
    ponte.avviato = true;
    controllaPonte();
    // ogni tanto si rilegge «occupato» (un brano di Yavier che parte o finisce)
    setInterval(() => {
      if (document.visibilityState === 'visible' && ponte.flusso) leggiStatoPonte().catch(() => {});
    }, 10000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ponte.flusso) leggiStatoPonte().catch(() => {});
    });
  }

  YG.ingressi = {
    ascolta, collegaTasto, usaMappa, rilasciaTasti, attivaMidi, avviaPonte, midiPossibile,
    stato: () => Object.assign({}, stato),
  };
})();
