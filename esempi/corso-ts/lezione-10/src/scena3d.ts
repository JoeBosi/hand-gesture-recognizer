// src/scena3d.ts — scena 3D già pronta: tu devi solo chiamare mostraMano() e disegna()
import * as THREE from "three";
import type { Punto } from "./disegna";

const tela3d = document.getElementById("scena") as HTMLCanvasElement;

const scena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ canvas: tela3d, antialias: true, alpha: true });

function adatta(): void {
  const w = tela3d.clientWidth || window.innerWidth;
  const h = tela3d.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();   // obbligatorio dopo aver cambiato le proporzioni
}
window.addEventListener("resize", adatta);
adatta();

// Luci: una diffusa perché niente resti nero, una direzionale che dà volume.
scena.add(new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 1.4));
const principale = new THREE.DirectionalLight(0xffffff, 2.2);
principale.position.set(3, 5, 8);
scena.add(principale);

// 21 sfere, create UNA volta sola: a ogni fotogramma si spostano soltanto.
const geometria = new THREE.SphereGeometry(1, 20, 14);
const materiale = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35 });
const sfere: THREE.Mesh[] = [];
for (let i = 0; i < 21; i++) {
  const s = new THREE.Mesh(geometria, materiale);
  s.position.set((i - 10) * 0.35, 0, 0);   // in fila, finché non arriva una mano vera
  s.scale.setScalar(0.12);
  scena.add(s);
  sfere.push(s);
}

const LARGHEZZA = 6;
const ALTEZZA = 4.5;

const PUNTE = [4, 8, 12, 16, 20];

/** Sposta le 21 sfere sui 21 punti della mano (coordinate 0…1 di MediaPipe). */
export function mostraMano(punti: Punto[]): void {
  for (let i = 0; i < 21; i++) {
    const p = punti[i];
    sfere[i].scale.setScalar(PUNTE.includes(i) ? 0.16 : 0.12);
    sfere[i].position.set(
      (0.5 - p.x) * LARGHEZZA,
      (0.5 - p.y) * ALTEZZA,
      -p.z * LARGHEZZA * 1.6,
    );
  }
  mostra(true);
}

/** Colora tutta la mano: il materiale è uno solo, condiviso dalle 21 sfere. */
export function coloraMano(colore: number): void {
  materiale.color.setHex(colore);
}

/** Mostra o nasconde la mano in blocco. */
export function mostra(visibile: boolean): void {
  for (const s of sfere) s.visible = visibile;
}

/** Un fotogramma. Va chiamata dentro il ciclo di main.ts. */
export function disegna(): void {
  renderer.render(scena, camera);
}
