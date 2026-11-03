/* Yavier — /grazie/: il ritorno da Stripe dopo il pagamento.
   Con ?prodotto=<id> e l'account aperto in questo browser guarda per qualche secondo
   se il prodotto è già arrivato nell'account (lo scrive il webhook dei pagamenti). */
(function () {
  "use strict";
  var C = window.CLOUD, S = window.SITO;
  var msg = document.getElementById("messaggio");
  var id = String(new URLSearchParams(location.search).get("prodotto") || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(id) || !C.configurato() || !C.entrato()) return;
  var p = window.YAVIER_PRODOTTO(id, []);
  var nome = p ? p.nome : id;
  var tentativi = 0, MASSIMO = 8, ATTESA = 4000;

  S.messaggio(msg, "Controllo il tuo account…", "attesa");
  function guarda() {
    C.rpc("yavier_miei_diritti", {}).then(function (d) {
      var espansi = d && Array.isArray(d.espansi) ? d.espansi : [];
      if (espansi.indexOf(id) >= 0) { S.messaggio(msg, nome + " è attivo nel tuo account.", "ok"); return; }
      if (++tentativi < MASSIMO) { setTimeout(guarda, ATTESA); return; }
      S.messaggio(msg, ["Il pagamento è arrivato, ma " + nome + " non compare ancora nell'account.", "Di solito basta un minuto: guarda tra poco nel tuo account."], "");
    }, function (e) {
      S.messaggio(msg, e && e.sessioneMorta ? "Entra nel tuo account per vedere il prodotto." : "Non riesco a controllare adesso: guarda tra poco nel tuo account.", "");
    });
  }
  guarda();
})();
