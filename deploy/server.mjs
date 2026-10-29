/**
 * server.mjs — il server che mette a disposizione i file del sito.
 *
 * Ascolta solo su 127.0.0.1:8791, cioè sulla macchina stessa: da internet non ci si arriva
 * direttamente. Davanti c'è Caddy, che si occupa di HTTPS, del certificato, della compressione e
 * delle intestazioni di sicurezza (vedi deploy/Caddyfile.snippet).
 *
 * Perché esiste, invece di far servire i file direttamente a Caddy:
 * Caddy gira come utente `caddy` e non può entrare in /root, dove vive il progetto. L'alternativa
 * sarebbe copiare il sito in /opt o /srv, ma allora una parte del progetto vivrebbe fuori dalla
 * cartella e questa smetterebbe di essere portabile. Questo processo gira come root, legge
 * `app/dist` dentro al progetto, e il problema sparisce.
 *
 * Perché scritto a mano e senza dipendenze (niente Express e simili): deve fare poche cose,
 * restituire file e contare i posti. Un centinaio di righe di Node bastano, non aggiungono pacchetti da aggiornare e non
 * portano dentro codice di terzi in un punto esposto a internet.
 *
 * Avvio: lo fa systemd, con l'unità generata da deploy/mano.service.
 * A mano: node deploy/server.mjs     (PORT, ROOT e HOST si possono sovrascrivere)
 */
import { createReadStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** La cartella servita: la build dentro al progetto, non una copia altrove. */
const ROOT = resolve(process.env.ROOT ?? join(here, "..", "app", "dist"));
const PORT = +(process.env.PORT ?? 8791);
/** Solo interfaccia locale: nessuno può raggiungere questo processo scavalcando Caddy. */
const HOST = process.env.HOST ?? "127.0.0.1";

/**
 * I POSTI: al massimo MAX_UTENTI persone insieme (oggi quasi illimitati, vedi sotto; dal 05/10/2026: accesso
 * libero, senza password, ma non più di cinque contemporanei).
 *
 * Cosa conta come «persona che sta usando il sito»: una scheda con la camera accesa. Una pagina è
 * statica e dopo il caricamento non fa più richieste, quindi il server non ha modo di sapere chi
 * c'è ancora: lo dice la pagina stessa. Quando si preme «Accendi la camera» chiede un posto
 * (`entra`); finché la camera è accesa lo rinnova ogni 15 secondi (`ping`); quando si spegne lo
 * libera (`esci`). Il posto scade da solo dopo 45 secondi senza notizie, così una scheda chiusa
 * male o un computer spento non occupa un posto per sempre.
 *
 * L'identificativo è un numero casuale generato dalla pagina a ogni apertura: non è un cookie, non
 * lega a una persona né a un indirizzo, e vive solo in memoria qui (nessun file, nessun log).
 *
 * ONESTÀ: è un limite «di buona educazione» imposto dalle pagine, non un muro. Chi chiamasse
 * `entra` a mano o disattivasse JavaScript non ne sarebbe fermato, e i file statici restano
 * leggibili anche a posti esauriti (si può aprire la pagina e leggere; non si può accendere la
 * camera). Per un'impresa di cinque amici basta; non protegge da qualcuno che ci tenga davvero.
 */
// Dal 08/10/2026, su richiesta di Giuseppe, «quasi illimitati»: il meccanismo resta, il tetto no.
// Per rimetterlo: Environment=MANO_MAX_UTENTI=5 nell'unità, oppure cambiare il numero qui.
const MAX_UTENTI = +(process.env.MANO_MAX_UTENTI ?? 10_000);
const SCADENZA_MS = 45_000;
/** id → istante dell'ultima notizia. */
const posti = new Map();

function pulisciPosti() {
  const adesso = Date.now();
  for (const [id, quando] of posti) if (adesso - quando > SCADENZA_MS) posti.delete(id);
}

/** Gestisce /presenza/*. Risponde 204 (posto tuo), 503 (al completo) o 400. */
function gestisciPresenza(req, res, url) {
  const nocache = { "cache-control": "no-store" };
  const azione = url.pathname.slice("/presenza/".length);
  pulisciPosti();

  if (azione === "visita" && req.method === "POST") {
    accessi += 1;
    salvaAccessi();
    res.writeHead(200, { ...nocache, "content-type": "application/json" }).end(JSON.stringify({ accessi }));
    return;
  }
  if (azione === "accessi" && req.method === "GET") {
    res.writeHead(200, { ...nocache, "content-type": "application/json" }).end(JSON.stringify({ accessi }));
    return;
  }
  if (azione === "stato" && req.method === "GET") {
    res.writeHead(200, { ...nocache, "content-type": "application/json" }).end(JSON.stringify({ attivi: posti.size, max: MAX_UTENTI }));
    return;
  }
  const id = url.searchParams.get("id") ?? "";
  if (req.method !== "POST" || !/^[A-Za-z0-9-]{8,64}$/.test(id) || !["entra", "ping", "esci"].includes(azione)) {
    res.writeHead(400, nocache).end();
    return;
  }
  if (azione === "esci") {
    posti.delete(id);
    res.writeHead(204, nocache).end();
    return;
  }
  // `entra` e `ping` sono la stessa cosa: chi ha già un posto lo rinnova, gli altri lo prendono se
  // c'è. Così anche un `ping` arrivato dopo la scadenza, a posti ancora liberi, riammette la
  // pagina senza che se ne accorga; se nel frattempo il sito si è riempito riceve 503.
  if (posti.has(id) || posti.size < MAX_UTENTI) {
    posti.set(id, Date.now());
    res.writeHead(204, nocache).end();
    return;
  }
  res.writeHead(503, { ...nocache, "content-type": "application/json", "retry-after": "10" }).end(JSON.stringify({ pieno: true, max: MAX_UTENTI }));
}

/**
 * GLI ACCESSI (dal 08/10/2026): quante volte una pagina del sito è stata aperta, in totale, tutte le
 * pagine insieme. Ogni pagina, appena caricata, fa `POST /presenza/visita` e riceve il totale da
 * mostrare in basso a destra. Si conta un numero e basta: niente indirizzo, niente identificativo,
 * niente pagina, niente ora. Sta in deploy/dati/accessi.json, dentro la cartella del progetto.
 * Il valore di partenza, se il file non c'è ancora, è MANO_ACCESSI_INIZIALI (0 se non impostato).
 */
const FILE_ACCESSI = resolve(process.env.MANO_FILE_ACCESSI ?? join(here, "dati", "accessi.json"));
let accessi = +(process.env.MANO_ACCESSI_INIZIALI ?? 0);
try {
  const letto = JSON.parse(readFileSync(FILE_ACCESSI, "utf8")).accessi;
  if (Number.isSafeInteger(letto) && letto >= 0) accessi = letto;
} catch {
  /* primo avvio: si parte dal valore iniziale */
}
let salvataggio = 0;
function salvaAccessi() {
  // Si scrive al più una volta al secondo, su un file temporaneo poi rinominato: un'interruzione a
  // metà non lascia mai un file rotto.
  if (salvataggio) return;
  salvataggio = setTimeout(() => {
    salvataggio = 0;
    try {
      mkdirSync(dirname(FILE_ACCESSI), { recursive: true });
      writeFileSync(FILE_ACCESSI + ".tmp", JSON.stringify({ accessi }));
      renameSync(FILE_ACCESSI + ".tmp", FILE_ACCESSI);
    } catch (e) {
      console.error("mano: accessi non salvati", e.message);
    }
  }, 1000);
}

/**
 * Il tipo dichiarato per ogni estensione. Non è un dettaglio: il file `.wasm` deve arrivare come
 * `application/wasm`, altrimenti il browser si rifiuta di compilarlo al volo e MediaPipe non parte.
 * Un tipo sconosciuto diventa `application/octet-stream`, che il browser scarica senza interpretare.
 */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream", // il modello dei gesti
  ".map": "application/json; charset=utf-8",
  // le pagine del corso (corso-scuola/, servite sotto /scuola/)
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".gz": "application/gzip",
};

const server = createServer((req, res) => {
  try {
    gestisci(req, res);
  } catch (e) {
    // Ultima rete: qualunque errore imprevisto chiude QUELLA richiesta, non il server.
    console.error("mano: errore nella richiesta", e?.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

function gestisci(req, res) {
  // `new URL` separa il percorso dalla query e decodifica ciò che serve.
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/presenza/")) {
    gestisciPresenza(req, res, url);
    return;
  }

  // Sicurezza: si ricostruisce il percorso assoluto e si pretende che stia dentro ROOT.
  // `normalize` risolve i "..", il controllo successivo blocca i tentativi tipo
  // /../../etc/passwd. È l'unico punto davvero delicato di questo file.
  // Solo lettura: qualunque altro metodo non ha senso su file statici.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  // `decodeURIComponent` lancia un errore su sequenze malformate (es. /%E0): senza questo controllo
  // una sola richiesta faceva cadere il processo (trovato dall'audit del 08/10/2026).
  let decodificato;
  try {
    decodificato = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let path = resolve(join(ROOT, normalize(decodificato)));
  if (path !== ROOT && !path.startsWith(ROOT + "/")) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let info;
  try {
    info = statSync(path);
    if (info.isDirectory()) {
      // Una cartella senza la barra finale (/scuola/mkdocs) si rimanda alla forma con la barra:
      // le pagine del corso usano indirizzi relativi, che senza barra puntano un livello più su.
      if (!url.pathname.endsWith("/")) {
        // Le barre iniziali si riducono a una: "//scuola" diventerebbe un rimando a un altro sito.
        res.writeHead(301, { location: "/" + url.pathname.replace(/^\/+/, "") + "/" + url.search }).end();
        return;
      }
      // "/" e le cartelle rispondono con il loro index.html.
      path = join(path, "index.html");
      info = statSync(path);
    }
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Non trovato");
    return;
  }

  const ext = extname(path);

  // ETag costruito da dimensione e data di modifica: se il browser ha già il file identico,
  // rispondiamo 304 e non rispediamo 11 MB di WebAssembly a ogni ricarica.
  const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "content-length": info.size,
    etag,
    // I file in assets/ hanno l'impronta del contenuto nel nome: se cambiano, cambia il nome,
    // quindi si possono tenere in cache per sempre. Gli altri si ricontrollano ogni 5 minuti.
    "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  // `pipe` invia il file a pezzi: nessun rischio di tenere in memoria un file grande.
  // Un file sparito a metà (durante una pubblicazione) non deve far cadere il processo.
  createReadStream(path)
    .on("error", () => res.destroy())
    .pipe(res);
}

server.listen(PORT, HOST, () => console.log(`mano: ${ROOT} su http://${HOST}:${PORT}`));

// systemd ferma i servizi con SIGTERM: si chiude il server con garbo invece di essere uccisi.
// Prima di uscire si salva il contatore, se c'era un salvataggio in sospeso.
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    if (salvataggio) {
      clearTimeout(salvataggio);
      try {
        mkdirSync(dirname(FILE_ACCESSI), { recursive: true });
        writeFileSync(FILE_ACCESSI, JSON.stringify({ accessi }));
      } catch {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
