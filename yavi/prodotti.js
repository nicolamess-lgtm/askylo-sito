/* Yavier — sito: come si presentano i prodotti (contratto §2). Nomi e «comprende» sono quelli del
   contratto; icone e frasi sono del sito. I PREZZI NON STANNO QUI: arrivano da yavier_catalogo(),
   e senza prezzo il sito dice «Prezzo in arrivo» e «Presto disponibile». */
(function () {
  "use strict";
  window.YAVIER_PRODOTTI = [
    { id: "game", nome: "Gratis", icona: "🎹", gratuito: true, comprende: [],
      breve: "You play e Yavi plays: suoni tu con le note che scendono, o il pianoforte suona per te. Fino a 20 brani tuoi. Senza account." },
    { id: "youplay_plus", nome: "You play+", icona: "🎮", comprende: [],
      breve: "Brani tuoi senza limiti in You play, con i progressi e le stelle salvati." },
    { id: "ascolto", nome: "Ascolto", icona: "🎧", comprende: [],
      breve: "Il Disklavier suona per te, con il tocco di un pianista. E nella Libreria i tuoi preferiti e le tue playlist." },
    { id: "impara", nome: "Plus", icona: "🎓", comprende: ["ascolto"],
      breve: "Libreria, Archivio, Tastiera, Canta e Regia, con fino a 200 brani tuoi." },
    { id: "pro", nome: "Pro", icona: "⭐", comprende: ["impara", "ascolto", "locali", "scriptorium_musica"],
      breve: "Tutto senza limiti: Accordi e testo, Palco, Spartito, Registra, Sottofondo e Askylo Scriptorium · Musica." },
    { id: "locali", nome: "Locali", icona: "🌙", comprende: ["ascolto"],
      breve: "Sottofondo per ore, a fasce orarie, per locali e centri benessere. Comprende Ascolto." },
    { id: "studio_insegnanti", nome: "Askylo Studio · Insegnanti di musica", icona: "🧑‍🏫", comprende: [], soloPro: true,
      breve: "Il gestionale per chi insegna: allievi, lezioni, compiti. Per ora è in anteprima: una demo con dati di esempio. Si usa con il livello Pro." },
    { id: "scriptorium_musica", nome: "Askylo Scriptorium · Musica", icona: "🎶", comprende: [], soloPro: true,
      breve: "Il quaderno del cantautore: testo, accordi, versioni e demo. Si usa con il livello Pro." }
  ];
  // il prodotto per id, unendo quello che sa il sito con quello che dice il catalogo del server
  window.YAVIER_PRODOTTO = function (id, catalogo) {
    var noto = null, dalServer = null;
    window.YAVIER_PRODOTTI.forEach(function (p) { if (p.id === id) noto = p; });
    (catalogo || []).forEach(function (p) { if (p && p.id === id) dalServer = p; });
    if (!noto && !dalServer) return null;
    var p = {};
    Object.keys(noto || {}).forEach(function (k) { p[k] = noto[k]; });
    p.id = id;
    p.nome = (noto && noto.nome) || String((dalServer && dalServer.nome) || id);
    p.icona = (noto && noto.icona) || "🎹";
    p.breve = (noto && noto.breve) || String((dalServer && dalServer.descrizione) || "");
    if (dalServer) {
      p.gratuito = !!dalServer.gratuito;
      p.acquistabile = !!dalServer.acquistabile;
      p.prezzo_cent = dalServer.prezzo_cent;
      p.valuta = dalServer.valuta;
      p.tipo = dalServer.tipo;
      if (Array.isArray(dalServer.comprende)) p.comprende = dalServer.comprende;
    }
    return p;
  };
})();
