/* Yavier — sito: le cose comuni a tutte le pagine.
   Tema Carta/Sala (stessa chiave dell'app), il link «Accedi» o «Account» in alto,
   e qualche aiuto per le pagine dell'account (window.SITO). Niente rete qui. */
(function () {
  "use strict";

  // ---------------- tema Carta / Sala ----------------
  function scrivi(chiave, valore) { try { localStorage.setItem(chiave, valore); } catch (e) { /* niente memoria: pazienza */ } }
  function temaEffettivo() {
    var t = document.documentElement.getAttribute("data-tema");
    if (t === "light" || t === "dark") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function aggiornaTema() {
    var t = temaEffettivo(), b = document.getElementById("btnTema");
    document.documentElement.classList.toggle("notte", t === "dark");
    if (b) {
      b.setAttribute("aria-label", t === "dark" ? "Passa al tema chiaro Carta" : "Passa al tema scuro Sala");
      b.title = t === "dark" ? "Tema: Sala (passa a Carta)" : "Tema: Carta (passa a Sala)";
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#12141C" : "#FAF7F0");
  }
  var btn = document.getElementById("btnTema");
  if (btn) btn.addEventListener("click", function () {
    var nuovo = temaEffettivo() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-tema", nuovo);
    scrivi("yavier-tema", nuovo);
    aggiornaTema();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    if (mq.addEventListener) mq.addEventListener("change", aggiornaTema);
  }
  aggiornaTema();

  // ---------------- «Accedi» o «Account» in alto ----------------
  // Basta sapere se in questo browser c'è una sessione salvata (la scrive /supabase.js).
  var dentro = false;
  try { dentro = !!localStorage.getItem("yavier-sito-sessione"); } catch (e) {}
  Array.prototype.forEach.call(document.querySelectorAll("[data-account]"), function (a) {
    if (!dentro) return;
    a.textContent = "Account";
    a.setAttribute("href", "/yavi/account/");
  });

  // ---------------- aiuti per le pagine dell'account ----------------
  /* Il percorso dove tornare dopo l'accesso (?poi=): solo pagine di questo sito.
     Niente indirizzi di altri siti («//altro.it», «https:…»), niente barre rovesciate,
     niente /accedi/ (si girerebbe in tondo). Vuoto se non va bene. */
  function percorsoSicuro(p) {
    if (typeof p !== "string" || !p || p.length > 400) return "";
    if (p.charAt(0) !== "/" || p.charAt(1) === "/" || /[\\\s\u0000-\u001f]/.test(p)) return "";
    var u;
    try { u = new URL(p, location.origin); } catch (e) { return ""; }
    if (u.origin !== location.origin) return "";
    // «/.//altro.it» o «/a/..//altro.it» diventano «//altro.it» quando si mettono in ordine i
    // punti: si ricontrolla il percorso già messo in ordine, che è quello dove si va davvero.
    if (u.pathname.charAt(1) === "/" || u.pathname.indexOf("\\") >= 0) return "";
    if (/^\/accedi(\/|$)/.test(u.pathname)) return "";
    return u.pathname + u.search + u.hash;
  }
  // porta alla pagina di accesso, che poi riporta qui
  function vaiAdAccedi(poi) {
    location.replace("/yavi/accedi/?poi=" + encodeURIComponent(percorsoSicuro(poi || (location.pathname + location.search)) || "/yavi/account/"));
  }
  // un elemento con figli e testi (mai HTML del server dentro le pagine)
  function el(tag, attributi, figli) {
    var e = document.createElement(tag);
    Object.keys(attributi || {}).forEach(function (k) {
      var v = attributi[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "testo") e.textContent = v;
      else if (k === "classe") e.className = v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    (figli || []).forEach(function (f) { if (f !== null && f !== undefined && f !== false) e.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return e;
  }
  /* Un messaggio nel riquadro di stato della pagina: tipo ok | errore | attesa | (vuoto) = informazione.
     righe = una frase o più frasi (array). Vuoto = nasconde il riquadro. */
  function messaggio(riquadro, righe, tipo) {
    if (!riquadro) return;
    riquadro.textContent = "";
    riquadro.className = "messaggio" + (tipo ? " " + tipo : "");
    if (!righe || (Array.isArray(righe) && !righe.length)) { riquadro.hidden = true; return; }
    (Array.isArray(righe) ? righe : [righe]).forEach(function (r) { riquadro.appendChild(typeof r === "string" ? el("p", { testo: r }) : r); });
    riquadro.hidden = false;
  }
  // 28 ottobre 2026
  function data(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try { return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  /* Il prezzo come si legge: «29,00 €» (il tipo, «al mese» e simili, lo dice tipoPrezzo).
     Come nel database: prezzo_cent null, o tipo null, = prezzo da decidere: torna "". */
  function prezzo(p) {
    if (!p || p.prezzo_cent === null || p.prezzo_cent === undefined || p.prezzo_cent === "" || !p.tipo) return "";
    var cent = Number(p.prezzo_cent);
    if (!isFinite(cent) || cent < 0) return "";
    var valuta = String(p.valuta || "eur").toUpperCase(), testo;
    try { testo = new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(cent / 100); }
    catch (e) { testo = (cent / 100).toFixed(2).replace(".", ",") + " " + valuta; }
    return testo;
  }
  function tipoPrezzo(p) {
    var t = String((p && p.tipo) || "").toLowerCase();
    if (/mes|mens|month/.test(t)) return "al mese";
    if (/ann|year/.test(t)) return "all'anno";
    if (/una|singol|tantum|sempre|once|one/.test(t)) return "una volta sola";
    return "";
  }

  window.SITO = { percorsoSicuro: percorsoSicuro, vaiAdAccedi: vaiAdAccedi, el: el, messaggio: messaggio, data: data, prezzo: prezzo, tipoPrezzo: tipoPrezzo };
})();
