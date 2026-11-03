/* Yavier — vetrina: i prezzi letti da yavier_catalogo() (contratto §5, eseguibile anche senza account).
   La pagina è già completa senza: ogni prodotto dice «Prezzo in arrivo» e «Presto disponibile».
   Qui si cambia solo quello che il catalogo sa davvero. Testi del server sempre come testo, mai HTML. */
(function () {
  "use strict";
  var C = window.CLOUD, S = window.SITO;
  if (!C || !S || !C.configurato()) return;   // anteprima: restano le frasi «in arrivo»

  function aggiorna(carta, p) {
    var prezzo = carta.querySelector("[data-prezzo]");
    var compra = carta.querySelector("[data-compra]");
    if (p.id === "game" || p.gratuito) return;        // il Game è già «Gratis» con «Gioca»
    var testo = S.prezzo(p), tipo = S.tipoPrezzo(p);
    if (prezzo) {
      prezzo.textContent = "";
      prezzo.classList.toggle("in-arrivo", !testo);
      if (testo) {
        prezzo.appendChild(document.createTextNode(testo + " "));
        if (tipo) prezzo.appendChild(S.el("span", { classe: "tipo", testo: tipo }));
      } else prezzo.textContent = "Prezzo in arrivo";
    }
    if (!compra) return;
    var nuovo;
    if (testo && p.acquistabile) nuovo = S.el("a", { classe: "pulsante primo", href: "/yavi/account/?compra=" + encodeURIComponent(p.id), "data-compra": true, testo: "Acquista" });
    else if (testo) nuovo = S.el("span", { classe: "pulsante secondo", "aria-disabled": "true", "data-compra": true, testo: "Non si acquista da solo" });
    else nuovo = S.el("span", { classe: "pulsante secondo", "aria-disabled": "true", "data-compra": true, testo: "Presto disponibile" });
    compra.parentNode.replaceChild(nuovo, compra);
  }

  // una carta per un prodotto che il sito non conosce ancora (aggiunto nel catalogo dopo)
  function nuovaCarta(p) {
    return S.el("article", { classe: "carta prezzo-carta", "data-prodotto": p.id }, [
      S.el("div", { classe: "prezzo-testa" }, [S.el("span", { classe: "prezzo-icona", "aria-hidden": "true", testo: p.icona }), S.el("h3", { testo: p.nome })]),
      S.el("p", { testo: p.breve }),
      S.el("p", { classe: "prezzo in-arrivo", "data-prezzo": true, testo: "Prezzo in arrivo" }),
      S.el("span", { classe: "pulsante secondo", "data-compra": true, "aria-disabled": "true", testo: "Presto disponibile" })
    ]);
  }

  C.rpc("yavier_catalogo", {}, true).then(function (catalogo) {
    if (!Array.isArray(catalogo)) return;
    var elenco = document.getElementById("elencoPrezzi"), qualcuno = false;
    catalogo.forEach(function (voce) {
      if (!voce || typeof voce.id !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(voce.id)) return;
      var p = window.YAVIER_PRODOTTO(voce.id, catalogo);
      var carta = elenco.querySelector('[data-prodotto="' + voce.id + '"]');
      if (!carta) { carta = nuovaCarta(p); elenco.appendChild(carta); }
      aggiorna(carta, p);
      if (!p.gratuito && S.prezzo(p)) qualcuno = true;
    });
    var nota = document.getElementById("notaPrezzi");
    if (nota && qualcuno) nota.textContent = "Paghi con carta su una pagina sicura di Stripe. Il prodotto si apre sui Mac collegati al tuo account.";
  }, function () { /* senza catalogo restano le frasi «in arrivo» */ });
})();
