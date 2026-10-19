# Askylo Studio — il sito

La pagina di presentazione della famiglia Askylo, su askylostudio.it. In cima
i due strumenti: **Askylo** (askylo.com, le domande dal vivo del pubblico) e
**Askylo Studio** (il gestionale per chi lavora con i clienti), ognuno con
una finta schermata fatta solo di CSS; poi il gestionale nel dettaglio (cosa
fa, per chi, come si parte), la sezione di Askylo (sala, aula, libri) e, in
fondo, le altre app della famiglia. Pubblicata da GitHub Pages a ogni push su
`main`. L'app vera sta su `app.askylostudio.it` (repository privato
`askylo-studio`).

Una pagina sola, `index.html`, senza compilazione: si apre così com'è. Per
guardarla in locale basta un server statico, per esempio
`python3 -m http.server 8765`.

## Lo stile

È il system design Asky, lo stesso dell'app e di askylo.com: di notte la
«Sala» (blu notte `#12141C`, zafferano `#FFC61A` con generosità), di giorno
«Carta» (crema `#FAF7F0`, inchiostro `#1A2233`, zafferano con parsimonia).
Fraunces per titoli e numeri, DM Sans per il resto; angoli 14 / 18 / 22 e
un'ombra leggera. I colori stanno tutti nelle variabili in cima a
`index.html`: un pezzo nuovo usa quelle (`--card`, `--line`, `--giallo`,
`--accento`) e prende giorno e notte da solo. Le sezioni compaiono
scorrendo (`.sv`), solo con JavaScript e non per chi ha chiesto meno
movimento.

## I mestieri e le demo

La carta di Askylo Studio (il pulsante «Scegli il tuo mestiere», o un clic sulla
carta) apre la finestra dei mestieri (`#mestieri`): operatori olistici,
estetiste, massofisioterapisti, gelaterie, scuole e insegnanti di ballo &
aerofitness; fisioterapisti e osteopati sono «A breve». Ogni mestiere ha tre
strade: **comincia gratis** (l'app, con `?mestiere=<chiave>`), **tutorial**
(spento finché non ci sono) e **guarda un gestionale demo**. Le demo stanno
sull'app (`DEMO` nello script): `?demo=olistico|estetista|massofisio` è il
gestionale vero su un archivio inventato, `demo/gelateria/` e `demo/ballo/`
sono gestionali a parte. Un link diretto: `#mestieri/gelateria`.

## Giorno e notte

Il pulsante con sole e luna funziona come sulle altre pagine Askylo: la scelta
resta nel browser (`asky-theme`: `light` o `dark`); senza scelta la pagina
segue il tema del sistema (`prefers-color-scheme`).

## Lingue

Sedici, le stesse di askylo.com: italiano, inglese, francese, spagnolo,
tedesco, polacco, russo, cinese, giapponese, arabo (da destra a sinistra),
rumeno, ucraino, olandese, danese, svedese, albanese.

- **l'italiano sta nell'HTML**, così la pagina si legge anche senza
  JavaScript; ogni testo che si traduce ha un `data-t="id"`;
- le altre lingue sono dizionari `lingue/<codice>.js` (`{ id: testo }`), caricati
  solo quando servono. Un id senza traduzione resta in italiano;
- si sceglie dal menu in alto (ricordata in `asky-lang`), altrimenti la lingua
  del browser; `?lingua=en` la forza;
- **chi cambia o aggiunge un testo** lo cambia in `index.html` e in tutti i
  dizionari, poi lancia `node tools/controlla_lingue.mjs`: dice cosa manca o
  è di troppo. Chi aggiunge una lingua la aggiunge all'elenco in fondo a
  `index.html` e crea il suo file.

Le traduzioni sono automatiche: vanno riviste da un madrelingua prima di fare
pubblicità nel paese.
