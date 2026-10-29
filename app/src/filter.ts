/**
 * filter.ts — il filtro anti-tremolio.
 *
 * Il problema: anche con la mano ferma, i punti che escono dal riconoscitore ballano di qualche
 * pixel a ogni fotogramma. Sullo schermo si vede una mano che vibra.
 *
 * La soluzione facile — fare la media con i fotogrammi precedenti — cura il tremolio ma
 * introduce ritardo: quando muovi la mano di scatto, quella sullo schermo arriva dopo.
 *
 * Il "One Euro filter" (Casiez, Roussel, Vogel, CHI 2012) risolve il compromesso cambiando la
 * propria forza in base alla velocità del punto:
 *   - punto quasi fermo  → filtra molto  → niente vibrazione
 *   - punto veloce       → filtra poco   → niente ritardo percepibile
 *
 * È poco più di dieci righe di matematica, non ha dipendenze, ed è lo stesso filtro consigliato
 * nella letteratura del tracciamento delle mani. Per questo è scritto qui invece di aggiungere
 * una libreria.
 */

/**
 * Filtro passa-basso elementare: `y = α·x + (1-α)·y_precedente`.
 * Con α vicino a 1 segue fedelmente il valore; vicino a 0 lo insegue lentamente.
 */
class LowPass {
  private y: number | null = null;

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  /** Ultimo valore prodotto (`null` se non ne è ancora passato nessuno). */
  last(): number | null {
    return this.y;
  }
}

/**
 * Converte una "frequenza di taglio" in hertz nel coefficiente α del passa-basso, tenendo conto
 * di quanto tempo è passato davvero fra due fotogrammi: così il filtro si comporta allo stesso
 * modo a 30 o a 60 fotogrammi al secondo.
 */
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuroFilter {
  private x = new LowPass(); // filtra il valore
  private dx = new LowPass(); // filtra la sua velocità
  private lastTime: number | null = null;

  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  /**
   * @param minCutoff quanto filtrare quando la mano è ferma: più basso = più stabile ma più lento.
   * @param beta      quanto "aprire" il filtro con la velocità: più alto = insegue meglio i movimenti veloci.
   * @param dCutoff   filtro applicato alla stima della velocità, per non farla saltellare.
   *
   * I valori predefiniti sono tarati sulle coordinate normalizzate di MediaPipe (0…1 sull'immagine)
   * e scelti a occhio sul risultato: mano ferma stabile, movimenti rapidi senza scia.
   */
  constructor(minCutoff = 1.2, beta = 8, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timeMs: number): number {
    const prev = this.x.last();

    // Tempo trascorso in secondi. Al primo giro si ipotizzano 30 fps; il minimo di 1 ms evita
    // una divisione per zero se arrivassero due misure con lo stesso istante.
    const dt = this.lastTime === null ? 1 / 30 : Math.max((timeMs - this.lastTime) / 1000, 1e-3);
    this.lastTime = timeMs;

    // Velocità stimata del punto (unità al secondo), a sua volta filtrata.
    const derivative = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dx.filter(derivative, alpha(this.dCutoff, dt));

    // Il cuore del metodo: la soglia di filtro cresce con la velocità.
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

/**
 * Applica il filtro a un insieme di punti: i 21 di una mano oppure i 33 di un corpo.
 *
 * Ogni coordinata ha il proprio filtro indipendente: 21 punti × 3 assi = 63 filtri (191 per il
 * corpo), ognuno con due numeri di stato. Costa niente e mantiene il codice banale.
 *
 * Un'istanza per figura, creata quando la figura appare e buttata quando sparisce: altrimenti
 * alla ricomparsa il filtro "ricorderebbe" la posizione di prima e la mano arriverebbe
 * strisciando da lì (vedi main.ts e corpo.ts).
 *
 * @param count quanti punti ha la figura: 21 per una mano (predefinito), 33 per un corpo.
 */
export class LandmarkSmoother {
  private filters: OneEuroFilter[];

  constructor(count = 21) {
    this.filters = Array.from({ length: count * 3 }, () => new OneEuroFilter());
  }

  smooth(points: { x: number; y: number; z: number }[], timeMs: number) {
    return points.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, timeMs),
      y: this.filters[i * 3 + 1].filter(p.y, timeMs),
      z: this.filters[i * 3 + 2].filter(p.z, timeMs),
    }));
  }
}
