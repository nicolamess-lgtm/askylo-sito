// Yavier Game — le figure delle schede (SVG in linea, disegnate per il Game) e le stelline.
// I colori vengono dai token Asky attraverso le classi f-* (riempimento) e t-* (tratto) di stile.css.
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const YG = (G.YG = G.YG || {});

  const apri = '<svg class="figura" viewBox="0 0 120 100" aria-hidden="true" focusable="false">';
  const FIGURE = {
    // una scala che sale, con una nota in cima
    scala: apri +
      '<rect class="f-tinta" x="8" y="88" width="104" height="4" rx="2"/>' +
      '<rect class="f-g" x="12" y="72" width="20" height="16" rx="5"/>' +
      '<rect class="f-p" x="34" y="60" width="20" height="28" rx="5"/>' +
      '<rect class="f-c" x="56" y="48" width="20" height="40" rx="5"/>' +
      '<rect class="f-g" x="78" y="36" width="20" height="52" rx="5"/>' +
      '<ellipse class="f-i" cx="89" cy="24" rx="7.5" ry="5.6" transform="rotate(-20 89 24)"/>' +
      '<path class="t-i" d="M95.5 22V5c5 1.5 8 5 8.5 11" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
    // la campana del mattino, che suona
    campana: apri +
      '<path class="t-c" d="M20 36c-5 8-5 16 0 24M100 36c5 8 5 16 0 24M11 30c-8 12-8 24 0 36M109 30c8 12 8 24 0 36" fill="none" stroke-width="3" stroke-linecap="round"/>' +
      '<rect class="f-i" x="55" y="6" width="10" height="10" rx="4"/>' +
      '<path class="f-g" d="M60 14c-15 0-24 12-24 28v16l-9 12h66l-9-12V42c0-16-9-28-24-28z"/>' +
      '<path class="f-luce" d="M47 30c3-6 7-9 12-10-6 4-8 10-9 18z"/>' +
      '<circle class="f-p" cx="60" cy="78" r="7"/>' +
      '</svg>',
    // la stellina che brilla
    stella: apri +
      '<polygon class="f-g" points="60 18 68.5 40.3 92.3 41.5 73.8 56.5 80 79.5 60 66.5 40 79.5 46.2 56.5 27.7 41.5 51.5 40.3" stroke-linejoin="round"/>' +
      '<path class="f-p" d="M22 16l2.2 5.8L30 24l-5.8 2.2L22 32l-2.2-5.8L14 24l5.8-2.2z"/>' +
      '<path class="f-c" d="M98 64l1.8 4.4 4.2 1.6-4.2 1.6L98 76l-1.8-4.4L92 70l4.2-1.6z"/>' +
      '<circle class="f-i" cx="100" cy="22" r="2.5"/><circle class="f-i" cx="18" cy="74" r="2"/>' +
      '</svg>',
    // il sole della gioia
    sole: apri +
      '<path class="t-g" d="M87 50h13M83.4 63.5l7.8 4.5M73.5 73.4l6.5 11.2M60 77v9M46.5 73.4L40 84.6M36.6 63.5l-7.8 4.5M33 50H20M36.6 36.5L28.8 32M46.5 26.6L40 15.4M60 23v-9M73.5 26.6L80 15.4M83.4 36.5l7.8-4.5" fill="none" stroke-width="5" stroke-linecap="round"/>' +
      '<circle class="f-c" cx="60" cy="50" r="21"/>' +
      '<circle class="f-g" cx="60" cy="50" r="15"/>' +
      '</svg>',
    // una balalaika, lo strumento delle feste di paese
    balalaika: apri +
      '<rect class="f-i" x="56.5" y="12" width="7" height="34" rx="2"/>' +
      '<path class="f-i" d="M54 4h12l-1.5 10h-9z"/>' +
      '<path class="f-p" d="M60 40L90 86c-18 7-42 7-60 0z" stroke-linejoin="round"/>' +
      '<circle class="f-tinta" cx="60" cy="68" r="6.5"/>' +
      '<path class="t-luce" d="M58 16v66M62 16v66" stroke-width="1" fill="none"/>' +
      '<rect class="f-g" x="50" y="78" width="20" height="4" rx="2"/>' +
      '</svg>',
    // la luna della piccola serenata notturna
    luna: apri +
      '<path class="f-g" d="M66 12a38 38 0 1 0 30 61A30 30 0 1 1 66 12z"/>' +
      '<path class="f-p" d="M94 18l1.8 4.6 4.6 1.8-4.6 1.8L94 31l-1.8-4.8-4.6-1.8 4.6-1.8z"/>' +
      '<circle class="f-c" cx="104" cy="46" r="3"/><circle class="f-i" cx="84" cy="44" r="2"/>' +
      '<path class="f-c" d="M18 20l1.4 3.6 3.6 1.4-3.6 1.4L18 30l-1.4-3.6-3.6-1.4 3.6-1.4z"/><circle class="f-p" cx="104" cy="84" r="2.5"/>' +
      '</svg>',
    // un tulipano, un dono per Elisa
    fiore: apri +
      '<path class="t-p" d="M60 52v40" fill="none" stroke-width="4" stroke-linecap="round"/>' +
      '<path class="f-p" d="M60 80c-4-12-14-18-26-18 2 12 12 20 26 18zM60 74c4-10 12-15 22-15-2 10-10 16-22 15z"/>' +
      '<path class="f-c" d="M40 22c2 20 8 30 20 32 12-2 18-12 20-32l-10 8-10-16-10 16z" stroke-linejoin="round"/>' +
      '<path class="f-luce" d="M46 32c1 8 4 13 9 16-6-1-9-7-9-16z"/>' +
      '</svg>',
  };

  // una stellina da 24×24: piena (presa) o vuota (ancora da prendere)
  function stellina(piena, classe) {
    return '<svg class="stellina ' + (piena ? 'piena' : 'vuota') + (classe ? ' ' + classe : '') +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.8l2.85 5.8 6.4.93-4.63 4.5 1.1 6.37L12 17.4l-5.72 3 1.1-6.37-4.63-4.5 6.4-.93z" stroke-linejoin="round"/></svg>';
  }

  function stelline(n, classe) {
    let s = '';
    for (let i = 1; i <= 3; i++) s += stellina(i <= n, classe);
    return s;
  }

  YG.figure = { FIGURE, figura: (id) => FIGURE[id] || FIGURE.stella, stellina, stelline };
})();
