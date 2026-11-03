// Tastiera di Yavier — base comune: eventi tra moduli e piccole utilità.
// Scritto dal capo progetto (contratto §5.0): si cambia solo d'accordo con tutti i gruppi.
// Gira anche in Node (test): niente DOM, niente localStorage.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const YT = (G.YT = G.YT || {});

  // ---------- eventi ----------
  const ascoltatori = new Map(); // nome → Set(fn)

  YT.on = function (nome, fn) {
    if (!ascoltatori.has(nome)) ascoltatori.set(nome, new Set());
    ascoltatori.get(nome).add(fn);
    return () => { const s = ascoltatori.get(nome); if (s) s.delete(fn); };
  };

  YT.once = function (nome, fn) {
    const off = YT.on(nome, (d) => { off(); fn(d); });
    return off;
  };

  YT.emit = function (nome, dati) {
    const s = ascoltatori.get(nome);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(dati); } catch (e) { console.error('[Tastiera] errore in un ascoltatore di «' + nome + '»:', e); }
    }
  };

  YT.avviso = function (testo, opzioni) {
    const o = opzioni || {};
    YT.emit('avviso', { testo: String(testo), tipo: o.tipo || 'info', durata_ms: o.durata_ms || 4000 });
  };

  // ---------- utilità ----------
  const NOMI_DIESIS = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const NOMI_BEMOLLI = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  const AME_DIESIS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const AME_BEMOLLI = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  // i nomi delle note in tutta Yavier (contratto comune: /api/impostazioni «nomi_note»)
  const SISTEMI_NOTE = ['italiano', 'americano', 'entrambi'];
  let sistemaNote = 'italiano';
  const due = (n) => String(n).padStart(2, '0');

  function giornoDa(data) { return data.getFullYear() + '-' + due(data.getMonth() + 1) + '-' + due(data.getDate()); }
  function dataDa(giorno) { const [a, m, g] = giorno.split('-').map(Number); return new Date(a, m - 1, g, 12); }

  YT.util = {
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),

    // 60 → 'Do' (o 'Do4' con ottava: true); Do4 è il Do centrale (= C4).
    // Segue il sistema scelto (YT.util.sistemaNote): 'italiano' Do Re Mi, 'americano' C D E,
    // 'entrambi' «Do · C». opzioni.sistema lo sceglie per una sola chiamata; con righe: true
    // torna un array di righe (['Do', 'C'] in «entrambi», per i tasti stretti).
    nomeNota(midi, opzioni) {
      const o = opzioni || {};
      const sistema = SISTEMI_NOTE.includes(o.sistema) ? o.sistema : sistemaNote;
      const k = ((midi % 12) + 12) % 12;
      const ott = o.ottava ? String(Math.floor(midi / 12) - 1) : '';
      const ita = (o.bemolli ? NOMI_BEMOLLI : NOMI_DIESIS)[k] + ott;
      const ame = (o.bemolli ? AME_BEMOLLI : AME_DIESIS)[k] + ott;
      const righe = sistema === 'americano' ? [ame] : sistema === 'entrambi' ? [ita, ame] : [ita];
      return o.righe ? righe : righe.join(' · ');
    },

    // legge o cambia il sistema dei nomi delle note ('italiano' | 'americano' | 'entrambi')
    sistemaNote(valore) {
      if (valore !== undefined && SISTEMI_NOTE.includes(valore) && valore !== sistemaNote) {
        sistemaNote = valore;
        YT.emit('nomi:cambiati', { sistema: valore });
      }
      return sistemaNote;
    },

    SISTEMI_NOTE: SISTEMI_NOTE.slice(),

    // una tonalità: (57, true) → 'La minore' · 'A minor' · 'La minore · A minor'
    nomeTonalita(midi, minore, opzioni) {
      const o = opzioni || {};
      const sistema = SISTEMI_NOTE.includes(o.sistema) ? o.sistema : sistemaNote;
      const [ita, ame] = YT.util.nomeNota(midi, { bemolli: o.bemolli, sistema: 'entrambi', righe: true });
      const i = ita + (minore ? ' minore' : ' maggiore'), a = ame + (minore ? ' minor' : ' major');
      return sistema === 'americano' ? a : sistema === 'entrambi' ? i + ' · ' + a : i;
    },

    oggi: (data) => giornoDa(data || new Date()),

    lunedi(giorno) {
      const d = dataDa(giorno);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return giornoDa(d);
    },

    piuGiorni(giorno, n) {
      const d = dataDa(giorno);
      d.setDate(d.getDate() + n);
      return giornoDa(d);
    },

    // FNV-1a a 32 bit, 8 cifre esadecimali
    impronta(byte) {
      let h = 0x811c9dc5;
      for (let i = 0; i < byte.length; i++) { h ^= byte[i]; h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(16).padStart(8, '0');
    },

    semplice: (testo) => String(testo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),

    copia: (oggetto) => (oggetto === undefined ? undefined : JSON.parse(JSON.stringify(oggetto))),
  };
})();
