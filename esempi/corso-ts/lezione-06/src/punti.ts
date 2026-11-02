import type { Punto } from "./disegna";

/** Una mano aperta inventata: coordinate fra 0 e 1, come quelle vere. */
export const MANO_FINTA: Punto[] = [
  { x: 0.50, y: 0.90, z: 0 },   // 0  polso
  { x: 0.40, y: 0.84, z: 0 },   // 1  pollice
  { x: 0.33, y: 0.76, z: 0 },   // 2
  { x: 0.28, y: 0.68, z: 0 },   // 3
  { x: 0.24, y: 0.61, z: 0 },   // 4  punta del pollice
  { x: 0.44, y: 0.62, z: 0 },   // 5  indice
  { x: 0.43, y: 0.50, z: 0 },   // 6
  { x: 0.42, y: 0.42, z: 0 },   // 7
  { x: 0.42, y: 0.35, z: 0 },   // 8  punta dell'indice
  { x: 0.52, y: 0.60, z: 0 },   // 9  medio
  { x: 0.52, y: 0.47, z: 0 },   // 10
  { x: 0.52, y: 0.38, z: 0 },   // 11
  { x: 0.52, y: 0.31, z: 0 },   // 12 punta del medio
  { x: 0.59, y: 0.62, z: 0 },   // 13 anulare
  { x: 0.60, y: 0.50, z: 0 },   // 14
  { x: 0.61, y: 0.42, z: 0 },   // 15
  { x: 0.61, y: 0.35, z: 0 },   // 16 punta dell'anulare
  { x: 0.65, y: 0.67, z: 0 },   // 17 mignolo
  { x: 0.68, y: 0.58, z: 0 },   // 18
  { x: 0.70, y: 0.52, z: 0 },   // 19
  { x: 0.72, y: 0.46, z: 0 },   // 20 punta del mignolo
];

/** Da coordinate 0…1 a pixel di una tela larga `larghezza` e alta `altezza`. */
export function aPixel(p: Punto, larghezza: number, altezza: number): Punto {
  return { x: p.x * larghezza, y: p.y * altezza, z: p.z };
}
