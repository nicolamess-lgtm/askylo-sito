/* Yavier — sito: la pagina dei piani. Ogni mese / ogni anno (12 mesi al prezzo di 10) ed euro / dollari.
   I prezzi stanno nell'HTML (data-mese, data-anno): sono di prova (3/11/2026), li decide Nicola.
   Lo stesso numero in euro e in dollari, scritto come si usa nella lingua scelta (Intl). */
(function () {
  "use strict";
  var T = function (id, it) { return window.YAVI_T ? window.YAVI_T(id, it) : it; };
  var periodo = "mese", valuta = "eur";
  try { if (localStorage.getItem("yavi-valuta") === "usd") valuta = "usd"; } catch (e) {}

  function formato(n) {
    var lingua = window.YAVI_LINGUA ? window.YAVI_LINGUA() : "it";
    try {
      return new Intl.NumberFormat(lingua, { style: "currency", currency: valuta === "usd" ? "USD" : "EUR",
        minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
    } catch (e) { return valuta === "usd" ? "$" + n : n + " €"; }
  }

  function disegna() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-prezzo]"), function (el) {
      var fisso = el.hasAttribute("data-fisso");
      var n = Number(el.getAttribute(periodo === "anno" && !fisso ? "data-anno" : "data-mese"));
      el.textContent = n === 0 ? formato(0) : formato(n);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-unita]"), function (el) {
      el.textContent = periodo === "anno" ? T("p.allanno", "/ anno") : T("p.almese", "/ mese");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-periodo]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-periodo") === periodo ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-valuta]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-valuta") === valuta ? "true" : "false");
    });
    pulsantiPayPal();   // periodo, valuta e lingua cambiano il link
  }

  // ---------------- PayPal ----------------
  // Pagamento con i pulsanti «standard» di PayPal (un link, niente chiavi né codice di PayPal nella pagina):
  // Plus e Pro come abbonamento che si rinnova (ogni mese o ogni anno), «A vita» come pagamento unico.
  // Il piano NON si attiva da solo: Nicola riceve l'avviso di PayPal e lo attiva a mano (3/11/2026).
  // Con attivo: false i pulsanti tornano «Presto disponibile».
  var PAYPAL = { attivo: true, conto: "nutrylab@gmail.com" };
  var PIANI = {
    ypp: { nome: "Askylo Yavi You play+", mese: 4.99, anno: 39 },
    plus: { nome: "Askylo Yavi Plus", mese: 15, anno: 150 },
    pro: { nome: "Askylo Yavi Pro", mese: 30, anno: 300 },
    vita: { nome: "Askylo Yavi Pro a vita (fondatori)", unico: 493 }
  };
  function indirizzoPayPal(id) {
    var p = PIANI[id], qui = location.origin + location.pathname;
    var q = {
      business: PAYPAL.conto, item_name: p.nome, item_number: "yavi-" + id + (p.unico ? "" : "-" + periodo),
      currency_code: valuta === "usd" ? "USD" : "EUR", no_shipping: "1", charset: "utf-8",
      "return": qui + "?pagato=" + id, cancel_return: qui
    };
    // la lingua della pagina di PayPal (PayPal vuole il codice del paese; le lingue che non conosce: niente)
    var LC = { it: "IT", en: "US", fr: "FR", es: "ES", de: "DE", pl: "PL", ru: "RU", zh: "C2", ja: "JP", nl: "NL", da: "DK", sv: "SE" };
    var lc = LC[window.YAVI_LINGUA ? window.YAVI_LINGUA() : "it"];
    if (lc) q.lc = lc;
    if (p.unico) { q.cmd = "_xclick"; q.amount = String(p.unico); }
    else {
      q.cmd = "_xclick-subscriptions"; q.src = "1"; q.no_note = "1";
      q.a3 = String(periodo === "anno" ? p.anno : p.mese); q.p3 = "1"; q.t3 = periodo === "anno" ? "Y" : "M";
    }
    return "https://www.paypal.com/cgi-bin/webscr?" + Object.keys(q).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]);
    }).join("&");
  }
  function pulsantiPayPal() {
    if (!PAYPAL.attivo) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-compra]"), function (el) {
      var id = el.getAttribute("data-compra");
      var a = el;
      if (el.tagName !== "A") {
        a = document.createElement("a");
        a.className = el.className;
        a.setAttribute("data-compra", id);
        a.rel = "noopener";
        el.parentNode.replaceChild(a, el);
      }
      a.href = indirizzoPayPal(id);
      a.textContent = T("p.paga", "Paga con PayPal");
    });
  }
  if (/[?&]pagato=(ypp|plus|pro|vita)\b/.test(location.search)) {
    var g = document.getElementById("grazie"); if (g) g.hidden = false;
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-periodo]"), function (b) {
    b.addEventListener("click", function () { periodo = b.getAttribute("data-periodo"); disegna(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-valuta]"), function (b) {
    b.addEventListener("click", function () {
      valuta = b.getAttribute("data-valuta");
      try { localStorage.setItem("yavi-valuta", valuta); } catch (e) {}
      disegna();
    });
  });
  document.addEventListener("yavi-lingua", disegna);
  disegna();
})();
