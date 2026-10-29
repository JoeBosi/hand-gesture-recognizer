/**
 * skeleton-head.ts — la testa dello scheletro: cranio, mandibola, collo.
 *
 * È il pezzo che più cambia da una persona all'altra e da un istante al successivo: la testa gira,
 * si china, si inclina, la bocca si apre. Per questo ha un file suo.
 *
 * ## Come si capisce dove sta la testa
 *
 * Prima si ricavava dai sette punti del viso della posa del corpo (naso, occhi, orecchie). Non
 * bastava, e il difetto si vedeva a occhio: davanti a una webcam la persona è seduta, vicina, e
 * china la testa verso lo schermo; l'«alto» della testa era la direzione dalle spalle alle
 * orecchie, ma la profondità (`z`) che la posa assegna al viso è esagerata di circa quattro volte
 * rispetto a quella del modello del volto (misurato: il naso risultava 0,35 davanti alle orecchie
 * contro 0,09 nel modello del volto, su una testa larga 0,11). Quella componente di profondità
 * inclinava l'asse e il cranio veniva disegnato **con la faccia in giù, visto dall'alto**: «la
 * testa bassa» di cui si lamentava chi lo provava.
 *
 * Ora l'orientamento nasce dal modello del volto (`face.ts`), che ha una profondità coerente con la
 * larghezza e dà punti ben distribuiti (guance, angoli degli occhi, fronte, mento, naso):
 *
 *   - *di lato*: dalla guancia destra alla sinistra (e dagli angoli esterni degli occhi);
 *   - *in alto*: dal mento alla fronte (e dalla bocca alla radice del naso);
 *   - *in avanti*: il prodotto vettoriale dei due, con il verso deciso dal naso, che sta davanti.
 *
 * Il **verso** lo decide la geometria e non una convenzione di segno: è il motivo per cui si
 * passano i punti e non la matrice di trasformazione già pronta del modello.
 *
 * La posizione si ancora a tre punti insieme (mento, guance, fronte) e se ne fa la media: ciascuno
 * da solo ha un errore, e tre errori indipendenti si compensano. La **profondità** dell'insieme, che
 * il modello del volto non può dare (è relativa al volto stesso), si prende dalla posa del corpo ma
 * si tiene in un intervallo plausibile: una testa sta davanti alle spalle di pochi centimetri, mai
 * di mezzo metro.
 *
 * Se il volto non si vede (o il modello non è attivo) resta il calcolo vecchio da orecchie e naso,
 * ma corretto nel punto che sbagliava: l'«alto» si prende nel piano dell'immagine, ignorando la
 * profondità del viso.
 */
import * as THREE from "three";
import { MANDIBLE_PIVOT, mandibleGeometry, skullGeometry, vertebraGeometry } from "./bones";
import { FORWARD, UP, clamp, mid, orientation, unit } from "./skeleton-utils";

/** I punti del viso già convertiti in coordinate della scena (con la profondità relativa al volto). */
export interface FaceWorld {
  rightSide: THREE.Vector3;
  leftSide: THREE.Vector3;
  rightEye: THREE.Vector3;
  leftEye: THREE.Vector3;
  forehead: THREE.Vector3;
  glabella: THREE.Vector3;
  nose: THREE.Vector3;
  mouth: THREE.Vector3;
  chin: THREE.Vector3;
  jawOpen: number;
}

export interface HeadInput {
  /** Larghezza delle spalle nella scena: la misura da cui dipendono tutte le altre. */
  size: number;
  neckBase: THREE.Vector3;
  face: FaceWorld | null;
  /** I punti del viso della posa del corpo, `null` quelli poco visibili. */
  nose: THREE.Vector3 | null;
  earL: THREE.Vector3 | null;
  earR: THREE.Vector3 | null;
}

/** Dove sta la testa e come è girata, pronta per essere disegnata. */
export interface HeadFrame {
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  jaw: number;
}

// Dove stanno nel cranio (coordinate locali, altezza ~1, origine all'altezza delle orecchie) i
// punti a cui si ancora il modello del volto. Sono letti dalla geometria in bones.ts.
const CHIN_LOCAL = new THREE.Vector3(0, -0.42, 0.28);
const CHEEK_LOCAL = new THREE.Vector3(0, -0.04, 0.1);
const FOREHEAD_LOCAL = new THREE.Vector3(0, 0.4, 0.38);
/** La base del cranio, dove la colonna cervicale lo regge (il forame magno). */
const SKULL_BASE_LOCAL = new THREE.Vector3(0, -0.27, -0.09);

/** Le sette vertebre del collo. */
const NECK_COUNT = 7;

/** Quanto può aprirsi la mandibola (radianti) con `jawOpen` = 1: ~32°, l'apertura massima comoda. */
const MAX_JAW_ANGLE = 0.56;

export class HeadRig {
  /** Tutto ciò che si muove con la testa: cranio, orbite, mandibola. */
  readonly group = new THREE.Group();
  readonly neck: THREE.Mesh[] = [];
  private readonly jaw = new THREE.Group();

  private readonly target = new THREE.Quaternion();
  private readonly current = new THREE.Quaternion();
  private tracked = false;
  private lastFrame: HeadFrame | null = null;

  constructor(bone: THREE.Material, deep: THREE.Material) {
    this.group.add(new THREE.Mesh(skullGeometry(), bone));

    // Le orbite: due forme scure, incassate nel viso e cerchiate dal bordo osseo del cranio.
    const socket = new THREE.SphereGeometry(0.5, 14, 10);
    for (const side of [1, -1]) {
      const eye = new THREE.Mesh(socket, deep);
      eye.scale.set(0.17, 0.145, 0.14);
      eye.position.set(side * 0.165, 0.0, 0.352);
      this.group.add(eye);
    }
    // L'apertura nasale: stretta in alto e larga in basso, la forma di cuore rovesciato che si
    // riconosce in qualsiasi teschio. Due ellissoidi sovrapposti la imitano.
    const upper = new THREE.Mesh(socket, deep);
    upper.scale.set(0.075, 0.14, 0.1);
    upper.position.set(0, -0.1, 0.41);
    this.group.add(upper);
    const lower = new THREE.Mesh(socket, deep);
    lower.scale.set(0.13, 0.08, 0.1);
    lower.position.set(0, -0.185, 0.405);
    this.group.add(lower);

    // La mandibola: un gruppo il cui perno è l'articolazione. La geometria è nelle coordinate del
    // cranio, quindi si trasla di −perno dentro il gruppo e il gruppo si porta al perno.
    const mandible = new THREE.Mesh(mandibleGeometry(), bone);
    mandible.position.copy(MANDIBLE_PIVOT).negate();
    this.jaw.position.copy(MANDIBLE_PIVOT);
    this.jaw.add(mandible);
    this.group.add(this.jaw);

    const vertebra = vertebraGeometry();
    for (let i = 0; i < NECK_COUNT; i++) this.neck.push(new THREE.Mesh(vertebra, bone));
  }

  /** Aggiunge al gruppo padre la testa e le vertebre del collo. */
  addTo(parent: THREE.Object3D): void {
    parent.add(this.group);
    for (const v of this.neck) parent.add(v);
  }

  // -----------------------------------------------------------------------------------------------
  // Dove sta la testa
  // -----------------------------------------------------------------------------------------------
  solve(inp: HeadInput): HeadFrame | null {
    const { size, neckBase, face } = inp;

    // La profondità della testa, comune a entrambi i percorsi: davanti alle spalle di poco.
    const earMid = inp.earL && inp.earR ? mid(inp.earL, inp.earR) : inp.nose;
    const zOffset = earMid ? earMid.z - neckBase.z : 0.08 * size;
    const headZ = neckBase.z + clamp(zOffset, -0.1 * size, 0.3 * size);

    let frame: HeadFrame | null = null;

    if (face) {
      // --- Percorso principale: il modello del volto. -----------------------------------------
      const side = unit(new THREE.Vector3().subVectors(face.leftSide, face.rightSide))
        .multiplyScalar(0.6)
        .add(unit(new THREE.Vector3().subVectors(face.leftEye, face.rightEye)).multiplyScalar(0.4));
      const up = unit(new THREE.Vector3().subVectors(face.forehead, face.chin))
        .add(unit(new THREE.Vector3().subVectors(face.glabella, face.mouth)).multiplyScalar(0.7));
      // Il naso sta davanti al piano delle guance: è l'unico indizio che decide il verso.
      const forwardHint = new THREE.Vector3().subVectors(face.nose, mid(face.leftSide, face.rightSide));

      const basis = orientation(side, up, forwardHint);

      // La scala: la larghezza delle guance e l'altezza fronte→mento, ciascuna riportata alla
      // dimensione del cranio (un viso largo 13,5 cm e alto 18,5 su un cranio alto 22 cm e largo
      // 15: la larghezza delle guance è dunque il 70% dell'altezza del cranio che le contiene — un
      // primo tentativo con 0,61 disegnava il cranio il 27% più largo del viso misurato).
      const width = face.leftSide.distanceTo(face.rightSide);
      const height = face.forehead.distanceTo(face.chin);
      const scale = 0.5 * (width / 0.7 + height / 0.84);

      // La posizione: tre ancoraggi, uno per punto di misura, e se ne fa la media.
      const R = basis.quaternion;
      const anchored = (point: THREE.Vector3, local: THREE.Vector3) =>
        point.clone().sub(local.clone().multiplyScalar(scale).applyQuaternion(R));
      const center = anchored(face.chin, CHIN_LOCAL)
        .add(anchored(mid(face.leftSide, face.rightSide), CHEEK_LOCAL))
        .add(anchored(face.forehead, FOREHEAD_LOCAL))
        .multiplyScalar(1 / 3);
      center.z = headZ; // l'unica componente che il modello del volto non può dare

      frame = { center, quaternion: basis.quaternion, scale, jaw: face.jawOpen };
    } else if (inp.earL && inp.earR) {
      // --- Ripiego: orecchie e naso della posa. -----------------------------------------------
      const center = mid(inp.earL, inp.earR);
      center.z = headZ;
      const side = new THREE.Vector3().subVectors(inp.earL, inp.earR);
      // L'«alto» nel piano dell'immagine: la profondità del viso nella posa è inaffidabile ed è
      // proprio quella che inclinava il cranio verso il basso.
      const up = new THREE.Vector3(center.x - neckBase.x, center.y - neckBase.y, 0);
      if (up.lengthSq() < 1e-8) up.copy(UP);
      // Da che parte guarda: dal naso, ma solo nel piano (a sinistra/destra delle orecchie).
      const forwardHint = FORWARD.clone();
      if (inp.nose) {
        const lateral = new THREE.Vector3().subVectors(inp.nose, center).dot(unit(side));
        forwardHint.addScaledVector(unit(side), clamp(lateral / Math.max(side.length(), 1e-6), -1.2, 1.2) * -0.8);
      }
      const basis = orientation(side, up, forwardHint);
      const width = clamp(side.length(), 0.33 * size, 0.45 * size);
      frame = { center, quaternion: basis.quaternion, scale: width * 1.5, jaw: 0 };
    }

    if (frame) {
      this.target.copy(frame.quaternion);
      // Alla prima comparsa non si insegue niente: ci si mette subito nella posa giusta, altrimenti
      // la testa arriva ruotando da chissà dove.
      if (!this.tracked) this.current.copy(this.target);
      this.tracked = true;
    }
    this.lastFrame = frame;
    return frame;
  }

  // -----------------------------------------------------------------------------------------------
  // Disegno
  // -----------------------------------------------------------------------------------------------
  /**
   * Mette cranio e collo nella posa calcolata da `solve`.
   *
   * @param torsoUp l'alto del busto: la tangente del collo in basso, dove si attacca alle spalle
   */
  place(frame: HeadFrame | null, neckBase: THREE.Vector3, torsoUp: THREE.Vector3, size: number): void {
    this.group.visible = frame !== null;
    for (const v of this.neck) v.visible = frame !== null;
    if (!frame) return;

    this.group.position.copy(frame.center);
    this.group.quaternion.copy(this.current);
    this.group.scale.setScalar(frame.scale);
    // Positivo = il mento va in giù e indietro (rotazione attorno a X).
    this.jaw.rotation.x = clamp(frame.jaw, 0, 1) * MAX_JAW_ANGLE;

    // Il collo: una curva di Bézier dalla settima cervicale (poco sopra la linea delle spalle) alla
    // base del cranio. Le tangenti sono le direzioni dei due estremi — in basso l'alto del busto,
    // in alto l'alto della testa — così se la testa è china il collo si piega, invece di restare
    // dritto con il cranio che gli penzola sopra.
    const headUp = UP.clone().applyQuaternion(this.current);
    const headSide = new THREE.Vector3(1, 0, 0).applyQuaternion(this.current);
    const p0 = neckBase.clone().addScaledVector(torsoUp, 0.05 * size);
    const p3 = frame.center.clone().add(SKULL_BASE_LOCAL.clone().multiplyScalar(frame.scale).applyQuaternion(this.current));
    const len = p0.distanceTo(p3);
    const curve = new THREE.CubicBezierCurve3(
      p0,
      p0.clone().addScaledVector(torsoUp, len * 0.4),
      p3.clone().addScaledVector(headUp, -len * 0.4),
      p3,
    );

    const spacing = len / NECK_COUNT;
    this.neck.forEach((v, i) => {
      const t = (i + 0.5) / NECK_COUNT;
      const tangent = curve.getTangentAt(t);
      v.position.copy(curve.getPointAt(t));
      v.quaternion.copy(orientation(headSide, tangent, FORWARD.clone().applyQuaternion(this.current)).quaternion);
      // Le vertebre del collo sono più piccole di quelle del torace e si stringono verso l'alto.
      const r = size * (0.066 - 0.012 * t);
      v.scale.set(r, spacing * 1.35, r);
    });
  }

  /** Un passo di inseguimento della rotazione: la testa impiega ~un decimo di secondo ad allinearsi. */
  tick(dt: number): void {
    if (!this.tracked) return;
    this.current.slerp(this.target, Math.min(1, dt * 11));
    if (this.lastFrame) this.group.quaternion.copy(this.current);
  }

  /** Persona non più inquadrata: la testa dimentica dove guardava. */
  hide(): void {
    this.tracked = false;
    this.lastFrame = null;
    // Anche le due rotazioni in memoria: derivano dal viso di una persona, e a camera spenta non
    // devono restare (sono quattro numeri e non escono dal browser, ma costa una riga).
    this.target.identity();
    this.current.identity();
  }
}
