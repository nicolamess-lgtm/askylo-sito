/* Yavier — /account/: i tuoi prodotti (yavier_miei_diritti), i Mac collegati con «Scollega»
   (yavier_miei_dispositivi, yavier_scollega_dispositivo), il catalogo con «Acquista»
   (Edge Function yavier-pagamenti, azione checkout) ed «Esci».
   ?compra=<prodotto> arriva dall'app o dalla vetrina: mette in evidenza quel prodotto.
   ?annullato=1 è il ritorno da Stripe quando il pagamento si annulla.
   Testi del server sempre come testo (SITO.el), mai come HTML. */
(function () {
  "use strict";
  var C = window.CLOUD, S = window.SITO, el = S.el;
  function $(id) { return document.getElementById(id); }
  var msg = $("messaggio");                                    // in cima: annullato, errori generali
  var esitoMac = $("esitoMac"), esitoCatalogo = $("esitoCatalogo");   // accanto ai pulsanti
  var q = new URLSearchParams(location.search);
  var ID = /^[a-z][a-z0-9_]{0,39}$/;
  var compra = String(q.get("compra") || "").trim().toLowerCase();
  if (!ID.test(compra)) compra = "";
  var annullato = q.get("annullato") === "1";
  var MAX_MAC = 3;

  var CATALOGO = [], CATALOGO_OK = false, DIRITTI = null;

  if (!C.configurato()) { $("nonAttivo").hidden = false; return; }
  if (!C.entrato()) { S.vaiAdAccedi(); return; }
  $("tutto").hidden = false;
  $("email").textContent = C.email() || "il tuo account";
  if (annullato) S.messaggio(msg, "Pagamento annullato: non ti è stato addebitato niente.", "");

  // la sessione non vale più: si rientra, e poi si torna qui
  function sessioneFinita(e) {
    if (e && e.sessioneMorta) { S.vaiAdAccedi(); return true; }
    return false;
  }
  // un esito accanto ai pulsanti, portato in vista se è uscito dallo schermo
  function esito(riquadro, righe, tipo) {
    S.messaggio(riquadro, righe, tipo);
    if (righe && riquadro.scrollIntoView) riquadro.scrollIntoView({ block: "nearest" });
  }
  function vuoto(ul, testo) { ul.textContent = ""; ul.appendChild(el("li", { classe: "vuoto", testo: testo })); }
  function prodotto(id) { return window.YAVIER_PRODOTTO(id, CATALOGO) || { id: id, nome: id, icona: "🎹", breve: "", comprende: [] }; }
  function espansi() { return DIRITTI && Array.isArray(DIRITTI.espansi) ? DIRITTI.espansi : []; }
  function voce(icona, nome, dati, classe, azione) {
    return el("li", { classe: "voce-elenco" + (classe ? " " + classe : "") }, [
      el("span", { classe: "icona", "aria-hidden": "true", testo: icona }),
      el("span", { classe: "testo" }, [el("span", { classe: "nome", testo: nome }), dati ? el("span", { classe: "dati", testo: dati }) : null]),
      azione || null
    ]);
  }
  function erroreLettura(ul, e) {
    if (sessioneFinita(e)) return;
    vuoto(ul, e && e.codice === "non_pronto" ? "Questa parte dell'account non è ancora pronta sul server." : "Non riesco a leggerli adesso. Ricarica la pagina tra poco.");
  }

  // ---------------- i tuoi prodotti ----------------
  // le sole origini che il database conosce (yavier.diritti, colonna origine)
  var ORIGINI = { acquisto: "acquistato", abbonamento: "in abbonamento", manuale: "concesso" };
  function disegnaProdotti() {
    var ul = $("elencoProdotti");
    ul.textContent = "";
    ul.appendChild(voce("🎮", "Game", "Gratis, sempre attivo, anche senza account."));
    var dettaglio = Array.isArray(DIRITTI.dettaglio) ? DIRITTI.dettaglio : [];
    var miei = Array.isArray(DIRITTI.prodotti) ? DIRITTI.prodotti : [];
    // un prodotto comprato più volte si mostra una volta: dal primo inizio all'ultima fine (null = senza fine)
    var visti = {}, ordine = [];
    dettaglio.forEach(function (d) {
      if (!d || typeof d.prodotto !== "string" || !ID.test(d.prodotto) || d.prodotto === "game") return;
      var v = visti[d.prodotto];
      if (!v) { v = visti[d.prodotto] = { dal: d.dal, al: d.al, origine: d.origine }; ordine.push(d.prodotto); return; }
      if (d.dal && (!v.dal || d.dal < v.dal)) v.dal = d.dal;
      if (v.al && (!d.al || d.al > v.al)) v.al = d.al || null;
    });
    miei.forEach(function (id) { if (ID.test(id) && id !== "game" && !visti[id]) { visti[id] = {}; ordine.push(id); } });
    ordine.forEach(function (id) {
      var p = prodotto(id), v = visti[id], parti = [];
      if (ORIGINI[v.origine]) parti.push(ORIGINI[v.origine].charAt(0).toUpperCase() + ORIGINI[v.origine].slice(1));
      if (S.data(v.dal)) parti.push("dal " + S.data(v.dal));
      parti.push(v.al ? "fino al " + S.data(v.al) : "senza scadenza");
      var li = voce(p.icona, p.nome, parti.join(" · "));
      li.id = "mio-" + id;
      ul.appendChild(li);
    });
    // quelli compresi in un prodotto più grande (Impara e Ascolto dentro Pro…)
    espansi().forEach(function (id) {
      if (!ID.test(id) || id === "game" || visti[id]) return;
      var dentro = ordine.filter(function (m) { return (prodotto(m).comprende || []).indexOf(id) >= 0; }).map(function (m) { return prodotto(m).nome; });
      ul.appendChild(voce(prodotto(id).icona, prodotto(id).nome, dentro.length ? "Compreso in " + dentro.join(" e ") : "Compreso", "compreso"));
    });
    if (!ordine.length) ul.appendChild(el("li", { classe: "vuoto", testo: "Per ora hai il Game. Qui sotto trovi quello che puoi aggiungere." }));
  }

  // ---------------- i tuoi Mac ----------------
  function disegnaMac(lista) {
    var ul = $("elencoMac"), via = $("elencoScollegati");
    lista = Array.isArray(lista) ? lista.filter(function (d) { return d && typeof d.id === "string"; }) : [];
    var attivi = lista.filter(function (d) { return !d.revocato_il; });
    var scollegati = lista.filter(function (d) { return !!d.revocato_il; });
    $("contaMac").textContent = attivi.length + " di " + MAX_MAC;
    ul.textContent = "";
    if (!attivi.length) ul.appendChild(el("li", { classe: "vuoto", testo: "Nessun Mac collegato per ora." }));
    attivi.forEach(function (d) {
      var nome = String(d.nome || "").trim() || "Mac senza nome";
      var parti = [S.data(d.creato_il) ? "Collegato il " + S.data(d.creato_il) : "Collegato"];
      if (S.data(d.ultimo_rinnovo)) parti.push("ultima licenza il " + S.data(d.ultimo_rinnovo));
      var b = el("button", { classe: "pulsante pericolo piccolo", type: "button", testo: "Scollega", "aria-label": "Scollega " + nome });
      b.addEventListener("click", function () { chiediScollega(d.id, nome, b); });
      ul.appendChild(voce("💻", nome, parti.join(" · "), "", b));
    });
    via.textContent = "";
    scollegati.forEach(function (d) {
      var nome = String(d.nome || "").trim() || "Mac senza nome";
      via.appendChild(voce("💤", nome, S.data(d.revocato_il) ? "Scollegato il " + S.data(d.revocato_il) : "Scollegato", "compreso"));
    });
    $("scollegati").hidden = !scollegati.length;
  }
  function caricaMac() {
    return C.rpc("yavier_miei_dispositivi", {}).then(disegnaMac, function (e) { $("contaMac").textContent = ""; erroreLettura($("elencoMac"), e); });
  }

  // «Scollega», con una domanda prima
  var daScollegare = null, finestra = $("finestraScollega");
  function chiediScollega(id, nome, bottone) {
    daScollegare = { id: id, nome: nome, bottone: bottone };
    // L'app scopre di essere scollegata quando chiede il rinnovo della licenza: all'apertura di
    // Yavier e poi ogni 6 ore mentre resta aperto (yavier/licenza.py, rinnovo_pronto). Un tentativo
    // andato a vuoto senza rete conta lo stesso: il prossimo è 6 ore dopo, non appena torna internet.
    var testo = "Il posto si libera subito. «" + nome + "» chiude le parti a pagamento al suo prossimo rinnovo della licenza: entro circa 6 ore se Yavi resta aperto e in rete, oppure appena Yavi si riapre con internet. Se resta senza internet, al più tardi quando scade la sua licenza (al massimo 30 giorni). Potrai ricollegarlo quando vuoi.";
    $("testoScollega").textContent = testo;
    if (finestra && typeof finestra.showModal === "function") finestra.showModal();
    else if (window.confirm("Scollegare questo Mac?\n\n" + testo)) scollega();
  }
  $("btnAnnullaScollega").addEventListener("click", function () { finestra.close(); });
  $("btnConfermaScollega").addEventListener("click", function () { finestra.close(); scollega(); });
  function scollega() {
    var d = daScollegare;
    if (!d) return;
    daScollegare = null;
    d.bottone.disabled = true;
    esito(esitoMac, "Scollego «" + d.nome + "»…", "attesa");
    C.rpc("yavier_scollega_dispositivo", { p_id: d.id }).then(function (r) {
      if (!r || r.ok !== true) throw new Error("Il server non ha confermato.");
      esito(esitoMac, "«" + d.nome + "» è scollegato.", "ok");
      return caricaMac();
    }).catch(function (e) {
      if (sessioneFinita(e)) return;
      d.bottone.disabled = false;
      esito(esitoMac, ["Non sono riuscito a scollegare il Mac.", e.message], "errore");
    });
  }

  // ---------------- il catalogo e «Acquista» ----------------
  var ERRORI_PAGAMENTO = {
    prezzo_da_decidere: "Il prezzo di questo prodotto non è ancora deciso: sarà presto disponibile.",
    gia_tuo: "Questo prodotto è già tuo: non serve comprarlo di nuovo.",
    non_acquistabile: "Questo prodotto non si può acquistare da solo.",
    stripe_non_configurato: "I pagamenti non sono ancora attivi. Riprova tra qualche giorno.",
    rete: "Non riesco a raggiungere il server. Controlla la connessione e riprova.",
    troppi: "Troppi tentativi: riprova tra qualche minuto.",
    non_pronto: "I pagamenti non sono ancora pronti sul server.",
    errore_stripe: "Il servizio dei pagamenti non risponde adesso. Riprova tra poco: non ti è stato addebitato niente."
  };
  function disegnaCatalogo() {
    var ul = $("elencoCatalogo");
    if (!CATALOGO_OK) { vuoto(ul, "Non riesco a leggere il catalogo adesso. Ricarica la pagina tra poco."); return; }
    ul.textContent = "";
    var tuoi = espansi(), quanti = 0;
    CATALOGO.forEach(function (v) {
      if (!v || typeof v.id !== "string" || !ID.test(v.id) || v.id === "game" || v.gratuito) return;
      var p = prodotto(v.id), tuo = tuoi.indexOf(p.id) >= 0;
      var prezzo = S.prezzo(p), tipo = S.tipoPrezzo(p);
      var riga = (p.breve ? p.breve + " " : "") + (tuo ? "" : prezzo ? prezzo + (tipo ? " " + tipo : "") + "." : "Prezzo in arrivo.");
      riga = riga.trim();
      var azione;
      if (tuo) azione = el("span", { classe: "pill verde", testo: "Già tuo" });
      else if (prezzo && p.acquistabile) {
        azione = el("button", { classe: "pulsante primo piccolo", type: "button", testo: "Acquista", "aria-label": "Acquista " + p.nome });
        azione.addEventListener("click", function () { acquista(p, azione); });
      } else azione = el("span", { classe: "pulsante secondo piccolo", "aria-disabled": "true", testo: prezzo ? "Non si acquista da solo" : "Presto disponibile" });
      var li = voce(p.icona, p.nome, riga, "", azione);
      li.id = "prodotto-" + p.id;
      ul.appendChild(li);
      quanti++;
    });
    if (!quanti) vuoto(ul, "Per ora non c'è niente da aggiungere.");
  }
  function acquista(p, bottone) {
    var prima = bottone.textContent;
    bottone.disabled = true;
    bottone.textContent = "Un attimo…";
    esito(esitoCatalogo, "Preparo il pagamento sicuro per " + p.nome + "…", "attesa");
    C.funzione("yavier-pagamenti", { azione: "checkout", prodotto: p.id }).then(function (r) {
      var url = r && typeof r.url === "string" ? r.url : "";
      // si va solo alla pagina di pagamento di Stripe (contratto §5), mai altrove
      if (!/^https:\/\/checkout\.stripe\.com\//.test(url)) { var e = new Error("Risposta inattesa dal server dei pagamenti."); e.codice = "risposta"; throw e; }
      esito(esitoCatalogo, "Ti porto alla pagina di pagamento…", "attesa");
      location.href = url;
    }).catch(function (e) {
      if (sessioneFinita(e)) return;
      bottone.disabled = false;
      bottone.textContent = prima;
      var testo = ERRORI_PAGAMENTO[e.codice] || "Il pagamento non è partito. Riprova tra poco.";
      esito(esitoCatalogo, testo, e.codice === "gia_tuo" ? "ok" : "errore");
      if (e.codice === "gia_tuo") caricaDiritti().then(disegnaCatalogo, function () {});
    });
  }

  // ---------------- ?compra=<prodotto> ----------------
  function gestisciCompra() {
    if (!compra) return;
    var avviso = $("avvisoCompra"), p = window.YAVIER_PRODOTTO(compra, CATALOGO);
    if (!p) { S.messaggio(avviso, "Non trovo il prodotto «" + compra + "». Scegli qui sotto quello che ti serve.", "errore"); return; }
    if (p.id === "game" || p.gratuito) {
      S.messaggio(avviso, [el("p", {}, [p.nome + " è gratis e non serve comprarlo: ", el("a", { href: "/yavi/gioco/", testo: "aprilo da qui" }), "."])], "ok");
      return;
    }
    if (espansi().indexOf(p.id) >= 0) { S.messaggio(avviso, p.nome + " è già tuo: lo trovi qui sopra, tra i tuoi prodotti.", "ok"); return; }
    var li = $("prodotto-" + p.id);
    if (S.prezzo(p) && p.acquistabile) S.messaggio(avviso, ["Hai scelto " + p.nome + ".", "Premi «Acquista»: ti porto alla pagina di pagamento sicura di Stripe."], "attesa");
    else S.messaggio(avviso, p.nome + " non è ancora in vendita: sarà presto disponibile.", "");
    if (li) {
      li.classList.add("evidenziato");
      if (li.scrollIntoView) li.scrollIntoView({ block: "center" });
      var b = li.querySelector("button");
      if (b) b.focus({ preventScroll: true });
    }
  }

  // ---------------- all'apertura ----------------
  function caricaDiritti() {
    return C.rpc("yavier_miei_diritti", {}).then(function (d) {
      DIRITTI = d && typeof d === "object" ? d : {};
      disegnaProdotti();
    }, function (e) { DIRITTI = null; erroreLettura($("elencoProdotti"), e); throw e; });
  }
  var catalogo = C.rpc("yavier_catalogo", {}, true).then(function (c) {
    CATALOGO = Array.isArray(c) ? c : [];
    CATALOGO_OK = Array.isArray(c);
  }, function () { CATALOGO_OK = false; });
  // i nomi dei prodotti vengono dal catalogo: prima lui, poi diritti e catalogo da comprare
  catalogo.then(function () {
    caricaMac();
    return caricaDiritti().then(function () { disegnaCatalogo(); gestisciCompra(); }, function () {
      if (CATALOGO_OK) vuoto($("elencoCatalogo"), "Prima devo leggere i tuoi prodotti: ricarica la pagina tra poco.");
    });
  });

  $("btnEsci").addEventListener("click", function () {
    this.disabled = true;
    C.esci().then(function () { location.replace("/"); });
  });
})();
