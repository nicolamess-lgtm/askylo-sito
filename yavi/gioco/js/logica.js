// Yavier Game — la logica pura del gioco: le canzoni, come si preparano, quali tasti mostrare,
// la tastiera del computer, il giudizio delle note e le stelle.
// Gira anche in Node (test): niente DOM, niente localStorage, niente suono.
// Usa YT.brani e YT.util della Tastiera (/yavi/tastiera/js/base.js e brani.js) quando ci sono.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const YG = (G.YG = G.YG || {});
  // le lingue (web/lingue.js): T(chiave, testo italiano). Senza traduzione (o nelle prove, in node) resta l'italiano.
  const T = (id, it) => (G.YAVI_T ? G.YAVI_T(id, it) : it);
  const TF = (id, it, v) => T(id, it).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));

  // ---------- i numeri del gioco: tutti qui (da tarare con persone vere, anche bambini) ----------
  const SOGLIE = {
    versione: 1,
    finestra_s: 2.6,          // secondi veri in cui una nota scende dall'alto fino alla linea
    aiuto_dopo_s: 3,          // il tasto giusto pulsa dopo 3 s di attesa sulla linea…
    aiuto_dopo_sbagli: 2,     // …oppure subito dopo 2 tasti sbagliati sulla stessa nota
    ribattuta_ms: 250,        // il tasto appena preso, ripremuto entro 250 ms, non conta (dito che rimbalza)
    doppio_tocco_ms: 400,     // una scheda toccata entro 400 ms dal cambio di schermata è il 2° tocco di un doppio tocco
    doppio_ms: 45,            // la stessa nota da due fonti entro 45 ms conta una volta (come la Tastiera)
    fantasma: 2,              // forza 1–2 in ingresso non è un dito vero (come la Tastiera)
    accordo_s: 0.04,          // note della melodia entro 40 ms = da prendere insieme
    forza_tocco: 84,          // forza delle note toccate sullo schermo o con la tastiera del computer
    forza_sbagliata: 30,      // la nota sbagliata suona piano piano
    sinistra: 0.55,           // la mano sinistra la suona il computer, più piano: forza × 0,55
    coda_max_s: 4,            // dopo l'ultima nota la sinistra finisce, al massimo per 4 s
    passo_max_s: 0.1,         // un fotogramma lungo (scheda nascosta) non fa correre il brano
    stelle: {                 // al primo colpo = nota presa senza tasti sbagliati e senza aiuto
      tre: { primo: 0.9, aiuti: 0.05 },   // 3 stelle: almeno 90 % al primo colpo e al massimo 5 % di aiuti
      due: { primo: 0.7, aiuti: 0.2 },    // 2 stelle: almeno 70 % e al massimo 20 %
    },                                    // altrimenti 1 stella: mai zero
  };

  // ---------- le canzoni del gioco (dai brani inclusi della Tastiera) ----------
  // velocita: il brano va a questa frazione del suo tempo (la mano sinistra del computer e la discesa delle note).
  // figura: il disegno della scheda (figure.js). colore: la tinta della scheda.
  const CANZONI = [
    { id: 'scala-di-do', titolo: 'La scala di Do', sotto: 'Per cominciare', figura: 'scala', colore: 'giallo', velocita: 0.8 },
    { id: 'fra-martino', titolo: 'Fra Martino', figura: 'campana', colore: 'petrolio', velocita: 0.8 },
    { id: 'ah-vous-dirai-je', titolo: 'Ah! vous dirai-je, maman', figura: 'stella', colore: 'inchiostro', velocita: 0.8 },
    { id: 'inno-alla-gioia', titolo: 'Inno alla gioia', figura: 'sole', colore: 'corallo', velocita: 0.8 },
    { id: 'korobeiniki', titolo: 'Korobeiniki (canto popolare russo)', sotto: 'Tradizionale', figura: 'balalaika', colore: 'petrolio', velocita: 0.65 },
    { id: 'kleine-nachtmusik', titolo: 'Eine kleine Nachtmusik', figura: 'luna', colore: 'inchiostro', velocita: 0.6 },
    { id: 'per-elisa', titolo: 'Per Elisa', figura: 'fiore', colore: 'corallo', velocita: 0.7 },
  ];

  const EPS = 0.005;   // secondi: note «nello stesso istante»
  const NERI = [1, 3, 6, 8, 10];
  const nero = (n) => NERI.includes(((n % 12) + 12) % 12);
  const NOMI = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  function nomeNota(n) {
    const YT = G.YT;
    // le lingue che usano le lettere (C D E) lo dicono nel dizionario: «g.note.sistema» = «americano»
    const sistema = T('g.note.sistema', '');
    if (YT && YT.util && YT.util.nomeNota) return YT.util.nomeNota(n, sistema ? { sistema } : undefined);
    return NOMI[((n % 12) + 12) % 12];
  }

  function canzone(id) { return CANZONI.find((c) => c.id === id) || null; }

  // ---------- preparazione di un brano ----------
  // brano: il Brano di YT.brani.daJSON (tempi in secondi). Restituisce
  // { id, gruppi: [{ i, t, fine, note: [midi…], forza }], sinistra: [{ id, nota, inizio, fine, forza }],
  //   tasti: [midi…], inizio, durata }
  function prepara(brano) {
    if (!brano || !Array.isArray(brano.note) || !Array.isArray(brano.parti)) throw new Error('Brano non valido.');
    const suonabili = brano.parti.filter((p) => !p.percussione);
    let melodia = suonabili.find((p) => p.mano === 'destra');
    if (!melodia) {
      // nessuna mano destra: la parte con le note più acute in media
      let meglio = null, media = -Infinity;
      for (const p of suonabili) {
        const ns = brano.note.filter((n) => n.parte === p.id);
        if (!ns.length) continue;
        const m = ns.reduce((a, n) => a + n.nota, 0) / ns.length;
        if (m > media) { media = m; meglio = p; }
      }
      melodia = meglio;
    }
    if (!melodia) throw new Error('Il brano non ha una melodia.');
    const altre = new Set(suonabili.filter((p) => p.id !== melodia.id).map((p) => p.id));
    const ordina = (a, b) => a.inizio - b.inizio || a.nota - b.nota;
    const noteM = brano.note.filter((n) => n.parte === melodia.id).sort(ordina);
    const gruppi = [];
    for (const n of noteM) {
      const ultimo = gruppi[gruppi.length - 1];
      if (ultimo && n.inizio - ultimo.t <= SOGLIE.accordo_s + 1e-9) {
        if (!ultimo.note.includes(n.nota)) ultimo.note.push(n.nota);
        ultimo.fine = Math.max(ultimo.fine, n.fine);
        continue;
      }
      gruppi.push({ i: gruppi.length, t: n.inizio, fine: n.fine, note: [n.nota], forza: n.forza || 64 });
    }
    gruppi.forEach((g) => g.note.sort((a, b) => a - b));
    if (!gruppi.length) throw new Error('Il brano non ha una melodia.');
    const sinistra = brano.note
      .filter((n) => altre.has(n.parte))
      .sort(ordina)
      .map((n, i) => ({
        id: i, nota: n.nota, inizio: n.inizio, fine: Math.max(n.inizio + 0.05, n.fine),
        forza: Math.max(1, Math.round((n.forza || 64) * SOGLIE.sinistra)),
      }));
    const tasti = tastiDaMostrare(gruppi);
    const inizio = Math.min(gruppi[0].t, sinistra.length ? sinistra[0].inizio : Infinity);
    const durata = Math.max(gruppi[gruppi.length - 1].fine, sinistra.reduce((m, n) => Math.max(m, n.fine), 0));
    return { id: brano.id, gruppi, sinistra, tasti, inizio, durata };
  }

  // i tasti da disegnare: solo quelli che servono alla melodia, dal più grave al più acuto
  function tastiDaMostrare(gruppi) {
    const s = new Set();
    for (const g of gruppi) for (const n of g.note) s.add(n);
    return [...s].sort((a, b) => a - b);
  }

  // i nomi sui tasti: «Do», «Re»…; se un nome torna due volte, il più grave è «basso» e il più acuto «alto»
  function etichette(tasti) {
    const perNome = new Map();
    const fuori = tasti.map((nota) => {
      const nome = nomeNota(nota);
      const e = { nota, nome, segno: '', nero: nero(nota) };
      if (!perNome.has(nome)) perNome.set(nome, []);
      perNome.get(nome).push(e);
      return e;
    });
    for (const lista of perNome.values()) {
      if (lista.length < 2) continue;
      lista[0].segno = T('g.basso', 'basso');
      lista[lista.length - 1].segno = T('g.alto', 'alto');
    }
    return fuori;
  }

  // il nome da dire e da leggere (aria-label, annunci): «Do basso», «Re», «Do alto»
  function nomeIntero(e) { return e ? e.nome + (e.segno ? ' ' + e.segno : '') : ''; }

  // informazioni per la scheda: quanti tasti, quanti neri, quante note
  function riassunto(prep) {
    return { tasti: prep.tasti.length, neri: prep.tasti.filter(nero).length, note: prep.gruppi.length };
  }

  // ---------- la tastiera del computer ----------
  // la riga centrale (A S D F G H J K L Ò), centrata sul numero dei tasti; oltre 10 si aggiunge la riga sopra.
  const RIGA_CASA = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  const RIGA_SOPRA = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
  function mappaComputer(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (n <= RIGA_CASA.length) {
      const da = Math.floor((RIGA_CASA.length - n) / 2);
      return RIGA_CASA.slice(da, da + n);
    }
    const tutti = RIGA_CASA.concat(RIGA_SOPRA);
    const fuori = tutti.slice(0, n);
    while (fuori.length < n) fuori.push(null);   // oltre 20 tasti: solo tocco e MIDI
    return fuori;
  }

  // la lettera da scrivere sul tasto (la pagina la corregge con la disposizione vera, se il browser la dà)
  function lettera(code) {
    if (!code) return '';
    if (code === 'Semicolon') return 'Ò';
    return code.replace(/^Key/, '');
  }

  // dall'evento della tastiera alla nota (mappa: { codice: nota }), o null.
  // Non contano: i tasti con Ctrl, Cmd, Alt o Maiusc (scorciatoie), quelli tenuti giù che si ripetono
  // (ci pensa chi chiama) e quelli premuti mentre si scrive in un campo.
  function notaDaTasto(e, mappa) {
    if (!e || !mappa) return null;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    if (campoDiTesto(e.target)) return null;
    return Object.prototype.hasOwnProperty.call(mappa, e.code) ? mappa[e.code] : null;
  }

  function campoDiTesto(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toLowerCase();
    if (el.isContentEditable || tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    const tipo = String(el.type || 'text').toLowerCase();
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(tipo);
  }

  // ---------- ingressi: regole pure ----------
  function fantasma(forza) {
    const f = Number(forza);
    return Number.isFinite(f) && f > 0 && f <= SOGLIE.fantasma;
  }

  // ultimi: Map nota → { fonte, ms }. true se questa pressione è il doppione di una da un'altra fonte.
  function doppione(ultimi, nota, fonte, ms, soglia) {
    const u = ultimi.get(nota);
    const s = soglia == null ? SOGLIE.doppio_ms : soglia;
    if (u && u.fonte !== fonte && Math.abs(ms - u.ms) < s) return true;
    ultimi.set(nota, { fonte, ms });
    return false;
  }

  // doppio tocco su «Un altro»: il secondo tocco arriva sulla scheda appena comparsa sotto il dito.
  // Un tocco così vicino al cambio di schermata (ms) non apre una canzone che nessuno ha scelto.
  function toccoDiTroppo(ora, cambio) { return Number(ora) - Number(cambio) < SOGLIE.doppio_tocco_ms; }

  // il pianoforte vero si ascolta solo se la pagina viene da Yavier sul Mac (127.0.0.1 o localhost)
  // o dal suo 📱 Telecomando (porta 8877, un indirizzo della rete di casa o un nome .local)
  function servitoDaYavier(loc) {
    const h = String((loc && loc.hostname) || '').toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1') return true;
    if (String((loc && loc.port) || '') !== '8877') return false;
    return /\.local$/.test(h) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(h);
  }

  // una porta Web MIDI che è il pianoforte già sentito dal ponte (si ignora: mai due volte)
  function portaDelPiano(nome, ingressoPonte) {
    if (!ingressoPonte || !nome) return false;
    return nome === ingressoPonte || /yamaha|disklavier|enspire/i.test(nome);
  }

  // ---------- la partita ----------
  // Il tempo «t» è in secondi di brano. Scorre a «velocita» finché la prossima nota arriva sulla linea,
  // poi si ferma e ti aspetta: la nota non si perde mai. La mano sinistra la suona il computer e si ferma con lui.
  // Gli eventi per la pagina si raccolgono e si prendono con avanza() / prendi():
  //   { tipo: 'on', id, nota, forza } · { tipo: 'off', id, nota }        (la mano sinistra)
  //   { tipo: 'arriva', gruppo }   la nota è sulla linea e aspetta
  //   { tipo: 'aiuto', gruppo, note }   il tasto giusto comincia a pulsare
  //   { tipo: 'presa', gruppo, esito: 'primo'|'dopo'|'aiuto' } · { tipo: 'ultima' } · { tipo: 'fine' }
  class Partita {
    constructor(prep, opzioni) {
      const o = opzioni || {};
      this.prep = prep;
      this.velocita = Math.max(0.2, Math.min(1.5, o.velocita || 1));
      this.finestra = (o.finestra_s || SOGLIE.finestra_s) * this.velocita;   // secondi di brano sopra la linea
      this.t = prep.inizio - this.finestra;   // la prima nota parte dall'alto
      this.g = 0;
      this.prese = new Set();
      this.esiti = [];
      this.sbagli = 0;
      this.sbagliGruppo = 0;
      this.aiutoGruppo = false;
      this.attesa_s = 0;
      this.iS = 0;
      this.suonano = new Map();   // id → nota della sinistra
      this.eventi = [];
      this.ultimaPresa = null;
      this.coda_s = 0;
      this.finito = false;
    }

    get gruppo() { return this.prep.gruppi[this.g] || null; }
    get aspetta() { const gr = this.gruppo; return !!gr && this.t >= gr.t - 1e-9; }
    get avanzamento() { return this.prep.gruppi.length ? this.g / this.prep.gruppi.length : 1; }
    // niente da far scorrere: la nota aspetta sulla linea e l'aiuto c'è già (oppure è finita).
    // Il tempo non cambia più finché non arriva una nota: la pagina può smettere di disegnare.
    get quieta() { return this.finito || (this.aspetta && this.aiutoGruppo); }

    prendi() { const e = this.eventi; this.eventi = []; return e; }

    // la mano sinistra fino a «fino»: prima si alzano le note finite, poi partono quelle nuove.
    // compreso = false: le note proprio sull'istante della nota che aspetta partono con lei, non prima.
    _sinistra(fino, compreso) {
      const sin = this.prep.sinistra;
      for (const [id, nota] of this.suonano) {
        if (sin[id].fine <= fino + 1e-9) { this.suonano.delete(id); this.eventi.push({ tipo: 'off', id, nota }); }
      }
      const limite = compreso ? fino + EPS : fino - EPS;
      while (this.iS < sin.length && sin[this.iS].inizio < limite) {
        const n = sin[this.iS++];
        if (n.fine <= fino + 1e-9 && !compreso) continue;    // già finita: niente note lampo
        this.suonano.set(n.id, n.nota);
        this.eventi.push({ tipo: 'on', id: n.id, nota: n.nota, forza: n.forza });
      }
    }

    // un salto in avanti (nota presa in anticipo): la sinistra di mezzo non si suona di corsa
    _salta(fino) {
      const sin = this.prep.sinistra;
      for (const [id, nota] of this.suonano) {
        if (sin[id].fine <= fino + 1e-9) { this.suonano.delete(id); this.eventi.push({ tipo: 'off', id, nota }); }
      }
      while (this.iS < sin.length && sin[this.iS].inizio < fino - EPS) this.iS++;
    }

    _aiuto() {
      const gr = this.gruppo;
      if (!gr || this.aiutoGruppo) return;
      this.aiutoGruppo = true;
      this.eventi.push({ tipo: 'aiuto', gruppo: gr.i, note: gr.note.slice() });
    }

    _spegniTutte() {
      for (const [id, nota] of this.suonano) this.eventi.push({ tipo: 'off', id, nota });
      this.suonano.clear();
    }

    // dt: secondi veri dall'ultima chiamata
    avanza(dt) {
      if (this.finito) return this.prendi();
      dt = Math.max(0, Math.min(SOGLIE.passo_max_s, Number(dt) || 0));
      const gr = this.gruppo;
      if (gr) {
        const prossimo = this.t + dt * this.velocita;
        if (prossimo >= gr.t - 1e-9) {
          const arriva = this.t < gr.t - 1e-9;
          if (arriva) this.attesa_s = (prossimo - gr.t) / this.velocita;
          else this.attesa_s += dt;
          this.t = gr.t;
          this._sinistra(gr.t, false);
          if (arriva) this.eventi.push({ tipo: 'arriva', gruppo: gr.i });
          if (this.attesa_s >= SOGLIE.aiuto_dopo_s - 1e-9) this._aiuto();
        } else {
          this.t = prossimo;
          this._sinistra(prossimo, false);
        }
      } else {
        // dopo l'ultima nota la sinistra finisce il suo giro
        this.t += dt * this.velocita;
        this.coda_s += dt;
        this._sinistra(this.t, false);
        if (this.t >= this.prep.durata - 1e-9 || this.coda_s >= SOGLIE.coda_max_s - 1e-9) {
          this._spegniTutte();
          this.finito = true;
          this.eventi.push({ tipo: 'fine' });
        }
      }
      return this.prendi();
    }

    // una nota premuta (ms: l'ora della pressione, per i rimbalzi).
    // → { esito: 'giusta', gruppo, completo } · { esito: 'sbagliata', gruppo } · { esito: 'ignorata' } · { esito: 'fuori' }
    premi(nota, ms) {
      const gr = this.gruppo;
      if (this.finito || !gr) return { esito: 'fuori' };
      if (gr.note.includes(nota) && !this.prese.has(nota)) {
        this.prese.add(nota);
        const completo = this.prese.size >= gr.note.length;
        if (completo) this._completa(ms);
        return { esito: 'giusta', gruppo: gr.i, completo };
      }
      if (gr.note.includes(nota)) return { esito: 'ignorata' };   // già presa in questo accordo
      // prima che la prima nota arrivi sulla linea i tasti si possono provare: non è uno sbaglio
      // (anche il secondo tocco di un doppio tocco sulla scheda, che cade su un tasto appena comparso)
      if (this.g === 0 && !this.aspetta) return { esito: 'ignorata' };
      const u = this.ultimaPresa;
      if (u && u.note.includes(nota) && ms != null && u.ms != null && ms - u.ms < SOGLIE.ribattuta_ms) return { esito: 'ignorata' };
      this.sbagli++;
      this.sbagliGruppo++;
      if (this.sbagliGruppo >= SOGLIE.aiuto_dopo_sbagli) this._aiuto();
      return { esito: 'sbagliata', gruppo: gr.i };
    }

    _completa(ms) {
      const gr = this.gruppo;
      const esito = this.aiutoGruppo ? 'aiuto' : this.sbagliGruppo ? 'dopo' : 'primo';
      this.esiti.push(esito);
      if (this.t < gr.t - 1e-9) this._salta(gr.t);
      this.t = gr.t;
      this._sinistra(gr.t, true);   // la sinistra di questo istante suona insieme a te
      this.eventi.push({ tipo: 'presa', gruppo: gr.i, esito });
      this.ultimaPresa = { note: gr.note.slice(), ms: ms == null ? null : ms };
      this.g++;
      this.prese = new Set();
      this.sbagliGruppo = 0;
      this.aiutoGruppo = false;
      this.attesa_s = 0;
      if (!this.gruppo) this.eventi.push({ tipo: 'ultima' });
    }

    // i gruppi da disegnare: dal prossimo in su, finché stanno nella finestra (al massimo «max»)
    inVista(max) {
      const fuori = [];
      const lim = this.t + this.finestra * 1.08;
      for (let i = this.g; i < this.prep.gruppi.length && fuori.length < (max || 6); i++) {
        const gr = this.prep.gruppi[i];
        if (gr.t > lim) break;
        fuori.push(gr);
      }
      return fuori;
    }

    risultato() {
      const conta = (e) => this.esiti.filter((x) => x === e).length;
      const r = { totale: this.prep.gruppi.length, primo: conta('primo'), dopo: conta('dopo'), aiuti: conta('aiuto'), sbagli: this.sbagli };
      r.stelle = stelle(r);
      return r;
    }
  }

  // quanto in alto sta una nota: 0 = sulla linea, 1 = in cima (oltre: ancora fuori dalla vista)
  function altezza(tNota, tOra, finestra) {
    return Math.max(0, (tNota - tOra) / Math.max(1e-6, finestra));
  }

  // ---------- le stelle ----------
  function stelle(r) {
    const tot = Math.max(1, r.totale || 0);
    const primo = (r.primo || 0) / tot, aiuti = (r.aiuti || 0) / tot;
    const s = SOGLIE.stelle;
    if (primo >= s.tre.primo - 1e-9 && aiuti <= s.tre.aiuti + 1e-9) return 3;
    if (primo >= s.due.primo - 1e-9 && aiuti <= s.due.aiuti + 1e-9) return 2;
    return 1;
  }

  // ---------- i salvataggi (solo le stelle migliori, in localStorage «yg1.stelle») ----------
  function leggiStelle(testo) {
    let o = null;
    try { o = JSON.parse(testo || '{}'); } catch (e) { o = null; }
    const fuori = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return fuori;
    for (const c of CANZONI) {
      const v = o[c.id];
      if (Number.isInteger(v) && v >= 1 && v <= 3) fuori[c.id] = v;
    }
    return fuori;
  }

  function conStelle(salvate, id, n) {
    const prima = (salvate && salvate[id]) || 0;
    const nuove = Object.assign({}, salvate || {});
    const s = Math.max(1, Math.min(3, Math.round(n || 1)));
    if (s > prima) nuove[id] = s;
    return { salvate: nuove, record: s > prima, prima };
  }

  // ---------- le parole della fine ----------
  // (getter: le parole si leggono nella lingua scelta al momento della fine)
  const PAROLE_FINE = {
    get 3() { return { titolo: T('g.fine.3.titolo', 'Tre stelle!'), frase: T('g.fine.3.frase', 'L’hai suonata come un pianista.') }; },
    get 2() { return { titolo: T('g.fine.2.titolo', 'Due stelle'), frase: T('g.fine.2.frase', 'Ancora un giro e arriva la terza.') }; },
    get 1() { return { titolo: T('g.fine.1.titolo', 'Una stella'), frase: T('g.fine.1.frase', 'Ogni volta suona un po’ meglio. Riproviamo?') }; },
  };

  function dettaglio(r) {
    const v = { primo: r.primo, totale: r.totale, aiuti: r.aiuti };
    let s = r.primo === 1 ? TF('g.dett.uno', '{primo} nota su {totale} al primo colpo', v)
      : TF('g.dett.molte', '{primo} note su {totale} al primo colpo', v);
    if (r.primo === r.totale) s = r.totale === 1 ? TF('g.dett.tutta', 'Tutte le {totale} nota al primo colpo', v)
      : TF('g.dett.tutte', 'Tutte le {totale} note al primo colpo', v);
    if (r.aiuti) s += ' · ' + (r.aiuti === 1 ? TF('g.dett.aiuto', '{aiuti} aiuto', v) : TF('g.dett.aiuti', '{aiuti} aiuti', v));
    return s;
  }
  // il titolo e la riga sotto di una canzone, nella lingua scelta
  const titolo = (c) => T('g.canzone.' + c.id, c.titolo);
  const sotto = (c) => (c.sotto ? T('g.canzone.' + c.id + '.sotto', c.sotto) : '');

  YG.SOGLIE = SOGLIE;
  YG.T = T; YG.TF = TF;
  YG.CANZONI = CANZONI;
  YG.logica = {
    canzone, prepara, tastiDaMostrare, etichette, nomeIntero, riassunto, nero, nomeNota, titolo, sotto,
    mappaComputer, lettera, notaDaTasto, campoDiTesto,
    fantasma, doppione, toccoDiTroppo, servitoDaYavier, portaDelPiano,
    Partita, altezza, stelle, leggiStelle, conStelle, PAROLE_FINE, dettaglio,
  };
})();
