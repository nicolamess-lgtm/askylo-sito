/* Askylo Scriptorium — la pagina di presentazione (askylostudio.it/scriptorium/): le lingue.
   Le stesse 16 lingue di Askylo (askylo.com, askylostudio.it), con la stessa chiave del browser
   (asky-lang): chi ha scelto la lingua su Yavi o su askylo.com la ritrova qui. Copiato da yavi/lingue.js.
   L'italiano è nell'HTML (la pagina si legge anche senza JavaScript); le altre stanno in
   /lingue/<codice>.js, un dizionario { id: testo } caricato solo quando serve.
   Nell'HTML:  data-t="id"        → il contenuto dell'elemento (può contenere <em>, <b>)
               data-t-aria="id"   → l'aria-label
               data-t-title="id"  → il title
   Per gli script: window.SCRIPTORIUM_T(id, testoItaliano) e l'evento «scriptorium-lingua» su document.
   Un id senza traduzione resta in italiano.
   Il nome segue la lingua (5/11/2026): Scrivylo in italiano, Writylo nelle altre, anche dove il testo resta
   in italiano; [data-marchio] riceve il nome, [data-marchio-scritta] il nome con la «y» gialla. */
(function () {
  "use strict";
  var LINGUE = [
    ["it", "Italiano"], ["en", "English"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"],
    ["pl", "Polski"], ["ru", "Русский"], ["zh", "中文"], ["ja", "日本語"], ["ar", "العربية"],
    ["ro", "Română"], ["uk", "Українська"], ["nl", "Nederlands"], ["da", "Dansk"], ["sv", "Svenska"], ["sq", "Shqip"]
  ];
  var CODICI = LINGUE.map(function (l) { return l[0]; });
  var RTL = { ar: 1 };
  var CHIAVE = "asky-lang";
  window.LINGUE_SCRIPTORIUM = window.LINGUE_SCRIPTORIUM || {};

  // la cartella delle lingue: accanto a questo file (qui sotto /scriptorium/)
  var io = document.currentScript && document.currentScript.src;
  var BASE = io ? io.replace(/[^/]*$/, "") + "lingue/" : "/scriptorium/lingue/";

  var corrente = "it";
  var elementi = [], origine = [], attributi = [];
  var titolo0 = document.title;
  var meta = document.querySelector('meta[name="description"]');
  var desc0 = meta ? meta.getAttribute("content") : "";

  function marchio(cod) { return cod === "it" ? "Scrivylo" : "Writylo"; }
  function conMarchio(s) { return corrente === "it" || s == null ? s : String(s).replace(/Scrivylo/g, "Writylo"); }

  function dizionario(cod) { return cod === "it" ? {} : (window.LINGUE_SCRIPTORIUM[cod] || {}); }

  window.SCRIPTORIUM_T = function (id, italiano) {
    var v = dizionario(corrente)[id];
    return conMarchio(v != null ? v : italiano);
  };
  window.SCRIPTORIUM_LINGUA = function () { return corrente; };

  function raccogli() {
    elementi = Array.prototype.slice.call(document.querySelectorAll("[data-t]"));
    origine = elementi.map(function (e) { return e.innerHTML; });
    attributi = [];
    ["aria", "title"].forEach(function (tipo) {
      var nome = tipo === "aria" ? "aria-label" : "title";
      Array.prototype.forEach.call(document.querySelectorAll("[data-t-" + tipo + "]"), function (e) {
        attributi.push({ el: e, nome: nome, id: e.getAttribute("data-t-" + tipo), it: e.getAttribute(nome) || "" });
      });
    });
  }

  function applica(cod) {
    corrente = cod;
    var d = dizionario(cod);
    elementi.forEach(function (e, i) { var v = d[e.getAttribute("data-t")]; e.innerHTML = conMarchio(v != null ? v : origine[i]); });
    attributi.forEach(function (a) { var v = d[a.id]; a.el.setAttribute(a.nome, conMarchio(v != null ? v : a.it)); });
    var chiaveTitolo = document.body && document.body.getAttribute("data-t-pagina");
    document.title = conMarchio((chiaveTitolo && d[chiaveTitolo + ".meta.titolo"]) || titolo0);
    if (meta) meta.setAttribute("content", conMarchio((chiaveTitolo && d[chiaveTitolo + ".meta.desc"]) || desc0));
    var nome = marchio(cod), y = nome.indexOf("y");
    Array.prototype.forEach.call(document.querySelectorAll("[data-marchio]"), function (e) { e.textContent = nome; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-marchio-scritta]"), function (e) {
      e.innerHTML = nome.slice(0, y) + '<span class="y">y</span>' + nome.slice(y + 1);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".marchio[aria-label]"), function (e) { e.setAttribute("aria-label", "Askylo " + nome); });
    var h = document.documentElement;
    h.setAttribute("lang", cod);
    h.setAttribute("dir", RTL[cod] ? "rtl" : "ltr");
    Array.prototype.forEach.call(document.querySelectorAll("select.sel-lingua"), function (s) { s.value = cod; });
    try { document.dispatchEvent(new CustomEvent("scriptorium-lingua", { detail: cod })); } catch (e) {}
  }

  function carica(cod, fatto) {
    if (cod === "it" || window.LINGUE_SCRIPTORIUM[cod]) return fatto();
    var s = document.createElement("script");
    s.src = BASE + cod + ".js";
    s.onload = fatto;
    s.onerror = function () { fatto(); };   // dizionario non raggiunto: si resta in italiano
    document.head.appendChild(s);
  }

  function scegli(cod, ricorda) {
    carica(cod, function () {
      applica(cod === "it" || window.LINGUE_SCRIPTORIUM[cod] ? cod : "it");
      if (ricorda) { try { localStorage.setItem(CHIAVE, cod); } catch (e) {} }
    });
  }

  function iniziale() {
    var q = (location.search.match(/[?&]lingua=([a-z]{2})/) || [])[1];
    if (q && CODICI.indexOf(q) >= 0) return q;
    try { var m = localStorage.getItem(CHIAVE); if (m && CODICI.indexOf(m) >= 0) return m; } catch (e) {}
    var pref = navigator.languages || [navigator.language || "it"];
    for (var i = 0; i < pref.length; i++) {
      var c = String(pref[i]).toLowerCase().split("-")[0];
      if (CODICI.indexOf(c) >= 0) return c;
    }
    return "it";
  }

  function avvia() {
    raccogli();
    Array.prototype.forEach.call(document.querySelectorAll("select.sel-lingua"), function (sel) {
      LINGUE.forEach(function (l) {
        var o = document.createElement("option"); o.value = l[0]; o.textContent = l[1]; sel.appendChild(o);
      });
      sel.addEventListener("change", function () { scegli(sel.value, true); });
    });
    scegli(iniziale(), false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia);
  else avvia();
})();
