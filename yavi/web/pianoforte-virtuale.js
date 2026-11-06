"use strict";
/* Yavier — pianoforte virtuale (window.YavierVirtuale)
   Quando il Disklavier non c'è (o hai scelto «Sempre dal computer») il brano lo suona il
   browser, con i campioni di un pianoforte vero salvati in /web/suoni/pianoforte/
   (FluidR3_GM, licenza CC BY 3.0: vedi web/suoni/LICENZA.md). Funziona senza Internet.

   Cosa c'è qui dentro:
   - i campioni (caricati solo quando servono, con «sto preparando il pianoforte…»);
   - le note: forza → volume con una curva morbida, durata, pedale di risonanza, riverbero
     leggero, volume generale, al massimo 64 voci insieme;
   - un lettore di file MIDI piccolo (formato 0 e 1, mappa dei tempi, pedale CC64);
   - il brano suonato da un punto qualsiasi (in secondi), pianificato poco alla volta
     sull'AudioContext, e lo stop immediato con un rilascio breve;
   - segui(stato): da chiamare con la risposta di /api/stato; suona quello che il server
     sta «suonando per finta», sincronizzato, passa al brano dopo, si ferma con lui.
     Le pagine che non lo chiamano (Tastiera, Canta) chiedono lo stato da sole: così un
     brano avviato da fuori (MCP, Scriptorium · Musica) si sente da qualunque scheda di Yavier;
   - le note del ponte (/api/virtuale/eventi): quelle che Tastiera, Canta o
     Scriptorium · Musica «dal vivo» mandano al pianoforte quando il Disklavier non c'è;
   - usaContesto(ctx, dest): Tastiera e Canta prestano il loro AudioContext, così nella
     pagina ce n'è uno solo;
   - montaLettore(el) e montaScelta(el): indicatore «🔈 Suono dal computer / 🎹 Disklavier»,
     volume e scelta «Dove suona».
   Il suono parte solo dopo un gesto (clic o tasto): è la regola dei browser.

   Modalità «solo suono» (la usa il Game): la pagina la chiede PRIMA di caricare questo file,
   con un attributo sul tag <html>:
       <html lang="it" data-virtuale="solo-suono">
   Restano i campioni, le voci (usaContesto, carica, conCampioni, voceSu, accendi, rilascia,
   pedale, silenzio), il volume e il lettore MIDI (leggiMidi, suonaDa, ferma).
   Non parte niente verso Yavier e verso le altre schede: niente /api/stato (né subito né
   ogni 5 s), niente ponte /api/virtuale/eventi, niente BroadcastChannel «yavier-virtuale»,
   niente ascolto dei clic e dei tasti di tutta la pagina (quello che manda «prendo»).
   segui, montaLettore, montaScelta, impostaPreferita e aggiornaPreferita non fanno niente.
   Così la pagina non suona i brani avviati da altre parti (Riproduttore, MCP) e un tocco
   non zittisce le altre schede di Yavier. Senza l'attributo il file fa tutto come sempre. */
(function (G) {
  if (G.YavierVirtuale && G.YavierVirtuale.versione) return;   // già caricato
  const V = (G.YavierVirtuale = {});
  V.versione = "2";
  // lingue (web/lingue.js): l'italiano è il testo di partenza
  const T = (id, it) => (G.YAVI_T ? G.YAVI_T(id, it) : it);
  const TF = (id, it, v) => T(id, it).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ""));
  // la modalità «solo suono» (vedi sopra): si legge una volta sola, al caricamento
  const SOLO_SUONO = (() => {
    try {
      const radice = G.document && G.document.documentElement;
      return !!(radice && radice.getAttribute && radice.getAttribute("data-virtuale") === "solo-suono");
    } catch (e) { return false; }
  })();
  V.soloSuono = SOLO_SUONO;

  const BASE = "/yavi/web/suoni/pianoforte/";
  const NOMI = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const GRAVE = 21, ACUTA = 108, MAX_VOCI = 64, IN_PARALLELO = 6;
  const SENZA_SMORZATORI = 89;       // dal Fa6 in su il pianoforte non ha smorzatori
  const nomeFile = (n) => NOMI[n % 12] + (Math.floor(n / 12) - 1) + ".mp3";

  function leggi(k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { G.localStorage.setItem(k, v); } catch (e) { /* pazienza */ } }

  // ------------------------------------------------------------------ audio
  let ctx = null, bus = null, volNodo = null;
  let ospite = false;                // true: l'AudioContext è della pagina (Tastiera, Canta)
  let vol = (() => { const v = parseFloat(leggi("yavier-virtuale-volume")); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; })();
  let muto = leggi("yavier-virtuale-muto") === "1";

  function impulso(c, secondi) {
    const n = Math.floor(c.sampleRate * secondi), pre = Math.floor(c.sampleRate * 0.012);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const x = (i - pre) / (n - pre);
        lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;   // un po' più scuro del rumore bianco
        d[i] = lp * Math.pow(1 - x, 2.2) * Math.exp(-3 * x);
      }
    }
    return b;
  }
  function guadagnoVolume() { return muto ? 0 : vol * vol * 1.1; }

  /** L'AudioContext di Yavier (creato la prima volta che serve), oppure quello prestato. */
  function contesto() {
    if (ctx) return ctx;
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: "playback" }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 4;
    lim.attack.value = 0.003; lim.release.value = 0.25;
    volNodo = ctx.createGain(); volNodo.gain.value = guadagnoVolume();
    bus = ctx.createGain(); bus.gain.value = 0.5;
    const secco = ctx.createGain(); secco.gain.value = 1;
    const conv = ctx.createConvolver(); conv.buffer = impulso(ctx, 2.2);
    const bagnato = ctx.createGain(); bagnato.gain.value = 0.2;
    bus.connect(secco); secco.connect(volNodo);
    bus.connect(conv); conv.connect(bagnato); bagnato.connect(volNodo);
    volNodo.connect(lim); lim.connect(ctx.destination);
    ctx.onstatechange = () => avvisa();
    return ctx;
  }
  /** Tastiera e Canta: «usa il mio AudioContext, collegati a dest». Niente secondo contesto. */
  function usaContesto(c, dest) {
    if (!c || ctx === c) return;
    if (ctx && !ospite) {                     // ne avevo già uno mio: lo chiudo
      const mio = ctx;
      if (brano && brano.timer) clearInterval(brano.timer);
      brano = null;
      for (const v of voci) { try { v.g.disconnect(); } catch (e) {} }
      voci.clear(); vociPonte.clear(); tenutePonte.clear(); tenuteLive.clear();
      try { mio.close(); } catch (e) { /* pazienza */ }
    }
    ctx = c; ospite = true;
    volNodo = c.createGain(); volNodo.gain.value = guadagnoVolume();
    bus = c.createGain(); bus.gain.value = 0.5;
    bus.connect(volNodo);
    if (Array.isArray(dest)) dest.forEach((d) => volNodo.connect(d)); else volNodo.connect(dest || c.destination);
    carica();
    avvisa(); riprova();
  }
  V.usaContesto = usaContesto;
  /** Prova a far partire l'audio (va chiamata dentro un clic o un tasto). */
  function sblocca() {
    const c = contesto();
    if (c && c.state !== "running") { const p = c.resume(); if (p && p.then) p.then(() => { avvisa(); riprova(); }, () => {}); }
    carica();
    return c;
  }
  V.contesto = contesto;
  V.sblocca = sblocca;
  V.adesso = () => (ctx ? ctx.currentTime : 0);
  V.inFunzione = () => !!ctx && ctx.state === "running";

  // ------------------------------------------------------------------ campioni
  const campioni = new Map();       // nota → { buffer, inizio }
  let caricamento = null, statoCarica = "nulla", caricati = 0;

  function decodifica(c, dati) {
    return new Promise((ok, no) => {
      try {
        const p = c.decodeAudioData(dati, ok, no);
        if (p && p.then) p.then(ok, no);
      } catch (e) { no(e); }
    });
  }
  /* I campioni sono stereo: per un pianoforte basta un canale (metà memoria: circa 49 MB
     invece di 98 per pagina). Si decodifica con un OfflineAudioContext, che non suona
     e non tiene occupato l'audio del computer. */
  let decodificatore = null;
  function contestoPerDecodificare() {
    if (decodificatore) return decodificatore;
    const OAC = G.OfflineAudioContext || G.webkitOfflineAudioContext;
    if (OAC) { try { decodificatore = new OAC(1, 1, 44100); return decodificatore; } catch (e) { /* sotto */ } }
    return contesto();
  }
  function inMono(b, c) {
    if (!b || b.numberOfChannels < 2) return b;
    let m;
    try { m = new AudioBuffer({ numberOfChannels: 1, length: b.length, sampleRate: b.sampleRate }); }
    catch (e) { try { m = c.createBuffer(1, b.length, b.sampleRate); } catch (e2) { return b; } }
    const d = m.getChannelData(0), l = b.getChannelData(0), r = b.getChannelData(1);
    for (let i = 0; i < d.length; i++) d[i] = (l[i] + r[i]) * 0.5;
    return m;
  }
  function attacco(buffer) {         // gli mp3 cominciano con qualche millisecondo di silenzio
    const d = buffer.getChannelData(0), max = Math.min(d.length, Math.floor(buffer.sampleRate * 0.08));
    for (let i = 0; i < max; i++) if (Math.abs(d[i]) > 0.003) return Math.max(0, i - 16) / buffer.sampleRate;
    return 0;
  }
  /** Carica i campioni (una volta sola). Restituisce una Promise. */
  function carica() {
    if (caricamento) return caricamento;
    const c = typeof fetch === "function" ? contestoPerDecodificare() : null;
    if (!c) { statoCarica = "errore"; avvisa(); return Promise.resolve(false); }
    statoCarica = "carica"; avvisa();
    const coda = [];
    for (let n = GRAVE; n <= ACUTA; n++) coda.push(n);
    async function lavoratore() {
      while (coda.length) {
        const n = coda.shift();
        try {
          const r = await fetch(BASE + nomeFile(n));
          if (!r.ok) throw new Error("HTTP " + r.status);
          const buffer = inMono(await decodifica(c, await r.arrayBuffer()), c);
          campioni.set(n, { buffer, inizio: attacco(buffer) });
        } catch (e) { /* manca una nota: si usa la vicina */ }
        caricati++;
        if (caricati % 8 === 0) avvisa();
      }
    }
    const lavori = [];
    for (let i = 0; i < IN_PARALLELO; i++) lavori.push(lavoratore());
    caricamento = Promise.all(lavori).then(() => {
      decodificatore = null;
      statoCarica = campioni.size ? "pronto" : "errore";   // senza campioni: sintetizzatore
      avvisa(); riprova();
      return campioni.size > 0;
    });
    return caricamento;
  }
  V.carica = carica;
  V.pronto = () => statoCarica === "pronto" || statoCarica === "errore";
  V.conCampioni = () => campioni.size > 0;

  function campioneVicino(n) {
    if (campioni.has(n)) return { c: campioni.get(n), rate: 1 };
    for (let d = 1; d < 12; d++) {
      for (const m of [n - d, n + d]) if (campioni.has(m)) return { c: campioni.get(m), rate: Math.pow(2, (n - m) / 12) };
    }
    return null;
  }

  // ------------------------------------------------------------------ voci
  const voci = new Set();
  const curva = (forza) => { const x = Math.max(1, Math.min(127, forza || 64)) / 127; return 0.04 + 0.96 * Math.pow(x, 1.7); };

  /* Costruisce una voce sul contesto c, collegata a dest. Restituisce
     { g, sorgenti: [...], t, fineNaturale } senza registrarla. */
  function costruisci(c, dest, nota, forza, t, scala, dentro) {
    const amp = curva(forza) * (scala == null ? 1 : scala);
    const x = Math.max(1, Math.min(127, forza || 64)) / 127;
    const f0 = 440 * Math.pow(2, (nota - 69) / 12);
    const g = c.createGain();
    const filtro = c.createBiquadFilter(); filtro.type = "lowpass";
    filtro.frequency.value = Math.min(18000, Math.max(f0 * 5, 1400 + 15000 * x * x));   // piano = più scuro
    filtro.connect(g);
    if (Array.isArray(dest)) dest.forEach((d) => g.connect(d)); else g.connect(dest);
    const vc = campioneVicino(nota);
    let sorgenti, fine;
    g.gain.setValueAtTime(0, t);
    if (vc) {
      const src = c.createBufferSource();
      src.buffer = vc.c.buffer; src.playbackRate.value = vc.rate;
      const da = vc.c.inizio + (dentro || 0) * vc.rate;
      const resto = (vc.c.buffer.duration - da) / vc.rate;
      if (resto < 0.3) { try { g.disconnect(); } catch (e) {} return null; }
      src.connect(filtro);
      g.gain.linearRampToValueAtTime(amp, t + (dentro ? 0.03 : 0.003));
      fine = t + resto;
      g.gain.setValueAtTime(amp, fine - 0.25);          // niente «clic» alla fine del campione
      g.gain.linearRampToValueAtTime(0, fine);
      src.start(t, da);
      src.stop(fine + 0.05);
      sorgenti = [src];
    } else {
      // ultima risorsa: un pianoforte sintetico (somma di armoniche che decadono)
      sorgenti = [];
      const durata = 1.2 + 4 * Math.max(0, (100 - nota) / 80);
      [[1, 1], [2, 0.42], [3, 0.2], [4, 0.09]].forEach(([k, a]) => {
        if (f0 * k > 16000) return;
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f0 * k; o.detune.value = (k - 1) * 1.5;
        const ga = c.createGain(); ga.gain.value = a * 0.35;
        o.connect(ga); ga.connect(filtro);
        o.start(t); o.stop(t + durata + 0.1);
        sorgenti.push(o);
      });
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.01, durata / 4);
      fine = t + durata;
    }
    return { g, sorgenti, osc: sorgenti, t, fineNaturale: fine };
  }

  function chiudiVoce(v, quando, tau) {
    try {
      v.g.gain.cancelScheduledValues(quando);
      v.g.gain.setTargetAtTime(0, quando, tau);
      v.sorgenti.forEach((s) => { try { s.stop(quando + tau * 8 + 0.02); } catch (e) { /* già ferma */ } });
    } catch (e) { /* voce già finita */ }
  }
  function tauDi(nota) { return nota >= SENZA_SMORZATORI ? 0.45 : nota < 40 ? 0.14 : 0.09; }

  /** Accende una nota al tempo t (secondi dell'AudioContext). gruppo: "brano" | "live". */
  function accendiVoce(nota, forza, t, gruppo, dentro) {
    const c = contesto(); if (!c) return null;
    nota = Math.round(nota);
    if (nota < 0 || nota > 127) return null;
    t = Math.max(t || 0, c.currentTime);
    // lo stesso tasto ribattuto: la corda di prima si smorza (con il pedale giù si fonde)
    for (const v of voci) if (v.nota === nota && v.gruppo === gruppo && v.fine > t) { chiudiVoce(v, t, 0.12); v.fine = t; }
    // troppe voci: si spegne la più vecchia
    if (voci.size >= MAX_VOCI) {
      let vecchia = null;
      for (const v of voci) if (!vecchia || v.t < vecchia.t) vecchia = v;
      if (vecchia) {
        const q = Math.max(c.currentTime, Math.min(t, vecchia.fine));
        if (vecchia.t > c.currentTime) vecchia.sorgenti.forEach((s) => { try { s.stop(); } catch (e) {} });
        else chiudiVoce(vecchia, q, 0.015);
        voci.delete(vecchia);
      }
    }
    const v = costruisci(c, bus, nota, forza, t, 1, dentro);
    if (!v) return null;
    v.nota = nota; v.gruppo = gruppo; v.fine = Infinity; v.tenuta = false;
    voci.add(v);
    v.sorgenti[0].onended = () => { voci.delete(v); try { v.g.disconnect(); } catch (e) {} };
    return v;
  }
  /** Rilascia la voce al tempo t (con lo smorzatore). */
  function rilasciaVoce(v, t) {
    if (!v || !ctx) return;
    t = Math.max(t || 0, ctx.currentTime);
    if (v.fine <= t) return;
    v.fine = t;
    if (t >= v.fineNaturale - 0.25) return;            // il suono è già finito da solo
    chiudiVoce(v, t, tauDi(v.nota));
  }
  /** Silenzio subito (rilascio breve). gruppo facoltativo. */
  function silenzio(gruppo) {
    if (!ctx) return;
    const ora = ctx.currentTime;
    for (const v of [...voci]) {
      if (gruppo && v.gruppo !== gruppo) continue;
      if (v.t > ora + 0.005) {                          // pianificata ma non ancora partita
        v.sorgenti.forEach((s) => { try { s.stop(); } catch (e) {} });
        try { v.g.disconnect(); } catch (e) {}
      } else chiudiVoce(v, ora, 0.035);
      v.fine = ora;
      voci.delete(v);
    }
    if (!gruppo || gruppo === "live") tenuteLive.clear();
    if (!gruppo || gruppo === "ponte") { vociPonte.clear(); tenutePonte.clear(); pedalePonte = false; }
  }

  // API «dal vivo» (per chi suona note una per una)
  let pedaleLive = false;
  const tenuteLive = new Set();
  V.accendi = (nota, forza, t) => accendiVoce(nota, forza, t, "live");
  V.rilascia = (voce, t) => {
    if (!voce) return;
    if (pedaleLive) { voce.tenuta = true; tenuteLive.add(voce); return; }
    rilasciaVoce(voce, t);
  };
  V.pedale = (giu) => {
    pedaleLive = !!giu;
    if (!pedaleLive) { for (const v of tenuteLive) rilasciaVoce(v); tenuteLive.clear(); }
  };
  V.silenzio = silenzio;
  /** Una nota sul contesto di un'altra pagina (Tastiera, Canta): { g, osc: [...] } oppure null.
      I campioni si possono usare su più AudioContext. */
  V.voceSu = (c, dest, nota, forza, t, scala) => {
    if (!campioni.size || !c) return null;
    try { return costruisci(c, dest, nota, forza, Math.max(t || 0, c.currentTime), scala == null ? 0.6 : scala); }
    catch (e) { return null; }
  };
  V.voci = () => voci.size;

  // ------------------------------------------------------------------ volume
  V.volume = (v) => {
    if (v !== undefined) {
      vol = Math.max(0, Math.min(1, Number(v) || 0));
      scrivi("yavier-virtuale-volume", String(vol));
      if (volNodo) volNodo.gain.setTargetAtTime(guadagnoVolume(), ctx.currentTime, 0.03);
      avvisa();
    }
    return vol;
  };
  V.muto = (m) => {
    if (m !== undefined) {
      muto = !!m; scrivi("yavier-virtuale-muto", muto ? "1" : "0");
      if (volNodo) volNodo.gain.setTargetAtTime(guadagnoVolume(), ctx.currentTime, 0.03);
      avvisa();
    }
    return muto;
  };

  // ------------------------------------------------------------------ lettore MIDI
  const DURATA_MIN = 0.03, TENUTA_MAX = 10, UNISONO = 0.02, PEDALE_GIU = 40, PAUSA_PEDALE = 0.08;   // come suona_midi.py
  function inTastiera(n) { while (n < GRAVE) n += 12; while (n > ACUTA) n -= 12; return n; }
  /** Legge un file MIDI (ArrayBuffer o Uint8Array). Restituisce
      { note: [{t, d, r, n, v}], pedale: [{t, giu}], durata } in secondi.
      r = quando la corda si smorza davvero (tenendo conto del pedale). */
  function leggiMidi(dati) {
    const b = dati instanceof Uint8Array ? dati : new Uint8Array(dati);
    let p = 0;
    const testo = (i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const u32 = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const u16 = (i) => (b[i] << 8) + b[i + 1];
    if (b.length < 14 || testo(0) !== "MThd") throw new Error(T("v.err.nonmidi", "Non è un file MIDI."));
    const lungTesta = u32(4);
    const formato = u16(8), nTracce = u16(10), divisione = u16(12);
    if (formato > 2) throw new Error(T("v.err.formato", "Formato MIDI sconosciuto."));
    let tickSec = null, tpq = divisione;
    if (divisione & 0x8000) {                              // SMPTE: fotogrammi × suddivisioni
      const fps = 256 - (divisione >> 8), sub = divisione & 0xff;
      tickSec = 1 / (fps * sub || 1);
    } else if (!tpq) throw new Error(T("v.err.tempo", "Il tempo del file non è leggibile."));
    p = 8 + lungTesta;
    const eventi = [];       // { tick, ord, tipo, ch, a, v }
    const tempi = [];        // { tick, us }
    let ord = 0;
    for (let tr = 0; tr < nTracce && p + 8 <= b.length; tr++) {
      const nome = testo(p), lung = u32(p + 4);
      p += 8;
      if (nome !== "MTrk") { p += lung; tr--; if (p >= b.length) break; continue; }   // pezzi sconosciuti: saltati
      const fineTr = Math.min(b.length, p + lung);
      let tick = 0, corrente = 0;
      const varlen = () => { let v = 0, k = 0, c; do { if (p >= fineTr) return v; c = b[p++]; v = (v << 7) | (c & 0x7f); } while ((c & 0x80) && ++k < 4); return v; };
      while (p < fineTr) {
        tick += varlen();
        if (p >= fineTr) break;
        let st = b[p];
        if (st & 0x80) { p++; } else if (corrente) { st = corrente; } else { p++; continue; }   // byte orfano: salta
        if (st === 0xff) {
          const tipo = b[p++], l = varlen();
          if (tipo === 0x51 && l >= 3 && p + 3 <= fineTr) tempi.push({ tick, us: (b[p] << 16) + (b[p + 1] << 8) + b[p + 2], ord: ord++ });
          p += l;
          if (tipo === 0x2f) break;
          continue;
        }
        if (st === 0xf0 || st === 0xf7) { const l = varlen(); p += l; continue; }
        if (st >= 0xf1) { continue; }                     // messaggi di sistema rari: niente dati utili
        corrente = st;
        const tipo = st & 0xf0, ch = st & 0x0f;
        const a = b[p++] & 0x7f;
        const v = (tipo === 0xc0 || tipo === 0xd0) ? 0 : (b[p++] & 0x7f);
        if (p > fineTr) break;
        if (tipo === 0x90 || tipo === 0x80 || (tipo === 0xb0 && a === 64)) eventi.push({ tick, ord: ord++, tipo, ch, a, v });
      }
      p = fineTr;
    }
    // mappa dei tempi: tick → secondi
    tempi.sort((x, y) => x.tick - y.tick || x.ord - y.ord);
    const segmenti = [{ tick: 0, sec: 0, us: 500000 }];
    for (const tm of tempi) {
      const u = segmenti[segmenti.length - 1];
      const sec = u.sec + (tm.tick - u.tick) * u.us / 1e6 / tpq;
      if (tm.tick === u.tick) { u.us = tm.us; continue; }
      segmenti.push({ tick: tm.tick, sec, us: tm.us });
    }
    let iSeg = 0;
    const secondi = (tick) => {
      if (tickSec) return tick * tickSec;
      while (iSeg + 1 < segmenti.length && segmenti[iSeg + 1].tick <= tick) iSeg++;
      while (iSeg > 0 && segmenti[iSeg].tick > tick) iSeg--;
      const s = segmenti[iSeg];
      return s.sec + (tick - s.tick) * s.us / 1e6 / tpq;
    };
    eventi.sort((x, y) => x.tick - y.tick || x.ord - y.ord);
    // Come il kit (suona_midi.py), così si sente quello che sentirebbe il Disklavier:
    // note fuori tastiera spostate di ottava, tasto ribattuto che chiude la nota di prima,
    // unisoni uniti, pedale giù se almeno un canale lo tiene giù (dal valore 40),
    // pedale rialzato e riabbassato subito: giù di nuovo solo dopo 80 ms.
    const note = [], pedaliFile = [], aperte = new Map(), ribattute = new Map();
    let ultimo = 0;
    for (const e of eventi) {
      const t = secondi(e.tick);
      ultimo = Math.max(ultimo, t);
      if (e.ch === 9) continue;                           // canale 10: batteria, non si suona
      if (e.tipo === 0xb0) {
        if (e.a === 64) pedaliFile.push({ t, ch: e.ch, v: e.v });
        else if (e.a === 120 || e.a === 123) {            // «tutte le note giù»: finiscono quelle del canale
          for (const [k, nota] of [...aperte]) if ((k >> 7) === e.ch) { nota.d = t - nota.t; aperte.delete(k); }
        }
        continue;
      }
      const k = e.ch * 128 + e.a;
      if (e.tipo === 0x90 && e.v > 0) {
        const vecchia = aperte.get(k);
        if (vecchia) { vecchia.d = t - vecchia.t; ribattute.set(k, t); }
        const nota = { t, d: -1, r: 0, n: inTastiera(e.a), v: e.v };
        note.push(nota);
        aperte.set(k, nota);
      } else {
        const nota = aperte.get(k);
        if (!nota) continue;
        if (nota.t === t && ribattute.get(k) === t) { ribattute.delete(k); continue; }   // era la fine di quella di prima
        nota.d = t - nota.t;
        aperte.delete(k);
      }
    }
    for (const nota of note) {
      if (nota.d < 0) nota.d = Math.min(ultimo, nota.t + TENUTA_MAX) - nota.t;      // senza fine nel file
      nota.d = Math.max(DURATA_MIN, nota.d);
    }
    // unisoni: lo stesso tasto battuto due volte quasi insieme è un colpo solo, il più forte
    note.sort((x, y) => x.n - y.n || x.t - y.t);
    const unite = [];
    for (const nota of note) {
      const p = unite[unite.length - 1];
      if (p && p.n === nota.n && nota.t - p.t < UNISONO) {
        p.v = Math.max(p.v, nota.v);
        p.d = Math.max(p.t + p.d, nota.t + nota.d) - p.t;
      } else unite.push(nota);
    }
    // pedale: il massimo tra i canali, poi la pausa minima degli smorzatori
    pedaliFile.sort((x, y) => x.t - y.t);
    const perCanale = new Map(), grezzo = [];
    let giuPrima = null;
    for (const e of pedaliFile) {
      perCanale.set(e.ch, e.v);
      const giu = Math.max(...perCanale.values()) >= PEDALE_GIU;
      if (giu !== giuPrima) { grezzo.push({ t: e.t, giu }); giuPrima = giu; }
    }
    const pedale = [];
    let alzato = null;
    for (let i = 0; i < grezzo.length; i++) {
      const e = grezzo[i];
      if (!e.giu) { alzato = e.t; pedale.push(e); continue; }
      if (alzato != null && e.t - alzato < PAUSA_PEDALE) {
        const nuovo = alzato + PAUSA_PEDALE, dopo = grezzo[i + 1];
        if (dopo && dopo.t <= nuovo) continue;            // si rialza comunque subito dopo
        pedale.push({ t: nuovo, giu: true });
      } else pedale.push(e);
    }
    // una nota alzata col pedale giù resta finché il pedale non si alza
    const su = [];             // istanti in cui il pedale si alza
    let giu = false;
    for (const e of pedale) { if (giu && !e.giu) su.push(e.t); giu = e.giu; }
    const fineTutto = ultimo + 4;
    const pedaleGiuA = (t) => {                        // stato del pedale all'istante t
      let lo = 0, hi = pedale.length - 1, ris = false;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (pedale[m].t <= t) { ris = pedale[m].giu; lo = m + 1; } else hi = m - 1; }
      return ris;
    };
    const prossimoSu = (t) => {
      let lo = 0, hi = su.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (su[m] <= t) lo = m + 1; else hi = m; }
      return lo < su.length ? su[lo] : fineTutto;
    };
    for (const nota of unite) {
      const off = nota.t + nota.d;
      nota.r = pedaleGiuA(off) ? Math.max(off, prossimoSu(off)) : off;
    }
    const note2 = unite;
    note2.sort((x, y) => x.t - y.t);
    return { note: note2, pedale, durata: ultimo };
  }
  V.leggiMidi = leggiMidi;

  // ------------------------------------------------------------------ brano
  let brano = null;          // { dati, t0, i, timer, chiave }
  const lookahead = () => (G.document && G.document.hidden ? 2.5 : 0.35);

  function pianifica() {
    if (!brano || !ctx) return;
    const ora = ctx.currentTime, limite = ora + lookahead(), note = brano.dati.note;
    while (brano.i < note.length) {
      const n = note[brano.i], t = brano.t0 + n.t;
      if (t >= limite) break;
      brano.i++;
      if (t < ora - 0.05) continue;                        // in ritardo: meglio saltarla
      const v = accendiVoce(n.n, n.v, t, "brano");
      if (v) rilasciaVoce(v, brano.t0 + n.r);
    }
  }
  /** Suona i dati (da leggiMidi) dal secondo «da». */
  function suonaDa(dati, da, chiave) {
    fermaBrano();
    const c = contesto(); if (!c) return false;
    da = Math.max(0, da || 0);
    const t0 = c.currentTime + 0.06 - da;
    const note = dati.note;
    let lo = 0, hi = note.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (note[m].t < da) lo = m + 1; else hi = m; }
    // le note già cominciate che suonano ancora: si prendono a metà
    for (let j = lo - 1; j >= 0 && note[j].t > da - 3; j--) {
      const n = note[j];
      if (n.r <= da + 0.05) continue;
      const v = accendiVoce(n.n, n.v * 0.9, t0 + da, "brano", da - n.t);
      if (v) rilasciaVoce(v, t0 + n.r);
    }
    brano = { dati, t0, i: lo, chiave, timer: null };
    pianifica();
    brano.timer = setInterval(pianifica, 60);
    avvisa();
    return true;
  }
  function fermaBrano() {
    if (brano && brano.timer) clearInterval(brano.timer);
    brano = null;
    silenzio("brano");
    avvisa();
  }
  V.suonaDa = suonaDa;
  V.posizione = () => (brano && ctx ? ctx.currentTime - brano.t0 : null);
  V.staSuonando = () => !!brano;

  // ------------------------------------------------------------------ sincronia con il server
  let ultimo = null;          // { s, quando }
  let attesa = null;          // { chiave, url, dati, errore }
  let chiaveFermata = null;   // dopo uno Stop: quel brano non riparte anche se un vecchio stato lo dice
  let ceduto = false;         // un'altra scheda di Yavier sta suonando
  let lettore = false;        // questa pagina segue i brani (Riproduttore, Regia)
  const cacheMidi = new Map();

  function posServer() {
    if (!ultimo) return null;
    const s = ultimo.s;
    let p;
    if ("posizione" in s) { if (s.posizione == null) return null; p = s.posizione; }
    else p = Math.max(0, (s.trascorso || 0) - 0.8);   // server vecchio: stima
    return p + (performance.now() - ultimo.quando) / 1000;
  }
  function chiaveDi(s) { return (s.avvio != null ? s.avvio : s.file) + "|" + s.url_brano; }
  function vuoleVirtuale(s) { return !!(s && s.uscita === "virtuale" && s.attivo && s.url_brano); }

  async function prendiMidi(url) {
    if (cacheMidi.has(url)) return cacheMidi.get(url);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(TF("v.err.scarica", "Non riesco a scaricare il brano ({stato}).", { stato: r.status }));
    const dati = leggiMidi(await r.arrayBuffer());
    if (cacheMidi.size > 6) cacheMidi.delete(cacheMidi.keys().next().value);
    cacheMidi.set(url, dati);
    return dati;
  }
  function riprova() {
    const s = ultimo && ultimo.s;
    if (!vuoleVirtuale(s) || ceduto) return;
    const chiave = chiaveDi(s);
    if (chiave === chiaveFermata) return;
    if (!attesa || attesa.chiave !== chiave) {
      attesa = { chiave, url: s.url_brano, dati: null, errore: null };
      const a = attesa;
      prendiMidi(s.url_brano).then((d) => { a.dati = d; riprova(); }, (e) => { a.errore = e.message || String(e); avvisa(); });
    }
    if (!attesa.dati || !V.pronto() || !V.inFunzione()) { avvisa(); return; }
    const pos = posServer();
    if (pos == null) { avvisa(); return; }
    if (!brano || brano.chiave !== chiave) { suonaDa(attesa.dati, pos, chiave); return; }
    const scarto = V.posizione() - pos;
    if (Math.abs(scarto) > 0.4) suonaDa(attesa.dati, pos, chiave);   // fuori tempo: si riallinea
  }
  function aggiorna(s) {
    ultimo = s ? { s, quando: performance.now() } : null;
    modoServer = s && s.uscita ? s.uscita : modoServer;
    if (!vuoleVirtuale(s)) {
      if (brano) fermaBrano();
      attesa = null;
      if (s && !s.attivo) chiaveFermata = null;
      avvisa();
      return;
    }
    if (chiaveFermata && chiaveDi(s) !== chiaveFermata) chiaveFermata = null;
    carica();
    riprova();
  }
  let ultimoSegui = -1e9;
  /** Da chiamare con ogni risposta di /api/stato (Riproduttore, Regia). */
  V.segui = (s) => { if (SOLO_SUONO) return; lettore = true; ultimoSegui = performance.now(); aggiorna(s); };

  // Le pagine che non chiamano segui() chiedono lo stato da sole: di continuo mentre
  // c'è un brano, ogni 5 secondi altrimenti, e subito quando il server avvisa «brano».
  let chiedendo = false, ultimaChiesta = -1e9, servito = null;   // servito: la pagina viene da Yavier?
  async function chiediStato() {
    if (SOLO_SUONO || chiedendo || servito === false) return;
    chiedendo = true; ultimaChiesta = performance.now();
    try {
      const r = await fetch("/api/stato", { cache: "no-store" });
      const s = r.ok ? await r.json() : null;
      if (s && typeof s === "object" && "attivo" in s) {
        if (servito == null) { servito = true; apriPonte(); }
        if (performance.now() - ultimoSegui > 2500) aggiorna(s);
      } else if (servito == null) servito = false;
    } catch (e) { if (servito == null) servito = false; }    // pagina aperta senza Yavier
    chiedendo = false;
  }
  if (!SOLO_SUONO) setInterval(() => {
    if (performance.now() - ultimoSegui < 2500) return;     // ci pensa la pagina
    const s = ultimo && ultimo.s;
    const serve = !!brano || !!attesa || (s && s.attivo);
    if (serve || performance.now() - ultimaChiesta > 5000) chiediStato();
  }, 1000);

  // ------------------------------------------------------------------ note del ponte
  // Quando il Disklavier non c'è, le note che Tastiera, Canta o Scriptorium · Musica mandano
  // al ponte (/api/piano/note) arrivano qui, già passate dalla sicurezza meccanica.
  const vociPonte = new Map();     // nota → voce
  const tenutePonte = new Set();
  let pedalePonte = false, sorgentePonte = null, riprovaPonte = 0;
  function apriPonte() {
    if (SOLO_SUONO || sorgentePonte || typeof G.EventSource !== "function") return;
    let es;
    try { es = new G.EventSource("/api/virtuale/eventi"); } catch (e) { return; }
    sorgentePonte = es;
    es.onmessage = (m) => { let ev = null; try { ev = JSON.parse(m.data); } catch (e) { return; } if (ev) notaPonte(ev); };
    es.onerror = () => {
      if (es.readyState !== 2) return;                       // il browser riprova da solo
      sorgentePonte = null;
      clearTimeout(riprovaPonte);
      riprovaPonte = setTimeout(apriPonte, 5000);            // Yavier riavviato: si riprova
    };
  }
  function notaPonte(ev) {
    if (ev.t === "brano") { chiediStato(); return; }
    if (ceduto) return;                                      // suona un'altra scheda
    if (ev.t === "on") {
      const c = contesto(); if (!c) return;
      carica();
      if (c.state !== "running" && !ospite) { const p = c.resume(); if (p && p.catch) p.catch(() => {}); }
      const t = c.currentTime + Math.max(0, Math.min(2, Number(ev.ritardo) || 0));
      const prima = vociPonte.get(ev.nota);
      if (prima) { tenutePonte.delete(prima); rilasciaVoce(prima, t); }
      const v = accendiVoce(ev.nota, ev.forza, t, "ponte");
      if (v) vociPonte.set(ev.nota, v); else vociPonte.delete(ev.nota);
      sentito = performance.now();
      avvisa();
      return;
    }
    if (!ctx) return;
    const t = ctx.currentTime + Math.max(0, Math.min(2, Number(ev.ritardo) || 0));
    if (ev.t === "off") {
      const v = vociPonte.get(ev.nota);
      if (!v) return;
      vociPonte.delete(ev.nota);
      if (pedalePonte) tenutePonte.add(v); else rilasciaVoce(v, t);
    } else if (ev.t === "pedale") {
      pedalePonte = (ev.valore || 0) >= PEDALE_GIU;
      if (!pedalePonte) { for (const v of tenutePonte) rilasciaVoce(v, t); tenutePonte.clear(); }
    }
  }
  let sentito = -1e9;
  V.suonaIlPonte = () => performance.now() - sentito < 3000;
  /** Stop / PANICO della pagina: zitto subito, senza aspettare il server. */
  V.ferma = () => {
    if (brano) chiaveFermata = brano.chiave;
    else if (!attesa && ultimo && ultimo.s && vuoleVirtuale(ultimo.s)) chiaveFermata = chiaveDi(ultimo.s);
    else if (attesa) chiaveFermata = attesa.chiave;
    attesa = null;
    fermaBrano();
    silenzio();
  };

  // più schede aperte: suona solo una. Ogni scheda dice «ci sono» ogni 1,5 s. Vince
  // quella che sta già suonando (niente salti a metà brano); a parità, quella toccata
  // per ultima. Un clic su una scheda («prendo») fa tacere le altre.
  const ID = Math.random().toString(36).slice(2);
  let canale = null, mioGesto = 0;
  const altre = new Map();         // id → { g, quando, nascosta, suona }
  if (!SOLO_SUONO) try { canale = new BroadcastChannel("yavier-virtuale"); } catch (e) { canale = null; }
  const nascosta = () => !!(G.document && G.document.hidden);
  const ioSuono = () => !!brano || vociPonte.size > 0 || performance.now() - sentito < 3000;
  function annunciaci(tipo) { if (canale) try { canale.postMessage({ tipo: tipo || "ci-sono", id: ID, g: mioGesto, nascosta: nascosta(), suona: ioSuono() }); } catch (e) {} }
  function ricalcola() {
    const ora = performance.now(), io = ioSuono();
    let cedo = false;
    for (const [id, a] of altre) {
      if (ora - a.quando > (a.nascosta ? 8000 : 5000)) { altre.delete(id); continue; }   // scheda chiusa (o addormentata)
      if (a.suona !== io) { if (a.suona) cedo = true; continue; }
      if (a.g > mioGesto || (a.g === mioGesto && id > ID)) cedo = true;
    }
    if (cedo === ceduto) return;
    ceduto = cedo;
    if (ceduto) { if (brano) fermaBrano(); silenzio("ponte"); }
    else riprova();
    avvisa();
  }
  if (canale) {
    canale.onmessage = (ev) => {
      const m = ev.data || {};
      if (!m.id || m.id === ID) return;
      if (m.tipo === "via") altre.delete(m.id);
      else {
        if (m.tipo === "prendo" && (m.g || 0) >= mioGesto) {   // l'hanno toccata adesso: qui si tace
          if (brano) fermaBrano();
          silenzio("ponte"); sentito = -1e9;
        }
        altre.set(m.id, { g: m.g || 0, quando: performance.now(), nascosta: !!m.nascosta, suona: !!m.suona });
        if (m.tipo === "ciao" || m.tipo === "prendo") annunciaci();   // risposta subito
      }
      ricalcola();
    };
    annunciaci("ciao");
    setInterval(() => { annunciaci(); ricalcola(); }, 1500);
    if (G.addEventListener) {
      G.addEventListener("pagehide", () => annunciaci("via"));
      G.addEventListener("beforeunload", () => annunciaci("via"));
    }
    if (G.document && G.document.addEventListener) G.document.addEventListener("visibilitychange", () => annunciaci());
  }
  function prendo() {
    mioGesto = Date.now();
    annunciaci("prendo");
    ricalcola();
  }

  // il primo gesto sblocca l'audio (clic su Suona compreso)
  let ultimoGesto = 0;
  function gesto(e) {
    if (e && e.type === "keydown" && (e.key === "Tab" || e.key === "Shift")) return;
    if (lettore) sblocca();
    else if (ctx && !ospite && ctx.state !== "running") {   // Tastiera e Canta: il contesto è loro
      const p = ctx.resume(); if (p && p.then) p.then(() => { avvisa(); riprova(); }, () => {});
    }
    if (Date.now() - ultimoGesto > 1000) { ultimoGesto = Date.now(); prendo(); }
  }
  if (G.addEventListener && !SOLO_SUONO) {   // «solo suono»: l'audio lo sblocca la pagina
    G.addEventListener("pointerdown", gesto, true);
    G.addEventListener("keydown", gesto, true);
  }
  // si comincia subito ad ascoltare il server (anche nelle pagine che non chiamano segui)
  if (!SOLO_SUONO) setTimeout(chiediStato, 300);

  // ------------------------------------------------------------------ interfaccia
  let modoServer = null;          // "pianoforte" | "virtuale" | null
  let preferita = null;           // "automatica" | "virtuale" | null (non ancora letta)
  const montati = [];
  let rinfresco = 0;
  function avvisa() {
    if (rinfresco) return;
    rinfresco = setTimeout(() => { rinfresco = 0; disegna(); }, 30);   // non rAF: nelle schede nascoste non arriva
  }
  let problemaUscita = "";        // il controllo dopo il cambio non è riuscito (vedi controllaUscita)
  function testoIndicatore() {
    const s = ultimo && ultimo.s;
    // un brano già partito resta dov'è: la scelta nuova vale dal prossimo (suona_midi.py non sa riprendere a metà)
    if (modoServer === "pianoforte") {
      const poi = s && s.attivo && preferita === "virtuale" ? T("v.prossimo.computer", "dal prossimo brano suona il computer") : "";
      return { t: "🎹 Disklavier", sotto: poi, azione: false };
    }
    if (modoServer !== "virtuale") return { t: "", sotto: "", azione: false };
    let sotto = "", azione = false;
    const suonando = vuoleVirtuale(s);
    if (problemaUscita) sotto = problemaUscita;
    else if (suonando && preferita === "automatica" && s.motivo_virtuale === "scelta") sotto = T("v.riprende", "il Disklavier riprende dal prossimo brano");
    else if (statoCarica === "carica") sotto = TF("v.preparando", "sto preparando il pianoforte… {perc}%", { perc: Math.round(caricati / 88 * 100) });
    else if (attesa && attesa.errore) sotto = attesa.errore;
    else if (ceduto && suonando) { sotto = T("v.altra", "suona in un'altra scheda · tocca qui"); azione = true; }
    else if (suonando && (!ctx || ctx.state !== "running")) { sotto = T("v.tocca", "tocca qui per sentire"); azione = true; }
    else if (muto || vol === 0) sotto = T("v.senzavolume", "senza volume");
    else if (!suonando && s && s.motivo_virtuale === "nessun_pianoforte") sotto = T("v.noncollegato", "il Disklavier non è collegato");
    else if (!suonando && s && s.motivo_virtuale === "scelta") sotto = T("v.scelto", "hai scelto «Sempre dal computer»");
    return { t: T("v.computer", "🔈 Suono dal computer"), sotto, azione };
  }
  function disegna() {
    const ind = testoIndicatore();
    for (const m of montati) {
      if (m.ind) {
        m.radice.hidden = !ind.t;
        m.ind.querySelector(".yv-ind-testo").textContent = ind.t;
        const sotto = m.ind.querySelector(".yv-ind-sotto");
        sotto.textContent = ind.sotto ? "· " + ind.sotto : "";
        m.ind.classList.toggle("yv-chiama", ind.azione);
        m.ind.title = modoServer === "pianoforte" ? T("v.ind.pianoforte", "Suona il Disklavier") : T("v.ind.computer", "Il suono esce dagli altoparlanti di questo computer");
        m.vol.hidden = modoServer !== "virtuale";
        m.cursore.value = String(Math.round(vol * 100));
        m.muto.textContent = muto || vol === 0 ? "🔇" : "🔊";
        m.muto.setAttribute("aria-pressed", muto ? "true" : "false");
        m.muto.setAttribute("aria-label", muto ? T("v.muto.riaccendi", "Riaccendi il suono del computer") : T("v.muto.spegni", "Spegni il suono del computer"));
      }
      m.radio.forEach((r) => { r.checked = r.value === preferita; r.disabled = preferita == null; });
      if (m.dove) m.dove.hidden = preferita == null;
    }
  }
  async function leggiPreferita() {
    if (SOLO_SUONO) return;
    try {
      const r = await fetch("/api/impostazioni", { cache: "no-store" });
      const j = await r.json();
      preferita = j && j.uscita_preferita ? j.uscita_preferita : null;
    } catch (e) { preferita = null; }
    avvisa();
  }
  async function impostaPreferita(valore) {
    if (SOLO_SUONO) return;
    const prima = preferita;
    preferita = valore; avvisa();
    try {
      const r = await fetch("/api/impostazioni", { method: "POST", headers: { "X-Studio": "1", "Content-Type": "application/json" },
        body: JSON.stringify({ uscita_preferita: valore }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.errore) throw new Error(j.errore || "Errore " + r.status);
      preferita = j.uscita_preferita || valore;
      // il menu si chiude: con la scelta cambia la riga del lettore (compare o sparisce il volume)
      // e le voci si spostano; un secondo clic nel punto di prima finiva fuori dal menu
      for (const m of montati) if (m.dove) m.dove.open = false;
      if (typeof V.quandoCambia === "function") V.quandoCambia(preferita);
      avvisa();
      await controllaUscita(preferita);
    } catch (e) {
      preferita = prima;
      if (typeof G.alert === "function") G.alert(TF("v.err.salva", "Non sono riuscito a salvare la scelta: {errore}", { errore: e.message }));
    }
    avvisa();
  }
  V.impostaPreferita = impostaPreferita;

  /** Lo stato del server subito, anche nelle pagine che chiamano segui() solo ogni tanto. */
  async function statoAdesso() {
    const r = await fetch("/api/stato", { cache: "no-store" });
    const s = r.ok ? await r.json() : null;
    if (!s || typeof s !== "object" || !("attivo" in s)) throw new Error("stato");
    aggiorna(s);
    return s;
  }
  /** Dopo un cambio di «Dove suona»: entro 2 s l'indicatore deve dire dove suona davvero.
   *  Con «Automatico» e la porta del Disklavier presente deve tornare «🎹 Disklavier»
   *  (salvo un brano già partito dal computer, che finisce lì). Se il server dice ancora
   *  «computer», la scelta si rimanda una volta; se non basta, lo dice l'indicatore. */
  let giroControllo = 0;
  async function controllaUscita(valore) {
    const giro = ++giroControllo;
    problemaUscita = "";
    const fine = performance.now() + 2000;
    let rimandata = false;
    while (giro === giroControllo) {
      let s = null;
      try { s = await statoAdesso(); } catch (e) { return; }      // Yavier non risponde: ci pensa il resto
      if (valore === "virtuale" || s.uscita === "pianoforte") return;
      if (s.attivo) return;                                       // brano dal computer: «riprende dal prossimo brano»
      if (s.motivo_virtuale !== "scelta") return;                 // porta assente o simulazione: niente da correggere
      // «Automatico» salvato, ma il server suona ancora dal computer «per scelta»
      if (!rimandata) {
        rimandata = true;
        try {
          await fetch("/api/impostazioni", { method: "POST", headers: { "X-Studio": "1", "Content-Type": "application/json" },
            body: JSON.stringify({ uscita_preferita: valore }) });
        } catch (e) { /* si riprova sotto */ }
      }
      if (performance.now() >= fine) {
        problemaUscita = T("v.problema", "non riesco a tornare al Disklavier: chiudi e riapri Yavi");
        avvisa();
        return;
      }
      await new Promise((ok) => setTimeout(ok, 250));
    }
  }
  // tornando su questa scheda (la scelta si può cambiare anche da un'altra) si rilegge tutto
  if (!SOLO_SUONO && G.document && typeof G.document.addEventListener === "function") {
    G.document.addEventListener("visibilitychange", () => {
      if (G.document.visibilityState !== "visible" || servito === false) return;
      leggiPreferita();
      statoAdesso().catch(() => {});
    });
    // la scelta può cambiare anche con la pagina in primo piano (MCP, un'altra finestra):
    // ogni 15 s si rilegge, così il pallino del menu e la riga sotto l'indicatore non restano vecchi
    if (typeof G.setInterval === "function") {
      G.setInterval(() => {
        if (G.document.visibilityState === "visible" && servito !== false && montati.length) leggiPreferita();
      }, 15000);
    }
  }

  let gruppoRadio = 0;
  // testi fissi dei pezzi montati: al cambio di lingua (evento «yavi-lingua») si riscrivono
  const testiFissi = [];
  function fisso(el, proprieta, testo) {
    const metti = () => { const t = testo(); if (proprieta === "aria-label") el.setAttribute(proprieta, t); else el[proprieta] = t; };
    metti(); testiFissi.push(metti);
  }
  if (!SOLO_SUONO && G.document && typeof G.document.addEventListener === "function") {
    G.document.addEventListener("yavi-lingua", () => { for (const f of testiFissi) f(); avvisa(); });
  }
  const sceltaDove = () => [
    ["automatica", T("v.dove.auto", "Automatico"), T("v.dove.auto.spiega", "Il Disklavier se è collegato, altrimenti il computer.")],
    ["virtuale", T("v.dove.virtuale", "Sempre dal computer"), T("v.dove.virtuale.spiega", "Anche con il pianoforte collegato: al pianoforte non arriva niente (utile di notte).")],
  ];
  function radioDove(contenitore, conSpiegazione) {
    const nome = "yv-dove-" + (++gruppoRadio);
    const scelte = sceltaDove();
    const g = document.createElement("div");
    g.className = "yv-scelte"; g.setAttribute("role", "radiogroup");
    fisso(g, "aria-label", () => T("v.dove", "Dove suona"));
    const radio = [];
    for (const [i, [v]] of scelte.entries()) {
      const l = document.createElement("label"); l.className = "yv-scelta";
      const r = document.createElement("input"); r.type = "radio"; r.name = nome; r.value = v;
      r.onchange = () => { if (r.checked) impostaPreferita(v); };
      const s = document.createElement("span");
      s.innerHTML = "<b></b>" + (conSpiegazione ? '<span class="yv-spiega"></span>' : "");
      fisso(s.firstChild, "textContent", () => sceltaDove()[i][1]);
      if (conSpiegazione) { const sp = s.lastChild; fisso(sp, "textContent", () => sceltaDove()[i][2]); }
      l.appendChild(r); l.appendChild(s); g.appendChild(l); radio.push(r);
    }
    contenitore.appendChild(g);
    return radio;
  }
  /* CC BY 3.0 chiede di citare la fonte dei campioni (web/suoni/LICENZA.md) */
  const CREDITI = () => T("v.crediti", "Suono del pianoforte del computer: FluidR3_GM (Frank Wen e collaboratori), licenza CC BY 3.0; file mp3 da midi-js-soundfonts di Benjamin Gleitzman.");
  Object.defineProperty(V, "crediti", { get: CREDITI, enumerable: true });
  function crediti(el) {
    if (!el || !G.document) return;
    const p = G.document.createElement("p"); p.className = "yv-crediti"; fisso(p, "textContent", CREDITI);
    el.appendChild(p);
  }
  function stile() {
    if (document.getElementById("yv-stile")) return;
    const st = document.createElement("style"); st.id = "yv-stile";
    st.textContent = `
.yv-virtuale{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12.5px;line-height:1.3;margin-top:4px;position:relative}
.yv-virtuale[hidden]{display:none}
.yv-ind{font:inherit;color:inherit;background:none;border:0;padding:2px 0;cursor:pointer;text-align:left;display:inline-flex;flex-wrap:wrap;gap:0 5px;align-items:baseline}
.yv-ind-testo{font-weight:600}
.yv-ind-sotto{opacity:.75}
.yv-ind.yv-chiama .yv-ind-sotto{opacity:1;text-decoration:underline;font-weight:600}
.yv-vol{display:inline-flex;align-items:center;gap:4px}
.yv-vol[hidden]{display:none}
.yv-muto{font:inherit;background:none;border:0;color:inherit;cursor:pointer;padding:2px;min-width:24px;min-height:24px}
.yv-cursore{width:90px;accent-color:var(--giallo, currentColor)}
.yv-dove{position:relative}
.yv-dove[hidden]{display:none}
.yv-dove>summary{cursor:pointer;list-style:none;opacity:.8;padding:2px 0}
.yv-dove>summary::-webkit-details-marker{display:none}
.yv-dove[open]>summary{opacity:1}
.yv-dove .yv-scelte{position:absolute;z-index:50;right:0;top:calc(100% + 4px);min-width:200px;padding:8px 10px;border-radius:10px;
  background:var(--card, #fff);color:var(--ink, #1A2233);border:1px solid var(--line-forte, rgba(127,127,127,.35));box-shadow:var(--ombra, 0 8px 24px rgba(0,0,0,.18))}
.yv-scelte{display:flex;flex-direction:column;gap:6px}
.yv-scelta{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.yv-scelta input{margin-top:2px}
.yv-scelta span{display:flex;flex-direction:column}
.yv-spiega{opacity:.75;font-size:.92em}
.yv-crediti{margin:4px 0 0;opacity:.6;font-size:.82em;line-height:1.3;max-width:260px}
@media (max-width:560px){.yv-cursore{width:70px}.yv-dove .yv-scelte{right:auto;left:0}}
`;
    document.head.appendChild(st);
  }
  /** Indicatore, volume e menu «Dove suona» dentro il lettore. */
  V.montaLettore = (el) => {
    if (SOLO_SUONO || !el || !G.document) return;
    stile(); lettore = true;
    const radice = document.createElement("div");
    radice.className = "yv-virtuale"; radice.hidden = true;
    radice.innerHTML = '<button type="button" class="yv-ind"><span class="yv-ind-testo"></span><span class="yv-ind-sotto"></span></button>' +
      '<span class="yv-vol"><button type="button" class="yv-muto">🔊</button>' +
      '<input type="range" class="yv-cursore" min="0" max="100" step="1"></span>' +
      '<details class="yv-dove"><summary></summary></details>';
    fisso(radice.querySelector(".yv-cursore"), "aria-label", () => T("v.volume", "Volume del pianoforte del computer"));
    fisso(radice.querySelector(".yv-dove > summary"), "textContent", () => T("v.dove.menu", "Dove suona ▾"));
    const ind = radice.querySelector(".yv-ind");
    ind.onclick = () => { sblocca(); prendo(); riprova(); };
    const muteBtn = radice.querySelector(".yv-muto"), cursore = radice.querySelector(".yv-cursore");
    muteBtn.onclick = () => { if (vol === 0) { V.volume(0.6); V.muto(false); } else V.muto(!muto); };
    cursore.oninput = () => { V.volume(cursore.value / 100); if (muto && vol > 0) V.muto(false); };
    const dove = radice.querySelector(".yv-dove");
    const radio = radioDove(dove, true);
    crediti(dove.querySelector(".yv-scelte"));
    G.document.addEventListener("click", (e) => { if (dove.open && !dove.contains(e.target)) dove.open = false; });
    el.appendChild(radice);
    montati.push({ radice, ind, vol: radice.querySelector(".yv-vol"), cursore, muto: muteBtn, radio, dove });
    if (preferita == null) leggiPreferita();
    avvisa();
  };
  /** La scelta «Dove suona» per una scheda di impostazioni. */
  V.montaScelta = (el) => {
    if (SOLO_SUONO || !el || !G.document) return;
    stile();
    const radio = radioDove(el, true);
    crediti(el.querySelector(".yv-scelte") || el);
    montati.push({ radio });
    if (preferita == null) leggiPreferita();
    avvisa();
  };
  V.aggiornaPreferita = leggiPreferita;
})(typeof window !== "undefined" ? window : globalThis);
