/* Yavier — /collega/?codice=ABCD-EFGH: il cliente approva il Mac che l'app sta collegando
   (contratto §4). Se non è dentro va prima ad /accedi/ e torna qui con lo stesso codice.
   Poi un nome facoltativo per il Mac e «Collega questo Mac» (RPC yavier_approva_collegamento). */
(function () {
  "use strict";
  var C = window.CLOUD, S = window.SITO, el = S.el;
  function $(id) { return document.getElementById(id); }
  var msg = $("messaggio");
  var q = new URLSearchParams(location.search);

  // il codice: 8 caratteri da questo alfabeto (niente I, O, 0 e 1, che si confondono), trattino in mezzo
  var ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function normalizza(c) {
    var s = String(c || "").toUpperCase().replace(/[\s-]/g, "");
    if (s.length !== 8) return "";
    for (var i = 0; i < s.length; i++) if (ALFABETO.indexOf(s.charAt(i)) < 0) return "";
    return s.slice(0, 4) + "-" + s.slice(4);
  }
  var scritto = q.get("codice");
  var codice = normalizza(scritto);

  function dici(righe, tipo) {
    S.messaggio(msg, righe, tipo);
    if (righe && msg.scrollIntoView) msg.scrollIntoView({ block: "nearest" });
  }
  function passo(quale) {
    ["passoCodice", "passoConferma", "passoFatto"].forEach(function (id) { $(id).hidden = id !== quale; });
  }
  function chiediCodice() {
    passo("passoCodice");
    $("campoCodice").value = codice || "";
    $("campoCodice").focus();
  }
  function mostraConferma() {
    $("mostraCodice").textContent = codice;
    $("email").textContent = C.email() || "quello con cui sei dentro";
    passo("passoConferma");
  }

  // ---------------- all'apertura ----------------
  if (!C.configurato()) { $("nonAttivo").hidden = false; return; }
  if (!C.entrato()) { S.vaiAdAccedi("/yavi/collega/" + (codice ? "?codice=" + codice : "")); return; }
  if (codice) mostraConferma();
  else {
    chiediCodice();
    if (scritto) dici("Il codice nell'indirizzo non sembra giusto: scrivilo qui, come lo vedi sul Mac.", "errore");
  }

  // ---------------- il codice scritto a mano ----------------
  $("formCodice").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var campo = $("campoCodice"), c = normalizza(campo.value);
    if (!c) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
      dici("Il codice ha 8 caratteri, lettere e numeri, per esempio ABCD-EFGH. Non ci sono mai la I, la O, lo 0 e l'1.", "errore");
      return;
    }
    campo.setAttribute("aria-invalid", "false");
    codice = c;
    try { history.replaceState(null, "", "/yavi/collega/?codice=" + codice); } catch (e) {}
    dici(null);
    mostraConferma();
    $("campoNome").focus();
  });
  $("btnAltroCodice").addEventListener("click", function () { dici(null); chiediCodice(); });

  // ---------------- «Collega questo Mac» ----------------
  var ESITI = {
    scaduto: "Questo codice è scaduto: vale 10 minuti. Sul Mac, in Yavi, premi di nuovo «Collega questo Mac» per averne uno nuovo: si riapre questa pagina.",
    // «sconosciuto» arriva anche per un codice solo scaduto: quelli mai approvati il sito li
    // cancella 15 minuti dopo che sono nati (contratto §4)
    sconosciuto: "Questo codice non c'è più o è sbagliato. Controlla di averlo scritto uguale a quello che vedi sul Mac. Un codice vale 10 minuti: se è passato più tempo, sul Mac, in Yavi, premi di nuovo «Collega questo Mac» per averne uno nuovo.",
    gia_usato: "Questo codice è già stato usato. Se il Mac non risulta collegato, sul Mac, in Yavi, premi di nuovo «Collega questo Mac» per averne uno nuovo."
  };
  $("formCollega").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var b = $("btnCollega");
    if (b.disabled) return;
    var nome = $("campoNome").value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    b.disabled = true;
    dici("Collego il Mac…", "attesa");
    C.rpc("yavier_approva_collegamento", { p_codice: codice, p_nome: nome || null }).then(function (r) {
      b.disabled = false;
      if (r && r.ok === true) {
        // il codice è usato: non resta nell'indirizzo, così una ricarica non ci riprova
        try { history.replaceState(null, "", "/yavi/collega/"); } catch (e) {}
        dici(null);
        passo("passoFatto");
        $("titoloFatto").focus();
        return;
      }
      var motivo = r && typeof r.motivo === "string" ? r.motivo : "";
      // «oggi»: non è il limite dei 3 Mac, ma quello dei Mac nuovi collegati in un giorno.
      // Scollegarne uno non servirebbe: si riprova domani.
      if (motivo === "troppi_dispositivi" && r.oggi === true) {
        dici("Oggi hai già collegato 10 Mac nuovi: per sicurezza riprova domani.", "errore");
        return;
      }
      if (motivo === "troppi_dispositivi") {
        dici([el("p", { testo: "Hai già 3 Mac collegati: è il massimo." }),
              el("p", {}, ["Scollegane uno dal ", el("a", { href: "/yavi/account/", target: "_blank", rel: "noopener", testo: "tuo account" }),
                           " (si apre in un'altra scheda), poi torna qui e premi di nuovo «Collega questo Mac»."])], "errore");
        return;
      }
      dici(ESITI[motivo] || "Il collegamento non è riuscito. Riprova tra poco.", "errore");
      if (motivo === "sconosciuto") chiediCodice();
    }, function (e) {
      b.disabled = false;
      if (e.sessioneMorta) { S.vaiAdAccedi("/yavi/collega/?codice=" + codice); return; }
      dici(e.codice === "non_pronto" ? "Il collegamento dei Mac non è ancora pronto sul server." : e.message, "errore");
    });
  });
})();
