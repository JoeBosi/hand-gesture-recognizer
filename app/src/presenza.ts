/**
 * presenza.ts — i posti: al massimo MAX_UTENTI persone insieme (vedi deploy/server.mjs; oggi il tetto è altissimo).
 *
 * Il sito è libero, senza password, ma non più di cinque schede con la camera accesa
 * contemporaneamente. Questo modulo è la metà che sta nella pagina:
 *
 *   1. `entra` — prima di accendere la camera si chiede un posto al server;
 *   2. se i posti sono finiti, la pagina lo DICE, resta IN ATTESA e riprova da sola ogni pochi
 *      secondi: appena se ne libera uno parte, e in ogni momento si può annullare;
 *   3. finché la camera è accesa si rinnova il posto ogni 15 secondi (`mantieni`);
 *   4. quando la camera si spegne si libera (`libera`).
 *
 * Cosa viaggia: un identificativo casuale generato a ogni apertura della pagina (non è un cookie,
 * non si salva da nessuna parte, non si lega a una persona) e nient'altro. Nessuna immagine, nessun
 * punto del corpo: la richiesta è una POST vuota a un indirizzo del sito stesso, ed è la CSP
 * `connect-src 'self'` a garantire che non possa andare altrove.
 *
 * Se il server dei posti non risponde (il sito in sviluppo, una rete che cade) la pagina **lascia
 * entrare**: bloccare tutti perché il contatore non risponde sarebbe peggio del limite che non si
 * applica. Solo un 503 esplicito vuol dire «al completo».
 */

/** Ogni apertura della pagina ha il suo numero casuale, tenuto solo in memoria. */
const id = crypto.randomUUID();

const RINNOVO_MS = 15_000;
const RIPROVA_MS = 4_000;

type Esito = "ok" | "pieno";

async function chiama(azione: "entra" | "ping" | "esci"): Promise<Esito> {
  try {
    // `keepalive` lascia partire la richiesta anche se la pagina si sta chiudendo: serve a `esci`.
    const r = await fetch(`/presenza/${azione}?id=${id}`, { method: "POST", keepalive: true, cache: "no-store" });
    return r.status === 503 ? "pieno" : "ok";
  } catch {
    return "ok"; // il contatore non risponde: si lascia entrare (vedi sopra)
  }
}

let timer = 0;
let haPosto = false;

/**
 * Chiede un posto e, se sono finiti, aspetta che se ne liberi uno.
 *
 * @param attesa chiamata con il testo da mostrare mentre si aspetta, e con `null` quando non serve
 *        più (posto ottenuto o attesa annullata)
 * @param annullata dice se l'utente ha rinunciato ad aspettare
 * @returns `true` se il posto è stato ottenuto, `false` se l'attesa è stata annullata (o se la
 *          scheda è stata nascosta mentre si aspettava)
 */
export async function entra(attesa: (testo: string | null) => void, annullata: () => boolean): Promise<boolean> {
  while (!annullata()) {
    // Una scheda nascosta o chiusa che aspettava non deve prendere un posto quando se ne libera
    // uno: lo toglierebbe a chi è davvero lì. Si rinuncia, e l'utente al ritorno preme di nuovo.
    if (document.hidden) {
      attesa(null);
      return false;
    }
    if ((await chiama("entra")) === "ok") {
      haPosto = true;
      attesa(null);
      return true;
    }
    attesa(
      "Il sito è al completo: ci sono già troppe persone che lo stanno usando. " +
        "Sei in attesa: appena si libera un posto parte da solo. Se preferisci, riprova più tardi.",
    );
    await new Promise((ok) => setTimeout(ok, RIPROVA_MS));
  }
  attesa(null);
  return false;
}

/**
 * Tiene il posto finché la camera è accesa.
 *
 * @param perso chiamata se il server dice «al completo» al rinnovo: il posto è scaduto (per esempio
 *        il computer è rimasto in stand-by) e nel frattempo lo ha preso qualcun altro. La pagina
 *        deve spegnere la camera.
 */
export function mantieni(perso: () => void): void {
  window.clearInterval(timer);
  timer = window.setInterval(async () => {
    if (!haPosto) return;
    if ((await chiama("ping")) === "pieno") {
      haPosto = false;
      window.clearInterval(timer);
      perso();
    }
  }, RINNOVO_MS);
}

/** Libera il posto (se c'è) e smette di rinnovarlo. Si può chiamare quante volte si vuole. */
export function libera(): void {
  window.clearInterval(timer);
  if (!haPosto) return;
  haPosto = false;
  void chiama("esci");
}
