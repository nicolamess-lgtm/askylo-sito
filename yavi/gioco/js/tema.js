// Yavier Game — il tema chiaro o scuro, prima di disegnare la pagina (niente lampo di colore).
// Scelta del Game in «yg1.tema» (light | dark); altrimenti quella di Yavier («yavier-tema», solo letta);
// altrimenti segue il sistema (prefers-color-scheme).
(function () {
  var t = null;
  try { t = localStorage.getItem('yg1.tema') || localStorage.getItem('yavier-tema'); } catch (e) { t = null; }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-tema', t);
})();
