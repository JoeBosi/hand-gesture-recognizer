/**
 * hand3d.ts — la mano stilizzata in 3D.
 *
 * Trasforma i 21 punti che arrivano dal riconoscitore in una figura tridimensionale: una sfera
 * per ogni articolazione, un cilindro per ogni osso, un poligono semitrasparente per il palmo.
 *
 * Perché Three.js: disegnare in WebGL "a mano" significa scrivere shader, matrici e gestione del
 * contesto grafico; Three.js è la libreria standard per questo, non ha dipendenze proprie e pesa
 * circa 500 kB compressi. In cambio, tutta la scena sta in questo file.
 *
 * Perché sfere e cilindri invece di un modello di mano realistico: un modello 3D vero andrebbe
 * "vestito" su uno scheletro (rigging, skinning), richiederebbe file pesanti e mesi di rifiniture.
 * Questa forma stilizzata si costruisce con due geometrie e rende leggibile ogni dito.
 *
 * Idea chiave: gli oggetti si creano UNA volta sola nel costruttore; a ogni fotogramma si
 * spostano soltanto. Creare e distruggere oggetti 60 volte al secondo farebbe lavorare il
 * raccoglitore di memoria e produrrebbe scatti.
 */
import * as THREE from "three";
import { FrameScene, fade, type Point3 } from "./scene3d";
import { HAND_CONNECTIONS } from "./tracker";

// Il tipo dei punti vive in scene3d.ts, che è il modulo condiviso con la pagina del corpo:
// si riesporta perché chi usa la mano non debba conoscere due file invece di uno.
export type { Point3 };

/**
 * I vertici del palmo: polso (0), base del pollice (1) e le quattro nocche (5, 9, 13, 17).
 * Disegnati come un ventaglio di triangoli che parte dal polso.
 */
const PALM = [0, 1, 5, 9, 13, 17];

/** Le punte delle dita: pollice 4, indice 8, medio 12, anulare 16, mignolo 20. */
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

/**
 * La profondità che arriva da MediaPipe è piccola rispetto alle altre due coordinate:
 * moltiplicarla un po' rende visibile il gesto di avvicinare la mano alla camera. 1.6 è scelto a
 * occhio: più in alto la mano sembra deformarsi.
 */
const DEPTH_GAIN = 1.6;

/** Un colore per lato, così due mani insieme restano distinguibili. */
const COLORS = { Right: 0x38bdf8, Left: 0xf472b6 } as const;

/** "Right" | "Left": il tipo deriva dalle chiavi di COLORS, impossibile scrivere un lato inesistente. */
export type Side = keyof typeof COLORS;

/**
 * Una mano: 21 sfere, 21 cilindri (uno per connessione) e il palmo.
 * Tutto dentro un `Group`, così la mano si può nascondere o spostare in blocco.
 */
class StylizedHand {
  readonly group = new THREE.Group();
  private readonly joints: THREE.Mesh[] = [];
  private readonly bones: THREE.Mesh[] = [];
  private readonly palm: THREE.Mesh;

  // Tre materiali, non uno per oggetto: cambiare la trasparenza di un materiale la cambia per
  // tutti gli oggetti che lo usano, ed è così che funziona la dissolvenza.
  private readonly solid: THREE.MeshStandardMaterial; // ossa e articolazioni
  private readonly tips: THREE.MeshStandardMaterial; // punte delle dita, luminose
  private readonly palmMaterial: THREE.MeshStandardMaterial;

  private opacity = 0; // trasparenza attuale
  private targetOpacity = 0; // trasparenza verso cui tendere (1 = visibile)

  /** Posizioni di lavoro riusate a ogni fotogramma, per non allocare 21 vettori ogni volta. */
  private readonly world = Array.from({ length: 21 }, () => new THREE.Vector3());

  /**
   * @param jointGeo e boneGeo arrivano da fuori: la stessa sfera e lo stesso cilindro sono
   *        condivisi fra tutte le mani e tutte le ossa. Ogni oggetto poi li scala come serve.
   */
  constructor(color: number, jointGeo: THREE.BufferGeometry, boneGeo: THREE.BufferGeometry) {
    // MeshStandardMaterial = materiale "fisico": reagisce alle luci, quindi le sfere sembrano
    // volumi e non cerchi piatti.
    this.solid = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, transparent: true });
    this.tips = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color, // "emette" luce propria: le punte si notano anche in ombra
      emissiveIntensity: 0.9,
      roughness: 0.3,
      transparent: true,
    });
    this.palmMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      transparent: true,
      side: THREE.DoubleSide, // il palmo si vede anche da dietro
      depthWrite: false, // essendo semitrasparente non deve nascondere le dita dietro di sé
    });

    for (let i = 0; i < 21; i++) {
      const joint = new THREE.Mesh(jointGeo, FINGERTIPS.has(i) ? this.tips : this.solid);
      this.joints.push(joint);
      this.group.add(joint);
    }
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const bone = new THREE.Mesh(boneGeo, this.solid);
      this.bones.push(bone);
      this.group.add(bone);
    }

    // Il palmo è una geometria costruita a mano: sei vertici che si spostano a ogni fotogramma.
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PALM.length * 3), 3));
    // I triangoli del ventaglio: (polso, pollice, indice), (polso, indice, medio), e così via.
    palmGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
    this.palm = new THREE.Mesh(palmGeo, this.palmMaterial);
    // I vertici cambiano a ogni fotogramma: Three.js non deve fidarsi del volume di ingombro
    // calcolato all'inizio, altrimenti ogni tanto decide che il palmo è fuori schermo e lo salta.
    this.palm.frustumCulled = false;
    this.group.add(this.palm);

    this.group.visible = false; // finché non arriva una mano vera
  }

  /** Sposta articolazioni, ossa e palmo sui punti ricevuti (già in coordinate della scena). */
  update(points: Point3[]): void {
    this.targetOpacity = 1;
    for (let i = 0; i < 21; i++) this.world[i].set(points[i].x, points[i].y, points[i].z);

    // Spessori proporzionali alla mano (distanza polso → nocca del medio): così la figura resta
    // credibile sia con la mano vicina alla camera sia lontana.
    const size = this.world[0].distanceTo(this.world[9]);
    const jointR = size * 0.075;
    const boneR = size * 0.05;

    this.joints.forEach((j, i) => {
      j.position.copy(this.world[i]);
      // Polso un po' più grosso, punte leggermente più grandi: dà carattere alla figura.
      j.scale.setScalar(FINGERTIPS.has(i) ? jointR * 1.15 : i === 0 ? jointR * 1.4 : jointR);
    });

    // Ogni osso è un cilindro alto 1 e largo 1, che va portato da A a B:
    //   posizione = punto medio fra A e B
    //   rotazione = quella che porta l'asse Y (verso naturale del cilindro) sulla direzione A→B
    //   scala     = raggio sui lati, lunghezza del segmento in altezza
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    HAND_CONNECTIONS.forEach(({ start, end }, i) => {
      const a = this.world[start];
      const b = this.world[end];
      const bone = this.bones[i];
      dir.subVectors(b, a);
      const len = dir.length();
      bone.position.addVectors(a, b).multiplyScalar(0.5);
      // `divideScalar(len)` normalizza la direzione; il controllo evita la divisione per zero
      // quando due punti coincidono.
      if (len > 1e-6) bone.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
      bone.scale.set(boneR, len, boneR);
    });

    // Palmo: si riscrivono i sei vertici nel buffer già allocato.
    const pos = this.palm.geometry.getAttribute("position") as THREE.BufferAttribute;
    PALM.forEach((idx, k) => pos.setXYZ(k, this.world[idx].x, this.world[idx].y, this.world[idx].z));
    pos.needsUpdate = true; // senza questo Three.js non rimanda i dati alla scheda grafica
    this.palm.geometry.computeVertexNormals(); // ricalcola l'orientamento per l'illuminazione
  }

  /** Mano non più inquadrata: comincia a svanire. */
  hide(): void {
    this.targetOpacity = 0;
  }

  /**
   * Un passo di dissolvenza, chiamato a ogni disegno.
   * `dt * 12` rende la dissolvenza indipendente dagli fps: circa un decimo di secondo ovunque.
   */
  tick(dt: number): void {
    this.opacity = fade(this.opacity, this.targetOpacity, dt);

    // A zero l'oggetto si spegne del tutto: Three.js salta i gruppi non visibili.
    this.group.visible = this.opacity > 0;
    this.solid.opacity = this.opacity;
    this.tips.opacity = this.opacity;
    this.palmMaterial.opacity = this.opacity * 0.35; // il palmo resta comunque velato
  }
}

/**
 * La scena della mano: eredita telecamera, luci, adattamento alla finestra e conversione delle
 * coordinate da `FrameScene` (scene3d.ts), e aggiunge le due mani.
 */
export class HandScene extends FrameScene {
  private readonly hands: Record<Side, StylizedHand>;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, DEPTH_GAIN);

    // Due geometrie per tutta la scena: una sfera di raggio 1 e un cilindro alto 1.
    // Ogni oggetto le riusa cambiando solo posizione, rotazione e scala.
    const jointGeo = new THREE.SphereGeometry(1, 20, 14);
    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.hands = {
      Right: new StylizedHand(COLORS.Right, jointGeo, boneGeo),
      Left: new StylizedHand(COLORS.Left, jointGeo, boneGeo),
    };
    this.scene.add(this.hands.Right.group, this.hands.Left.group);
  }

  /** Aggiorna una mano, oppure la fa svanire se `points` è null. */
  update(side: Side, points: Point3[] | null): void {
    if (points) this.hands[side].update(points.map((p) => this.toWorld(p)));
    else this.hands[side].hide();
  }

  /** Chiamato da `render()` della classe base: fa avanzare le due dissolvenze. */
  protected override tick(dt: number): void {
    this.hands.Right.tick(dt);
    this.hands.Left.tick(dt);
  }
}
