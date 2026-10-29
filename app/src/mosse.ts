/**
 * mosse.ts — sasso, carta o forbici, letti dalla forma della mano e non dal nome di un gesto.
 *
 * Il classificatore di gesti di MediaPipe è addestrato soprattutto su mani viste dal **palmo**: una
 * mano girata di 180° (di dorso) può essere scambiata per un altro gesto o per nessuno. Per un
 * gioco in cui ognuno tiene la mano come gli viene comoda non basta.
 *
 * Qui si guarda invece una cosa che non dipende da come è girata la mano: **quali dita sono
 * distese e quali piegate**. Per ognuna delle quattro dita lunghe si confronta la distanza fra la
 * punta e il polso con quella fra la nocca e il polso:
 *
 *   dito disteso:  la punta sta molto più lontana dal polso della nocca (rapporto ~1,8–2,1)
 *   dito piegato:  la punta torna verso il palmo, vicino alla nocca o più vicina (rapporto < 1,3)
 *
 * È una proporzione fra due distanze nello stesso fotogramma, quindi vale a ogni distanza dalla
 * camera, e non cambia se si guarda il palmo o il dorso. Il pollice si ignora di proposito: nel
 * sasso sta fuori o dentro a seconda di chi lo fa, e nelle forbici è libero.
 *
 *   sasso   = tutte e quattro piegate
 *   carta   = tutte e quattro distese
 *   forbici = indice e medio distesi, anulare e mignolo piegati
 *
 * Qualunque altra combinazione (tre dita, solo l'indice, mano a metà) NON è una mossa: il round si
 * ripete, invece di tirare a indovinare.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type Mossa = "sasso" | "carta" | "forbici";

/** Per ogni dito lungo: indice della nocca (MCP) e della punta. Il polso è sempre il punto 0. */
const DITA = [
  { nocca: 5, punta: 8 }, // indice
  { nocca: 9, punta: 12 }, // medio
  { nocca: 13, punta: 16 }, // anulare
  { nocca: 17, punta: 20 }, // mignolo
] as const;

/** Rapporto punta/nocca sopra il quale un dito è disteso, e sotto il quale è piegato. */
export const SOGLIA_DISTESO = 1.55;
export const SOGLIA_PIEGATO = 1.35;

/**
 * Le due soglie sono diverse apposta: fra le due c'è una «zona grigia» in cui il dito non è né
 * l'uno né l'altro, e la mano viene dichiarata *incerta* invece di essere spinta da una parte.
 */
export type StatoDito = "disteso" | "piegato" | "incerto";

/** La distanza nel piano dell'immagine, con la x riportata alla stessa scala della y. */
const dist = (a: NormalizedLandmark, b: NormalizedLandmark, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/** Il rapporto punta/nocca di ogni dito lungo (indice, medio, anulare, mignolo). */
export function rapportiDita(l: NormalizedLandmark[], aspect: number): number[] {
  const polso = l[0];
  return DITA.map((d) => dist(l[d.punta], polso, aspect) / Math.max(dist(l[d.nocca], polso, aspect), 1e-6));
}

export function statoDito(rapporto: number): StatoDito {
  if (rapporto >= SOGLIA_DISTESO) return "disteso";
  if (rapporto <= SOGLIA_PIEGATO) return "piegato";
  return "incerto";
}

/**
 * La mossa fatta da una mano, o `null` se non è nessuna delle tre (o se è incerta).
 *
 * @param aspect larghezza/altezza del video: senza questa correzione la stessa mano darebbe
 *        rapporti diversi su una webcam 4:3 e su una 16:9.
 */
export function riconosciMossa(l: NormalizedLandmark[], aspect: number): Mossa | null {
  const s = rapportiDita(l, aspect).map(statoDito);
  const [indice, medio, anulare, mignolo] = s;
  if (s.every((x) => x === "piegato")) return "sasso";
  if (s.every((x) => x === "disteso")) return "carta";
  if (indice === "disteso" && medio === "disteso" && anulare === "piegato" && mignolo === "piegato") return "forbici";
  return null;
}
