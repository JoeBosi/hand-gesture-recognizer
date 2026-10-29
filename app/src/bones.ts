/**
 * bones.ts — i pezzi di uno scheletro, come geometrie riusabili.
 *
 * Qui non c'è niente che sappia di webcam o di MediaPipe: sono solo forme. `body3d.ts` le prende,
 * le mette in scena e a ogni fotogramma le sposta sopra i punti che arrivano dal riconoscitore.
 *
 * Il motivo per cui stanno in un file a parte è che sono costose da costruire (un osso lungo è un
 * solido di rotazione con un profilo di undici punti) e vanno costruite **una volta sola**: la
 * stessa geometria viene poi condivisa da tutte le ossa dello stesso tipo, che si distinguono solo
 * per posizione, rotazione e scala. Sono gli stessi oggetti in memoria, disegnati in venti posti
 * diversi: è ciò che permette di avere uno scheletro intero senza far faticare la scheda grafica.
 *
 * Convenzione delle forme, valida per tutte:
 *   - sono **centrate nell'origine** e alte 1, così scalarle è immediato;
 *   - le ossa lunghe stanno in piedi lungo l'asse Y, come il cilindro di Three.js: chi le posiziona
 *     deve solo ruotare l'asse Y sulla direzione voluta (vedi `placeBone` in body3d.ts);
 *   - nelle forme del corpo, +Z è **davanti** (verso chi guarda), +Y in alto, +X di lato
 *     (verso la sinistra della persona).
 */
import * as THREE from "three";

// -----------------------------------------------------------------------------------------------
// Attrezzi comuni
// -----------------------------------------------------------------------------------------------

/**
 * Un ellissoide con le dimensioni **complete** (non i raggi) già messo al suo posto. È il mattone
 * con cui si costruisce quasi tutto il resto: un osso corto, uno zigomo, un processo vertebrale
 * sono, a questa scala, ellissoidi con una buona luce addosso.
 */
function blob(w: number, h: number, d: number, x = 0, y = 0, z = 0, ws = 14, hs = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, ws, hs);
  g.scale(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * Lo specchio di una geometria rispetto al piano YZ (x → −x), con i triangoli rigirati.
 *
 * Una semplice scala negativa lascia i triangoli con l'avvolgimento sbagliato: la faccia davanti
 * diventa quella dietro e le luci si invertono. Qui si scambiano due indici per triangolo, e le
 * normali si ricalcolano già giuste perché `scale` le trasforma con la matrice inversa trasposta.
 */
export function mirrorX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = geo.clone();
  m.scale(-1, 1, 1);
  const idx = m.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      idx.setX(i + 1, c);
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  } else {
    // Geometria «non indicizzata» (ogni triangolo ha i suoi tre vertici, come quelle estruse): gli
    // indici non ci sono, quindi si scambiano il secondo e il terzo vertice di ogni triangolo in
    // TUTTI gli attributi. Alla prima versione questo caso non c'era e l'ala iliaca sinistra
    // veniva disegnata «al rovescio», grigia, con le luci invertite.
    for (const name of Object.keys(m.attributes)) {
      const a = m.getAttribute(name);
      for (let i = 0; i + 2 < a.count; i += 3) {
        for (let k = 0; k < a.itemSize; k++) {
          const v1 = a.getComponent(i + 1, k);
          a.setComponent(i + 1, k, a.getComponent(i + 2, k));
          a.setComponent(i + 2, k, v1);
        }
      }
      a.needsUpdate = true;
    }
  }
  return m;
}

/**
 * Unisce più geometrie in una sola, copiando i vertici una dietro l'altra.
 *
 * Three.js ha `BufferGeometryUtils.mergeGeometries`, ma sta negli "examples", che in questo
 * progetto non vengono importati per le forme: portarsi dietro un modulo intero per venti righe non
 * vale il peso aggiunto al pacchetto. Qui serve solo il caso semplice — tutte le geometrie hanno gli
 * stessi attributi (posizione, normale, coordinate della texture) — e quello si scrive a mano.
 *
 * Le coordinate della texture (`uv`) servono alla grana dell'osso (vedi `boneGrainTexture`): senza,
 * il rilievo verrebbe campionato sempre nello stesso punto e non si vedrebbe niente.
 */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const part of parts) {
    const geo = part.index ? part : part.toNonIndexed();
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    const uv = geo.getAttribute("uv");
    const offset = positions.length / 3;

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) {
      const idx = geo.index;
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    }
    // Le geometrie di partenza servivano solo a questo: la memoria sulla scheda grafica si
    // libera subito, tanto nessuno le disegnerà mai.
    part.dispose();
    if (geo !== part) geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  return merged;
}

/**
 * La grana dell'osso: una texture di rumore usata come **rilievo** (`bumpMap`), non come colore.
 *
 * Un osso di plastica liscia ha un solo difetto, che si vede subito: la luce scivola sopra in modo
 * uniforme. Un osso vero è poroso, e basta un rilievo appena accennato perché la luce si spezzi
 * come su un osso. Si disegna una volta sola su una tela, con macchie chiare e scure sovrapposte
 * (rumore a più scale) e qualche segno allungato come le venature, e la stessa texture serve a
 * tutti i materiali.
 *
 * Il generatore è deterministico (un seme fisso): due caricamenti della pagina danno lo stesso osso.
 */
export function boneGrainTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#808080"; // grigio medio = nessun rilievo
  c.fillRect(0, 0, size, size);

  // Un generatore pseudocasuale minuscolo (mulberry32): `Math.random` darebbe un osso diverso a
  // ogni caricamento, e due schermate di prova non sarebbero confrontabili.
  let seed = 20260930;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Macchie a tre scale: le grandi fanno l'ondulazione, le piccole i pori.
  for (const [count, radius, alpha] of [
    [90, 38, 0.1],
    [420, 12, 0.14],
    [1800, 3.4, 0.22],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = radius * (0.5 + rnd());
      const light = rnd() > 0.5;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, light ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, "rgba(128,128,128,0)");
      c.fillStyle = g;
      // Si disegna anche sul lato opposto quando la macchia esce dal bordo: la texture si ripete,
      // e una giuntura visibile ogni 256 pixel rovinerebbe l'effetto.
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        if (x + dx + r < 0 || x + dx - r > size || y + dy + r < 0 || y + dy - r > size) continue;
        c.save();
        c.translate(dx, dy);
        c.fillRect(x - r, y - r, r * 2, r * 2);
        c.restore();
      }
    }
  }
  // Le venature: segni sottili, quasi verticali, come le fibre di un osso lungo.
  c.lineCap = "round";
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 6 + rnd() * 22;
    c.strokeStyle = rnd() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
    c.lineWidth = 0.6 + rnd() * 0.8;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 4, y + len);
    c.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  // Un rilievo è un dato, non un colore: lasciare `NoColorSpace` (il predefinito) è obbligatorio,
  // perché con `SRGBColorSpace` i grigi verrebbero «corretti» e il rilievo si schiaccerebbe.
  return tex;
}

// -----------------------------------------------------------------------------------------------
// Ossa lunghe e corte
// -----------------------------------------------------------------------------------------------

/**
 * Un osso lungo (omero, femore, tibia…): un solido di rotazione.
 *
 * Il profilo è la metà destra della sagoma dell'osso vista di fronte: `LatheGeometry` la fa girare
 * attorno all'asse Y e ne ricava il solido. Le due estremità sono più grosse del fusto — sono le
 * **epifisi**, le teste dell'osso — e sono la ragione per cui un femore si riconosce a colpo
 * d'occhio mentre un cilindro sembra un tubo dell'impianto idraulico.
 *
 * Coppie (raggio, altezza) con l'altezza da 0 a 1; il raggio è relativo, la scala vera la decide
 * chi usa la geometria.
 */
export function longBoneGeometry(): THREE.LatheGeometry {
  const profile = [
    [0.0, 0.0],
    [0.62, 0.02],
    [1.0, 0.09],
    [0.78, 0.17],
    [0.56, 0.3],
    [0.5, 0.5], // il fusto, la parte più sottile
    [0.56, 0.7],
    [0.78, 0.83],
    [1.0, 0.91],
    [0.62, 0.98],
    [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const geo = new THREE.LatheGeometry(profile, 14);
  geo.translate(0, -0.5, 0); // centrata come il cilindro, così `placeBone` vale per tutte
  return geo;
}

/**
 * Un osso corto e liscio: falangi delle dita, metacarpi, ossa del piede. Stessa idea dell'osso
 * lungo ma con le teste appena accennate — sotto il centimetro a schermo, un profilo elaborato non
 * si vedrebbe e costerebbe triangoli per niente.
 */
export function shortBoneGeometry(): THREE.LatheGeometry {
  const profile = [
    [0.0, 0.0],
    [0.85, 0.06],
    [0.62, 0.25],
    [0.6, 0.75],
    [0.85, 0.94],
    [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const geo = new THREE.LatheGeometry(profile, 8);
  geo.translate(0, -0.5, 0);
  return geo;
}

/** Una sfera unitaria (diametro 1): rotula, testa del femore, nocche, tarso. Si scala a piacere. */
export function roundBoneGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 14, 10);
}

// -----------------------------------------------------------------------------------------------
// Gabbia toracica
// -----------------------------------------------------------------------------------------------

/** Le tre famiglie di costole: dalla più sicura alla più libera. */
export type RibKind = "vera" | "falsa" | "fluttuante";

/** Una costola: la parte ossea e (se c'è) la cartilagine che la collega allo sterno. */
export interface RibParts {
  bone: THREE.BufferGeometry;
  cartilage: THREE.BufferGeometry | null;
}

/**
 * Una costola del lato **destro**, in due pezzi di materiale diverso.
 *
 * Le costole vere non sono anelli orizzontali: partono dalla colonna e girano in avanti
 * **scendendo**, e una gabbia di anelli piatti non si legge come torace. Sono tre famiglie:
 *   - le prime sette (**vere**) arrivano fino allo sterno con un tratto di cartilagine;
 *   - le tre successive (**false**) si fermano prima e si appoggiano alla costola sopra;
 *   - le ultime due (**fluttuanti**) finiscono nel fianco, senza attaccarsi a niente.
 * Il tratto di cartilagine è più chiaro e leggermente più grosso: è ciò che fa vedere «dove finisce
 * l'osso» e dà alla gabbia il suo aspetto di torace invece che di cestino.
 *
 * Il raggio della forma è 1 in larghezza e in profondità e la discesa è 1 in altezza: chi la usa
 * la scala sulle misure del torace (e per la discesa sulla distanza fra due vertebre).
 */
export function ribGeometries(kind: RibKind): { right: RibParts; left: RibParts } {
  const back = [
    new THREE.Vector3(0.06, 0.0, -0.9), // attacco sulla vertebra, dietro
    new THREE.Vector3(0.55, -0.11, -0.78),
    new THREE.Vector3(0.92, -0.28, -0.3),
    new THREE.Vector3(1.0, -0.5, 0.24),
  ];
  const front: Record<RibKind, THREE.Vector3[]> = {
    // Davanti fin quasi allo sterno.
    vera: [new THREE.Vector3(0.68, -0.78, 0.7), new THREE.Vector3(0.14, -1.0, 0.95)],
    // Si ferma sul bordo costale, più in fuori.
    falsa: [new THREE.Vector3(0.8, -0.74, 0.52), new THREE.Vector3(0.5, -0.92, 0.74)],
    // Corta: finisce nel fianco.
    fluttuante: [new THREE.Vector3(0.94, -0.72, 0.38)],
  };
  const curve = new THREE.CatmullRomCurve3([...back, ...front[kind]]);

  // Dove l'osso diventa cartilagine: il 74% della lunghezza per le vere, il 82% per le false.
  const split = kind === "vera" ? 0.74 : kind === "falsa" ? 0.82 : 1;
  const sample = (from: number, to: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(from + ((to - from) * i) / n));

  const tube = (pts: THREE.Vector3[], radius: number) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, radius, 7, false);

  const bone = tube(sample(0, split, 24), 0.075);
  const cartilage = split < 1 ? tube(sample(split - 0.01, 1, 10), 0.082) : null;

  const right: RibParts = { bone, cartilage };
  const left: RibParts = { bone: mirrorX(bone), cartilage: cartilage ? mirrorX(cartilage) : null };
  return { right, left };
}

/**
 * Una vertebra: il corpo (il cilindro schiacciato su cui poggia quella sopra), l'arco che protegge
 * il midollo, i due processi trasversi (le «ali» a cui si attaccano le costole) e il processo
 * spinoso, la punta che si sente sotto la pelle quando si curva la schiena. Tutti i pezzi sono
 * uniti in una geometria sola, perché una vertebra non si muove mai in pezzi.
 *
 * Il raggio 1 è il corpo; la profondità (Z) è dietro-davanti. Le vertebre lombari e cervicali
 * usano la stessa forma con scale diverse.
 */
export function vertebraGeometry(): THREE.BufferGeometry {
  // Il corpo: più largo che profondo, come una fava, e spostato un po' in avanti rispetto al centro.
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.46, 14);
  body.scale(1, 1, 0.84);
  body.translate(0, 0, 0.08);

  // L'arco: due peduncoli che escono dal corpo all'indietro e una lamina che li chiude.
  const pedicles = [1, -1].map((s) => blob(0.16, 0.2, 0.34, s * 0.3, 0.02, -0.28, 8, 6));
  const lamina = blob(0.78, 0.2, 0.14, 0, 0.04, -0.46, 10, 6);

  // I processi trasversi: le due ali laterali.
  const trasversi = [1, -1].map((s) => blob(0.5, 0.13, 0.17, s * 0.86, 0.02, -0.34, 8, 6));

  // Il processo spinoso: lungo, rivolto in basso e all'indietro (nel torace somiglia a un tetto).
  const spinoso = new THREE.BoxGeometry(0.14, 0.22, 0.62);
  spinoso.rotateX(0.35);
  spinoso.translate(0, -0.1, -0.74);

  return mergeGeometries([body, ...pedicles, lamina, ...trasversi, spinoso]);
}

/** Il disco fra due vertebre: un cilindro basso e morbido, di un materiale diverso dall'osso. */
export function discGeometry(): THREE.BufferGeometry {
  const d = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  d.scale(1, 1, 0.84);
  d.translate(0, 0, 0.08);
  return d;
}

/**
 * Lo sterno in tre pezzi, ciascuno alto 1 e centrato: il **manubrio** in alto (largo, dove si
 * attaccano le clavicole), il **corpo** lungo al centro, il processo **xifoideo** in basso, a
 * punta. Tutti rivolti con +Z davanti.
 */
export function sternumGeometries(): { manubrio: THREE.BufferGeometry; corpo: THREE.BufferGeometry; xifoide: THREE.BufferGeometry } {
  const manubrio = blob(1, 1, 0.55, 0, 0, 0, 14, 10);
  const corpo = new THREE.BoxGeometry(0.62, 1, 0.34);
  // Un lieve restringimento verso il basso: il corpo dello sterno non è un listello.
  const pos = corpo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const t = (0.5 - pos.getY(i)) ; // 0 in alto, 1 in basso
    pos.setX(i, pos.getX(i) * (1 - 0.18 * t));
  }
  corpo.computeVertexNormals();
  const xifoide = new THREE.ConeGeometry(0.5, 1, 8);
  xifoide.rotateX(Math.PI); // la punta in basso
  xifoide.scale(1, 1, 0.5);
  return { manubrio, corpo, xifoide };
}

/**
 * La scapola del lato **sinistro** (la destra è il suo specchio): una piastra triangolare piatta
 * con la spina che la percorre in diagonale e l'acromion, la punta che forma la sommità della
 * spalla. Vista da dietro è inconfondibile; di fronte quasi non si vede, ma appena la persona si
 * gira è lei a far capire che dietro c'è una schiena e non un buco.
 *
 * Alta 1 e larga 1; lo spessore (Z) è già sottile.
 */
export function scapulaGeometry(): THREE.BufferGeometry {
  // Il contorno: il bordo mediale verticale, il bordo superiore che sale verso l'esterno, e il
  // bordo laterale che scende all'angolo inferiore.
  const s = new THREE.Shape();
  s.moveTo(0.0, 0.46);
  s.lineTo(0.4, 0.36);
  s.lineTo(0.6, 0.16);
  s.lineTo(0.48, -0.02);
  s.lineTo(0.28, -0.24);
  s.lineTo(0.06, -0.5);
  s.lineTo(-0.02, -0.2);
  s.closePath();
  const plate = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
  plate.translate(0, 0, -0.04);

  // La spina: una cresta che attraversa la piastra in diagonale fino all'acromion.
  const spina = new THREE.BoxGeometry(0.62, 0.05, 0.1);
  spina.rotateZ(-0.12);
  spina.translate(0.3, 0.2, 0.06);
  const acromion = blob(0.2, 0.08, 0.14, 0.62, 0.22, 0.06, 8, 6);
  return mergeGeometries([plate, spina, acromion]);
}

/**
 * Il bacino: due **ali iliache** a lama che si aprono verso l'alto e in fuori (quelle che si toccano
 * mettendo le mani sui fianchi), le due cavità dove entra il femore (**acetaboli**), i **rami**
 * dell'ischio e del pube che scendono e si incontrano davanti nella sinfisi, l'**osso sacro** dietro
 * dove finisce la colonna e il **coccige** che lo prolunga.
 *
 * Alla prima versione le ali erano due sfere e i rami un anello: da lontano sembrava un paio di
 * natiche con una ciambella sotto. Qui l'ala è una lama sottile con il contorno di una cresta
 * iliaca, e il resto sono tubi che disegnano il «cuore» rovesciato del vero foro otturatorio.
 *
 * La forma è larga 1 per lato circa; l'origine sta a metà altezza delle ali, e gli acetaboli
 * (dove devono arrivare i femori) a (±0,70, −0,22).
 */
export function pelvisGeometry(): THREE.BufferGeometry {
  // L'ala iliaca del lato destro: un contorno a ventaglio, più largo in alto (la cresta) e che si
  // stringe verso l'acetabolo. La si estrude sottile e la si piega in fuori.
  const ala = new THREE.Shape();
  ala.moveTo(0.24, 0.24);
  ala.quadraticCurveTo(0.42, 0.44, 0.7, 0.4); // la cresta iliaca
  ala.quadraticCurveTo(0.9, 0.3, 0.86, 0.08);
  ala.quadraticCurveTo(0.84, -0.1, 0.72, -0.18);
  ala.lineTo(0.52, -0.28);
  ala.lineTo(0.34, -0.26);
  ala.lineTo(0.24, -0.06);
  ala.closePath();
  const lama = new THREE.ExtrudeGeometry(ala, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 10 });
  lama.translate(0, 0, -0.04);
  // L'ala si apre in fuori e un po' in avanti, come una conca: ruotata attorno a Y e a Z.
  lama.rotateY(-0.42);
  lama.rotateZ(-0.12);

  // L'acetabolo: la sfera cava in cui entra la testa del femore.
  const acetabolo = blob(0.3, 0.3, 0.24, 0.7, -0.22, 0.02, 14, 10);
  // I rami ischio-pubici: dall'acetabolo giù e verso il centro, fino alla sinfisi pubica.
  const ramo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.66, -0.3, 0.04),
      new THREE.Vector3(0.58, -0.54, 0.1),
      new THREE.Vector3(0.36, -0.68, 0.18),
      new THREE.Vector3(0.1, -0.64, 0.2),
    ]),
    16,
    0.06,
    8,
    false,
  );

  const parti: THREE.BufferGeometry[] = [lama, acetabolo, ramo];
  const lati: THREE.BufferGeometry[] = [];
  for (const g of parti) lati.push(g, mirrorX(g));

  // La sinfisi pubica, davanti al centro, che tiene insieme i due rami.
  const sinfisi = blob(0.2, 0.1, 0.1, 0, -0.64, 0.2, 10, 8);
  // L'osso sacro: il cuneo dietro, dove la colonna finisce e scarica il peso sul bacino.
  const sacro = blob(0.4, 0.74, 0.28, 0, 0.0, -0.3, 14, 10);
  // Il coccige: la piccola coda, un cono rivolto in basso e leggermente in avanti.
  const coccige = new THREE.ConeGeometry(0.08, 0.26, 8);
  coccige.rotateX(Math.PI - 0.35);
  coccige.translate(0, -0.46, -0.28);

  return mergeGeometries([...lati, sinfisi, sacro, coccige]);
}

// -----------------------------------------------------------------------------------------------
// La testa
// -----------------------------------------------------------------------------------------------

/**
 * Una fila di denti disposta su un arco: ogni dente è un blocchetto orientato lungo la curva.
 *
 * `larghezza` e `profondità` sono i semiassi dell'arco (X e Z), `centroZ` dove sta il suo centro,
 * `y` l'altezza del centro dei denti. I denti sono 14 per l'arcata superiore e 12 per l'inferiore:
 * i molari del giudizio non si contano, e a questa scala nessuno li conterebbe.
 */
function teethRow(larghezza: number, profondita: number, centroZ: number, y: number, count: number, toothH: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1); // 0..1
    const a = (t - 0.5) * 2 * 1.32; // angolo da -75° a +75° circa
    // I denti davanti sono più stretti (incisivi), quelli dietro più larghi (molari).
    const w = 0.034 + 0.03 * Math.abs(Math.sin(a));
    const tooth = new THREE.BoxGeometry(w, toothH, 0.04);
    tooth.rotateY(a);
    tooth.translate(larghezza * Math.sin(a), y, centroZ + profondita * Math.cos(a));
    out.push(tooth);
  }
  return out;
}

/**
 * Il cranio: calotta, fronte, arcata sopracciliare, bordi delle orbite, osso nasale, mascella
 * superiore con la sua fila di denti, zigomi, archi zigomatici e mastoidi. **Senza la mandibola**,
 * che è un pezzo a parte (`mandibleGeometry`) perché si muove: quando la persona apre la bocca il
 * teschio fa lo stesso.
 *
 * Orbite e cavità nasale **non** sono qui: sono buchi, e un buco in una mesh o si scava davvero
 * (costoso) o si finge con forme scure messe davanti — è la seconda strada, e le fa body3d.ts con
 * un materiale diverso.
 *
 * Il cranio è alto circa 1 (da −0.28 a +0.62 la calotta), con l'origine all'altezza delle
 * orecchie: è lì che il modello del volto dà le guance, quindi è il punto naturale a cui ancorarlo.
 * +Z è la faccia.
 */
export function skullGeometry(): THREE.BufferGeometry {
  // La calotta: più stretta che alta e più lunga che larga. Una sfera perfetta darebbe una testa
  // da fumetto; le proporzioni di un cranio vero sono circa 0,75 di larghezza per 1 di altezza.
  const cranium = blob(0.8, 0.9, 1.0, 0, 0.17, -0.07, 32, 22);
  // L'occipite: la sporgenza dietro, alla base della nuca. Di profilo è ciò che distingue un
  // cranio da un uovo.
  const occiput = blob(0.54, 0.4, 0.34, 0, 0.0, -0.42, 18, 12);
  // L'osso frontale, che sporge sopra le orbite: dà la fronte piena e tonda.
  const fronte = blob(0.5, 0.26, 0.2, 0, 0.27, 0.3, 18, 12);
  // L'arcata sopracciliare: il bordo osseo sopra le orbite, che dà l'ombra tipica del teschio.
  const brow = blob(0.5, 0.075, 0.13, 0, 0.1, 0.375, 18, 8);

  // I bordi delle orbite: due anelli sottili attorno alle cavità scure. Senza, le orbite sono
  // macchie su una palla; con, sono buchi con un bordo, e il teschio si legge subito.
  const orbite = [1, -1].map((s) => {
    const rim = new THREE.TorusGeometry(0.088, 0.02, 8, 22);
    rim.scale(1, 0.92, 1);
    rim.rotateY(s * 0.22);
    rim.translate(s * 0.165, 0.0, 0.36);
    return rim;
  });

  // La mascella superiore (il «viso»), che si stringe verso il basso come una V smussata.
  const face = blob(0.5, 0.3, 0.4, 0, -0.15, 0.24, 18, 12);
  // L'osso nasale: il ponte stretto fra le orbite.
  const nasale = blob(0.1, 0.2, 0.15, 0, 0.0, 0.4, 8, 6);
  nasale.rotateX(-0.35);
  // Gli zigomi, che danno alla faccia lo spigolo che una sfera non ha.
  const zigomi = [1, -1].map((s) => blob(0.14, 0.12, 0.2, s * 0.245, -0.07, 0.24, 10, 8));
  // Gli archi zigomatici: le sbarre sottili che dallo zigomo vanno verso l'orecchio. Sono ciò che
  // fa vedere un «vero» teschio di profilo.
  const archi = [1, -1].map((s) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.3, -0.05, 0.2),
      new THREE.Vector3(s * 0.385, -0.04, 0.1),
      new THREE.Vector3(s * 0.4, -0.03, -0.02),
    ]);
    return new THREE.TubeGeometry(curve, 8, 0.022, 6, false);
  });

  // L'arcata dentaria superiore.
  const denti = teethRow(0.155, 0.165, 0.225, -0.268, 14, 0.07);

  return mergeGeometries([cranium, occiput, fronte, brow, ...orbite, face, nasale, ...zigomi, ...archi, ...denti]);
}

/**
 * La mandibola con i suoi denti, nelle stesse coordinate del cranio (non relative al perno): chi la
 * usa la mette in un gruppo con il perno all'articolazione (`MANDIBLE_PIVOT`) e la fa ruotare.
 *
 * È un tubo che disegna la «U» dal condilo sinistro, giù lungo il ramo, in avanti lungo il corpo,
 * fino al mento e di nuovo su dall'altra parte; più due placche per i rami montanti, il mento e la
 * fila di denti inferiori. Nell'articolazione i condili sono due sfere.
 */
export function mandibleGeometry(): THREE.BufferGeometry {
  const U = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.26, -0.03, -0.03), // condilo destro
    new THREE.Vector3(0.255, -0.18, -0.03),
    new THREE.Vector3(0.235, -0.31, -0.01), // angolo
    new THREE.Vector3(0.18, -0.365, 0.13),
    new THREE.Vector3(0.09, -0.385, 0.245),
    new THREE.Vector3(0.0, -0.392, 0.285), // mento
    new THREE.Vector3(-0.09, -0.385, 0.245),
    new THREE.Vector3(-0.18, -0.365, 0.13),
    new THREE.Vector3(-0.235, -0.31, -0.01),
    new THREE.Vector3(-0.255, -0.18, -0.03),
    new THREE.Vector3(-0.26, -0.03, -0.03),
  ]);
  const corpo = new THREE.TubeGeometry(U, 60, 0.032, 8, false);
  const condili = [1, -1].map((s) => blob(0.075, 0.07, 0.09, s * 0.26, -0.03, -0.03, 8, 6));
  const rami = [1, -1].map((s) => blob(0.035, 0.27, 0.15, s * 0.255, -0.17, -0.03, 8, 8));
  const mento = blob(0.15, 0.08, 0.09, 0, -0.378, 0.272, 10, 8);
  const denti = teethRow(0.125, 0.145, 0.135, -0.335, 12, 0.062);
  return mergeGeometries([corpo, ...condili, ...rami, mento, ...denti]);
}

/**
 * Il perno della mandibola, nelle coordinate del cranio: l'articolazione temporo-mandibolare,
 * subito davanti e sotto l'orecchio. La mandibola ruota attorno a questo punto quando la bocca
 * si apre.
 */
export const MANDIBLE_PIVOT = new THREE.Vector3(0, -0.03, -0.03);
