/* Le pagine dei mestieri: tema, comparsa scorrendo, i passi col telefono che
   cambia schermata, i numeri che contano, «Chiedi» con le risposte preparate.
   Nessun server, nessun dato vero: le risposte sono scritte nella pagina. */
(function () {
  var h = document.documentElement;
  var ridotto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* il tema: come sulla landing (asky-theme), senza scelta segue il sistema */
  var tema = document.querySelector('[data-tema-btn]');
  function scuro() { var t = h.getAttribute('data-tema'); return t ? t === 'dark' : !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches); }
  function segno() { if (tema) tema.textContent = scuro() ? '☀' : '☾'; }
  if (tema) tema.addEventListener('click', function () { var p = scuro() ? 'light' : 'dark'; h.setAttribute('data-tema', p); try { localStorage.setItem('asky-theme', p); } catch (e) {} segno(); });
  segno();

  /* comparsa scorrendo */
  var sv = [].slice.call(document.querySelectorAll('.sv'));
  if ('IntersectionObserver' in window && !ridotto) {
    var io = new IntersectionObserver(function (v) { v.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    sv.forEach(function (e) { io.observe(e); });
  } else sv.forEach(function (e) { e.classList.add('in'); });

  /* i numeri che contano fino al loro valore, quando arrivano sullo schermo */
  var nn = [].slice.call(document.querySelectorAll('[data-conta]'));
  function conta(el) {
    var fine = +el.getAttribute('data-conta'), t0 = null, dur = 1100;
    if (ridotto) { el.firstChild.nodeValue = fine; return; }
    function f(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / dur); el.firstChild.nodeValue = Math.round(fine * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }
  if ('IntersectionObserver' in window) {
    var ic = new IntersectionObserver(function (v) { v.forEach(function (x) { if (x.isIntersecting) { conta(x.target); ic.unobserve(x.target); } }); }, { threshold: .4 });
    nn.forEach(function (e) { ic.observe(e); });
  } else nn.forEach(conta);

  /* i passi: ogni passo accende la sua schermata nel telefono accanto; da soli
     girano ogni 7 secondi finché la sezione è sullo schermo e nessuno tocca */
  [].slice.call(document.querySelectorAll('[data-passi]')).forEach(function (blocco) {
    var passi = [].slice.call(blocco.querySelectorAll('[data-passo]')), viste = [].slice.call(blocco.querySelectorAll('[data-vista]'));
    var k = 0, timer = null, toccato = false, visibile = false;
    /* in fondo allo schermo del telefono disegnato, la barra gialla che avanza fino alla schermata
       seguente e «2 / 6»: sul cellulare i passi stanno sotto, e senza si vedrebbero solo schermate che cambiano */
    var schermo = blocco.querySelector('.telefono .schermo'), avanza = null;
    if (schermo) {
      avanza = document.createElement('div'); avanza.className = 'avanza'; avanza.setAttribute('aria-hidden', 'true');
      avanza.innerHTML = '<span class="barra"><i></i></span><span class="quale"></span>';
      schermo.appendChild(avanza);
    }
    function vai(n) {
      k = (n + passi.length) % passi.length;
      passi.forEach(function (p, i) { p.classList.toggle('on', i === k); p.classList.remove('gira'); p.setAttribute('aria-pressed', i === k); });
      var id = passi[k].getAttribute('data-passo');
      viste.forEach(function (v) { v.classList.toggle('on', v.getAttribute('data-vista') === id); });
      if (avanza) { avanza.classList.remove('gira'); avanza.classList.toggle('fermo', toccato || ridotto); avanza.querySelector('.quale').textContent = (k + 1) + ' / ' + passi.length; }
      if (!toccato && !ridotto && visibile) { void passi[k].offsetWidth; passi[k].classList.add('gira'); if (avanza) avanza.classList.add('gira'); }
    }
    function giro() { clearInterval(timer); if (toccato || ridotto) return; timer = setInterval(function () { if (visibile) vai(k + 1); }, 7000); }
    passi.forEach(function (p, i) { p.addEventListener('click', function () {
      toccato = true; clearInterval(timer); vai(i);
      /* sul telefono il telefono disegnato sta sopra i passi: ci si torna, per vedere la schermata */
      var tel = blocco.querySelector('.telefono'); if (tel && innerWidth <= 900) tel.scrollIntoView({ behavior: ridotto ? 'auto' : 'smooth', block: 'center' });
    }); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (v) { visibile = v[0].isIntersecting; if (visibile) { vai(k); giro(); } else clearInterval(timer); }, { threshold: .35 }).observe(blocco);
    vai(0);
  });

  /* Chiedi: le domande d'esempio e una casella libera che cerca fra le parole delle risposte */
  [].slice.call(document.querySelectorAll('[data-chiedi]')).forEach(function (box) {
    var risposte = [].slice.call(box.querySelectorAll('template[data-r]')), dove = box.querySelector('.risposta');
    var bottoni = box.querySelector('.domande'), input = box.querySelector('input'), form = box.querySelector('form');
    risposte.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = t.getAttribute('data-r');
      b.addEventListener('click', function () { input.value = t.getAttribute('data-r'); mostra(t); });
      bottoni.appendChild(b); t._b = b;
    });
    function mostra(t, domanda) {
      risposte.forEach(function (x) { x._b.classList.toggle('on', x === t); });
      dove.innerHTML = '<div class="q">' + (domanda || t.getAttribute('data-r')).replace(/[<>&]/g, '') + '</div>';
      if (t) { dove.appendChild(t.content.cloneNode(true)); setTimeout(function () { [].slice.call(dove.querySelectorAll('.t i[data-w]')).forEach(function (i) { i.style.width = i.getAttribute('data-w'); }); }, 30); }
      else dove.insertAdjacentHTML('beforeend', '<p class="tenue">Qui rispondono le domande d’esempio, su un archivio inventato. Nel gestionale vero la domanda va al motore delle analisi, che la esegue sulla copia del tuo dispositivo: il modello non vede mai una riga dell’archivio.</p>');
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var q = input.value.trim().toLowerCase(); if (!q) return;
      var t = risposte.filter(function (x) { return (x.getAttribute('data-parole') || '').split(' ').some(function (p) { return p && q.indexOf(p) >= 0; }); })[0];
      mostra(t || null, input.value.trim());
    });
    if (risposte[0]) mostra(risposte[0]);
  });
})();

/* I link tracciati: con un link personale (?per=<codice>, dalla Modalità Dio di Askylo Studio, §68
   del suo AGENTS.md) la pagina carica per.js, che conta l'apertura, il tempo, fin dove si legge e cosa
   si tocca. Senza ?per= non carica nulla. Niente cookie, niente indirizzo IP. */
(function () {
  if (!/[?&]per=/.test(location.search)) return;
  var s = document.createElement('script');
  s.src = 'https://app.askylostudio.it/per.js'; s.async = true;
  document.head.appendChild(s);
})();
