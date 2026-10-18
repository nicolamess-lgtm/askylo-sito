# Askylo Studio — il sito

La pagina di presentazione di Askylo Studio (il gestionale per chi lavora con
i clienti), su askylostudio.it, con in fondo le altre app della famiglia Askylo.
Pubblicata da GitHub Pages a ogni push su `main`. L'app vera sta su
`app.askylostudio.it` (repository privato `askylo-studio`).

Una pagina sola, `index.html`, senza compilazione: si apre così com'è.

## Giorno e notte

Il pulsante con sole e luna funziona come sulle altre pagine Askylo: la scelta
resta nel browser (`asky-theme`: `light` o `dark`); senza scelta la pagina
segue il tema del sistema (`prefers-color-scheme`). Lo stile è l'«Oro» di
sempre: scuro con l'oro di notte, carta calda con l'oro scuro di giorno.

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
