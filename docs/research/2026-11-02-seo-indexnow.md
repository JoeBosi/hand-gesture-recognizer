# 2026-11-02 SEO e IndexNow

- IndexNow (https://www.indexnow.org/documentation): chiave esadecimale 8-128 caratteri, file
  `<chiave>.txt` alla radice con la chiave dentro; POST JSON a `https://api.indexnow.org/indexnow`
  con `host`, `key`, `keyLocation`, `urlList`. Risposta 200 = ok, 202 = ricevuto, chiave in verifica.
  Inviati i 22 URL della sitemap il 2/11/2026: risposta HTTP 202.
- Open Graph (https://ogp.me): og:title, og:description, og:url, og:image (1200x630), og:image:alt.
  Twitter/X cards: `twitter:card=summary_large_image` più title, description, image.
- Pagine copia (Quarto, mdBook): `rel=canonical` verso la pagina MkDocs con lo stesso testo e fuori
  dalla sitemap (Google Search Central, «consolidate duplicate URLs»).
- Verifiche: validator.w3.org/nu (0 errori sulle nostre pagine; restano 2 avvisi del tema Material
  sull'attributo autocomplete della ricerca) e validator.schema.org (0 errori, 0 avvisi).
