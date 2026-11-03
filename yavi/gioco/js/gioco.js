// Yavier Game — le tre schermate: Scegli → Suona → Fine.
// La prossima nota scende nella colonna del suo tasto e ASPETTA sulla linea finché premi il tasto giusto.
// La mano sinistra la suona il computer, piano piano, e si ferma quando il gioco aspetta te.
// Salvataggi solo in localStorage con il prefisso «yg1.». Niente account, niente statistiche, niente rete
// (salvo, nell'app di Yavier sul Mac, l'ascolto del pianoforte vero: vedi ingressi.js).
(function () {
  'use strict';
  const G = window;
  const YG = G.YG;
  const L = YG.logica, S = YG.SOGLIE, F = YG.figure;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- memoria del dispositivo (solo «yg1.») ----------
  const memoria = {
    leggi(k) { try { return G.localStorage.getItem('yg1.' + k); } catch (e) { return null; } },
    scrivi(k, v) { try { G.localStorage.setItem('yg1.' + k, v); } catch (e) { /* navigazione privata: pazienza */ } },
  };
  let stelleSalvate = L.leggiStelle(memoria.leggi('stelle'));
  let suonoMidi = memoria.leggi('suonoMidi') !== '0';

  // ---------- stato della pagina ----------
  let schermata = 'scegli';
  let cambio = -1e9;            // quando è cambiata la schermata (performance.now), per i doppi tocchi
  let attuale = null;          // la canzone aperta: { canzone, prep, partita, colonna: Map(nota → {corsia, tasto, et, codice}), pool: Map }
  let raf = 0, ultimoFotogramma = 0, tVista = 0, pausa = false;
  let daScegli = false;         // si è arrivati a Suona con un tocco su una scheda (allora «indietro» = history.back)
  let misure = { linea: 300, hn: 40 };
  let disposizione = null;      // la disposizione vera della tastiera del computer (Chrome, Edge), se il browser la dà
  const premuti = new Map();    // chiave → nota (per illuminare i tasti premuti da qualunque fonte)
  const timer = new Set();

  function dopo(ms, fn) { const t = setTimeout(() => { timer.delete(t); fn(); }, ms); timer.add(t); return t; }
  function fermaTimer() { for (const t of timer) clearTimeout(t); timer.clear(); }

  function braniInclusi() {
    try { return G.YT && G.YT.brani ? G.YT.brani.inclusi() : null; } catch (e) { return null; }
  }
  function branoDi(id) { const b = braniInclusi(); return b ? b.find((x) => x.id === id) || null : null; }

  function letteraDi(code) {
    if (!code) return '';
    const v = disposizione && disposizione.get ? disposizione.get(code) : null;
    if (v && v.length === 1 && /\S/.test(v)) return v.toUpperCase();
    return L.lettera(code);
  }

  // ---------- schermate ----------
  function mostra(nome) {
    if (nome !== schermata) cambio = performance.now();
    schermata = nome;
    for (const s of ['scegli', 'suona', 'fine']) $('s-' + s).hidden = s !== nome;
    document.body.classList.toggle('in-suona', nome === 'suona');
    const h = $('t-' + nome);
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    if (nome !== 'suona') G.scrollTo(0, 0);
  }

  function chiudiPartita() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    fermaTimer();
    YG.suono.silenzio('sin:');
    YG.suono.silenzio('festa:');
    YG.ingressi.usaMappa({});
    if (attuale) for (const el of attuale.pool.values()) el.remove();
    attuale = null;
    document.body.classList.remove('molti-tasti');
  }

  // ---------- 1. Scegli ----------
  function disegnaScegli() {
    const lista = $('schede');
    const inclusi = braniInclusi();
    if (!inclusi) {
      lista.innerHTML = '';
      $('manca').hidden = false;
      $('manca').textContent = 'Le canzoni non sono ancora arrivate. Ricarica la pagina tra un momento.';
      return;
    }
    $('manca').hidden = true;
    lista.innerHTML = '';
    for (const c of YG.CANZONI) {
      const b = inclusi.find((x) => x.id === c.id);
      if (!b) continue;
      let prep;
      try { prep = L.prepara(b); } catch (e) { continue; }
      const r = L.riassunto(prep);
      const n = stelleSalvate[c.id] || 0;
      const sotto = c.sotto || b.compositore || '';
      const neri = r.neri ? ' · ' + r.neri + (r.neri === 1 ? ' nero' : ' neri') : '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scheda tinta-' + c.colore;
      btn.innerHTML =
        '<span class="scheda-figura">' + F.figura(c.figura) + '</span>' +
        '<span class="scheda-titolo">' + esc(c.titolo) + '</span>' +
        '<span class="scheda-sotto">' + esc(sotto) + '</span>' +
        '<span class="scheda-piede"><span class="scheda-stelle">' + F.stelline(n) + '</span>' +
        '<span class="scheda-tasti">' + r.tasti + ' tasti' + neri + '</span></span>';
      const quanteStelle = n ? n + (n === 1 ? ' stella' : ' stelle') + ' su 3' : 'ancora nessuna stella';
      btn.setAttribute('aria-label', c.titolo + ', ' + sotto + '. ' + r.tasti + ' tasti' +
        (r.neri ? ', ' + r.neri + (r.neri === 1 ? ' nero' : ' neri') : '') + '. ' + quanteStelle + '.');
      btn.addEventListener('click', () => {
        if (L.toccoDiTroppo(performance.now(), cambio)) return;   // il 2° tocco di un doppio tocco su «Un altro»
        YG.suono.sblocca();
        daScegli = true;
        G.location.hash = '#/suona/' + c.id;
      });
      lista.appendChild(btn);
    }
  }

  function mostraScegli() {
    chiudiPartita();
    disegnaScegli();
    mostra('scegli');
  }

  function tornaAScegli() {
    if (daScegli && /^#\/suona\//.test(G.location.hash)) { daScegli = false; G.history.back(); return; }
    daScegli = false;
    try { G.history.replaceState(null, '', G.location.pathname + G.location.search); } catch (e) { G.location.hash = ''; }
    mostraScegli();
  }

  // ---------- 2. Suona ----------
  function apriSuona(id) {
    chiudiPartita();
    const c = L.canzone(id);
    const b = branoDi(id);
    if (!c || !b) { mostraScegli(); return; }
    let prep;
    try { prep = L.prepara(b); } catch (e) { mostraScegli(); return; }
    attuale = { canzone: c, prep, partita: new L.Partita(prep, { velocita: c.velocita }), colonna: new Map(), pool: new Map(), primaPresa: false };
    $('t-suona').textContent = c.titolo;
    costruisciPalco();
    mostra('suona');
    misura();
    aggiornaAvanzamento();
    tVista = attuale.partita.t;
    pausa = document.visibilityState === 'hidden';
    ultimoFotogramma = performance.now();
    raf = requestAnimationFrame(ciclo);
  }

  function costruisciPalco() {
    const et = L.etichette(attuale.prep.tasti);
    const codici = L.mappaComputer(et.length);
    const corsie = $('corsie'), tasti = $('tasti'), palco = $('palco');
    corsie.innerHTML = '';
    tasti.innerHTML = '';
    palco.style.setProperty('--n', String(et.length));
    corsie.style.setProperty('--n', String(et.length));
    tasti.style.setProperty('--n', String(et.length));
    const mappa = {};
    et.forEach((e, i) => {
      const corsia = document.createElement('div');
      corsia.className = 'corsia' + (e.nero ? ' nera' : '');
      corsie.appendChild(corsia);
      const codice = codici[i] || null;
      const lettera = letteraDi(codice);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tasto ' + (e.nero ? 'nero' : 'bianco');
      b.innerHTML = '<span class="tasto-nome">' + esc(e.nome) + '</span>' +
        (e.segno ? '<span class="tasto-segno">' + esc(e.segno) + '</span>' : '') +
        (lettera ? '<kbd class="tasto-lettera">' + esc(lettera) + '</kbd>' : '');
      b.setAttribute('aria-label', L.nomeIntero(e) + (lettera ? ', lettera ' + lettera : ''));
      YG.ingressi.collegaTasto(b, e.nota);
      tasti.appendChild(b);
      attuale.colonna.set(e.nota, { i, corsia, tasto: b, et: e, lettera, codice });
      if (codice) mappa[codice] = e.nota;
    });
    const linea = document.createElement('div');
    linea.className = 'linea';
    corsie.appendChild(linea);
    const sugg = document.createElement('p');
    sugg.className = 'suggerimento';
    sugg.id = 'suggerimento';
    sugg.textContent = 'Quando la nota arriva sulla linea, premi il suo tasto.';
    corsie.appendChild(sugg);
    YG.ingressi.usaMappa(mappa);
    document.body.classList.toggle('molti-tasti', et.length > 7);
  }

  function misura() {
    const corsie = $('corsie');
    if (!corsie || !attuale) return;
    const alto = corsie.clientHeight;
    const sotto = parseFloat(getComputedStyle($('palco')).getPropertyValue('--sotto')) || 22;
    const prima = corsie.querySelector('.corsia');
    const largo = prima ? prima.clientWidth : 60;
    const hn = Math.round(Math.max(26, Math.min(56, largo * 0.62, alto * 0.2)));
    misure = { linea: alto - sotto, hn };
    corsie.style.setProperty('--hn', hn + 'px');
  }

  function aggiornaAvanzamento() {
    if (!attuale) return;
    const v = Math.round(attuale.partita.avanzamento * 100);
    const av = $('avanzamento');
    av.style.setProperty('--av', v + '%');
    av.setAttribute('aria-valuenow', String(v));
  }

  function creaNota(gr, nota) {
    const col = attuale.colonna.get(nota);
    if (!col) return null;
    const el = document.createElement('div');
    el.className = 'nota';
    el.textContent = col.et.nome;
    el.dataset.lettera = col.lettera || '';
    el.setAttribute('aria-hidden', 'true');
    col.corsia.appendChild(el);
    return el;
  }

  function disegna() {
    const p = attuale.partita;
    // il disegno segue il tempo del gioco; dopo un salto (nota presa in anticipo) ci arriva scivolando
    if (p.t - tVista > 0.03) tVista += (p.t - tVista) * 0.28; else tVista = p.t;
    const vivi = new Set();
    const corsa = misure.linea + misure.hn;
    let gruppoAttivo = null;
    for (const gr of p.inVista(6)) {
      const frac = L.altezza(gr.t, tVista, p.finestra);
      const y = misure.linea - frac * corsa - misure.hn / 2;
      const prossimo = gr.i === p.g;
      if (prossimo) gruppoAttivo = gr;
      for (const nota of gr.note) {
        if (prossimo && p.prese.has(nota)) continue;
        const k = gr.i + ':' + nota;
        let el = attuale.pool.get(k);
        if (!el) { el = creaNota(gr, nota); if (!el) continue; attuale.pool.set(k, el); }
        vivi.add(k);
        el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
        el.classList.toggle('prossima', prossimo);
        el.classList.toggle('aspetta', prossimo && p.aspetta);
        el.classList.toggle('aiuto', prossimo && p.aiutoGruppo);
      }
    }
    for (const [k, el] of attuale.pool) if (!vivi.has(k)) { el.remove(); attuale.pool.delete(k); }
    for (const col of attuale.colonna.values()) {
      col.corsia.classList.toggle('attiva', !!gruppoAttivo && gruppoAttivo.note.includes(col.et.nota) && p.aspetta);
    }
  }

  function ciclo(ora) {
    raf = 0;
    if (!attuale || schermata !== 'suona') return;
    const dt = Math.max(0, (ora - ultimoFotogramma) / 1000);
    ultimoFotogramma = ora;
    if (!pausa && !attuale.partita.finito) gestisci(attuale.partita.avanza(dt));
    if (attuale) disegna();
    // quando non si muove niente (la nota aspetta, l'aiuto pulsa già da solo col CSS) si smette di
    // disegnare: niente fotogrammi inutili, la batteria del telefono ringrazia. Riparte con sveglia().
    if (attuale && schermata === 'suona' && !(attuale.partita.quieta && tVista === attuale.partita.t)) raf = requestAnimationFrame(ciclo);
  }

  // riparte il disegno (una nota premuta, lo schermo che cambia misura, la scheda che torna visibile)
  function sveglia() {
    if (raf || !attuale || schermata !== 'suona') return;
    ultimoFotogramma = performance.now();
    raf = requestAnimationFrame(ciclo);
  }

  function annuncia(testo) { const a = $('annuncio'); if (a) a.textContent = testo; }

  function gestisci(eventi) {
    if (!attuale) return;
    for (const ev of eventi) {
      if (ev.tipo === 'on') YG.suono.suona('sin:' + ev.id, ev.nota, ev.forza);
      else if (ev.tipo === 'off') YG.suono.ferma('sin:' + ev.id);
      else if (ev.tipo === 'arriva') {
        const gr = attuale.prep.gruppi[ev.gruppo];
        // come sul tasto: «Do basso» e «Do alto», se no chi non vede non sa quale dei due
        annuncia('Adesso: ' + gr.note.map((n) => L.nomeIntero((attuale.colonna.get(n) || {}).et)).join(' e '));
      } else if (ev.tipo === 'aiuto') {
        for (const n of ev.note) { const col = attuale.colonna.get(n); if (col) col.tasto.classList.add('aiuto'); }
      } else if (ev.tipo === 'presa') {
        for (const col of attuale.colonna.values()) col.tasto.classList.remove('aiuto');
        aggiornaAvanzamento();
        if (!attuale.primaPresa) {
          attuale.primaPresa = true;
          const s = $('suggerimento');
          if (s) s.hidden = true;
        }
      } else if (ev.tipo === 'fine') {
        dopo(600, mostraFine);
      }
    }
  }

  // una nota presa: la sua testa si stacca e sparisce in verde petrolio
  function stacca(gruppo, nota) {
    const k = gruppo + ':' + nota;
    const el = attuale.pool.get(k);
    if (!el) return;
    attuale.pool.delete(k);
    el.classList.remove('prossima', 'aspetta', 'aiuto');
    el.classList.add('via');
    setTimeout(() => el.remove(), 420);
  }

  function lampo(el, classe, ms) {
    if (!el) return;
    el.classList.remove(classe);
    void el.offsetWidth;   // fa ripartire l'animazione
    el.classList.add(classe);
    dopo(ms, () => el.classList.remove(classe));
  }

  // ---------- le note che arrivano (tocco, tastiera, MIDI, pianoforte vero) ----------
  YG.ingressi.ascolta('giu', (d) => {
    let esito = null;
    if (schermata === 'suona' && attuale && !attuale.partita.finito) {
      esito = attuale.partita.premi(d.nota, d.ms);
      gestisci(attuale.partita.prendi());
      sveglia();
    }
    // il suono esce dal computer; le note del pianoforte vero no (le senti già dal pianoforte),
    // quelle della tastiera MIDI solo con «Suono dal computer»
    const qui = d.fonte !== 'piano' && (d.fonte !== 'midi' || suonoMidi);
    if (qui) {
      const forza = esito && esito.esito === 'sbagliata' ? Math.min(d.forza, S.forza_sbagliata) : d.forza;
      YG.suono.suona(d.chiave, d.nota, forza);
    }
    premuti.set(d.chiave, d.nota);
    const col = attuale && attuale.colonna.get(d.nota);
    if (col) col.tasto.classList.add('giu');
    if (!esito) return;
    if (esito.esito === 'giusta') {
      stacca(esito.gruppo, d.nota);
      if (col) lampo(col.tasto, 'bene', 420);
    } else if (esito.esito === 'sbagliata') {
      // nessuna parola dura: un suono morbido e un piccolo scossone
      if (col) lampo(col.tasto, 'storto', 320);
      lampo($('palco'), 'scossa', 260);
    }
  });

  YG.ingressi.ascolta('su', (d) => {
    YG.suono.ferma(d.chiave);
    premuti.delete(d.chiave);
    const col = attuale && attuale.colonna.get(d.nota);
    if (col && ![...premuti.values()].includes(d.nota)) col.tasto.classList.remove('giu');
  });

  YG.ingressi.ascolta('tastiera', () => document.body.classList.add('con-tastiera'));
  YG.ingressi.ascolta('stato', disegnaStrumenti);

  // ---------- 3. Fine ----------
  function mostraFine() {
    if (!attuale) return;
    const id = attuale.canzone.id;
    const r = attuale.partita.risultato();
    const esito = L.conStelle(stelleSalvate, id, r.stelle);
    stelleSalvate = esito.salvate;
    memoria.scrivi('stelle', JSON.stringify(stelleSalvate));
    const parole = L.PAROLE_FINE[r.stelle];
    const stelle = $('fine-stelle');
    stelle.innerHTML = F.stelline(r.stelle, 'grande');
    stelle.setAttribute('aria-label', r.stelle + (r.stelle === 1 ? ' stella' : ' stelle') + ' su 3');
    $('t-fine').textContent = parole.titolo;
    $('fine-frase').textContent = parole.frase;
    $('fine-dettaglio').textContent = L.dettaglio(r);
    $('fine-record').hidden = !(esito.record && esito.prima > 0);
    YG.suono.silenzio('sin:');
    YG.ingressi.usaMappa({});
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    mostra('fine');
    festa(r.stelle);
  }

  // un piccolo arpeggio di festa, piano: più stelle, più note
  function festa(n) {
    const note = [72, 76, 79, 84].slice(0, n + 1);
    note.forEach((nota, i) => {
      dopo(120 + i * 120, () => YG.suono.suona('festa:' + i, nota, 46));
      dopo(900 + i * 120, () => YG.suono.ferma('festa:' + i));
    });
  }

  // ---------- strumenti: tastiera MIDI e pianoforte collegato ----------
  const ICONA_MIDI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7 6v7M12 6v7M17 6v7M5 13h4M10 13h4M15 13h4"/></svg>';

  // breve: la versione stretta, sotto i tasti
  function htmlStrumenti(st, breve) {
    let html = '';
    if (st.piano) html += '<span class="chip"><span class="spia accesa"></span>' + (breve ? 'Pianoforte collegato' : 'Pianoforte collegato: suona anche sui suoi tasti') + '</span>';
    if (!YG.ingressi.midiPossibile()) return html;
    if (st.midi === 'spento' || st.midi === 'negato') {
      html += '<button class="pulsante secondo piccolo" type="button" data-azione="midi">' + ICONA_MIDI + 'Usa la mia tastiera MIDI</button>';
    }
    if (st.midi === 'negato') html += '<span class="tenue piccolo">Il browser non mi ha dato il permesso: puoi riprovare.</span>';
    if (st.midi === 'chiedo') html += '<span class="chip">Chiedo il permesso al browser…</span>';
    if (st.midi === 'attivo') {
      html += '<span class="chip"><span class="spia' + (st.porte.length ? ' accesa' : '') + '"></span>' +
        (st.porte.length ? (breve ? 'MIDI: ' : 'Tastiera MIDI: ') + esc(st.porte.join(', ')) : 'Collega la tastiera MIDI: la sento da sola') + '</span>';
      html += '<label class="interruttore"><input type="checkbox" data-azione="suono-midi"' + (suonoMidi ? ' checked' : '') + '>Suono dal computer</label>';
    }
    return html;
  }

  function disegnaStrumenti() {
    const st = YG.ingressi.stato();
    for (const [id, breve] of [['strumenti-scegli', false], ['strumenti-suona', true]]) {
      const el = $(id);
      if (!el) continue;
      const fuoco = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.azione : null;
      el.innerHTML = htmlStrumenti(st, breve);
      if (fuoco) { const x = el.querySelector('[data-azione="' + fuoco + '"]'); if (x) x.focus(); }
    }
  }

  function collegaStrumenti(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-azione="midi"]');
      if (!b) return;
      YG.suono.sblocca();
      YG.ingressi.attivaMidi();
    });
    el.addEventListener('change', (e) => {
      const c = e.target.closest('[data-azione="suono-midi"]');
      if (!c) return;
      suonoMidi = !!c.checked;
      memoria.scrivi('suonoMidi', suonoMidi ? '1' : '0');
      disegnaStrumenti();
    });
  }

  // ---------- tema ----------
  function temaAttuale() {
    const a = document.documentElement.getAttribute('data-tema');
    if (a === 'light' || a === 'dark') return a;
    return G.matchMedia && G.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function coloreTesta() {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', temaAttuale() === 'light' ? '#FAF7F0' : '#12141C');
  }

  // ---------- indirizzo: #/suona/<id> apre una canzone (anche da un link) ----------
  function leggiIndirizzo() {
    const m = /^#\/suona\/([a-z0-9-]+)$/.exec(G.location.hash || '');
    if (m && L.canzone(m[1]) && branoDi(m[1])) apriSuona(m[1]);
    else { daScegli = false; mostraScegli(); }
  }

  // ---------- avvio ----------
  function avvia() {
    $('btn-indietro').addEventListener('click', tornaAScegli);
    $('btn-ancora').addEventListener('click', () => { YG.suono.sblocca(); if (attuale) apriSuona(attuale.canzone.id); });
    $('btn-altro').addEventListener('click', tornaAScegli);
    $('btn-tema').addEventListener('click', () => {
      const nuovo = temaAttuale() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-tema', nuovo);
      memoria.scrivi('tema', nuovo);
      coloreTesta();
    });
    collegaStrumenti($('strumenti-scegli'));
    collegaStrumenti($('strumenti-suona'));
    coloreTesta();
    // il primo gesto sblocca il suono (anche su iPhone e iPad, dove conta il dito che si alza)
    for (const tipo of ['pointerup', 'touchend', 'keydown', 'click']) G.addEventListener(tipo, () => YG.suono.sblocca(), { capture: true, passive: true });
    G.addEventListener('hashchange', leggiIndirizzo);
    G.addEventListener('resize', () => { if (attuale) { misura(); sveglia(); } });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (attuale) { misura(); sveglia(); } }).observe($('corsie'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { pausa = true; YG.suono.silenzio('sin:'); }
      else { pausa = false; ultimoFotogramma = performance.now(); sveglia(); }
    });
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
        navigator.keyboard.getLayoutMap().then((m) => {
          disposizione = m;
          if (attuale) for (const col of attuale.colonna.values()) rinominaLettera(col);
        }).catch(() => {});
      }
    } catch (e) { /* niente disposizione: si usano le lettere italiane */ }
    YG.ingressi.avviaPonte();
    disegnaStrumenti();
    leggiIndirizzo();
  }

  // la lettera sul tasto, quando il browser dice com'è fatta davvero la tastiera del computer
  function rinominaLettera(col) {
    if (!col.codice) return;
    col.lettera = letteraDi(col.codice);
    const k = col.tasto.querySelector('.tasto-lettera');
    if (k) k.textContent = col.lettera;
    col.tasto.setAttribute('aria-label', L.nomeIntero(col.et) + ', lettera ' + col.lettera);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
