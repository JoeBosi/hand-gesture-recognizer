// src/filtro.ts
import type { Punto } from "./disegna";

export class MediaMobile {
  private valori: number[] = [];
  private readonly quanti: number;

  constructor(quanti = 5) {
    this.quanti = quanti;
  }

  aggiungi(valore: number): void {
    this.valori.push(valore);
    if (this.valori.length > this.quanti) this.valori.shift();
  }

  /** La media dei valori in memoria. Se non ce n'è nessuno, restituisce 0. */
  valore(): number {
    if (this.valori.length === 0) return 0;
    let somma = 0;
    for (const v of this.valori) somma += v;
    return somma / this.valori.length;
  }
}

export class FiltroMano {
  private filtri: MediaMobile[] = [];

  constructor(quanti = 5) {
    // 21 punti × 3 coordinate: un filtro per ciascuna, con la sua memoria
    for (let i = 0; i < 21 * 3; i++) this.filtri.push(new MediaMobile(quanti));
  }

  smorza(punti: Punto[]): Punto[] {
    const risultato: Punto[] = [];
    for (let i = 0; i < punti.length; i++) {
      this.filtri[i * 3].aggiungi(punti[i].x);
      this.filtri[i * 3 + 1].aggiungi(punti[i].y);
      this.filtri[i * 3 + 2].aggiungi(punti[i].z);
      risultato.push({
        x: this.filtri[i * 3].valore(),
        y: this.filtri[i * 3 + 1].valore(),
        z: this.filtri[i * 3 + 2].valore(),
      });
    }
    return risultato;
  }
}
