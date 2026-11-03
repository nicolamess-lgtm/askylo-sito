/* Yavier — /accedi/: «Continua con Google» (in alto, un clic), entra, crea un account (l'email
   si scrive due volte), password dimenticata, e la password nuova quando si arriva dal link dell'email.
   Un link con la sessione (#access_token=…) che non è partito da questa pagina chiede prima
   «Stai per entrare come <email>. Sei tu?» (vedi il segno dell'accesso in /supabase.js).
   ?poi=<percorso> = dove tornare dopo (solo pagine di questo sito: SITO.percorsoSicuro).
   ?modo=registrati apre direttamente «Crea un account». */
(function () {
  "use strict";
  var C = window.CLOUD, S = window.SITO;
  function $(id) { return document.getElementById(id); }
  var msg = $("messaggio");
  var q = new URLSearchParams(location.search);
  var poi = S.percorsoSicuro(q.get("poi") || "") || "/yavi/account/";
  // dove riportano i link per email e Google: di nuovo qui, con lo stesso «poi»
  var ritorno = location.origin + "/yavi/accedi/?poi=" + encodeURIComponent(poi);

  function dici(righe, tipo) {
    S.messaggio(msg, righe, tipo);
    if (righe && msg.scrollIntoView) msg.scrollIntoView({ block: "nearest" });
  }
  function vai() { location.replace(poi); }

  // una frase sotto il titolo che dice perché si è qui
  if (/^\/account\/\?(.*&)?compra=/.test(poi)) $("sotto").textContent = "Entra o crea un account per continuare con l'acquisto.";
  else if (/^\/collega\//.test(poi)) $("sotto").textContent = "Entra o crea un account: poi colleghi il tuo Mac con un clic.";

  // ---------------- le tre schede: entra, crea, password dimenticata ----------------
  // Google (con la riga «oppure con la tua email») si vede in «Entra» e «Crea un account».
  var scheda = "";
  function mostra(v) {
    // la seconda email si riscrive ogni volta che si torna su «Crea un account»
    if (v !== scheda) { $("emailReg2").value = ""; $("emailReg2").setAttribute("aria-invalid", "false"); }
    scheda = v;
    $("formEntra").hidden = v !== "entra";
    $("formRegistrati").hidden = v !== "registrati";
    $("formRecupera").hidden = v !== "recupera";
    $("schedaEntra").setAttribute("aria-pressed", String(v === "entra"));
    $("schedaRegistrati").setAttribute("aria-pressed", String(v === "registrati"));
    $("schede").hidden = v === "recupera";
    $("bloccoGoogle").hidden = v === "recupera";
    $("titolo").textContent = v === "registrati" ? "Crea il tuo account" : "Entra in Askylo Yavi";
  }
  // l'email scritta in una scheda passa alle altre (non a «Scrivi di nuovo l'email»: quella si
  // scrive a mano, se no il controllo non servirebbe)
  var CAMPI_EMAIL = ["emailEntra", "emailReg", "emailRec"];
  function passaEmail(da) {
    var v = $(da).value;
    CAMPI_EMAIL.forEach(function (id) { if (id !== da) $(id).value = v; });
  }
  CAMPI_EMAIL.forEach(function (id) { $(id).addEventListener("change", function () { passaEmail(id); }); });
  $("schedaEntra").addEventListener("click", function () { mostra("entra"); dici(null); });
  $("schedaRegistrati").addEventListener("click", function () { mostra("registrati"); dici(null); });
  $("vaiRecupera").addEventListener("click", function () { mostra("recupera"); dici(null); $("emailRec").focus(); });
  $("tornaEntra").addEventListener("click", function () { mostra("entra"); dici(null); $("emailEntra").focus(); });

  Array.prototype.forEach.call(document.querySelectorAll("[data-mostra]"), function (c) {
    c.addEventListener("change", function () {
      c.getAttribute("data-mostra").split(" ").forEach(function (id) { $(id).type = c.checked ? "text" : "password"; });
    });
  });

  // ---------------- controlli prima di mandare ----------------
  function emailValida(e) { return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function segna(campo, sbagliato) {
    campo.setAttribute("aria-invalid", sbagliato ? "true" : "false");
    if (sbagliato) campo.focus();
    return sbagliato;
  }
  function controllaEmail(campo) {
    campo.value = campo.value.trim();
    if (segna(campo, !emailValida(campo.value))) { dici("Scrivi un'email valida, per esempio nome@esempio.it.", "errore"); return false; }
    return true;
  }
  // l'email come la tiene Supabase: senza spazi ai lati, tutta minuscola
  function pulita(e) { return String(e || "").trim().toLowerCase(); }
  // «Scrivi di nuovo l'email»: deve essere la stessa (gli spazi ai lati e le maiuscole non contano)
  function controllaSeconda(prima, seconda) {
    seconda.value = seconda.value.trim();
    if (segna(seconda, !seconda.value)) { dici("Scrivi di nuovo l'email anche nel secondo campo, per sicurezza.", "errore"); return false; }
    if (segna(seconda, pulita(seconda.value) !== pulita(prima.value))) { dici("Le due email non sono uguali: controlla di averle scritte bene.", "errore"); return false; }
    return true;
  }
  function controllaNuova(campo) {
    if (segna(campo, campo.value.length < 8)) { dici("La password deve avere almeno 8 caratteri.", "errore"); return false; }
    return true;
  }
  // durante l'invio il modulo non si tocca, così non parte due volte
  function occupato(form, si) {
    Array.prototype.forEach.call(form.querySelectorAll("button, input"), function (x) { x.disabled = si; });
  }

  // ---------------- entra ----------------
  $("formEntra").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this, pw = $("pwEntra");
    if (!controllaEmail($("emailEntra"))) return;
    if (segna(pw, !pw.value)) { dici("Scrivi la password.", "errore"); return; }
    passaEmail("emailEntra");
    occupato(f, true);
    dici("Entro…", "attesa");
    C.entra($("emailEntra").value, pw.value).then(function () {
      dici("Fatto, sei dentro.", "ok");
      vai();
    }, function (e) {
      occupato(f, false);
      dici(e.message, "errore");
      pw.focus();
    });
  });

  // ---------------- crea un account ----------------
  $("formRegistrati").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this, email = $("emailReg");
    // prima le due email (niente chiamata a Supabase se sono diverse), poi la password
    if (!controllaEmail(email) || !controllaSeconda(email, $("emailReg2")) || !controllaNuova($("pwReg"))) return;
    passaEmail("emailReg");
    var indirizzo = pulita(email.value);
    occupato(f, true);
    dici("Creo l'account…", "attesa");
    C.registrati(indirizzo, $("pwReg").value, ritorno).then(function (r) {
      if (r.entrato) { dici("Account creato: sei dentro.", "ok"); vai(); return; }
      occupato(f, false);
      $("pwReg").value = "";
      dici(["Ti abbiamo mandato un'email a " + indirizzo + ".",
            "Apri il link che trovi dentro per confermare l'account: tornerai qui, già dentro. Se non la vedi, guarda nella posta indesiderata."], "ok");
    }, function (e) {
      occupato(f, false);
      dici(e.message, "errore");
    });
  });

  // ---------------- password dimenticata ----------------
  $("formRecupera").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this, email = $("emailRec");
    if (!controllaEmail(email)) return;
    passaEmail("emailRec");
    occupato(f, true);
    dici("Mando il link…", "attesa");
    C.recupera(email.value, ritorno).then(function () {
      occupato(f, false);
      // la stessa frase che l'email abbia un account o no: nessuno scopre chi è registrato
      dici(["Se " + email.value + " ha un account, ti arriva un'email con il link per scegliere una password nuova.",
            "Se non la vedi, guarda nella posta indesiderata."], "ok");
    }, function (e) {
      occupato(f, false);
      dici(e.message, "errore");
    });
  });

  // ---------------- Google ----------------
  // Un clic: si controlla che Google sia acceso, poi si va. Se è spento (o manca la rete) il
  // messaggio esce qui e il pulsante torna premibile.
  var btnGoogle = $("btnGoogle");
  btnGoogle.addEventListener("click", function () {
    btnGoogle.disabled = true;
    dici("Ti porto da Google…", "attesa");
    C.google(ritorno).then(null, function (e) {
      btnGoogle.disabled = false;
      dici(e.message, "errore");
    });
  });
  // tornando indietro da Google con «Indietro» il browser può rimettere la pagina com'era:
  // il pulsante si riaccende e «Ti porto da Google…» sparisce
  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted && btnGoogle.disabled) { btnGoogle.disabled = false; dici(null); }
  });

  // ---------------- la password nuova (dal link dell'email) ----------------
  $("formNuova").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this, a = $("pwNuova"), b = $("pwNuova2");
    if (!controllaNuova(a)) return;
    if (segna(b, a.value !== b.value)) { dici("Le due password non sono uguali: riscrivile.", "errore"); return; }
    occupato(f, true);
    dici("Salvo la password…", "attesa");
    C.cambiaPassword(a.value).then(function () {
      f.hidden = true;
      $("nuovaFatta").hidden = false;
      $("btnDopoNuova").setAttribute("href", poi);
      dici("Password salvata. Da adesso entri con quella nuova.", "ok");
      $("btnDopoNuova").focus();
    }, function (e) {
      occupato(f, false);
      dici(e.message, "errore");
      if (e.sessioneMorta) { $("nuova").hidden = true; apriModuli("recupera"); }
    });
  });

  // ---------------- già dentro ----------------
  $("btnEsciDentro").addEventListener("click", function () {
    var b = this;
    b.disabled = true;
    C.esci().then(function () {
      $("giaDentro").hidden = true;
      apriModuli("entra");
      dici("Sei uscito. Ora puoi entrare con un altro account.", "ok");
      $("emailEntra").focus();
    });
  });

  function apriModuli(v) {
    $("moduli").hidden = false;
    mostra(v || (q.get("modo") === "registrati" ? "registrati" : "entra"));
  }
  function mostraGiaDentro() {
    $("emailDentro").textContent = C.email() || "che hai usato l'ultima volta";
    $("btnContinua").setAttribute("href", poi);
    $("giaDentro").hidden = false;
  }
  // si è entrati con un link: dal link della password dimenticata si sceglie la password nuova
  function dopoIlLink(r) {
    if (r.tipo === "recovery") {
      $("titolo").textContent = "Password nuova";
      $("sotto").hidden = true;
      $("nuova").hidden = false;
      $("pwNuova").focus();
      return;
    }
    dici("Fatto, sei dentro" + (r.email ? " come " + r.email : "") + ".", "ok");
    vai();
  }

  // ---------------- un link per entrare che non è partito da qui: «Sei tu?» ----------------
  // Un link con i token di un altro account farebbe entrare nel suo account (e quello che compri
  // andrebbe a lui): prima di entrare si mostra con che email, e decide la persona.
  function chiediSeSeiTu(r) {
    $("emailLink").textContent = r.email || "un account senza email";
    bloccaConferma(false);
    $("sotto").hidden = true;
    $("confermaLink").hidden = false;
    $("titoloConferma").focus();   // il titolo, non «Sì»: un Invio per sbaglio non fa entrare
  }
  function bloccaConferma(si) { $("btnSiEntra").disabled = si; $("btnNoEsci").disabled = si; }
  $("btnSiEntra").addEventListener("click", function () {
    bloccaConferma(true);
    var r = C.confermaLink();
    $("confermaLink").hidden = true;
    if (!r) { $("sotto").hidden = false; apriModuli(); dici("Il link non vale più: entra con email e password.", "errore"); return; }
    dopoIlLink(r);
  });
  $("btnNoEsci").addEventListener("click", function () {
    bloccaConferma(true);
    C.rifiutaLink().then(function () {
      $("confermaLink").hidden = true;
      $("sotto").hidden = false;
      if (C.entrato()) { mostraGiaDentro(); dici("Va bene: non sei entrato con quell'account.", "ok"); return; }
      apriModuli("entra");
      dici("Va bene: non sei entrato. Se vuoi, entra con il tuo account.", "ok");
    });
  });

  // ---------------- all'apertura ----------------
  if (!C.configurato()) {
    $("nonAttivo").hidden = false;
    $("sotto").hidden = true;
    return;
  }
  // Un link con la sessione aperto quando questa pagina è già aperta cambia solo il frammento (#…):
  // la pagina non si ricarica e il token resterebbe nell'indirizzo. Si ricarica, così il link passa
  // dal controllo di sempre (qui sotto) e il frammento si toglie.
  window.addEventListener("hashchange", function () {
    if (/(^#|&)(access_token|refresh_token|error|error_code|error_description)=/.test(location.hash)) location.reload();
  });
  C.sessioneDalLink().then(function (r) {
    if (r && r.errore) { apriModuli(); dici(r.errore, "errore"); return; }
    if (r && r.daConfermare) { chiediSeSeiTu(r); return; }
    if (r) { dopoIlLink(r); return; }
    if (C.entrato()) { mostraGiaDentro(); return; }
    apriModuli();
  }, function (e) {
    apriModuli();
    dici(e.message, "errore");
  });
})();
