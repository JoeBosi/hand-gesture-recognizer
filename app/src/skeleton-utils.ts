/**
 * skeleton-utils.ts — le funzioni di servizio dello scheletro.
 *
 * Tre operazioni che servono ovunque nello scheletro e che non hanno niente di specifico: trovare
 * il punto medio, mettere un osso fra due punti, costruire una terna di assi da due direzioni
 * approssimative.
 */
import * as THREE from "three";
import type { Point3 } from "./scene3d";

export const UP = new THREE.Vector3(0, 1, 0);
export const FORWARD = new THREE.Vector3(0, 0, 1);

export const mid = (a: THREE.Vector3, b: THREE.Vector3) => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
export const toVec = (p: Point3) => new THREE.Vector3(p.x, p.y, p.z);

/** Un vettore di lunghezza 1 nella stessa direzione, senza toccare l'originale. */
export const unit = (v: THREE.Vector3) => v.clone().normalize();

/**
 * Porta un'osso (geometria alta 1 e larga 1, in piedi lungo Y) da `a` a `b`:
 *   posizione = punto medio, rotazione = da Y alla direzione a→b, scala = raggio e lunghezza.
 */
export function placeBone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  // Il controllo evita la divisione per zero quando due punti coincidono.
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  mesh.scale.set(radius, len, radius);
}

/**
 * Costruisce una terna di assi ortogonali (destrorsa) da due direzioni che ortogonali non sono.
 *
 * È l'operazione che serve ogni volta che si deve orientare un pezzo rigido — il cranio, il
 * bacino, una costola — a partire da punti misurati, che non stanno mai perfettamente ad angolo
 * retto fra loro. Si tiene un asse per buono, si ricavano gli altri due con prodotti vettoriali, e
 * il risultato è garantito ortogonale.
 *
 * @param sideHint  direzione approssimativa del fianco (da destra a sinistra della persona)
 * @param upHint    direzione approssimativa dell'alto
 * @param forwardHint direzione approssimativa dello sguardo, se la si conosce meglio dell'alto
 */
export function orientation(
  sideHint: THREE.Vector3,
  upHint: THREE.Vector3,
  forwardHint?: THREE.Vector3,
): { quaternion: THREE.Quaternion; forward: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3 } {
  const up = upHint.clone().normalize();
  let side = sideHint.clone().normalize();
  if (side.lengthSq() < 0.5) side = new THREE.Vector3(1, 0, 0);

  // L'avanti nasce dal prodotto vettoriale fra alto e fianco. Se si conosce anche una direzione di
  // sguardo (il naso), la si usa per decidere il **verso**: senza, uno scheletro ripreso di spalle
  // verrebbe disegnato al contrario, con la faccia dietro.
  const forward = new THREE.Vector3().crossVectors(side, up).normalize();
  const reference = forwardHint ?? FORWARD;
  if (forward.dot(reference) < 0) {
    forward.negate();
    side.negate();
  }
  // Riortogonalizzazione finale: `side` poteva non essere perpendicolare ad `up`.
  side = new THREE.Vector3().crossVectors(up, forward).normalize();

  const m = new THREE.Matrix4().makeBasis(side, up, forward);
  return { quaternion: new THREE.Quaternion().setFromRotationMatrix(m), forward, up, side };
}

/** Limita un numero a un intervallo. */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
