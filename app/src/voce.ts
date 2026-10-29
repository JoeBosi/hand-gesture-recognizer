/**
 * voce.ts — la voce del gioco, con la sintesi vocale che ha già il browser.
 *
 * Niente librerie e niente file audio: `speechSynthesis` è un'API del browser (Web Speech API) e
 * legge un testo con le voci installate nel sistema. Serve a una cosa sola: chi gioca tiene lo
 * sguardo sulle proprie mani e sull'avversario, non sullo schermo, e il conto alla rovescia, il
 * punto e il vincitore devono arrivare anche all'orecchio.
 *
 * Tre cose da sapere:
 *
 * 1. **Non è garantita.** Un browser può non avere nessuna voce italiana (o nessuna voce, come
 *    Chromium senza testa nelle prove automatiche). Allora le frasi non si sentono e il gioco
 *    funziona identico: tutto quello che si dice è anche scritto a schermo. Niente deve mai
 *    dipendere dal fatto che la voce parli.
 *
 * 2. **Si preferisce una voce locale.** Alcune voci dei browser (quelle «di rete», per esempio le
 *    voci Google di Chrome) inviano il testo a un server per farlo leggere. Qui il testo è solo
 *    frasi fisse del gioco — «tre», «punto al giocatore di sinistra» — e mai nulla che venga dalla
 *    camera, ma resta più pulito scegliere una voce che gira sul dispositivo, e si fa quando c'è.
 *
 * 3. **Parte solo dopo un clic.** I browser vietano di parlare senza che l'utente abbia fatto
 *    qualcosa nella pagina. Il gioco comincia dal pulsante «Accendi la camera», quindi la regola
 *    è già soddisfatta.
 */

const disponibile = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let attiva = true;
let voceScelta: SpeechSynthesisVoice | null = null;
/** L'ultima frase pronunciata o che si sarebbe pronunciata: serve ai test, dove non c'è una voce. */
let ultimaFrase = "";

/**
 * Sceglie la voce italiana migliore fra quelle disponibili: prima una locale, poi una qualsiasi.
 * Le voci arrivano in ritardo (il browser le carica da solo): si ritenta a ogni `voiceschanged`.
 */
function scegliVoce(): void {
  if (!disponibile) return;
  const italiane = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("it"));
  voceScelta = italiane.find((v) => v.localService) ?? italiane[0] ?? null;
}

if (disponibile) {
  scegliVoce();
  speechSynthesis.addEventListener("voiceschanged", scegliVoce);
}

/**
 * Pronuncia una frase.
 *
 * @param urgente interrompe quello che sta dicendo. Serve al conto alla rovescia, dove «due» detto
 *        dopo che sul tabellone c'è già «uno» è peggio che non dirlo; le frasi lunghe (punteggio,
 *        vincitore) invece si lasciano finire.
 */
export function parla(frase: string, urgente = false): void {
  ultimaFrase = frase;
  if (!disponibile || !attiva) return;
  if (urgente) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(frase);
  u.lang = "it-IT";
  if (voceScelta) u.voice = voceScelta;
  u.rate = 1.08; // appena più svelta del normale: un conto alla rovescia lento non è un conto
  speechSynthesis.speak(u);
}

/** Zittisce subito tutto, anche le frasi in coda. Si chiama allo spegnimento della camera. */
export function zittisci(): void {
  if (disponibile) speechSynthesis.cancel();
}

/** Accende o spegne la voce. Spegnendola, quel che si sta dicendo si interrompe. */
export function impostaVoce(on: boolean): void {
  attiva = on;
  if (!on) zittisci();
}

export const voceAttiva = (): boolean => attiva;

/** C'è davvero una voce che parlerà? Serve a dare ai testi il tempo giusto per essere letti. */
export const voceDisponibile = (): boolean => disponibile && attiva && voceScelta !== null;

export const ultimaFraseDetta = (): string => ultimaFrase;
