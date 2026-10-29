/**
 * run.mjs — la prova generale del sito, senza una webcam vera.
 *
 * Il problema: questo progetto vive su un server senza schermo e senza telecamera, ma le cose più
 * importanti da verificare sono proprio "la camera si accende, la figura viene riconosciuta e
 * seguita" e "niente esce dal browser".
 *
 * La soluzione, in tre pezzi:
 *   1. una webcam finta — make-video.sh costruisce due filmati MJPEG (una mano che cambia gesto,
 *      una persona in piedi che oscilla); Chromium sa usare un file al posto della telecamera;
 *   2. un Caddy locale — parte con lo STESSO frammento di configurazione della produzione
 *      (deploy/Caddyfile.snippet), quindi con la stessa CSP e le stesse intestazioni: se una regola
 *      di sicurezza rompe il sito, si scopre qui e non dopo la pubblicazione;
 *   3. Playwright — guida un Chromium senza finestra, clicca i pulsanti e legge quello che la
 *      pagina scrive su `document.body.dataset` quando è avviata con `?e2e`.
 *
 * Gli scenari sono quattro — `mano` (/), `sfida`, `mano-lontana`, `corpo` e `corpo-mani` (/corpo/,
 * con due filmati diversi) — e ognuno vuole il suo filmato. Siccome il file della webcam finta si
 * sceglie all'avvio del browser, gli scenari girano uno dopo l'altro, ciascuno con il proprio
 * Chromium; il Caddy invece è uno solo per tutti.
 *
 * Perché Playwright e non un test unitario: le cose che possono rompersi qui sono i permessi della
 * camera, il caricamento del WebAssembly, la CSP, WebGL. Nessuna di queste esiste fuori da un
 * browser vero, e simularle darebbe un test che passa mentre il sito è guasto.
 *
 * Uso:  npm run test:e2e         (serve: npm run build, ffmpeg, caddy, i browser di Playwright)
 * Variabili:  DURATION=ms  QS=delegate=cpu  VIEWPORT=390x844  SOLO=mano|sfida|mano-lontana|corpo|corpo-mani
 * Esito: stampa "E2E OK" e termina con 0, oppure elenca i controlli falliti e termina con 1.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../..");
const cache = join(here, ".cache"); // filmati finti, Caddyfile temporaneo, schermate
const PORT = 8766; // porta solo per il test, diversa da quella del servizio vero (8791)
/** Quanto si lascia girare ogni pagina: i filmati durano 10 s e si ripetono. */
const DURATION = +(process.env.DURATION ?? 35000);
/** Le credenziali del sito, le stesse di deploy/Caddyfile.snippet. */


/** Ogni controllo fallito finisce qui; alla fine decide l'esito del processo. */
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`); if (!ok) failures.push(msg); };

// Prepara (o riusa) i filmati delle webcam finte.
execFileSync(join(here, "make-video.sh"), { stdio: "inherit" });
mkdirSync(cache, { recursive: true });

// Si riusa il frammento di produzione cambiando due sole cose: il nome del sito diventa
// localhost su HTTP (niente certificati nel test) e, se il frammento servisse i file da una
// cartella, quella cartella diventa la build locale. Tutte le intestazioni restano identiche: è
// il punto di questo test.
const snippet = readFileSync(join(app, "../deploy/Caddyfile.snippet"), "utf8")
  .replace(/^mano\.giuseppebosi\.com \{/m, `http://localhost:${PORT} {`)
  .replace(/root \* \/opt\/mano/, `root * ${join(app, "dist")}`);
// `admin off`: il Caddy di produzione tiene già occupata la porta di amministrazione.
writeFileSync(join(cache, "Caddyfile"), `{\n    admin off\n}\n${snippet}`);
// stderr NON va buttato via: se Caddy non parte (porta occupata, configurazione non valida) il
// motivo è scritto lì, e senza si vedrebbe solo un "fetch failed" qualche riga più in basso.
const caddy = spawn("caddy", ["run", "--adapter", "caddyfile", "--config", join(cache, "Caddyfile")], {
  stdio: ["ignore", "ignore", "pipe"],
});
let caddyErr = "";
caddy.stderr.on("data", (d) => (caddyErr += d));

// Si aspetta che risponda davvero, invece di sperare in un'attesa fissa: su una macchina carica
// due secondi non bastano sempre, e il test moriva con un ECONNREFUSED che non spiegava niente.
// (Stesso difetto già corretto in deploy/pubblica.sh.)
let inAscolto = false;
for (let i = 0; i < 30 && !inAscolto; i++) {
  try {
    await fetch(`http://localhost:${PORT}/`);
    inAscolto = true; // basta che risponda
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!inAscolto) {
  caddy.kill();
  console.error(`Caddy non si è messo in ascolto sulla porta ${PORT} dopo 15 secondi.`);
  if (caddyErr.trim()) console.error(caddyErr.trim().split("\n").slice(0, 10).join("\n"));
  process.exit(1);
}

/**
 * Gli scenari. Ognuno dice quale filmato usare, quale pagina aprire, con quali parametri, e cosa
 * pretendere dai dati che la pagina pubblica su `data-*`.
 */
const SCENARI = [
  {
    nome: "mano",
    percorso: "/",
    video: "hands.mjpeg",
    attributi: ["data-wrist", "data-hands"],
    controlli(trace) {
      const conFigura = trace.filter((t) => +t.hands > 0);
      const gesti = new Set(conFigura.map((t) => t.gestures));
      const lati = new Set(conFigura.map((t) => t.sides));
      const x = conFigura.map((t) => +t.wrist);
      console.log(`    rilevazioni ${trace.length}, con mano ${conFigura.length}, gesti ${[...gesti]}, lati ${[...lati]}`);

      check(conFigura.length >= 10, "almeno 10 rilevazioni con la mano");
      // Non tutti e quattro: il pugno chiuso in certi fotogrammi di passaggio è ambiguo, e
      // pretendere il 100% renderebbe il test capriccioso senza aggiungere niente.
      check(["Victory", "Thumb_Up", "Pointing_Up", "Closed_Fist"].filter((g) => gesti.has(g)).length >= 3,
        "almeno 3 dei 4 gesti del video riconosciuti");
      // Le foto di MediaPipe ritraggono una mano sinistra: questo controllo protegge l'inversione
      // destra/sinistra di main.ts (realSide), che è facile rompere senza accorgersene.
      check(lati.size === 1 && lati.has("Left"), "la mano del video (sinistra) è indicata come sinistra");
      // Il polso si sposta perché il filmato fa oscillare la mano: se il valore fosse fermo, il
      // riconoscimento starebbe restituendo sempre la stessa posizione.
      check(Math.max(...x) - Math.min(...x) > 0.15, `il movimento viene seguito (polso x ${Math.min(...x)}–${Math.max(...x)})`);
    },
  },
  {
    // La partita a sasso-carta-forbici, giocata per intero contro un filmato finto con DUE mani.
    // Il filmato è fermo (pugno a sinistra del fotogramma, vittoria a destra), quindi l'esito è
    // sempre lo stesso e la partita finisce 2-0: quello che si verifica non è la fortuna ma le
    // regole, l'assegnazione dei giocatori e il fatto che la partita arrivi davvero alla fine.
    nome: "sfida",
    percorso: "/sfida/",
    video: "duel.mjpeg",
    qs: "delegate=cpu", // le mani sono ferme: il ripiego automatico è già provato altrove
    attributi: ["data-fase", "data-punti"],
    durata: 30000, // due round da ~7 s (c'è l'annuncio e la lettura ritardata), più l'avvio
    controlli(trace) {
      const fasi = new Set(trace.map((t) => t.fase));
      const conDueMani = trace.filter((t) => t.mani === "2").length;
      const ultimo = trace[trace.length - 1];
      console.log(`    campioni ${trace.length}, con due mani ${conDueMani}, fasi ${[...fasi]}, punteggio finale ${ultimo?.punti}`);

      check(conDueMani >= 10, "le due mani vengono viste insieme");
      // Se una di queste fasi manca, la macchina a stati si è bloccata da qualche parte.
      for (const f of ["attesa", "conto", "rivelazione", "esito"]) {
        check(fasi.has(f), `la partita attraversa la fase "${f}"`);
      }
      // Il pugno sta a sinistra del fotogramma e, con l'immagine NON specchiata (dal 28/10/2026),
      // anche a sinistra sullo schermo: è il giocatore di sinistra. Sasso batte forbici: vince lui.
      // Questo controllo protegge l'ordine in `maniOrdinate`, che è facile invertire
      // senza accorgersene e che scambierebbe i punti fra i due giocatori.
      check(ultimo?.punti === "2-0", `la partita finisce 2-0 per il giocatore di sinistra (${ultimo?.punti})`);
      check(fasi.has("fine"), "la partita arriva alla fine");
    },
  },
  {
    // Mani aperte viste una dal PALMO e una dal DORSO (girata di 180°): la mossa va letta lo
    // stesso. Il classificatore di gesti di MediaPipe è addestrato soprattutto sui palmi; qui la
    // mossa viene dalla forma delle dita (src/mosse.ts), e questo scenario lo dimostra.
    nome: "sfida-dorso",
    percorso: "/sfida/",
    video: "dorso.mjpeg",
    qs: "delegate=cpu",
    attributi: ["data-fase", "data-mosse", "data-parlato"],
    durata: 12000,
    controlli(trace) {
      const moss = new Set(trace.map((t) => t.mosse).filter(Boolean));
      const parlato = new Set(trace.map((t) => t.parlato).filter(Boolean));
      console.log(`    campioni ${trace.length}, mosse viste: ${[...moss].join(" | ")}; frasi: ${[...parlato].length}`);
      check(moss.has("carta,carta"), "carta riconosciuta sia di palmo sia di dorso (carta,carta)");
      // Due carte sono un pareggio: nessun punto, e la voce lo dice.
      check(trace.every((t) => !t.punti || t.punti === "0-0"), "due carte = pareggio, nessun punto assegnato");
      check([...parlato].some((f) => /^Si comincia/.test(f)), "la voce annuncia l'inizio della partita");
      check([...parlato].some((f) => /^(Tre|Due|Uno)$/i.test(f)), "la voce dice il conto alla rovescia");
    },
  },
  {
    // L'onda energetica: due mani aperte con i polsi vicini, tenute ferme. La pagina deve passare
    // da `idle` a `carica` a `raggio`, e il raggio deve arrivare dopo circa QUATTRO secondi di posa
    // (non tre, non sei: è il numero che l'utente si aspetta). Il filmato è fermo di proposito.
    nome: "onda",
    percorso: "/onda/",
    video: "onda.mjpeg",
    qs: "delegate=cpu", // la posa è ferma: il ripiego automatico è già provato dallo scenario `mano`
    attributi: ["data-fase", "data-carica", "data-mani", "data-misura", "data-tenuta", "data-suono"],
    durata: 13000, // avvio (~1 s) + posa (4 s) + raggio (2,5 s) + riposo, con margine per il VPS
    controlli(trace) {
      const fasi = trace.map((t) => t.fase).filter(Boolean);
      const insieme = new Set(fasi);
      const conDueMani = trace.filter((t) => t.mani === "2").length;
      const maxCarica = Math.max(0, ...trace.map((t) => +t.carica || 0));
      const polsi = trace.map((t) => +(t.misura ?? "").split("|")[0]).filter((n) => n > 0).sort((a, b) => a - b);
      const polsiMediano = polsi[Math.floor(polsi.length / 2)];
      const tenuta = trace.map((t) => +t.tenuta).find((n) => n > 0);
      console.log(`    campioni ${trace.length}, con due mani ${conDueMani}, fasi ${[...insieme]}, carica massima ${maxCarica}, posa tenuta ${tenuta} ms, polsi/palmo mediano ${polsiMediano?.toFixed(2)}`);

      check(conDueMani >= 10, "le due mani vengono viste insieme");
      check(insieme.has("carica"), "la posa fa partire la carica");
      check(insieme.has("raggio"), "dopo la carica parte il raggio");
      check(fasi.indexOf("carica") < fasi.indexOf("raggio"), "il raggio arriva DOPO la carica, non prima");
      check(maxCarica >= 0.99, `la carica arriva fino in fondo (${maxCarica})`);
      // Quattro secondi veri, con la tolleranza di un computer lento (qui il riconoscimento va a ~5 fps).
      check(tenuta >= 3600 && tenuta <= 5200, `la posa viene tenuta circa 4 secondi prima dello sparo (${tenuta} ms)`);
      check(polsiMediano < 1.6, `la distanza fra i polsi misurata è sotto la soglia di ingresso (${polsiMediano?.toFixed(2)} < 1.6)`);

      // Il suono. Non si può ascoltare, ma si può leggere lo stato del motore audio: `data-suono` =
      // «stato|livello della carica|livello del raggio|voce/muto» (solo con ?e2e, solo numeri di
      // volume). Il rendering vero del suono si misura a parte con prova-suono.html.
      const suoni = trace.map((t) => (t.suono ?? "").split("|")).filter((p) => p.length === 4);
      const stato = new Set(suoni.map((p) => p[0]));
      const volCarica = Math.max(0, ...suoni.map((p) => +p[1]));
      const maxRaggio = Math.max(0, ...suoni.map((p) => +p[2]));
      console.log(`    suono: stati ${[...stato]}, livello massimo carica ${volCarica}, raggio ${maxRaggio}`);
      check(stato.has("running"), "il motore audio è in funzione (AudioContext running)");
      check(volCarica >= 0.2, `il suono della carica sale (livello massimo ${volCarica})`);
      check(maxRaggio >= 0.3, `lo sparo accende il ruggito del raggio (livello massimo ${maxRaggio})`);
    },
  },
  {
    // La posa VERA dell'onda: le mani a ventaglio, polsi uniti, una con le dita in su e l'altra di
    // lato, a ~90° fra loro, e il ventaglio che scorre da un lato all'altro. Alla prima versione la
    // pagina chiedeva dita parallele (≤ 75°) e una persona vera, provandola, veniva scartata.
    // Qui si verifica due cose: che la posa passi (angolo misurato OLTRE i 75° di prima) e che il
    // raggio, una volta sparato, SI MUOVA con le mani invece di restare fermo dove è partito.
    nome: "onda-ventaglio",
    percorso: "/onda/",
    video: "ventaglio-mobile.mjpeg",
    qs: "delegate=cpu",
    attributi: ["data-fase", "data-carica", "data-mani", "data-misura", "data-raggiox"],
    durata: 13000,
    controlli(trace) {
      const fasi = new Set(trace.map((t) => t.fase).filter(Boolean));
      const angoli = trace.map((t) => +(t.misura ?? "").split("|")[2]).filter((n) => n > 0).sort((a, b) => a - b);
      const angolo = angoli[Math.floor(angoli.length / 2)];
      const xs = trace.filter((t) => t.fase === "raggio" && t.raggiox).map((t) => +t.raggiox);
      const escursione = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
      console.log(`    fasi ${[...fasi]}, angolo fra le mani mediano ${angolo}°, origine del raggio: ${xs.length} campioni, escursione ${escursione} px`);

      check(angolo > 75, `la posa a ventaglio ha un angolo oltre i 75° che la vecchia soglia scartava (${angolo}°)`);
      check(fasi.has("carica") && fasi.has("raggio"), "la posa a ventaglio carica e spara");
      check(xs.length >= 3, `il raggio viene tracciato (${xs.length} campioni)`);
      check(escursione >= 40, `il raggio si muove con le mani (origine spostata di ${escursione} px)`);
    },
  },
  {
    // Le mani escono dall'inquadratura mentre l'onda si sta caricando: l'onda deve SPARIRE, non
    // scendere piano. Il filmato ha il ventaglio per 3 secondi e poi un fotogramma vuoto.
    nome: "onda-sparisce",
    percorso: "/onda/",
    video: "ventaglio-sparisce.mjpeg",
    qs: "delegate=cpu",
    attributi: ["data-fase", "data-carica", "data-mani"],
    durata: 9000,
    controlli(trace) {
      const iMax = trace.reduce((m, t, i) => ((+t.carica || 0) > (+trace[m].carica || 0) ? i : m), 0);
      const maxCarica = +trace[iMax]?.carica || 0;
      // Dopo il massimo, i campioni senza due mani: la carica deve essere subito a zero (al più un
      // campione di tolleranza, 0,15 s), mai un calo graduale con valori intermedi.
      const dopo = trace.slice(iMax + 1).filter((t) => t.mani !== "2");
      const intermedi = dopo.filter((t) => +t.carica > 0 && +t.carica < maxCarica - 0.02 && t.fase === "carica").length;
      const finale = trace.at(-1);
      console.log(`    carica massima ${maxCarica}, campioni senza mani ${dopo.length}, con carica intermedia ${intermedi}, stato finale ${finale?.fase}/${finale?.carica}`);

      check(maxCarica >= 0.15, `la carica era partita prima che le mani uscissero (${maxCarica})`);
      check(finale?.fase === "idle" && +finale?.carica === 0, `a mani sparite non resta niente (${finale?.fase}, carica ${finale?.carica})`);
      check(intermedi <= 2, `non c'è un calo graduale: ${intermedi} campioni con carica intermedia (al più 2)`);
    },
  },
  {
    // Le stesse mani, ma staccate: aperte, nello stesso verso, soltanto più lontane. È il negativo
    // che ISOLA la soglia sulla distanza: con un pugno e una vittoria (la sfida) il test passerebbe
    // anche a soglia rotta, perché lì le dita aperte mancherebbero comunque.
    nome: "onda-lontane",
    percorso: "/onda/",
    video: "onda-lontane.mjpeg",
    qs: "delegate=cpu",
    attributi: ["data-fase", "data-carica", "data-mani", "data-misura", "data-tenuta"],
    durata: 9000,
    controlli(trace) {
      const insieme = new Set(trace.map((t) => t.fase).filter(Boolean));
      const conDueMani = trace.filter((t) => t.mani === "2").length;
      const maxCarica = Math.max(0, ...trace.map((t) => +t.carica || 0));
      const polsi = trace.map((t) => +(t.misura ?? "").split("|")[0]).filter((n) => n > 0).sort((a, b) => a - b);
      const polsiMediano = polsi[Math.floor(polsi.length / 2)];
      console.log(`    campioni ${trace.length}, con due mani ${conDueMani}, fasi ${[...insieme]}, carica massima ${maxCarica}, polsi/palmo mediano ${polsiMediano?.toFixed(2)}`);

      // Senza questo primo controllo il test potrebbe passare perché le mani NON sono state viste.
      check(conDueMani >= 10, "le due mani vengono viste (il rifiuto è per la distanza, non per l'assenza)");
      check(polsiMediano > 2.0, `i polsi risultano lontani (${polsiMediano?.toFixed(2)} > 2.0)`);
      check(!insieme.has("carica") && !insieme.has("raggio"), "con le mani lontane non si carica niente");
      check(maxCarica === 0, `la carica resta a zero (${maxCarica})`);
    },
  },
  {
    // La mano lontana: verifica che la pagina se ne accorga e dica di avvicinarsi.
    // È l'unico scenario che usa un filmato costruito apposta invece di una foto di MediaPipe,
    // perché tutte le loro foto di mani sono ravvicinate. Senza questo, la soglia misurata in
    // src/main.ts potrebbe smettere di funzionare (cambio di modello, di webcam, di calcolo)
    // senza che nessun test se ne accorga.
    nome: "mano-lontana",
    percorso: "/",
    video: "hand-far.mjpeg",
    qs: "delegate=cpu", // la mano è ferma: niente da guadagnare aspettando il ripiego automatico
    attributi: ["data-palm", "data-avviso"],
    controlli(trace) {
      const conMano = trace.filter((t) => +t.hands > 0);
      const palmi = conMano.map((t) => +t.palm).filter((n) => n > 0);
      const accesi = conMano.filter((t) => t.avviso === "1").length;
      const mediano = palmi.sort((a, b) => a - b)[Math.floor(palmi.length / 2)];
      console.log(`    rilevazioni ${trace.length}, con mano ${conMano.length}, palmo mediano ${mediano?.toFixed(3)}, avviso acceso in ${accesi}`);

      // Il punto dello scenario: la mano si vede lo stesso — MediaPipe non smette di trovarla —
      // ma è piccola, e la pagina lo dice.
      check(conMano.length >= 10, "la mano viene comunque riconosciuta anche se piccola");
      check(mediano > 0 && mediano < 0.115, `il palmo misurato è sotto la soglia (${mediano?.toFixed(3)} < 0.115)`);
      check(accesi >= 5, `l'avviso «avvicina la mano» si accende (${accesi} fotogrammi)`);
    },
  },
  {
    nome: "corpo",
    percorso: "/corpo/",
    video: "body.mjpeg",
    attributi: ["data-nose", "data-bodies", "data-hands", "data-hand-sides"],
    controlli(trace) {
      const conFigura = trace.filter((t) => +t.bodies > 0);
      const parti = new Set(conFigura.flatMap((t) => (t.parts ?? "").split(",").filter(Boolean)));
      const x = conFigura.map((t) => +t.nose);
      console.log(`    rilevazioni ${trace.length}, con persona ${conFigura.length}, parti viste ${[...parti]}`);

      check(conFigura.length >= 10, "almeno 10 rilevazioni con la persona");
      // La foto di prova è una persona in piedi, corpo intero: se il modello funziona devono
      // risultare visibili tutte e quattro le parti. È anche il controllo della soglia di
      // visibilità in body3d.ts: se fosse troppo severa, gambe o braccia sparirebbero.
      for (const parte of ["Testa", "Braccia", "Busto", "Gambe"]) {
        check(parti.has(parte), `${parte.toLowerCase()}: parte riconosciuta`);
      }
      check(Math.max(...x) - Math.min(...x) > 0.05, `il movimento viene seguito (naso x ${Math.min(...x)}–${Math.max(...x)})`);
      // In questa foto le mani sono piccole e mosse e il riconoscitore non le trova (verificato:
      // zero mani da 520 a 1400 pixel di larghezza). Qui si controlla solo che il secondo modello
      // stia girando davvero; le mani vere si provano nello scenario "corpo-mani".
      check(trace.every((t) => t.hands !== undefined), "il secondo modello (mani) è in funzione");
    },
  },
  {
    nome: "corpo-mani",
    percorso: "/corpo/",
    video: "body-hands.mjpeg",
    attributi: ["data-bodies", "data-hands", "data-hand-sides", "data-ms", "data-face"],
    controlli(trace) {
      const conFigura = trace.filter((t) => +t.bodies > 0);
      const conMani = conFigura.filter((t) => +t.hands > 0);
      const conDue = conFigura.filter((t) => +t.hands === 2);
      const lati = new Set(conFigura.flatMap((t) => (t.handSides ?? "").split(",").filter(Boolean)));
      console.log(`    rilevazioni ${trace.length}, con persona ${conFigura.length}`);
      console.log(`    fotogrammi con una mano ${conMani.length}, con due ${conDue.length}, lati ${[...lati]}`);
      // Il costo dei due modelli, in millisecondi per fotogramma. Su questa macchina non c'è una
      // scheda grafica vera (Chromium emula il 3D via software), quindi i valori assoluti non
      // dicono niente sul mondo reale: il rapporto fra i due, invece, sì.
      const ms = (trace.at(-1)?.ms ?? "0,0").split(",").map(Number);
      console.log(`    costo per fotogramma: corpo ${ms[0]} ms, mani ${ms[1]} ms, volto ${ms[2] ?? 0} ms (somma ${ms[0] + ms[1] + (ms[2] ?? 0)} ms)`);
      const conVolto = conFigura.filter((t) => t.face === "1");

      check(conFigura.length >= 5, "la persona viene riconosciuta");
      // È la prova che il secondo modello gira davvero e che le sue mani arrivano fino alla scena.
      check(conMani.length >= 5, `le mani vengono riconosciute (${conMani.length} fotogrammi su ${conFigura.length})`);
      check(conDue.length >= 1, `tutte e due le mani insieme almeno una volta (${conDue.length})`);
      // Se l'assegnazione mano→braccio fosse rotta, finirebbero tutte dalla stessa parte: è il
      // controllo che difende `assegnaMani` in corpo.ts, dove si è scelto di NON fidarsi
      // dell'etichetta destra/sinistra del modello ma di misurare la distanza dai polsi.
      check(lati.size === 2, `mani assegnate a tutti e due i lati (${[...lati].join(" e ") || "nessuno"})`);
      // Il terzo modello: la foto è un primo piano, quindi il volto è grande e va trovato. È la prova
      // che il modello del volto gira e che la sua posa della testa arriva fino alla scena (la testa
      // dello scheletro si orienta da lì, non più dai sette punti del viso della posa).
      check(conVolto.length >= 1, `il terzo modello (volto) è in funzione (${conVolto.length} fotogrammi con volto)`);
    },
  },
];

const scenari = ["posti", "schermo-intero"].includes(process.env.SOLO) ? [] : process.env.SOLO ? SCENARI.filter((s) => s.nome === process.env.SOLO) : SCENARI;
if (!scenari.length && !["posti", "schermo-intero"].includes(process.env.SOLO)) throw new Error(`SOLO=${process.env.SOLO} non corrisponde a nessuno scenario`);

try {
  for (const scenario of scenari) {
    console.log(`\n▸ pagina ${scenario.nome} (${scenario.percorso})`);
    await provaPagina(scenario);
  }
  if (!process.env.SOLO || process.env.SOLO === "posti") await provaPosti();
  if (!process.env.SOLO || process.env.SOLO === "schermo-intero") await provaSchermoIntero();
} finally {
  caddy.kill();
}

console.log(failures.length ? `\nE2E FALLITO (${failures.length})` : "\nE2E OK");
process.exit(failures.length ? 1 : 0);

/** Apre una pagina in un Chromium con la webcam finta giusta e le passa i controlli dello scenario. */
async function provaPagina(scenario) {
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream", // concede il permesso camera senza mostrare il pop-up
      "--use-fake-device-for-media-stream", // usa una telecamera simulata...
      `--use-file-for-fake-video-capture=${join(cache, scenario.video)}`, // ...alimentata dal filmato
      "--enable-unsafe-swiftshader", // WebGL via software: il server non ha una scheda grafica
    ],
  });
  try {
    const page = await (await browser.newContext({
      // VIEWPORT permette di ripetere il test a misura di telefono (es. VIEWPORT=390x844).
      viewport: process.env.VIEWPORT
        ? { width: +process.env.VIEWPORT.split("x")[0], height: +process.env.VIEWPORT.split("x")[1] }
        : { width: 1280, height: 800 },
    })).newPage();

    const external = []; // richieste verso domini diversi da localhost: devono restare zero
    const problems = []; // errori JavaScript e violazioni della CSP
    const infos = []; // messaggi informativi della pagina (es. il passaggio a CPU)

    // La prova più forte sulla riservatezza: si guarda ogni richiesta che il browser prova a fare.
    page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http") && u.hostname !== "localhost") external.push(r.url()); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("INFO:")) problems.push(m.text()); if (m.type() === "info") infos.push(m.text()); });

    // Questo codice viene iniettato nella pagina prima del suo script.
    await page.addInitScript((attributi) => {
      // Una violazione della CSP non genera un errore JavaScript: va ascoltata a parte.
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
      window.__trace = [];
      // L'osservatore va agganciato a `document.body`, che a questo punto non esiste ancora:
      // per questo si aspetta DOMContentLoaded (senza, l'osservatore non registrava nulla).
      document.addEventListener("DOMContentLoaded", () =>
        new MutationObserver(() => window.__trace.push({ ...document.body.dataset }))
          .observe(document.body, { attributes: true, attributeFilter: attributi }));
    }, scenario.attributi);

    // `?e2e` è ciò che autorizza la pagina a pubblicare i dati di ogni fotogramma su data-*.
    // Senza quel parametro non espone nulla: è una via aperta solo per i test.
    // Uno scenario può aggiungere i propri parametri (`qs`), per esempio per forzare la CPU.
    const qs = `?e2e${scenario.qs ? `&${scenario.qs}` : ""}${process.env.QS ? `&${process.env.QS.replace(/^\?/, "")}` : ""}`;
    const resp = await page.goto(`http://localhost:${PORT}${scenario.percorso}${qs}`);
    check(!!resp.headers()["content-security-policy"], "la risposta ha la CSP di produzione");

    await page.click("#start");
    // Il caricamento del modello e l'avvio della camera possono prendere parecchi secondi su una
    // macchina senza GPU: si aspetta lo stato, non un tempo fisso.
    await page.waitForFunction(() => ["running", "error"].includes(document.body.dataset.state), null, { timeout: 60000 });
    check((await page.evaluate(() => document.body.dataset.state)) === "running", "la camera si accende e il modello si carica");

    await page.waitForTimeout(scenario.durata ?? DURATION); // uno scenario può chiedere più tempo (la sfida dura cinque round)
    const schermata = join(cache, `running-${scenario.nome}.png`);
    await page.screenshot({ path: schermata }); // prova visiva, da guardare a occhio
    const trace = await page.evaluate(() => window.__trace);

    // Distribuzione delle combinazioni viste: è così che si era scoperta la "mano fantasma"
    // (2 fotogrammi su 117 con due mani) poi risolta con la conferma su 3 fotogrammi in main.ts.
    const counts = {};
    for (const t of trace) {
      const k = JSON.stringify({ ...t, wrist: undefined, nose: undefined, state: undefined });
      counts[k] = (counts[k] ?? 0) + 1;
    }
    console.log("    distribuzione", JSON.stringify(counts));

    scenario.controlli(trace);

    await page.click("#stop");
    await page.waitForTimeout(300);
    // Riservatezza, seconda prova: dopo lo spegnimento la telecamera deve essere davvero rilasciata.
    check(await page.evaluate(() => document.getElementById("video").srcObject === null), "dopo 'Spegni camera' lo stream è rilasciato");
    check(external.length === 0, `nessuna richiesta verso altri domini ${external.length ? external : ""}`);
    check(problems.length === 0, `nessun errore o violazione CSP in console ${problems.length ? JSON.stringify(problems) : ""}`);
    infos.forEach((i) => console.log(`    info: ${i}`));
    console.log(`    schermata: tests/e2e/.cache/running-${scenario.nome}.png`);
  } finally {
    // `finally`: il browser va chiuso anche se un controllo esplode, altrimenti resta un processo
    // appeso e la prova successiva parte in un ambiente sporco.
    await browser.close();
  }
}

/**
 * I posti: al massimo cinque persone insieme (deploy/server.mjs + src/presenza.ts).
 *
 * Si occupano i cinque posti con identificativi finti, poi si apre una pagina vera e si verifica che
 * (1) dica che il sito è al completo e resti in attesa, (2) l'attesa si possa annullare, (3)
 * appena un posto si libera parta da sola. Il server è quello vero (il Caddy di prova gli fa da
 * proxy): se ci fossero persone vere collegate in questo momento il test potrebbe sbagliare.
 */
async function provaPosti() {
  console.log("\n▸ posti (massimo 5 persone insieme)");
  // Sul sito vero il limite oggi è altissimo (08/10/2026): il meccanismo si prova su una copia del
  // server avviata qui con MANO_MAX_UTENTI=5, che serve la stessa build e ha un contatore accessi a parte.
  const PORTA_POSTI = 8797;
  const copia = spawn(process.execPath, [join(here, "..", "..", "..", "deploy", "server.mjs")], {
    env: { ...process.env, PORT: String(PORTA_POSTI), MANO_MAX_UTENTI: "5", MANO_FILE_ACCESSI: join(cache, "accessi-prova.json") },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(`http://127.0.0.1:${PORTA_POSTI}/presenza/stato`); break; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
    await provaPostiSu(`http://127.0.0.1:${PORTA_POSTI}`);
  } finally {
    copia.kill();
  }
}

async function provaPostiSu(base) {
  const stato = async () => (await fetch(`${base}/presenza/stato`)).json();
  const chiama = (azione, id) => fetch(`${base}/presenza/${azione}?id=${id}`, { method: "POST" });
  const ids = Array.from({ length: 5 }, (_, i) => `prova-posti-${Date.now()}-${i}`);

  const prima = await stato();
  check(prima.max === 5, `il limite è di 5 persone (${prima.max})`);
  for (const id of ids) await chiama("entra", id);
  check((await stato()).attivi >= 5, "i cinque posti risultano occupati");
  const sesto = await chiama("entra", `prova-posti-${Date.now()}-sesto`);
  check(sesto.status === 503, `il sesto viene respinto con 503 (${sesto.status})`);

  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${join(cache, "hands.mjpeg")}`, "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`${base}/sfida/?e2e&delegate=cpu`);
    const etichetta = await page.textContent("#start");

    // 1) a posti finiti: lo dice, resta in attesa, la camera non parte
    await page.click("#start");
    await page.waitForFunction(() => !document.getElementById("error").hidden, null, { timeout: 8000 });
    const messaggio = await page.textContent("#error");
    check(/al completo/.test(messaggio) && /riprova più tardi/.test(messaggio), `la pagina dice che il sito è al completo e di riprovare più tardi («${messaggio.slice(0, 48)}…»)`);
    check((await page.getAttribute("body", "data-state")) !== "running", "a posti finiti la camera NON parte");
    check((await page.textContent("#start")) === "Annulla attesa", "il pulsante diventa «Annulla attesa»");

    // 2) annullare
    await page.click("#start");
    await page.waitForFunction(() => document.getElementById("error").hidden, null, { timeout: 8000 });
    check((await page.textContent("#start")) === etichetta, "annullando, il pulsante torna com'era e il messaggio sparisce");

    // 3) di nuovo in attesa, poi si libera un posto: deve partire da sola
    await page.click("#start");
    await page.waitForFunction(() => !document.getElementById("error").hidden, null, { timeout: 8000 });
    await chiama("esci", ids[0]);
    await page.waitForFunction(() => document.body.dataset.state === "running", null, { timeout: 60000 });
    check(true, "appena un posto si libera la partita parte da sola");

    // 4) spegnendo la camera il posto torna libero
    const dentro = (await stato()).attivi;
    await page.click("#stop");
    await page.waitForTimeout(800);
    check((await stato()).attivi === dentro - 1, `spegnendo la camera il posto si libera (${dentro} → ${(await stato()).attivi})`);
  } finally {
    await browser.close();
    for (const id of ids) await chiama("esci", id);
  }
  check((await stato()).attivi === prima.attivi, "alla fine non resta nessun posto occupato dal test");
}

/**
 * Il pulsante «Schermo intero» su tutte le pagine con la camera: un clic entra, un secondo clic
 * esce, il menu si nasconde mentre si è dentro. Non serve la camera: si prova solo l'interfaccia.
 */
async function provaSchermoIntero() {
  console.log("\n▸ schermo intero (tutte le pagine con la camera)");
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  try {
    for (const percorso of ["/", "/sfida/", "/onda/", "/corpo/"]) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await page.goto(`http://localhost:${PORT}${percorso}`);
      const nome = `${percorso}`;
      const stato = () => page.evaluate(() => ({
        dentro: document.fullscreenElement !== null,
        classe: document.documentElement.classList.contains("schermo-intero"),
        testo: document.getElementById("schermo-intero")?.textContent ?? "",
        menu: getComputedStyle(document.querySelector(".nav")).display,
      }));

      const prima = await stato();
      check(!prima.dentro && !prima.classe && prima.menu !== "none", `${nome}: all'inizio è in finestra, con il menu`);

      await page.click("#schermo-intero");
      await page.waitForFunction(() => document.fullscreenElement !== null && document.documentElement.classList.contains("schermo-intero"), null, { timeout: 5000 }).catch(() => {});
      const dentro = await stato();
      check(dentro.dentro && dentro.classe, `${nome}: un clic mette a schermo intero`);
      check(dentro.menu === "none", `${nome}: a schermo intero il menu si nasconde`);
      check(/Esci/.test(dentro.testo), `${nome}: il pulsante diventa «${dentro.testo}»`);

      await page.click("#schermo-intero");
      await page.waitForFunction(() => document.fullscreenElement === null && !document.documentElement.classList.contains("schermo-intero"), null, { timeout: 5000 }).catch(() => {});
      const fuori = await stato();
      check(!fuori.dentro && !fuori.classe && fuori.menu !== "none", `${nome}: lo stesso pulsante riporta in modalità normale`);
      check(/Schermo intero/.test(fuori.testo) && !/Esci/.test(fuori.testo), `${nome}: il pulsante torna «${fuori.testo}»`);
      await page.close();
    }
    // Automatico (dal 08/10/2026): il clic su «Accendi la camera» mette anche a schermo intero.
    for (const percorso of ["/", "/sfida/", "/onda/", "/corpo/"]) {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      await page.goto(`http://localhost:${PORT}${percorso}?autofs`);
      await page.click("#start");
      const ok = await page.waitForFunction(() => document.documentElement.classList.contains("schermo-intero"), null, { timeout: 5000 }).then(() => true, () => false);
      check(ok, `${percorso}: il clic su «Accendi» mette da solo a schermo intero`);
      const contatore = await page.evaluate(() => { const e = document.querySelector(".accessi"); return e ? getComputedStyle(e).display : "assente"; });
      check(contatore === "none" || contatore === "assente", `${percorso}: a schermo intero il contatore degli accessi è nascosto (${contatore})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
