/**
 * scene3d.ts — la parte di scena 3D che mano e corpo hanno in comune.
 *
 * Quando la seconda pagina (il corpo) è nata, si è visto che di `hand3d.ts` serviva quasi tutto
 * tranne la figura: telecamera virtuale, luci, adattamento alla finestra e conversione delle
 * coordinate erano identici. Invece di copiarli, stanno qui: `HandScene` e `BodyScene` ereditano
 * da `FrameScene` e aggiungono solo ciò che disegnano.
 *
 * Il nome: "frame" perché questa classe sa una cosa sola del mondo, cioè che esiste un
 * rettangolo — il fotogramma della webcam — dentro al quale le figure si muovono.
 */
import * as THREE from "three";

/** Un punto nello spazio. Vale sia per i punti normalizzati sia per quelli della scena. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export class FrameScene {
  protected readonly renderer: THREE.WebGLRenderer;
  protected readonly scene = new THREE.Scene();
  protected readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  private frameAspect = 4 / 3; // proporzioni del video della webcam
  protected frameHeight = 1; // altezza, nel mondo 3D, dell'area che rappresenta il video
  private lastTick = performance.now();
  private readonly canvas: HTMLCanvasElement;

  /**
   * @param depthGain quanto amplificare la profondità. La `z` che arriva da MediaPipe è piccola
   *        rispetto alle altre due coordinate: senza un po' di guadagno, avvicinare la mano (o
   *        allungare un braccio in avanti) quasi non si noterebbe. Valori alti fanno sembrare la
   *        figura deformata, ed è il motivo per cui la mano usa 1,6 e il corpo 0,9: la profondità
   *        del corpo è stimata peggio, esagerarla lo farebbe ondeggiare.
   * @param maxZoom quanto si può ingrandire su schermi più stretti del video (telefono in
   *        verticale), dove altrimenti la figura risulterebbe minuscola fra due bande vuote.
   */
  // Dichiarati qui e assegnati nel costruttore, non come "parametri-proprietà" (`private
  // readonly` scritto fra i parametri): il progetto compila con `erasableSyntaxOnly`, che accetta
  // solo il TypeScript cancellabile riga per riga, e quella scorciatoia genererebbe codice.
  private readonly depthGain: number;
  private readonly maxZoom: number;

  constructor(canvas: HTMLCanvasElement, depthGain: number, maxZoom = 1.4) {
    this.canvas = canvas;
    this.depthGain = depthGain;
    this.maxZoom = maxZoom;
    // `alpha: true`: lo sfondo lo mette il CSS (una sfumatura), la tela resta trasparente.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // Su schermi ad alta densità si disegna al massimo al doppio della risoluzione: oltre non si
    // vede la differenza e si spreca lavoro (e batteria).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Telecamera ferma davanti all'origine: si muove la figura, non l'inquadratura. È ciò che
    // rende immediato l'effetto specchio.
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // Tre luci: una diffusa cielo/terra per non avere ombre nere, una principale in alto a destra
    // che dà volume, una radente violacea che stacca la figura dallo sfondo scuro.
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x818cf8, 1.2);
    rim.position.set(-4, -2, -6);
    this.scene.add(rim);

    // La tela non occupa più per forza tutta la finestra: nella pagina della mano è metà schermo,
    // e quella metà diventa schermo intero quando l'utente nasconde la camera. Un `resize` della
    // finestra non basta più ad accorgersene — il ResizeObserver guarda la tela, non la finestra.
    // `window.resize` resta perché il cambio di densità dello schermo (spostare la finestra su un
    // monitor diverso) non fa cambiare le misure CSS dell'elemento.
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  /** Proporzioni del video: l'area utile della scena avrà le stesse, centrata nello schermo. */
  setFrameAspect(aspect: number): void {
    this.frameAspect = aspect;
    this.resize();
  }

  /**
   * Adatta tela e inquadratura alla finestra.
   *
   * `visibleH` è quanto mondo entra in verticale alla distanza della figura: dipende dall'angolo
   * di campo della telecamera virtuale. Da lì si ricava l'altezza dell'area-video, scegliendo il
   * lato che "stringe" di più, così il rettangolo del video entra sempre tutto nello schermo.
   */
  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); // false = non toccare la dimensione CSS, la decide il foglio di stile
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix(); // obbligatorio dopo aver cambiato aspect o fov

    const visibleH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fit = this.camera.aspect > this.frameAspect ? visibleH : (visibleH * this.camera.aspect) / this.frameAspect;

    const zoom = Math.min(this.maxZoom, Math.max(1, this.frameAspect / this.camera.aspect));
    this.frameHeight = fit * 0.92 * zoom; // 0.92 = un margine perché la figura non tocchi i bordi
  }

  /**
   * Da coordinate MediaPipe a coordinate della scena.
   *
   * In ingresso: x e y fra 0 e 1 (angolo in alto a sinistra dell'immagine = 0,0), z con la stessa
   * scala della x (negativa = più vicino alla camera).
   * In uscita: il centro dell'immagine diventa l'origine, la y è rovesciata perché in 3D cresce
   * verso l'alto, e la x è specchiata perché la figura sullo schermo si muova come in uno specchio.
   */
  toWorld(p: Point3): Point3 {
    const width = this.frameAspect * this.frameHeight;
    return {
      x: (0.5 - p.x) * width, // 0.5 - x = specchiatura + centratura in un colpo solo
      y: (0.5 - p.y) * this.frameHeight,
      z: -p.z * width * this.depthGain, // segno invertito: z negativa di MediaPipe = verso di noi
    };
  }

  /**
   * Un fotogramma: si misura il tempo passato dall'ultimo disegno (serve alle dissolvenze), si
   * lascia aggiornare la figura alla sottoclasse, poi si disegna.
   */
  render(): void {
    const now = performance.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Lo fanno le sottoclassi: far avanzare le dissolvenze delle proprie figure. */
  protected tick(_dt: number): void {}
}

/**
 * Il passo di dissolvenza, identico per mano e corpo: ci si avvicina all'opacità voluta di una
 * frazione che dipende dal tempo passato, così la sfumatura dura sempre circa un decimo di
 * secondo, a 30 come a 120 fotogrammi al secondo.
 */
export function fade(current: number, target: number, dt: number): number {
  const next = current + (target - current) * Math.min(1, dt * 12);
  return next < 0.01 && target === 0 ? 0 : next;
}
