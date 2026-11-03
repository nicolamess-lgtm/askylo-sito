// Yavier Game — il suono: SOLO dagli altoparlanti di questo computer (o telefono, o tablet).
// Pianoforte: i campioni di /web/pianoforte-virtuale.js (FluidR3_GM, CC BY 3.0); finché non sono pronti,
// o se mancano, un piccolo pianoforte fatto con gli oscillatori di Web Audio.
// Il Game lo carica in modalità «solo suono» (data-virtuale="solo-suono" sul tag <html> di index.html):
// solo campioni e voci, niente brani di Yavier, niente ponte, niente messaggi alle altre schede.
// Qui non c'è nessuna uscita MIDI e nessuna nota mandata al Disklavier.
// Il suono parte solo dopo un gesto (tocco, clic o tasto): è la regola dei browser.
(function () {
  'use strict';
  const G = window;
  const YG = (G.YG = G.YG || {});

  let ctx = null, secco = null, eco = null, uscita = null;
  const voci = new Map();   // chiave → voce { g, sorgenti }

  function impulso(c, secondi) {
    const n = Math.floor(c.sampleRate * secondi), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) { lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5; d[i] = lp * Math.pow(1 - i / n, 2.4); }
    }
    return b;
  }

  // crea (o risveglia) l'AudioContext: va chiamata dentro un gesto
  function sblocca() {
    try {
      // sui telefoni Apple: il suono esce anche con l'interruttore del silenzioso (Safari 16.4 e oltre)
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch (e) { /* non c'è: pazienza */ }
    if (ctx) {
      if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      return ctx;
    }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return null; } }
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -12; lim.knee.value = 6; lim.ratio.value = 4; lim.attack.value = 0.003; lim.release.value = 0.25;
    uscita = ctx.createGain(); uscita.gain.value = 0.9;
    uscita.connect(lim); lim.connect(ctx.destination);
    secco = ctx.createGain(); secco.gain.value = 1; secco.connect(uscita);
    const conv = ctx.createConvolver(); conv.buffer = impulso(ctx, 1.8);
    const bagnato = ctx.createGain(); bagnato.gain.value = 0.16;
    eco = ctx.createGain(); eco.gain.value = 1;
    eco.connect(conv); conv.connect(bagnato); bagnato.connect(uscita);
    // il pianoforte virtuale di Yavier usa questo stesso AudioContext e comincia a caricare i campioni
    const YV = G.YavierVirtuale;
    try { if (YV && YV.usaContesto) YV.usaContesto(ctx, [secco, eco]); else if (YV && YV.carica) YV.carica(); } catch (e) { /* senza campioni */ }
    if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    return ctx;
  }

  const conCampioni = () => !!(G.YavierVirtuale && G.YavierVirtuale.conCampioni && G.YavierVirtuale.conCampioni());

  // il ripiego: un pianoforte sintetico morbido (triangolo + armoniche che si spengono)
  function voceSintetica(nota, forza, t) {
    const f0 = 440 * Math.pow(2, (nota - 69) / 12);
    const v = Math.max(0.05, Math.min(1, forza / 127));
    const g = ctx.createGain();
    const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(Math.min(12000, f0 * (2.5 + v * 6)), t);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(f0 * 1.5, 350), t + 1.4);
    filtro.connect(g); g.connect(secco); g.connect(eco);
    const picco = 0.24 * v * (nota < 48 ? 1.2 : 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(picco, t + 0.006);
    g.gain.exponentialRampToValueAtTime(picco * 0.3, t + 0.6);
    g.gain.exponentialRampToValueAtTime(picco * 0.05, t + 3.5);
    const sorgenti = [];
    [[1, 'triangle', 1], [2.002, 'sine', 0.3], [3.003, 'sine', 0.08]].forEach(([k, tipo, a]) => {
      const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f0 * k;
      const ga = ctx.createGain(); ga.gain.value = a;
      o.connect(ga); ga.connect(filtro);
      o.start(t); o.stop(t + 4);
      sorgenti.push(o);
    });
    return { g, sorgenti };
  }

  function voce(nota, forza, t) {
    if (conCampioni()) {
      const vc = G.YavierVirtuale.voceSu(ctx, [secco, eco], nota, forza, t, nota < 48 ? 0.7 : 0.6);
      if (vc) return { g: vc.g, sorgenti: vc.sorgenti || vc.osc || [] };
    }
    return voceSintetica(nota, forza, t);
  }

  function chiudi(vc, veloce) {
    if (!vc || !ctx) return;
    const t = ctx.currentTime;
    const tau = veloce ? 0.02 : 0.09;
    try {
      const gg = vc.g.gain;
      if (gg.cancelAndHoldAtTime) gg.cancelAndHoldAtTime(t);
      else { gg.cancelScheduledValues(t); gg.setValueAtTime(Math.max(0.0001, gg.value), t); }
      gg.setTargetAtTime(0, t, tau);
      vc.sorgenti.forEach((s) => { try { s.stop(t + tau * 8 + 0.02); } catch (e) { /* già ferma */ } });
    } catch (e) { /* voce già finita */ }
  }

  // suona una nota; chiave: chi la tiene (per alzarla dopo)
  function suona(chiave, nota, forza) {
    if (!sblocca()) return;
    const n = Math.round(nota);
    if (!(n >= 21 && n <= 108)) return;
    if (voci.has(chiave)) chiudi(voci.get(chiave), true);
    try { voci.set(chiave, voce(n, Math.max(1, Math.min(127, forza || 72)), ctx.currentTime)); } catch (e) { voci.delete(chiave); }
  }

  function ferma(chiave, veloce) {
    const vc = voci.get(chiave);
    if (!vc) return;
    voci.delete(chiave);
    chiudi(vc, veloce);
  }

  // silenzio: tutte le voci, oppure solo quelle che cominciano con «prefisso»
  function silenzio(prefisso) {
    for (const [k, vc] of [...voci]) {
      if (prefisso && !String(k).startsWith(prefisso)) continue;
      voci.delete(k);
      chiudi(vc, true);
    }
  }

  YG.suono = { sblocca, suona, ferma, silenzio, conCampioni, get attivo() { return !!ctx && ctx.state === 'running'; } };
})();
