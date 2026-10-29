/**
 * vicinanza.ts — tenere solo le mani di chi sta davanti alla camera (dal 08/10/2026).
 *
 * Problema: MediaPipe restituisce le prime mani che trova, anche quelle di una persona lontana sullo
 * sfondo. Soluzione: si chiedono fino a 4 mani e si tengono solo quelle grandi quasi quanto la più
 * grande. La grandezza è `max(polso→nocca del medio, 1,15 × nocca dell'indice→nocca del mignolo)`:
 * il massimo delle due regge anche quando la mano è di scorcio. Una persona a distanza doppia ha mani
 * grandi la metà (≈ 0,5); due mani della stessa persona differiscono meno del 25%.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export function grandezzaMano(l: NormalizedLandmark[], aspect: number): number {
  const d = (a: number, b: number) => Math.hypot((l[a].x - l[b].x) * aspect, l[a].y - l[b].y);
  return Math.max(d(0, 9), 1.15 * d(5, 17));
}

/**
 * Indici delle mani da tenere, nell'ordine originale: al più `max`, e solo quelle con grandezza
 * ≥ `soglia` × la più grande.
 */
export function maniVicine(mani: NormalizedLandmark[][], aspect: number, soglia = 0.6, max = 2): number[] {
  const g = mani.map((l) => grandezzaMano(l, aspect));
  const top = Math.max(0, ...g);
  return g
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v >= soglia * top)
    .sort((a, b) => b.v - a.v)
    .slice(0, max)
    .map(({ i }) => i)
    .sort((a, b) => a - b);
}

/** Applica la scelta a tutti gli array paralleli di un risultato MediaPipe (landmarks, handedness, …). */
export function filtraRisultato<T extends { landmarks: NormalizedLandmark[][] }>(r: T, aspect: number, soglia?: number): T {
  if (r.landmarks.length <= 1) return r;
  const tieni = maniVicine(r.landmarks, aspect, soglia);
  if (tieni.length === r.landmarks.length) return r;
  const out: Record<string, unknown> = { ...r };
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v) && v.length === r.landmarks.length) out[k] = tieni.map((i) => v[i]);
  }
  return out as T;
}
