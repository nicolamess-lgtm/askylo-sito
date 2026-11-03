/* Yavier — sito: dove sta l'account (Supabase).
   I due segnaposto li sostituisce tools/prepara_sito.sh con le variabili SUPABASE_URL e
   SUPABASE_ANON_KEY di Cloudflare Pages. Se restano così, il sito è un'anteprima:
   vetrina e Game funzionano, le pagine dell'account dicono «L'account non è ancora attivo».
   La chiave è quella pubblica (anon): non è un segreto, ma il repository non dice di quale progetto è. */
window.YAVIER_CONFIG = {
  supabase_url: "INCOLLA-QUI-URL-SUPABASE",
  chiave_pubblica: "INCOLLA-QUI-LA-CHIAVE-PUBBLICA"
};
