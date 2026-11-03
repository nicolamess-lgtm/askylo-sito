/* Yavier — sito: «Yavi plays» nel browser (window.YaviSuona).
   Prende un brano incluso (gli stessi del Game, /tastiera/brani/inclusi.js), lo interpreta
   come farebbe un pianista e lo suona con il pianoforte virtuale (/yavi/web/pianoforte-virtuale.js,
   modalità «solo suono»). Intanto disegna il rullo: le note scendono e i tasti si abbassano.

   L'interpretazione è a regole, come umanizza.py dell'app, in piccolo:
   - la melodia (mano destra) canta sopra l'accompagnamento;
   - ogni frase di 4 battute sale e poi si posa (forza e un filo di rubato a fine frase);
   - gli accordi della sinistra si aprono appena, le note si legano un po';
   - in fondo il brano rallenta e si spegne.
   «Piatto» invece suona tutto con la stessa forza e il tempo del metronomo: serve al confronto.

   Uso:  var p = YaviSuona.crea({ tela: <canvas>, stato: function (s) {…} });
         p.suona("per-elisa", { umano: true });  p.ferma();
   stato riceve { fase: "carica" | "suona" | "fermo", id, avanzamento (0…1) }. */
(function () {
  "use strict";
  var V = window.YavierVirtuale;

  var NERI = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  function nero(n) { return !!NERI[((n % 12) + 12) % 12]; }

  var cacheBrani = null;
  function brani() {
    if (!cacheBrani) {
      try { cacheBrani = window.YT.brani.inclusi(); } catch (e) { cacheBrani = []; }
    }
    return cacheBrani;
  }
  function brano(id) {
    var b = brani();
    for (var i = 0; i < b.length; i++) if (b[i].id === id) return b[i];
    return null;
  }

  // numero casuale ripetibile (lo stesso brano suona uguale due volte di fila)
  function casuale(seme) {
    var s = seme >>> 0 || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* L'interpretazione: dalle note del brano a eventi { nota, t, fine, forza, mano } in secondi. */
  function interpreta(b, umano) {
    var mani = {};
    b.parti.forEach(function (p) { mani[p.id] = p.mano; });
    var battute = b.battute || [];
    var durBattuta = battute.length > 1 ? (battute[1].sec - battute[0].sec) : 2;
    if (!(durBattuta > 0)) durBattuta = 2;
    var fine = b.durata;

    if (!umano) {
      return b.note.map(function (n) {
        return { nota: n.nota, t: n.inizio, fine: n.inizio + Math.max(0.08, (n.fine - n.inizio) * 0.92), forza: 78, mano: mani[n.parte] };
      });
    }

    var rnd = casuale(b.note.length * 7919 + Math.round(fine * 100));
    var frase = durBattuta * 4;

    // il tempo che respira: un filo più lento alla fine di ogni frase, e un rallentando in fondo
    function tempo(t) {
      var fermata = 0;
      var nFrasi = Math.floor(t / frase);
      fermata += nFrasi * durBattuta * 0.05;                   // ogni frase finita ha «preso fiato»
      var dentro = (t % frase) / frase;
      if (dentro > 0.8) fermata += durBattuta * 0.05 * ((dentro - 0.8) / 0.2) * ((dentro - 0.8) / 0.2);
      var coda = Math.max(0, t - (fine - durBattuta * 2)) / (durBattuta * 2);   // ultime 2 battute
      fermata += coda * coda * durBattuta * 0.45;
      return t + fermata;
    }
    // la forza segue la frase: sale fino a due terzi, poi si posa
    function arco(t) {
      var x = (t % frase) / frase;
      var su = x < 0.66 ? x / 0.66 : 1 - (x - 0.66) / 0.34 * 0.8;
      var coda = Math.max(0, t - (fine - durBattuta * 2)) / (durBattuta * 2);
      return su * 14 - coda * 16;
    }

    // gli attacchi «insieme» della sinistra: si aprono di qualche millesimo, dal basso
    var perIstante = {};
    b.note.forEach(function (n) {
      if (mani[n.parte] !== "sinistra") return;
      var k = Math.round(n.inizio * 100);
      (perIstante[k] = perIstante[k] || []).push(n.nota);
    });
    Object.keys(perIstante).forEach(function (k) { perIstante[k].sort(function (a, c) { return a - c; }); });

    return b.note.map(function (n) {
      var mano = mani[n.parte];
      var base = n.forza != null ? n.forza : 64;
      var forza = mano === "sinistra" ? base * 0.72 + 4 : base * 0.86 + 12;
      forza += arco(n.inizio) + (rnd() - 0.5) * 8;
      forza = Math.max(18, Math.min(108, Math.round(forza)));   // mai oltre 110: come l'app
      var t = tempo(n.inizio) + (rnd() - 0.5) * 0.016;
      if (mano === "sinistra") {
        var gruppo = perIstante[Math.round(n.inizio * 100)];
        if (gruppo && gruppo.length > 1) t += gruppo.indexOf(n.nota) * 0.018;
      }
      var lungo = tempo(n.fine) - tempo(n.inizio);
      var fineNota = t + lungo + (mano === "sinistra" ? 0.12 : 0.05);   // legato
      return { nota: n.nota, t: Math.max(0, t), fine: fineNota, forza: forza, mano: mano };
    });
  }

  function crea(opz) {
    opz = opz || {};
    var tela = opz.tela || null, avvisa = opz.stato || function () {};
    var eventi = [], t0 = 0, timer = 0, raf = 0, idCorrente = null, prossimo = 0, durata = 0;
    var giu = {};                       // nota → quante voci la tengono giù adesso (per il disegno)
    var basso = 48, alto = 84;

    function libero() { return !idCorrente; }

    function intervallo(evs) {
      var mi = 127, ma = 0;
      evs.forEach(function (e) { if (e.nota < mi) mi = e.nota; if (e.nota > ma) ma = e.nota; });
      if (mi > ma) { mi = 48; ma = 84; }
      mi -= 3; ma += 3;
      while (nero(mi)) mi--;
      while (nero(ma)) ma++;
      if (ma - mi < 24) { var c = (ma + mi) / 2; mi = Math.round(c - 12); ma = Math.round(c + 12); while (nero(mi)) mi--; while (nero(ma)) ma++; }
      basso = mi; alto = ma;
    }

    function pianifica() {
      var c = V.contesto(); if (!c) return;
      var ora = c.currentTime - t0, fino = ora + 0.6;
      while (prossimo < eventi.length && eventi[prossimo].t < fino) {
        var e = eventi[prossimo++];
        var voce = V.accendi(e.nota, e.forza, t0 + e.t);
        if (voce) V.rilascia(voce, t0 + e.fine);
      }
      if (ora > durata + 2.5) fine();
    }

    function fine() {
      var era = idCorrente;
      clearInterval(timer); timer = 0;
      idCorrente = null;
      giu = {};
      disegna();
      avvisa({ fase: "fermo", id: era, avanzamento: 0 });
    }

    function ferma() {
      if (!idCorrente) return;
      try { V.silenzio("live"); } catch (e) {}
      fine();
    }

    function suona(id, o) {
      o = o || {};
      ferma();
      var b = brano(id); if (!b || !V) return false;
      var c = V.sblocca();             // dentro il clic: il browser lascia partire l'audio
      if (!c) return false;
      idCorrente = id;
      eventi = interpreta(b, o.umano !== false).sort(function (a, z) { return a.t - z.t; });
      durata = eventi.reduce(function (m, e) { return Math.max(m, e.fine); }, 0);
      intervallo(eventi);
      prossimo = 0;
      avvisa({ fase: "carica", id: id, avanzamento: 0 });
      var mio = id;
      Promise.resolve(V.carica()).then(function () {
        if (idCorrente !== mio) return;
        t0 = c.currentTime + 0.35;
        pianifica();
        timer = setInterval(pianifica, 120);
        avvisa({ fase: "suona", id: id, avanzamento: 0 });
        anima();
      });
      return true;
    }

    // ---------------- il rullo ----------------
    function colori() {
      var s = getComputedStyle(document.documentElement);
      function v(n, d) { return (s.getPropertyValue(n) || "").trim() || d; }
      return {
        fondo: v("--rullo-fondo", "#151824"), riga: v("--line", "rgba(255,255,255,.1)"),
        destra: v("--giallo", "#FFC61A"), sinistra: v("--petrolio", "#4FB3A8"),
        bianco: v("--tasto-bianco", "#F3EFE6"), nero: v("--tasto-nero", "#0B0D13"), bordo: v("--tasto-bordo", "rgba(0,0,0,.35)")
      };
    }

    function disegna() {
      if (!tela) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = tela.clientWidth, h = tela.clientHeight;
      if (!w || !h) return;
      if (tela.width !== Math.round(w * dpr) || tela.height !== Math.round(h * dpr)) {
        tela.width = Math.round(w * dpr); tela.height = Math.round(h * dpr);
      }
      var g = tela.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var col = colori();
      g.clearRect(0, 0, w, h);

      // i tasti bianchi in fila: la larghezza viene da quanti sono
      var bianchi = [];
      for (var n = basso; n <= alto; n++) if (!nero(n)) bianchi.push(n);
      var lb = w / bianchi.length, hTasti = Math.min(h * 0.24, lb * 4.2), yTasti = h - hTasti;
      function xDi(nota) {
        if (!nero(nota)) return { x: bianchi.indexOf(nota) * lb, l: lb };
        var prima = bianchi.indexOf(nota - 1);
        return { x: (prima + 1) * lb - lb * 0.3, l: lb * 0.6 };
      }

      // le note che scendono: 3 secondi di musica sopra i tasti
      var c = V && V.contesto ? V.contesto() : null;
      var ora = idCorrente && c ? c.currentTime - t0 : -1;
      var finestra = 3, pps = yTasti / finestra;
      giu = {};
      if (ora > -1) {
        for (var i = 0; i < eventi.length; i++) {
          var e = eventi[i];
          if (e.t > ora + finestra) break;
          if (e.fine < ora) continue;
          var p = xDi(e.nota);
          var y1 = yTasti - (e.t - ora) * pps, y0 = yTasti - (e.fine - ora) * pps;
          if (e.t <= ora) { giu[e.nota] = e.mano || "destra"; y1 = yTasti; }
          var hh = Math.max(4, y1 - y0);
          g.globalAlpha = 0.35 + 0.65 * (e.forza / 110);
          g.fillStyle = e.mano === "sinistra" ? col.sinistra : col.destra;
          raggio(g, p.x + 1.5, y0, p.l - 3, hh, Math.min(6, p.l / 3));
          g.fill();
        }
        g.globalAlpha = 1;
      }

      // la tastiera
      bianchi.forEach(function (nota, k) {
        var acceso = giu[nota];
        g.fillStyle = acceso ? (acceso === "sinistra" ? col.sinistra : col.destra) : col.bianco;
        g.fillRect(k * lb + 0.5, yTasti + (acceso ? 2 : 0), lb - 1, hTasti - (acceso ? 2 : 0));
        g.fillStyle = col.bordo;
        g.fillRect(k * lb + lb - 0.5, yTasti, 1, hTasti);
      });
      for (var m = basso; m <= alto; m++) {
        if (!nero(m)) continue;
        var q = xDi(m), acc = giu[m];
        g.fillStyle = acc ? (acc === "sinistra" ? col.sinistra : col.destra) : col.nero;
        g.fillRect(q.x, yTasti, q.l, hTasti * 0.62 + (acc ? 2 : 0));
      }
      g.fillStyle = col.destra;
      g.globalAlpha = 0.85;
      g.fillRect(0, yTasti - 2, w, 2);
      g.globalAlpha = 1;

      if (ora > -1 && durata > 0) avvisa({ fase: "suona", id: idCorrente, avanzamento: Math.min(1, Math.max(0, ora / durata)) });
    }

    function raggio(g, x, y, l, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.lineTo(x + l - r, y); g.quadraticCurveTo(x + l, y, x + l, y + r);
      g.lineTo(x + l, y + h - r); g.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
      g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }

    function anima() {
      cancelAnimationFrame(raf);
      (function giro() {
        disegna();
        if (idCorrente) raf = requestAnimationFrame(giro);
      })();
    }

    if (tela) {
      intervallo([]);
      var b0 = opz.mostra && brano(opz.mostra);
      if (b0) intervallo(interpreta(b0, true));
      disegna();
      window.addEventListener("resize", disegna);
      document.addEventListener("yavi-tema", disegna);
    }

    return { suona: suona, ferma: ferma, libero: libero, ridisegna: disegna, corrente: function () { return idCorrente; } };
  }

  window.YaviSuona = { crea: crea, brani: brani, brano: brano, interpreta: interpreta };
})();
