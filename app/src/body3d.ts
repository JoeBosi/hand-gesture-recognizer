/**
 * body3d.ts — lo scheletro umano.
 *
 * Il riconoscitore dà 33 punti sparsi (naso, spalle, gomiti, anche…). Qui quei punti diventano uno
 * scheletro vero: cranio con mandibola e denti, sette vertebre del collo, dodici toraciche e cinque
 * lombari con i loro dischi, dodici paia di costole con la cartilagine, sterno, clavicole, scapole,
 * bacino, ossa lunghe con le teste, rotule, piedi con metatarsi e dita, mani con le falangi. È
 * un'impalcatura *costruita sopra* i punti, non i punti collegati da bastoncini.
 *
 * La differenza pratica: dei 33 punti, quelli che si disegnano tali e quali sono pochissimi. Tutto
 * il resto — le diciassette vertebre, le ventiquattro costole, la scodella del bacino — non esiste
 * fra i dati e viene ricavato per interpolazione fra i punti che ci sono. Un modello non serve: le
 * proporzioni del corpo umano sono abbastanza regolari da poterle dedurre dalla larghezza delle
 * spalle.
 *
 * Scelte che vale la pena conoscere prima di leggere il codice:
 *
 * 1. **La testa ha un file suo** (`skeleton-head.ts`) e si orienta dal modello del volto, non da
 *    sette punti del corpo: è lì che si spiega perché prima il cranio veniva disegnato chino.
 *    Quando il volto non c'è, si ripiega sulla posa, con l'asse verticale corretto.
 *
 * 2. **Le mani arrivano da un secondo modello.** Il riconoscitore del corpo, delle mani, dà quattro
 *    punti soli: polso, pollice, indice, mignolo. Con quelli le dita si possono solo inventare — e
 *    inventarle sarebbe un disegno, non un riconoscimento. Quando `corpo.ts` passa anche i 21
 *    punti veri di una mano, quella mano viene costruita con le sue falangi; quando non li passa,
 *    il braccio finisce al polso e basta.
 *
 * 3. **Si tiene conto della "visibilità".** Ogni punto arriva con un numero che dice quanto il
 *    modello è sicuro di vederlo davvero: da seduti le gambe sono sotto il tavolo e il modello le
 *    *indovina*. Sotto soglia, quei pezzi non si disegnano. Il busto si disegna anche senza le
 *    anche (davanti a una webcam è quasi sempre così): in quel caso finisce alle lombari alte,
 *    senza bacino, e basta che si vedano le spalle.
 *
 * 4. **L'aspetto viene dalla luce, non dai colori.** Le ossa hanno una grana in rilievo (una
 *    texture di rumore usata come `bumpMap`) e la scena un'illuminazione d'ambiente procedurale
 *    (`RoomEnvironment`): senza file esterni, perché la CSP del sito li vieta.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FrameScene, fade, type Point3 } from "./scene3d";
import { POSE } from "./pose";
import { HAND_CONNECTIONS } from "./hands";
import type { FacePose } from "./face";
import {
  boneGrainTexture,
  discGeometry,
  longBoneGeometry,
  pelvisGeometry,
  ribGeometries,
  roundBoneGeometry,
  scapulaGeometry,
  shortBoneGeometry,
  sternumGeometries,
  vertebraGeometry,
  mirrorX,
  type RibKind,
  type RibParts,
} from "./bones";
import { HeadRig, type FaceWorld } from "./skeleton-head";
import { FORWARD, UP, mid, orientation, placeBone, toVec, unit } from "./skeleton-utils";

export type { Point3 };

/** Un punto del corpo: come gli altri, ma con l'indicazione di quanto è affidabile. */
export interface PosePoint extends Point3 {
  visibility?: number;
}

/** Una mano riconosciuta davvero: 21 punti, e da che parte del corpo sta. */
export interface HandPoints {
  /** "left"/"right" riferiti alla **persona**, come i nomi dei punti della posa. */
  side: "left" | "right";
  points: Point3[];
}

/**
 * Sotto questa confidenza il punto non viene disegnato. 0,5 è il valore che nei test toglie le
 * gambe inventate sotto la scrivania lasciando intatta una persona in piedi.
 */
const MIN_VISIBILITY = 0.5;

/** Colonna: cinque lombari in basso, dodici toraciche sopra. L'indice 0 è L5, l'ultimo è T1. */
const LUMBAR = 5;
const THORACIC = 12;
const VERTEBRAE = LUMBAR + THORACIC;

/** Dove sta ogni vertebra lungo la colonna (0 = bacino, 1 = base del collo). */
const T_LUMBAR = (k: number) => 0.05 + k * 0.07; // k = 0 (L5) … 4 (L1)
const T_THORACIC = (j: number) => 0.95 - j * 0.0505; // j = 0 (T1) … 11 (T12)
const tOfVertebra = (i: number) => (i < LUMBAR ? T_LUMBAR(i) : T_THORACIC(THORACIC - 1 - (i - LUMBAR)));

/** Le 12 costole per lato e a quale famiglia appartengono. */
const RIB_KINDS: RibKind[] = ["vera", "vera", "vera", "vera", "vera", "vera", "vera", "falsa", "falsa", "falsa", "fluttuante", "fluttuante"];

/** Le dita del piede (5) e le sue ossa lunghe (metatarsi). */
const TOES = 5;

class HumanSkeleton {
  readonly group = new THREE.Group();

  // --- I materiali. Sono pochi e sono condivisi: cambiare l'opacità di uno la cambia per tutte le
  // ossa che lo usano, ed è così che funziona la dissolvenza in entrata e in uscita.
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly matBone: THREE.MeshStandardMaterial;
  private readonly matCartilage: THREE.MeshStandardMaterial;
  private readonly matDisc: THREE.MeshStandardMaterial;
  private readonly matDeep: THREE.MeshStandardMaterial;

  // --- I pezzi. Ognuno è una mesh creata una volta sola nel costruttore e riposizionata a ogni
  // fotogramma: in un ciclo di disegno non si creano né si distruggono oggetti.
  private readonly head: HeadRig;
  private readonly spine: THREE.Mesh[] = [];
  private readonly discs: THREE.Mesh[] = [];
  /** `ribs[j]` = costola j-esima (0 = la prima): { destra, sinistra } × { osso, cartilagine }. */
  private readonly ribs: { bone: THREE.Mesh[]; cartilage: (THREE.Mesh | null)[] }[] = [];
  private readonly manubrio: THREE.Mesh;
  private readonly corpoSterno: THREE.Mesh;
  private readonly xifoide: THREE.Mesh;
  private readonly clavicles: THREE.Mesh[] = [];
  private readonly scapulae: THREE.Mesh[] = [];
  private readonly pelvis: THREE.Mesh;
  /** Le ossa lunghe degli arti, indicizzate per nome: humerus-left, tibia-right… */
  private readonly limbs = new Map<string, THREE.Mesh>();
  /** I piedi: per lato, tarso + metatarsi + dita. */
  private readonly feet = {
    left: { tarsus: null as unknown as THREE.Mesh, meta: [] as THREE.Mesh[], toes: [] as THREE.Mesh[] },
    right: { tarsus: null as unknown as THREE.Mesh, meta: [] as THREE.Mesh[], toes: [] as THREE.Mesh[] },
  };
  /** Le ossa delle due mani: 21 collegamenti per mano. */
  private readonly handBones = { left: [] as THREE.Mesh[], right: [] as THREE.Mesh[] };

  private opacity = 0;
  private targetOpacity = 0;

  /** Posizioni di lavoro riusate a ogni fotogramma, per non allocare 33 vettori ogni volta. */
  private readonly world = Array.from({ length: 33 }, () => new THREE.Vector3());
  private readonly visible = new Array<boolean>(33).fill(false);

  constructor(grain: THREE.Texture) {
    const standard = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...p });
    this.matBone = standard({
      color: 0xe6dcc4, // bianco d'osso, appena caldo: un bianco puro sembrerebbe plastica
      roughness: 0.64,
      metalness: 0.0,
      bumpMap: grain,
      bumpScale: 0.9,
    });
    // La cartilagine delle costole: più fredda e più liscia dell'osso, quasi bluastra.
    this.matCartilage = standard({ color: 0xb4bcae, roughness: 0.45, bumpMap: grain, bumpScale: 0.25 });
    // I dischi fra le vertebre: grigio-verdi e opachi.
    this.matDisc = standard({ color: 0x8b9b96, roughness: 0.7 });
    // Per le orbite e la cavità nasale: non sono buchi veri (scavarli in una mesh costa), sono
    // forme scure appoggiate sulla faccia. Da qualunque angolo si guardi, leggono come cavità.
    this.matDeep = standard({ color: 0x0d1220, roughness: 0.95 });
    this.materials = [this.matBone, this.matCartilage, this.matDisc, this.matDeep];

    // Le geometrie: costruite una volta, condivise da tutte le ossa dello stesso tipo.
    const long = longBoneGeometry();
    const short = shortBoneGeometry();
    const round = roundBoneGeometry();
    const vertebra = vertebraGeometry();
    const disc = discGeometry();

    // --- Testa e collo.
    this.head = new HeadRig(this.matBone, this.matDeep);
    this.head.addTo(this.group);

    // --- Colonna: diciassette vertebre con sedici dischi in mezzo.
    for (let i = 0; i < VERTEBRAE; i++) {
      const v = new THREE.Mesh(vertebra, this.matBone);
      this.spine.push(v);
      this.group.add(v);
      if (i > 0) {
        const d = new THREE.Mesh(disc, this.matDisc);
        this.discs.push(d);
        this.group.add(d);
      }
    }

    // --- Costole: tre famiglie, ciascuna con la sua forma (e i due lati sono specchio uno
    // dell'altro, non la stessa forma ruotata: vedi `mirrorX` in bones.ts).
    const famiglie = new Map<RibKind, { right: RibParts; left: RibParts }>();
    for (const k of new Set(RIB_KINDS)) famiglie.set(k, ribGeometries(k));
    for (const kind of RIB_KINDS) {
      const g = famiglie.get(kind)!;
      const bone: THREE.Mesh[] = [];
      const cartilage: (THREE.Mesh | null)[] = [];
      for (const side of [g.right, g.left]) {
        const b = new THREE.Mesh(side.bone, this.matBone);
        const c = side.cartilage ? new THREE.Mesh(side.cartilage, this.matCartilage) : null;
        bone.push(b);
        cartilage.push(c);
        this.group.add(b);
        if (c) this.group.add(c);
      }
      this.ribs.push({ bone, cartilage });
    }

    // --- Sterno: manubrio, corpo e xifoide.
    const st = sternumGeometries();
    this.manubrio = new THREE.Mesh(st.manubrio, this.matBone);
    this.corpoSterno = new THREE.Mesh(st.corpo, this.matBone);
    this.xifoide = new THREE.Mesh(st.xifoide, this.matCartilage);
    this.group.add(this.manubrio, this.corpoSterno, this.xifoide);

    // --- Clavicole: due ossa lunghe dal manubrio a ciascuna spalla.
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(long, this.matBone);
      this.clavicles.push(c);
      this.group.add(c);
    }

    // --- Scapole: la sinistra è la geometria, la destra il suo specchio.
    const scapola = scapulaGeometry();
    for (const geo of [scapola, mirrorX(scapola)]) {
      const s = new THREE.Mesh(geo, this.matBone);
      this.scapulae.push(s);
      this.group.add(s);
    }

    // --- Bacino.
    this.pelvis = new THREE.Mesh(pelvisGeometry(), this.matBone);
    this.group.add(this.pelvis);

    // --- Arti. Avambraccio e gamba hanno **due** ossa affiancate (radio e ulna, tibia e perone):
    // è la cosa che più di ogni altra fa leggere «scheletro» invece di «omino di bastoncini».
    for (const side of ["left", "right"] as const) {
      this.addLimb(`humerus-${side}`, long);
      this.addLimb(`radius-${side}`, long);
      this.addLimb(`ulna-${side}`, long);
      this.addLimb(`femur-${side}`, long);
      this.addLimb(`tibia-${side}`, long);
      this.addLimb(`fibula-${side}`, long);
      this.addLimb(`calcaneus-${side}`, short);
      this.addLimb(`patella-${side}`, round);

      // Il piede: tarso (il blocco dietro), cinque metatarsi a ventaglio, cinque dita.
      const foot = this.feet[side];
      foot.tarsus = new THREE.Mesh(round, this.matBone);
      this.group.add(foot.tarsus);
      for (let k = 0; k < TOES; k++) {
        const m = new THREE.Mesh(short, this.matBone);
        const t = new THREE.Mesh(short, this.matBone);
        foot.meta.push(m);
        foot.toes.push(t);
        this.group.add(m, t);
      }

      // Le mani: un osso per ogni collegamento fra i 21 punti (metacarpi e falangi).
      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const bone = new THREE.Mesh(short, this.matBone);
        bone.visible = false;
        this.handBones[side].push(bone);
        this.group.add(bone);
      }
    }

    this.group.visible = false;
  }

  private addLimb(name: string, geo: THREE.BufferGeometry): void {
    const mesh = new THREE.Mesh(geo, this.matBone);
    this.limbs.set(name, mesh);
    this.group.add(mesh);
  }

  /**
   * Piazza tutto lo scheletro sui punti ricevuti (già convertiti in coordinate della scena).
   *
   * @param points le 33 posizioni del corpo, con la loro visibilità
   * @param hands  le mani riconosciute dal secondo modello, se ce ne sono
   * @param face   il volto riconosciuto dal terzo modello, se c'è
   */
  update(points: PosePoint[], hands: HandPoints[], face: FaceWorld | null): void {
    this.targetOpacity = 1;
    for (let i = 0; i < 33; i++) {
      const p = points[i];
      this.world[i].set(p.x, p.y, p.z);
      // `visibility` può mancare (in teoria è sempre presente): in quel caso si disegna.
      this.visible[i] = (p.visibility ?? 1) >= MIN_VISIBILITY;
    }

    // Tutte le misure si ricavano dalla larghezza delle spalle: così la figura resta proporzionata
    // sia che la persona stia vicina alla camera sia che stia in fondo alla stanza.
    const shoulderL = this.world[POSE.LEFT_SHOULDER];
    const shoulderR = this.world[POSE.RIGHT_SHOULDER];
    const size = Math.max(shoulderL.distanceTo(shoulderR), 1e-3);

    const neckBase = mid(shoulderL, shoulderR);
    const hipCenter = mid(this.world[POSE.LEFT_HIP], this.world[POSE.RIGHT_HIP]);
    const shouldersOk = this.visible[POSE.LEFT_SHOULDER] && this.visible[POSE.RIGHT_SHOULDER];
    const hipsOk = shouldersOk && this.visible[POSE.LEFT_HIP] && this.visible[POSE.RIGHT_HIP];

    const earsOk = this.visible[POSE.LEFT_EAR] && this.visible[POSE.RIGHT_EAR];
    const frame = this.head.solve({
      size,
      neckBase,
      face,
      nose: this.visible[POSE.NOSE] ? this.world[POSE.NOSE] : null,
      earL: earsOk ? this.world[POSE.LEFT_EAR] : null,
      earR: earsOk ? this.world[POSE.RIGHT_EAR] : null,
    });

    const torsoUp = this.updateTorso(size, neckBase, hipCenter, frame?.center ?? null, shouldersOk, hipsOk);
    this.head.place(frame, neckBase, torsoUp, size);
    this.updateLimbs(size);
    this.updateHands(hands, size);
  }

  // ---------------------------------------------------------------------------------------------
  // Tronco: colonna, costole, sterno, clavicole, scapole, bacino.
  // ---------------------------------------------------------------------------------------------
  /** Restituisce l'«alto» del busto (di lunghezza 1), che serve anche al collo. */
  private updateTorso(
    size: number,
    neckBase: THREE.Vector3,
    hipCenter: THREE.Vector3,
    head: THREE.Vector3 | null,
    ok: boolean,
    hipsOk: boolean,
  ): THREE.Vector3 {
    for (const v of this.spine) v.visible = ok;
    for (const d of this.discs) d.visible = ok;
    for (const r of this.ribs) {
      for (const m of [...r.bone, ...r.cartilage]) if (m) m.visible = ok;
    }
    for (const s of this.scapulae) s.visible = ok;
    this.manubrio.visible = this.corpoSterno.visible = this.xifoide.visible = ok;
    this.pelvis.visible = ok && hipsOk;
    if (!ok) {
      for (const c of this.clavicles) c.visible = false;
      return UP.clone();
    }

    // La terna del tronco: di lato, in alto, in avanti. Serve a orientare costole e bacino, che
    // devono girare con il busto quando la persona si volta.
    //
    // L'«alto» **non** si prende dalle anche e basta. Quando la persona è inquadrata dalla vita in
    // su — cioè quasi sempre, davanti a una webcam — il modello le anche non le vede e le
    // *indovina*, dichiarandosi sicurissimo (visibilità 1,00). Verificato il 20/09/2026 su una
    // foto di prova: anche messe **di fianco** alle spalle invece che sotto, e con quell'asse lo
    // scheletro intero si disegnava coricato di 90°.
    // La testa, invece, il modello la trova quasi sempre bene: la direzione collo→cranio è la
    // stima più solida di dove sia l'alto. Le anche si usano solo se confermano quella direzione.
    // Della testa si tiene la posizione nel piano dell'immagine e si attenua molto la profondità:
    // la `z` di un punto del viso non è affidabile (vedi skeleton-head.ts).
    const flat = head ? new THREE.Vector3(head.x - neckBase.x, head.y - neckBase.y, (head.z - neckBase.z) * 0.35) : null;
    const upFromHead = flat && flat.lengthSq() > 1e-10 ? unit(flat) : null;
    const upFromHips = new THREE.Vector3().subVectors(neckBase, hipCenter);
    const up = upFromHead ? upFromHead.clone() : hipsOk ? unit(upFromHips) : UP.clone();
    if (upFromHead && hipsOk && upFromHips.lengthSq() > 1e-8 && upFromHead.dot(unit(upFromHips)) > 0.5) {
      up.add(unit(upFromHips)).normalize(); // d'accordo fra loro: si fa la media, più stabile
    }

    const basis = orientation(
      new THREE.Vector3().subVectors(this.world[POSE.LEFT_SHOULDER], this.world[POSE.RIGHT_SHOULDER]),
      up,
    );

    // La lunghezza del busto si misura **lungo l'asse alto**, non in linea d'aria: se le anche sono
    // sbagliate di lato, la distanza diretta sarebbe enorme e la gabbia toracica si allungherebbe
    // di conseguenza. Il minimo (1,1 volte la larghezza delle spalle) è la proporzione umana media,
    // ed entra in gioco quando le anche non si vedono o la loro stima è inutilizzabile.
    const spineLength = hipsOk
      ? Math.max(new THREE.Vector3().subVectors(neckBase, hipCenter).dot(basis.up), size * 1.1)
      : size * 1.1;
    const vR = size * 0.085; // raggio medio delle vertebre
    const point = new THREE.Vector3();

    // La colonna non è un segmento: ha una doppia curva, in dentro sui lombi e in fuori sul torace.
    // Si ottiene spostando ogni vertebra all'indietro di una quantità che dipende dalla sua quota.
    const spineBase = neckBase.clone().addScaledVector(basis.up, -spineLength);
    const spineAt = (t: number, out: THREE.Vector3) => {
      out.lerpVectors(spineBase, neckBase, t);
      const bow = Math.sin(t * Math.PI) * 0.17 - Math.sin(t * Math.PI * 2) * 0.06;
      return out.addScaledVector(basis.forward, -bow * spineLength);
    };

    // Le vertebre: più grosse in basso (lombari), più piccole in alto. Senza anche, le lombari non
    // si disegnano (la colonna finisce dove finisce il busto che si vede).
    this.spine.forEach((v, i) => {
      const t = tOfVertebra(i);
      const lumbar = i < LUMBAR;
      v.visible = !lumbar || hipsOk;
      v.position.copy(spineAt(t, point));
      v.quaternion.copy(basis.quaternion);
      const spacing = lumbar ? 0.07 : 0.0505;
      const r = vR * (lumbar ? 1.22 - 0.03 * i : 1.0 - 0.02 * (i - LUMBAR));
      v.scale.set(r, (spacing * spineLength * 0.8) / 0.46, r);
    });
    this.discs.forEach((d, k) => {
      // Il disco `k` sta fra la vertebra `k` e la `k+1`.
      const t = (tOfVertebra(k) + tOfVertebra(k + 1)) / 2;
      d.visible = k + 1 >= LUMBAR || hipsOk;
      d.position.copy(spineAt(t, point));
      d.quaternion.copy(basis.quaternion);
      const spacing = k < LUMBAR ? 0.07 : 0.0505;
      const r = vR * (k < LUMBAR ? 1.15 : 0.92 - 0.02 * (k - LUMBAR));
      d.scale.set(r * 0.92, spacing * spineLength * 0.34, r * 0.92);
    });

    // Costole: dodici paia, attaccate ciascuna alla sua vertebra toracica. La più larga è a
    // metà del torace, le altre si stringono verso l'alto e verso il basso — è la forma di una
    // gabbia, non di un cilindro. Ogni costola nasce dietro, all'altezza della vertebra, e scende
    // in avanti: quanto, lo dice la distanza fra due vertebre moltiplicata per un fattore che
    // cresce andando in basso (le costole alte sono quasi orizzontali, quelle basse inclinate).
    const chestHalf = size * 0.4;
    const taper = (j: number) => (j <= 7 ? 0.55 + 0.45 * (j / 7) : 1.0 - 0.18 * ((j - 7) / 4));
    const ribFront = (j: number) => chestHalf * taper(j) * 0.8; // quanto è «profonda» la costola j
    this.ribs.forEach((rib, j) => {
      const t = T_THORACIC(j);
      const xs = chestHalf * taper(j);
      const zs = ribFront(j);
      spineAt(t, point);
      // Spostata in avanti perché il suo capo posteriore tocchi la vertebra e non stia 30 cm
      // dietro la schiena: la curva nasce a z = −0,9 in unità della sua profondità.
      point.addScaledVector(basis.forward, 0.9 * zs - vR * 0.3);
      const drop = spineLength * (0.085 + 0.006 * j);
      for (let s = 0; s < 2; s++) {
        for (const mesh of [rib.bone[s], rib.cartilage[s]]) {
          if (!mesh) continue;
          mesh.position.copy(point);
          mesh.quaternion.copy(basis.quaternion);
          mesh.scale.set(xs, drop, zs);
        }
      }
    });

    // Lo sterno, appoggiato davanti dove le costole vere si chiudono: inclinato come nel corpo
    // vero (in alto più indietro, in basso più avanti), perché si appoggia alla punta delle
    // costole, che sono più profonde andando in basso.
    const frontZ = (j: number) => 1.85 * ribFront(j) - vR * 0.3;
    const sternumAt = (t: number, j: number, out: THREE.Vector3) => spineAt(t, out).addScaledVector(basis.forward, frontZ(j));
    sternumAt(0.87, 0, point);
    this.manubrio.position.copy(point);
    this.manubrio.quaternion.copy(basis.quaternion);
    this.manubrio.scale.set(size * 0.17, spineLength * 0.12, size * 0.09);
    const manubrioCenter = point.clone();
    sternumAt(0.69, 3, point);
    this.corpoSterno.position.copy(point);
    this.corpoSterno.quaternion.copy(basis.quaternion);
    this.corpoSterno.scale.set(size * 0.15, spineLength * 0.26, size * 0.06);
    sternumAt(0.53, 6, point);
    this.xifoide.position.copy(point);
    this.xifoide.quaternion.copy(basis.quaternion);
    this.xifoide.scale.set(size * 0.07, spineLength * 0.08, size * 0.05);

    // Le clavicole: dal bordo alto del manubrio alle due spalle.
    const claviculeRoot = manubrioCenter.clone().addScaledVector(basis.up, spineLength * 0.045);
    [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER].forEach((index, i) => {
      const c = this.clavicles[i];
      c.visible = this.visible[index];
      if (!c.visible) return;
      // La radice si sposta un poco verso la spalla di cui si tratta: le due clavicole partono
      // dai due lati del manubrio, non dallo stesso punto.
      const root = claviculeRoot.clone().addScaledVector(unit(new THREE.Vector3().subVectors(this.world[index], claviculeRoot)), size * 0.03);
      placeBone(c, root, this.world[index], size * 0.024);
    });

    // Le scapole: dietro, fra la colonna e ciascuna spalla, appoggiate alla parete posteriore della
    // gabbia (che sta a pochi centimetri dalla colonna, non a 30: le costole nascono dalla vertebra).
    [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER].forEach((index, i) => {
      const s = this.scapulae[i];
      s.visible = this.visible[index];
      if (!s.visible) return;
      spineAt(0.84, point);
      s.position.lerpVectors(point, this.world[index], 0.52).addScaledVector(basis.forward, -size * 0.045);
      s.quaternion.copy(basis.quaternion);
      s.scale.set(size * 0.15, spineLength * 0.19, size * 0.14);
    });

    // Il bacino: in fondo alla colonna, non sul punto medio delle due anche. Sono lo stesso posto
    // quando il modello vede le anche davvero; quando le indovina, la colonna è più affidabile.
    if (hipsOk) {
      this.pelvis.position.copy(spineBase);
      this.pelvis.quaternion.copy(basis.quaternion);
      const hipHalf = Math.max(this.world[POSE.LEFT_HIP].distanceTo(this.world[POSE.RIGHT_HIP]), 1e-3) * 0.7;
      // Alzato di poco: i due punti "anca" del modello sono le **articolazioni**, che in un bacino
      // vero stanno in basso e di lato, non sul bordo superiore. Senza questo scarto le creste
      // iliache finirebbero sotto la vita.
      this.pelvis.position.addScaledVector(basis.up, hipHalf * 0.22);
      this.pelvis.scale.set(hipHalf, hipHalf * 0.92, hipHalf * 0.78);
    }
    return basis.up.clone();
  }

  // ---------------------------------------------------------------------------------------------
  // Arti: braccia, gambe, piedi.
  // ---------------------------------------------------------------------------------------------
  private updateLimbs(size: number): void {
    const P = POSE;
    const sides = [
      { side: "left" as const, other: P.RIGHT_ANKLE, shoulder: P.LEFT_SHOULDER, elbow: P.LEFT_ELBOW, wrist: P.LEFT_WRIST, hip: P.LEFT_HIP, knee: P.LEFT_KNEE, ankle: P.LEFT_ANKLE, heel: P.LEFT_HEEL, foot: P.LEFT_FOOT },
      { side: "right" as const, other: P.LEFT_ANKLE, shoulder: P.RIGHT_SHOULDER, elbow: P.RIGHT_ELBOW, wrist: P.RIGHT_WRIST, hip: P.RIGHT_HIP, knee: P.RIGHT_KNEE, ankle: P.RIGHT_ANKLE, heel: P.RIGHT_HEEL, foot: P.RIGHT_FOOT },
    ];

    for (const s of sides) {
      this.single(`humerus-${s.side}`, s.shoulder, s.elbow, size * 0.048);
      this.single(`femur-${s.side}`, s.hip, s.knee, size * 0.058);
      this.single(`calcaneus-${s.side}`, s.ankle, s.heel, size * 0.032);
      // Avambraccio e gamba: due ossa parallele, scostate di poco ai lati della linea ideale.
      this.pair(`radius-${s.side}`, `ulna-${s.side}`, s.elbow, s.wrist, size * 0.026, size * 0.034);
      this.pair(`tibia-${s.side}`, `fibula-${s.side}`, s.knee, s.ankle, size * 0.032, size * 0.038);

      // La rotula: davanti al ginocchio, una piccola lente d'osso.
      const patella = this.limbs.get(`patella-${s.side}`)!;
      patella.visible = this.visible[s.knee] && this.visible[s.hip];
      if (patella.visible) {
        patella.position.copy(this.world[s.knee]).addScaledVector(FORWARD, size * 0.04);
        patella.quaternion.identity();
        patella.scale.set(size * 0.05, size * 0.058, size * 0.032);
      }

      this.foot(s.side, s.ankle, s.heel, s.foot, s.other, size);
    }
  }

  /**
   * Il piede: dal tallone alla punta si dispongono il tarso, cinque metatarsi a ventaglio e cinque
   * dita. Del piede il modello dà solo tre punti (caviglia, tallone, punta): il resto è
   * proporzione. Il «lato» del ventaglio si prende perpendicolare al piede e alla direzione di
   * vista, come per le coppie di ossa degli arti, e l'alluce è il dito dalla parte dell'altro piede.
   */
  private foot(side: "left" | "right", ankle: number, heel: number, toe: number, other: number, size: number): void {
    const f = this.feet[side];
    const ok = this.visible[ankle] && this.visible[heel] && this.visible[toe];
    f.tarsus.visible = ok;
    for (const m of [...f.meta, ...f.toes]) m.visible = ok;
    if (!ok) return;

    const H = this.world[heel];
    const T = this.world[toe];
    const d = new THREE.Vector3().subVectors(T, H);
    const len = d.length();
    if (len < 1e-6) {
      f.tarsus.visible = false;
      for (const m of [...f.meta, ...f.toes]) m.visible = false;
      return;
    }
    const dir = d.clone().divideScalar(len);
    let lateral = new THREE.Vector3().crossVectors(dir, FORWARD);
    if (lateral.lengthSq() < 1e-6) lateral = new THREE.Vector3().crossVectors(dir, UP);
    lateral.normalize();
    // L'alluce sta dalla parte dell'altro piede (se si vede), altrimenti dalla parte del corpo.
    const toward = this.visible[other] ? new THREE.Vector3().subVectors(this.world[other], this.world[ankle]).dot(lateral) : side === "left" ? 1 : -1;
    const bigToe = toward > 0 ? TOES - 1 : 0;

    const at = (u: number, k: number, spread: number) => H.clone().addScaledVector(d, u).addScaledVector(lateral, (k - 2) * len * spread);

    // Il tarso: un blocco appena davanti al tallone.
    placeBone(f.tarsus, H.clone().addScaledVector(d, 0.06), H.clone().addScaledVector(d, 0.4), size * 0.036);
    for (let k = 0; k < TOES; k++) {
      const thick = k === bigToe;
      placeBone(f.meta[k], at(0.38, k, 0.03), at(0.78, k, 0.085), size * (thick ? 0.02 : 0.014));
      // Le dita si accorciano dall'alluce al mignolo, e convergono un poco.
      const reach = thick ? 1.0 : 0.88 - 0.03 * Math.abs(k - bigToe);
      placeBone(f.toes[k], at(0.78, k, 0.085), at(reach, k, 0.07), size * (thick ? 0.017 : 0.0115));
    }
  }

  /** Un osso solo fra due punti del corpo. */
  private single(name: string, from: number, to: number, radius: number): void {
    const mesh = this.limbs.get(name)!;
    mesh.visible = this.visible[from] && this.visible[to];
    if (mesh.visible) placeBone(mesh, this.world[from], this.world[to], radius);
  }

  /**
   * Due ossa affiancate fra due punti (radio e ulna, tibia e perone). Lo scostamento si prende
   * perpendicolare sia all'osso sia alla direzione di vista: così le due ossa restano visibilmente
   * separate qualunque sia la posa, invece di sovrapporsi in una sola linea.
   */
  private pair(nameA: string, nameB: string, from: number, to: number, radius: number, gap: number): void {
    const a = this.limbs.get(nameA)!;
    const b = this.limbs.get(nameB)!;
    a.visible = b.visible = this.visible[from] && this.visible[to];
    if (!a.visible) return;

    const start = this.world[from];
    const end = this.world[to];
    const dir = new THREE.Vector3().subVectors(end, start);
    let offset = new THREE.Vector3().crossVectors(dir, FORWARD);
    if (offset.lengthSq() < 1e-8) offset = new THREE.Vector3().crossVectors(dir, UP);
    offset.normalize().multiplyScalar(gap * 0.5);

    placeBone(a, start.clone().add(offset), end.clone().add(offset), radius);
    placeBone(b, start.clone().sub(offset), end.clone().sub(offset), radius);
  }

  // ---------------------------------------------------------------------------------------------
  // Mani: i 21 punti veri del secondo modello, agganciati al polso del braccio.
  // ---------------------------------------------------------------------------------------------
  private updateHands(hands: HandPoints[], size: number): void {
    for (const side of ["left", "right"] as const) {
      const hand = hands.find((h) => h.side === side);
      const bones = this.handBones[side];
      const wristIndex = side === "left" ? POSE.LEFT_WRIST : POSE.RIGHT_WRIST;

      if (!hand || !this.visible[wristIndex]) {
        for (const bone of bones) bone.visible = false;
        continue;
      }

      // I due modelli misurano la profondità con due riferimenti diversi (il corpo rispetto ai
      // fianchi, la mano rispetto al proprio polso): sovrapporre i due polsi è quello che le
      // rimette d'accordo. In larghezza e altezza sono già nello stesso sistema — stesso
      // fotogramma, stesse coordinate normalizzate — quindi basta una traslazione.
      const shift = new THREE.Vector3().subVectors(this.world[wristIndex], toVec(hand.points[0]));
      const p = hand.points.map((q) => toVec(q).add(shift));

      // Le ossa della mano si dimensionano sulla mano stessa (polso → nocca del medio), non sulle
      // spalle: una mano tesa verso la camera è molto più grande di una mano lungo il fianco.
      const span = Math.max(p[0].distanceTo(p[9]), 1e-3);
      const radius = Math.max(span * 0.085, size * 0.009);

      HAND_CONNECTIONS.forEach((c, i) => {
        const bone = bones[i];
        bone.visible = true;
        placeBone(bone, p[c.start], p[c.end], radius);
      });
    }
  }

  /** Persona non più inquadrata: comincia a svanire, e la testa dimentica dove guardava. */
  hide(): void {
    this.targetOpacity = 0;
    this.head.hide();
  }

  /** Un passo di dissolvenza e un passo di inseguimento della rotazione della testa, a ogni disegno. */
  tick(dt: number): void {
    this.opacity = fade(this.opacity, this.targetOpacity, dt);
    this.group.visible = this.opacity > 0;
    for (const m of this.materials) {
      m.opacity = this.opacity;
      // Un materiale `transparent` si disegna in un passaggio a parte, ordinato per distanza, e con
      // tante ossa che si compenetrano l'ordine sbaglia: scheletro «bucato» a metà sulle costole.
      // A figura piena (opacità 1) si torna al passaggio normale, che usa il buffer di profondità.
      m.transparent = this.opacity < 0.999;
    }
    this.head.tick(dt);
  }
}

// -----------------------------------------------------------------------------------------------
// Funzioni di servizio
// -----------------------------------------------------------------------------------------------

/**
 * La scena del corpo: una sola figura, disegnata dentro il rettangolo del video.
 *
 * Il guadagno di profondità è 0,9 contro l'1,6 della mano, e l'ingrandimento su schermi stretti è
 * disattivato (1,0): per il corpo conta più vedere la figura intera, testa e piedi compresi, che
 * vederla grande.
 */
export class BodyScene extends FrameScene {
  private readonly body: HumanSkeleton;
  private readonly grain: THREE.Texture;
  private readonly environment: THREE.WebGLRenderTarget;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, 0.9, 1);

    // L'illuminazione d'ambiente: una stanza finta (generata nel codice, nessun file) trasformata
    // in una mappa che i materiali PBR usano per riflessi e ombre morbide. È ciò che toglie
    // all'osso l'aspetto di gesso e gli dà volume. Il generatore e la stanza servono solo a questo
    // e si liberano subito.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();
    // Le luci della scena (le mette FrameScene per la mano, che è di un materiale scuro e rosato)
    // con l'ambiente in più sovraesponevano l'osso fino a farlo sembrare gesso: si abbassano.
    for (const child of this.scene.children) if (child instanceof THREE.Light) child.intensity *= 0.55;

    this.grain = boneGrainTexture();
    this.body = new HumanSkeleton(this.grain);
    this.scene.add(this.body.group);
  }

  /**
   * Aggiorna la figura, oppure la fa svanire se `points` è null.
   *
   * @param hands le mani del secondo modello, in coordinate normalizzate come i punti del corpo.
   * @param face  la posa della testa dal terzo modello, in coordinate normalizzate.
   */
  update(points: PosePoint[] | null, hands: HandPoints[] = [], face: FacePose | null = null): void {
    if (!points) {
      this.body.hide();
      return;
    }
    const w = (p: Point3) => toVec(this.toWorld(p));
    this.body.update(
      points.map((p) => ({ ...this.toWorld(p), visibility: p.visibility })),
      hands.map((h) => ({ side: h.side, points: h.points.map((p) => this.toWorld(p)) })),
      face
        ? {
            rightSide: w(face.rightSide),
            leftSide: w(face.leftSide),
            rightEye: w(face.rightEye),
            leftEye: w(face.leftEye),
            forehead: w(face.forehead),
            glabella: w(face.glabella),
            nose: w(face.nose),
            mouth: w(face.mouth),
            chin: w(face.chin),
            jawOpen: face.jawOpen,
          }
        : null,
    );
  }

  protected override tick(dt: number): void {
    this.body.tick(dt);
  }
}
