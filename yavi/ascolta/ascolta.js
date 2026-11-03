/* Yavier — sito: «Yavi plays» nel browser. L'elenco dei brani inclusi, il rullo e la fila:
   finito un brano, dopo un respiro parte il successivo (come la playlist dell'app, in piccolo). */
(function () {
  "use strict";
  if (!window.YaviSuona || !window.YavierVirtuale) return;
  var T = function (id, it) { return window.YAVI_T ? window.YAVI_T(id, it) : it; };

  var BRANI = YaviSuona.brani().filter(function (b) { return b.id !== "scala-di-do" && b.id !== "zarathustra"; });
  var elenco = document.getElementById("elenco");
  var btn = document.getElementById("btnSuona");
  var titolo = document.getElementById("infoTitolo");
  var info = document.getElementById("infoStato");
  var barra = document.getElementById("barra");
  var chk = document.getElementById("chkUmano");
  var scelto = 0, inFila = true, prossimo = 0, fase = "fermo";

  var p = YaviSuona.crea({
    tela: document.getElementById("tela"), mostra: BRANI[0] && BRANI[0].id,
    stato: function (s) {
      var cambia = s.fase !== fase;
      fase = s.fase;
      barra.style.width = Math.round((s.avanzamento || 0) * 100) + "%";
      if (!cambia) return;
      scrivi();
      if (s.fase === "fermo" && inFila && BRANI.length) {
        clearTimeout(prossimo);
        prossimo = setTimeout(function () { suona((scelto + 1) % BRANI.length); }, 1500);
      }
    }
  });

  function scrivi() {
    var b = BRANI[scelto];
    titolo.textContent = b ? b.titolo : "—";
    if (fase === "carica") info.textContent = T("c.accordo", "accordo il pianoforte…");
    else if (fase === "suona") info.textContent = (b && b.compositore ? b.compositore + " · " : "") + (chk.checked ? T("a.umano", "Tocco umano") : T("a.piatto", "Piatto, come il file"));
    else info.textContent = T("a.scegli", "Tocca ▶ o un brano dell'elenco");
    btn.textContent = fase === "fermo" ? "▶" : "■";
    btn.setAttribute("aria-label", fase === "fermo" ? T("c.suona.az", "Suona") : T("c.ferma.az", "Ferma"));
    Array.prototype.forEach.call(elenco.querySelectorAll("button"), function (x, i) {
      x.setAttribute("aria-current", i === scelto ? "true" : "false");
    });
  }

  function suona(i) {
    clearTimeout(prossimo);
    scelto = i;
    inFila = true;
    p.suona(BRANI[i].id, { umano: chk.checked });
    clearTimeout(prossimo);   // il brano di prima, fermato qui, non deve chiamare il successivo
    scrivi();
  }

  BRANI.forEach(function (b, i) {
    var li = document.createElement("li");
    var x = document.createElement("button");
    x.type = "button";
    var num = document.createElement("span"); num.className = "num"; num.textContent = String(i + 1);
    var tit = document.createElement("span"); tit.className = "tit";
    var t1 = document.createElement("b"); t1.textContent = b.titolo;
    var t2 = document.createElement("span"); t2.textContent = b.compositore || "";
    tit.appendChild(t1); tit.appendChild(t2);
    x.appendChild(num); x.appendChild(tit);
    x.addEventListener("click", function () { suona(i); });
    li.appendChild(x);
    elenco.appendChild(li);
  });

  btn.addEventListener("click", function () {
    if (fase !== "fermo") { inFila = false; clearTimeout(prossimo); p.ferma(); return; }
    suona(scelto);
  });
  chk.addEventListener("change", function () { if (fase !== "fermo") suona(scelto); });
  document.addEventListener("yavi-lingua", scrivi);
  new MutationObserver(function () { p.ridisegna(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema", "class"] });
  scrivi();
})();
