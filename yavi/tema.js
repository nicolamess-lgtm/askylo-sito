/* Yavier — sito: il tema scelto (Carta o Sala) prima del primo disegno, così la pagina non lampeggia.
   Stessa chiave dell'app (yavier-tema: light | dark); senza scelta segue il sistema. Caricato senza defer. */
(function () {
  var p = null;
  try { p = localStorage.getItem("yavier-tema"); } catch (e) {}
  if (p === "light" || p === "dark") document.documentElement.setAttribute("data-tema", p);
})();
