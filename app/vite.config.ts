/**
 * vite.config.ts — configurazione di Vite (lo strumento che compila e mette insieme il sito).
 *
 * Perché Vite: in sviluppo serve i file senza ricompilare tutto (ricarica quasi istantanea), in
 * produzione produce un sito statico con i nomi dei file firmati dal contenuto, adatto a essere
 * messo in cache per sempre. È lo standard di fatto per un progetto in TypeScript senza framework.
 *
 * Qui dentro c'è una sola cosa non ovvia: la disattivazione della telemetria di MediaPipe.
 */
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** Percorso assoluto di un file del progetto: nei moduli ES `__dirname` non esiste. */
const page = (relativo: string) => fileURLToPath(new URL(relativo, import.meta.url));

/**
 * @mediapipe/tasks-vision 1.0.1 crea sempre, dentro ogni task, un piccolo "registratore" che ogni
 * 60 secondi manda a https://odml.pa.googleapis.com/v1/log alcune metriche d'uso: tipo di task,
 * modalità, tempi di esecuzione, sistema operativo. Nessuna immagine, ma è comunque una chiamata
 * a un terzo, e la libreria non offre alcun modo per spegnerla.
 *
 * Questo plugin interviene sul codice della libreria prima che venga impacchettato e rende la sua
 * funzione di invio una scatola vuota. Dopo la sostituzione il minificatore si accorge che il
 * resto della funzione non è più raggiungibile e cancella anche l'indirizzo.
 *
 * La CSP del sito (`connect-src 'self'`) bloccherebbe comunque la richiesta — infatti è proprio
 * così che l'abbiamo scoperta — ma vale la pena non farla nemmeno partire.
 *
 * Nota sulla fragilità: la sostituzione si basa su una stringa esatta del file minificato. Se un
 * aggiornamento della libreria la cambia, `this.error` interrompe la build con un messaggio
 * chiaro, invece di lasciar passare in silenzio una versione con la telemetria riaccesa.
 */
function disableMediapipeTelemetry(): Plugin {
  const pattern = "flush(t,e){if(this.error)";
  return {
    name: "disable-mediapipe-telemetry",
    enforce: "pre", // prima degli altri plugin: il codice deve essere ancora quello originale
    transform(code, id) {
      if (!id.includes("@mediapipe/tasks-vision/vision_bundle")) return null;
      if (!code.includes(pattern)) {
        this.error("telemetria MediaPipe: pattern non trovato, ricontrollare la patch in vite.config.ts");
      }
      // `this.h=[]` svuota la coda dei messaggi, `t?.()` avvisa il chiamante che è "andata bene".
      return { code: code.replace(pattern, "flush(t,e){this.h=[];t?.();return;if(this.error)"), map: null };
    },
  };
}

export default defineConfig({
  plugins: [disableMediapipeTelemetry()],
  // Di norma Vite pre-impacchetta le dipendenze prima di servirle in sviluppo, e in quella fase i
  // plugin di trasformazione non passano. Escludendo MediaPipe, la patch vale anche con `npm run dev`.
  optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  build: {
    // Three.js e MediaPipe insieme superano il mezzo megabyte: è normale per un'app 3D, e
    // l'avviso predefinito di Vite qui sarebbe solo rumore.
    chunkSizeWarningLimit: 900,

    // Ogni pagina del sito va dichiarata qui: Vite parte dai file HTML, segue gli script che trova
    // e costruisce un file per ciascuno. Una pagina che non è in questo elenco viene semplicemente
    // ignorata dalla build e non finisce mai online (è così che `prova-scheletro.html` resta uno
    // strumento di sviluppo). Il codice comune (Three.js, MediaPipe, camera.ts…) finisce in pezzi
    // condivisi, scaricati una volta sola anche visitando tutte le pagine.
    //   index.html      → /            la mano in 3D
    //   sfida/…         → /sfida/      sasso carta forbici fra due persone
    //   onda/…          → /onda/       l'onda energetica: due mani unite, 4 secondi, il raggio
    //   corpo/index.html→ /corpo/      il corpo
    //   tutorial/…      → /tutorial/   la guida, senza camera
    //   corso/…         → /corso/      il programma del corso, senza camera
    rollupOptions: {
      input: {
        mano: page("index.html"),
        sfida: page("sfida/index.html"),
        onda: page("onda/index.html"),
        corpo: page("corpo/index.html"),
        tutorial: page("tutorial/index.html"),
        corso: page("corso/index.html"),
        crediti: page("crediti/index.html"),
        privacy: page("privacy/index.html"),
      },
    },
  },
});
