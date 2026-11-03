/* Yavier — sito: il piccolo client di Supabase che usano le pagine dell'account
   (accedi, account, collega, grazie) e i prezzi della vetrina. Solo fetch, nessuna libreria.
   La configurazione arriva da /config.js (window.YAVIER_CONFIG). Con i segnaposto ancora lì
   CLOUD.configurato() è falso e le pagine dicono con calma che l'account non è ancora attivo.

   Gli errori sono Error con:
   - codice: la parola del server («gia_tuo», «scaduto», «sessione», «rete», «troppi»…);
   - status: lo stato HTTP (0 = la richiesta non è arrivata al server);
   - sessioneMorta: vero se bisogna entrare di nuovo con email e password. */
(function () {
  "use strict";

  var CFG = window.YAVIER_CONFIG || {};
  var URL_BASE = String(CFG.supabase_url || "").replace(/\/+$/, "");
  var CHIAVE = String(CFG.chiave_pubblica || "");
  var LS_SESSIONE = "yavier-sito-sessione";   // la legge anche /sito.js, per il link «Account» in alto
  var TEMPO_MAX = 20000;                      // una richiesta senza risposta dopo 20 secondi è un errore di rete

  /* Configurato = la build ha messo indirizzo e chiave veri. Il segnaposto si riconosce da un suo
     pezzo (/INCOLLA-QUI/): la build sostituisce il segnaposto intero in ogni file, anche qui. */
  var CONFIGURATO = !/INCOLLA-QUI/.test(URL_BASE + CHIAVE) &&
    /^(https:\/\/[A-Za-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost))(:\d{1,5})?$/.test(URL_BASE) &&
    /^[A-Za-z0-9._-]{20,}$/.test(CHIAVE);
  // La chiave pubblica di una volta è un token JWT (tre pezzi): va anche in Authorization.
  // Quella nuova (sb_publishable_…) va solo in apikey.
  var CHIAVE_JWT = CHIAVE.split(".").length === 3;

  // ---------- la sessione, salvata in questo browser ----------
  function leggiSalvata() { try { return JSON.parse(localStorage.getItem(LS_SESSIONE) || "null"); } catch (e) { return null; } }
  var sess = leggiSalvata();
  function salva(s) {
    sess = s;
    try { s ? localStorage.setItem(LS_SESSIONE, JSON.stringify(s)) : localStorage.removeItem(LS_SESSIONE); } catch (e) {}
  }
  function adesso() { return Math.floor(Date.now() / 1000); }
  function scaduta(s) { return !s || !s.expires_at || s.expires_at - 60 < adesso(); }
  // l'utente di una sessione: user.id, o il «sub» del token
  function utenteDi(s) {
    if (!s) return "";
    if (s.user && s.user.id) return String(s.user.id).toLowerCase();
    try {
      var p = String(s.access_token || "").split(".")[1];
      return p ? String(JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).sub || "").toLowerCase() : "";
    } catch (e) { return ""; }
  }
  function conScadenza(d) { d.expires_at = Number(d.expires_at) || adesso() + (Number(d.expires_in) || 3600); return d; }

  // ---------- gli errori ----------
  function errore(messaggio, codice, status) { var e = new Error(messaggio); e.codice = codice || ""; e.status = status || 0; return e; }
  function diRete() { var e = errore("Non riesco a raggiungere il server. Controlla la connessione e riprova.", "rete", 0); e.rete = true; return e; }
  function sessioneMorta() { var e = errore("La sessione è scaduta: entra di nuovo.", "sessione", 401); e.sessioneMorta = true; return e; }
  function altroAccount() { var e = errore("Nel frattempo, in un'altra scheda, è entrato un altro account. Ricarica la pagina.", "altro_account", 401); e.sessioneMorta = true; return e; }
  function troppi() { return errore("Troppi tentativi: riprova tra qualche minuto.", "troppi", 429); }
  function nonAttivo() { return errore("L'account non è ancora attivo.", "non_configurato", 0); }
  var GOOGLE_SPENTO = "L'accesso con Google non è ancora acceso. Per ora entra con la tua email.";

  // i messaggi di Supabase Auth, in parole semplici
  function traduci(d) {
    var m = String((d && (d.msg || d.message || d.error_description || d.error || d.error_code)) || "");
    if (/invalid login|invalid_credentials/i.test(m)) return "Email o password non corretti.";
    if (/email not confirmed|email_not_confirmed/i.test(m)) return "Prima devi confermare l'email: apri il link che ti abbiamo mandato.";
    if (/already registered|already been registered|user_already_exists/i.test(m)) return "Questa email ha già un account: usa «Entra».";
    if (/password should be|weak_password|password.*(short|length)/i.test(m)) return "La password è troppo corta o troppo semplice: usane una più lunga.";
    if (/different from the old password|same_password/i.test(m)) return "La password nuova deve essere diversa da quella di prima.";
    if (/provider is not enabled|unsupported provider|provider_disabled/i.test(m)) return GOOGLE_SPENTO;
    if (/access_denied|user denied|user cancelled|cancel/i.test(m)) return "Accesso con Google annullato.";
    if (/expired|otp_expired|invalid.*(link|token)/i.test(m)) return "Il link è scaduto o è già stato usato: chiedine uno nuovo.";
    if (/signup.*disabled|signups not allowed/i.test(m)) return "Per ora non si possono creare account nuovi.";
    if (/invalid.*email|email.*invalid|validation_failed/i.test(m)) return "Questa email non sembra scritta giusta.";
    if (/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/i.test(m)) return "Troppi tentativi: riprova tra qualche minuto.";
    if (/refresh token|invalid grant/i.test(m)) return "La sessione è scaduta: entra di nuovo.";
    return "Qualcosa non è andato. Riprova tra poco.";
  }

  // ---------- la rete, con un tempo massimo ----------
  function conTempo(url, opzioni) {
    var o = {};
    Object.keys(opzioni || {}).forEach(function (k) { o[k] = opzioni[k]; });
    if (typeof AbortController !== "function") return fetch(url, o).then(null, function () { throw diRete(); });
    var ac = new AbortController();
    var t = setTimeout(function () { ac.abort(); }, TEMPO_MAX);
    o.signal = ac.signal;
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; }, function () { clearTimeout(t); throw diRete(); });
  }
  // il corpo della risposta: JSON se lo è, altrimenti {}
  function corpo(r) {
    return r.text().then(function (t) {
      if (!t) return {};
      try { return JSON.parse(t); } catch (e) { return { message: t.slice(0, 200) }; }
    }, function () { throw diRete(); });
  }
  function intestazioni(token, extra) {
    var h = { apikey: CHIAVE };
    if (token) h.Authorization = "Bearer " + token;
    else if (CHIAVE_JWT) h.Authorization = "Bearer " + CHIAVE;
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  /* Il rinnovo della sessione, uno alla volta.
     Supabase consuma il refresh token a ogni rinnovo: chi lo riusa riceve un errore. Con due schede
     aperte la prima rinnova e salva la sessione nuova in localStorage; la seconda la prende da lì
     invece di riprovare con il token vecchio. Dopo un «troppi tentativi» non si riprova per 5 minuti. */
  var RINNOVO = null, BLOCCO_FINO = 0;
  function rinnova() {
    if (RINNOVO) return RINNOVO;
    if (!sess || !sess.refresh_token) return Promise.reject(sessioneMorta());
    if (Date.now() < BLOCCO_FINO) return Promise.reject(troppi());
    var usato = sess.refresh_token, mia = sess;
    RINNOVO = conTempo(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: usato })
    }).then(function (r) {
      return corpo(r).then(function (d) {
        if (r.status === 429) { BLOCCO_FINO = Date.now() + 5 * 60000; throw troppi(); }
        if (r.ok && d && d.access_token) { salva(conScadenza(d)); return d; }
        // un'altra scheda può aver già rinnovato: vale la sua sessione, se è dello stesso account
        var dopo = leggiSalvata();
        if (dopo && dopo.refresh_token && dopo.refresh_token !== usato) {
          if (utenteDi(dopo) !== utenteDi(mia)) throw altroAccount();
          sess = dopo; return dopo;
        }
        if (r.status >= 400 && r.status < 500) { salva(null); throw sessioneMorta(); }
        throw errore(traduci(d), String(d.error_code || d.error || ""), r.status);
      });
    }).then(function (d) { RINNOVO = null; return d; }, function (e) { RINNOVO = null; throw e; });
    return RINNOVO;
  }
  // il token buono: l'ultimo salvato (un'altra scheda può averlo rinnovato), rinnovato se sta per scadere
  function token() {
    var salvata = leggiSalvata();
    if (!salvata || !salvata.access_token) { sess = null; return Promise.reject(sessioneMorta()); }   // uscito in un'altra scheda
    if (sess && utenteDi(sess) && utenteDi(salvata) && utenteDi(sess) !== utenteDi(salvata)) return Promise.reject(altroAccount());
    sess = salvata;
    if (!scaduta(sess)) return Promise.resolve(sess.access_token);
    return rinnova().then(function (s) { return s.access_token; });
  }

  /* Una chiamata al server. anonimo = con la sola chiave pubblica (il catalogo della vetrina).
     Con il token scaduto per il server (401) si rinnova e si riprova, una volta sola. */
  function chiama(percorso, opzioni, anonimo, giaRiprovato) {
    if (!CONFIGURATO) return Promise.reject(nonAttivo());
    return (anonimo ? Promise.resolve("") : token()).then(function (t) {
      var o = { method: opzioni.method || "GET", headers: intestazioni(t, opzioni.headers) };
      if (opzioni.body !== undefined) o.body = opzioni.body;
      return conTempo(URL_BASE + percorso, o).then(function (r) {
        if (r.status === 401 && t && !giaRiprovato) return rinnova().then(function () { return chiama(percorso, opzioni, false, true); });
        return corpo(r).then(function (d) {
          if (r.ok && !(d && typeof d === "object" && !Array.isArray(d) && d.errore)) return d;
          throw erroreDalServer(r.status, d);
        });
      });
    });
  }
  /* L'errore di una risposta: la parola «errore» delle nostre funzioni, o il codice di PostgREST.
     Il messaggio resta generico: ogni pagina sa dire meglio cosa vuol dire quel codice. */
  function erroreDalServer(status, d) {
    d = d && typeof d === "object" ? d : {};
    if (status === 429) return troppi();
    // 401 anche dopo il rinnovo (o {"errore":"non_autenticato"}): bisogna rientrare
    if (status === 401) return sessioneMorta();
    if (typeof d.errore === "string" && d.errore) return errore("Il server ha risposto: " + d.errore + ".", d.errore, status);
    var codice = String(d.code || d.error_code || "");
    if (status === 404 || codice === "PGRST202" || codice === "42883") return errore("Questa parte dell'account non è ancora pronta sul server.", "non_pronto", status);
    if (status === 403) return errore("Il server non permette questa operazione.", "vietato", status);
    return errore("Il server ha avuto un problema. Riprova tra poco.", codice || "server", status);
  }

  /* Il segno «l'accesso l'ho chiesto io, da questo browser».
     Quando questa pagina fa partire un accesso che torna con la sessione nell'indirizzo
     (registrazione con conferma per email, password dimenticata, Google) mette qui l'ora.
     Al ritorno, un #access_token=… con il segno ancora buono (circa 2 ore) entra da solo; senza
     segno la pagina chiede prima «Sei tu?». Così un link preparato da un altro, con dentro i token
     del SUO account, non ti fa entrare nel suo account senza che tu te ne accorga. Il segno vale
     una volta sola: si toglie appena arriva una risposta. */
  var LS_AVVIO = "yavier-sito-accesso-avviato";
  var AVVIO_MAX = 2 * 3600000;
  function segnaAvvio() { try { localStorage.setItem(LS_AVVIO, String(Date.now())); } catch (e) {} }
  function togliAvvio() { try { localStorage.removeItem(LS_AVVIO); } catch (e) {} }
  function avvioBuono() {
    var t = 0;
    try { t = Number(localStorage.getItem(LS_AVVIO)) || 0; } catch (e) {}
    var trascorso = Date.now() - t;
    return t > 0 && trascorso >= 0 && trascorso <= AVVIO_MAX;
  }
  if (!avvioBuono()) togliAvvio();   // un segno vecchio non serve più: via

  // l'indirizzo dove Supabase riporta dopo un link per email o dopo Google
  function conRitorno(percorso, ritorno) { return URL_BASE + percorso + (ritorno ? "?redirect_to=" + encodeURIComponent(ritorno) : ""); }
  function auth(percorso, dati, ritorno) {
    if (!CONFIGURATO) return Promise.reject(nonAttivo());
    if (ritorno) segnaAvvio();   // il link dell'email tornerà qui
    return conTempo(conRitorno(percorso, ritorno), {
      method: "POST", headers: { apikey: CHIAVE, "Content-Type": "application/json" }, body: JSON.stringify(dati)
    }).then(function (r) {
      return corpo(r).then(function (d) {
        if (r.status === 429) throw troppi();
        if (!r.ok) throw errore(traduci(d), String(d.error_code || d.code || d.error || ""), r.status);
        return d;
      });
    }).then(null, function (e) { if (ritorno) togliAvvio(); throw e; });
  }

  // i parametri di un frammento o di una query («a=1&b=2»)
  function parametri(testo) {
    var p = {};
    String(testo || "").split("&").forEach(function (x) {
      var i = x.indexOf("=");
      if (i > 0) { try { p[decodeURIComponent(x.slice(0, i))] = decodeURIComponent(x.slice(i + 1).replace(/\+/g, " ")); } catch (e) {} }
    });
    return p;
  }
  // l'email scritta dentro un token (il pezzo di mezzo), se c'è
  function emailDelToken(t) {
    try {
      var p = String(t || "").split(".")[1];
      return p ? String(JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).email || "") : "";
    } catch (e) { return ""; }
  }
  // le chiavi che Supabase mette nell'indirizzo al ritorno: si tolgono tutte, anche dalla query
  // (più «sb», che Supabase aggiunge ai ritorni con errore: si toglie, ma da sola non conta)
  var CHIAVI_RITORNO = ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type",
    "provider_token", "provider_refresh_token", "error", "error_code", "error_description"];
  var DA_TOGLIERE = CHIAVI_RITORNO.concat(["sb"]);

  /* Google è acceso nel progetto Supabase? Lo dice /auth/v1/settings (external.google).
     Con Google spento /auth/v1/authorize non torna al sito: risponde 400 con un testo tecnico
     («Unsupported provider: provider is not enabled») sulla pagina di Supabase, e la persona
     resterebbe lì senza capire. Così invece il messaggio esce qui, nella pagina.
     Senza rete: errore di rete. Una risposta strana non ferma niente: si va da Google lo stesso. */
  function googleAcceso() {
    return conTempo(URL_BASE + "/auth/v1/settings", { headers: intestazioni("") }).then(function (r) {
      return corpo(r).then(function (d) {
        if (r.ok && d && d.external && d.external.google === false) throw errore(GOOGLE_SPENTO, "google_spento", 0);
      });
    });
  }
  // la sessione arrivata con un link non chiesto da qui: aspetta il «Sì, entra» (confermaLink)
  var inSospeso = null;

  // ---------- interfaccia per le pagine ----------
  window.CLOUD = {
    configurato: function () { return CONFIGURATO; },
    // c'è una sessione salvata (anche con il token da rinnovare)
    entrato: function () { var s = leggiSalvata(); return !!(CONFIGURATO && s && s.access_token); },
    email: function () { var s = leggiSalvata(); return (s && s.user && s.user.email) || ""; },

    entra: function (email, password) {
      return auth("/auth/v1/token?grant_type=password", { email: email, password: password }).then(function (d) {
        if (!d.access_token) throw errore(traduci(d), "", 400);
        togliAvvio();   // entrato con la password: nessun link in arrivo da accettare senza domande
        salva(conScadenza(d)); return d;
      });
    },
    /* ritorno = dove porta il link di conferma dell'email. Se il progetto non chiede la conferma
       la sessione arriva subito: { entrato: true }; altrimenti { confermaRichiesta: true }. */
    registrati: function (email, password, ritorno) {
      return auth("/auth/v1/signup", { email: email, password: password }, ritorno).then(function (d) {
        if (d.access_token) { togliAvvio(); salva(conScadenza(d)); return { entrato: true }; }
        return { confermaRichiesta: true };
      });
    },
    // il link per una password nuova; la risposta è la stessa che l'email esista o no
    recupera: function (email, ritorno) {
      return auth("/auth/v1/recover", { email: email }, ritorno).then(function () { return true; });
    },
    /* Accesso con Google: si va alla pagina di Supabase, che passa da Google e torna a «ritorno»
       con la sessione nel frammento (#access_token=…), letta da sessioneDalLink().
       Prima si controlla che Google sia acceso (googleAcceso): se è spento la promessa finisce
       con l'errore «L'accesso con Google non è ancora acceso…» e la pagina resta dov'è. */
    google: function (ritorno) {
      if (!CONFIGURATO) return Promise.reject(nonAttivo());
      return googleAcceso().then(function () {
        segnaAvvio();
        location.href = URL_BASE + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(ritorno);
      });
    },
    /* La sessione arrivata nell'indirizzo: dopo Google, dal link di conferma dell'email o da quello
       della password dimenticata. Risponde:
       - null se non c'è niente;
       - { errore } se Supabase ha detto di no, o il token non vale;
       - { tipo: "recovery" | "signup" | …, email } se si è entrati: l'accesso era partito da qui;
       - { tipo, email, daConfermare: true } se l'accesso NON è partito da qui (o è passato troppo
         tempo): la sessione non è ancora salvata, la pagina chiede «Sei tu?» e poi chiama
         confermaLink() oppure rifiutaLink().
       I token si leggono solo dal frammento (#…), mai dalla query (?…). Frammento e chiavi di
       ritorno si tolgono dall'indirizzo in ogni caso: una ricarica non li rilegge e i token non
       restano nella cronologia. */
    sessioneDalLink: function () {
      var h = (location.hash || "").replace(/^#/, ""), q = (location.search || "").replace(/^\?/, "");
      var f = parametri(h), d = parametri(q);
      var nelFrammento = CHIAVI_RITORNO.some(function (k) { return k in f; });
      var nellIndirizzo = CHIAVI_RITORNO.some(function (k) { return k in d; });
      if (!nelFrammento && !nellIndirizzo) return Promise.resolve(null);
      var resta = new URLSearchParams(q);
      DA_TOGLIERE.forEach(function (k) { resta.delete(k); });
      try { history.replaceState(null, "", location.pathname + (resta.toString() ? "?" + resta.toString() : "")); } catch (e) {}
      inSospeso = null;
      var chiesto = avvioBuono();
      togliAvvio();   // il segno vale una volta
      var perche = f.error_description || f.error_code || f.error || d.error_description || d.error_code || d.error || "";
      if (!f.access_token) return Promise.resolve(perche ? { errore: traduci({ msg: perche }) } : null);
      if (!CONFIGURATO) return Promise.resolve({ errore: "L'account non è ancora attivo." });
      var s = conScadenza({ access_token: f.access_token, refresh_token: f.refresh_token || "", token_type: f.token_type || "bearer", expires_in: Number(f.expires_in) || 3600, expires_at: Number(f.expires_at) || 0 });
      // Il frammento non porta l'utente: si chiede, così si controlla anche che il token valga.
      // La sessione si salva solo dopo: un token sbagliato non tocca quella che c'era.
      return conTempo(URL_BASE + "/auth/v1/user", { headers: intestazioni(s.access_token) }).then(function (r) {
        return corpo(r).then(function (u) {
          if (!r.ok || !u || !u.id) return { errore: traduci(u) };
          s.user = u;
          var esito = { tipo: f.type || "", email: u.email || emailDelToken(s.access_token) };
          if (chiesto) { salva(s); return esito; }
          inSospeso = { s: s, esito: esito };
          return { tipo: esito.tipo, email: esito.email, daConfermare: true };
        });
      });
    },
    // «Sì, entra»: salva la sessione del link in attesa. { tipo, email }, oppure null se non c'è
    confermaLink: function () {
      var x = inSospeso;
      inSospeso = null;
      if (!x) return null;
      salva(x.s);
      return { tipo: x.esito.tipo, email: x.esito.email };
    },
    // «No, esci»: la sessione del link non si salva e si chiude anche sul server; quella che c'era resta
    rifiutaLink: function () {
      var x = inSospeso;
      inSospeso = null;
      if (!x) return Promise.resolve();
      return conTempo(URL_BASE + "/auth/v1/logout?scope=local", { method: "POST", headers: intestazioni(x.s.access_token) })
        .then(function () {}, function () {});
    },
    // la password nuova (dopo il link «password dimenticata», o per cambiarla)
    cambiaPassword: function (nuova) {
      return token().then(function (t) {
        return conTempo(URL_BASE + "/auth/v1/user", {
          method: "PUT", headers: intestazioni(t, { "Content-Type": "application/json" }), body: JSON.stringify({ password: nuova })
        }).then(function (r) {
          return corpo(r).then(function (u) {
            if (!r.ok) throw errore(traduci(u), String(u.error_code || u.code || ""), r.status);
            if (sess && u && u.id) { sess.user = u; salva(sess); }
            return true;
          });
        });
      });
    },
    // esce solo da questo browser; la sessione si toglie anche senza rete
    esci: function () {
      var s = leggiSalvata();
      var via = CONFIGURATO && s && s.access_token
        ? conTempo(URL_BASE + "/auth/v1/logout?scope=local", { method: "POST", headers: intestazioni(s.access_token) }).catch(function () {})
        : Promise.resolve();
      togliAvvio();
      return via.then(function () { salva(null); }, function () { salva(null); });
    },

    // una funzione public.yavier_* del database (contratto §5)
    rpc: function (nome, argomenti, anonimo) {
      return chiama("/rest/v1/rpc/" + encodeURIComponent(nome), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(argomenti || {})
      }, !!anonimo);
    },
    // una Edge Function con il token dell'utente (yavier-pagamenti)
    funzione: function (nome, dati) {
      return chiama("/functions/v1/" + encodeURIComponent(nome), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dati || {})
      }, false);
    }
  };
})();
