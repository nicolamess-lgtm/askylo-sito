/* Yavier — sito: la landing. Il pianoforte dell'apertura («Ascolta un esempio») e il confronto
   «piatto contro umano». Un solo brano alla volta: chi parte ferma l'altro. */
(function () {
  "use strict";
  if (!window.YaviSuona || !window.YavierVirtuale) return;
  var T = function (id, it) { return window.YAVI_T ? window.YAVI_T(id, it) : it; };

  var ESEMPIO = "per-elisa";
  var btnEsempio = document.getElementById("btnEsempio");
  var stato = document.getElementById("demoStato");
  var barra = document.getElementById("demoBarra");
  var demo = YaviSuona.crea({
    tela: document.getElementById("telaDemo"), mostra: ESEMPIO,
    stato: function (s) {
      if (s.fase === "carica") stato.textContent = T("c.accordo", "accordo il pianoforte…");
      else if (s.fase === "suona") stato.textContent = T("c.suona", "suona");
      else stato.textContent = T("l.demo.pronto", "pronto");
      stato.classList.toggle("acceso", s.fase === "suona");
      barra.style.width = Math.round((s.avanzamento || 0) * 100) + "%";
      btnEsempio.textContent = s.fase === "fermo" ? T("l.invito.ascolta", "▶ Ascolta un esempio") : T("c.ferma", "■ Ferma");
    }
  });

  // il confronto
  var sel = document.getElementById("selBrano");
  var btnPiatto = document.getElementById("btnPiatto"), btnUmano = document.getElementById("btnUmano");
  var btnFerma = document.getElementById("btnFermaDiff");
  var BRANI = YaviSuona.brani().filter(function (b) { return b.id !== "scala-di-do" && b.id !== "zarathustra"; });
  BRANI.forEach(function (b) {
    var o = document.createElement("option");
    o.value = b.id; o.textContent = b.titolo + (b.compositore ? " · " + b.compositore : "");
    sel.appendChild(o);
  });
  if (BRANI.some(function (b) { return b.id === "inno-alla-gioia"; })) sel.value = "inno-alla-gioia";
  var diff = YaviSuona.crea({
    tela: document.getElementById("telaDiff"), mostra: sel.value,
    stato: function (s) {
      btnFerma.hidden = s.fase === "fermo";
      btnPiatto.classList.toggle("in-corso", s.fase !== "fermo" && modo === "piatto");
      btnUmano.classList.toggle("in-corso", s.fase !== "fermo" && modo === "umano");
    }
  });
  var modo = null;

  btnEsempio.addEventListener("click", function () {
    if (!demo.libero()) { demo.ferma(); return; }
    diff.ferma();
    demo.suona(ESEMPIO, { umano: true });
  });
  function confronta(m) {
    demo.ferma();
    modo = m;
    diff.suona(sel.value, { umano: m === "umano" });
  }
  btnPiatto.addEventListener("click", function () { confronta("piatto"); });
  btnUmano.addEventListener("click", function () { confronta("umano"); });
  btnFerma.addEventListener("click", function () { diff.ferma(); });
  sel.addEventListener("change", function () { diff.ferma(); });

  // il tema cambia i colori del rullo
  new MutationObserver(function () { demo.ridisegna(); diff.ridisegna(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema", "class"] });
  document.addEventListener("yavi-lingua", function () { if (demo.libero()) btnEsempio.textContent = T("l.invito.ascolta", "▶ Ascolta un esempio"); });
})();
