/**
 * onda-fx.ts — gli effetti luminosi dell'onda energetica.
 *
 * Solo disegno: niente DOM, niente webcam, niente stato della partita. Chi li chiama (onda.ts)
 * passa posizioni e tempi, e qui dentro si trasformano in luce su una tela 2D.
 *
 * IL TRUCCO DELLA LUCE: `globalCompositeOperation = "lighter"`. È la modalità che SOMMA i colori
 * invece di coprirli: due bagliori che si sovrappongono diventano più luminosi, non più opachi, ed
 * è esattamente come si comporta la luce vera. Con un bianco al centro e un azzurro che sfuma
 * all'esterno, si ottiene un alone credibile senza nessun filtro. Chi chiama imposta `lighter`
 * prima delle funzioni "luminose" e lo rimette a `source-over` prima di buio e lampo.
 *
 * PERCHÉ GRADIENTI RADIALI E NON `shadowBlur`: sfocare un'ombra costa moltissimo, perché il
 * browser deve rielaborare i pixel a ogni disegno; un gradiente radiale è una formula calcolata
 * dalla scheda grafica, e a 60 fotogrammi al secondo la differenza si sente.
 *
 * PERCHÉ UN GENERATORE CASUALE "A SEME" per i fulmini: se a ogni fotogramma (60 volte al secondo)
 * si estraessero fulmini nuovi, tutto sfarfallerebbe in modo fastidioso — e per chi è sensibile
 * alle luci, pericoloso. Il seme cambia una dozzina di volte al secondo: dentro lo stesso seme i
 * fulmini restano fermi, fra un seme e l'altro cambiano forma. Lo sfarfallio è lento e leggibile.
 */

export interface Punto {
  x: number;
  y: number;
}

// --- Piccoli aiuti ----------------------------------------------------------------------------

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Passaggio morbido da 0 a 1: parte piano, corre al centro, arriva piano (3t² − 2t³). */
const liscia = (t: number) => {
  const c = clamp(t);
  return c * c * (3 - 2 * c);
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Generatore pseudo-casuale a seme (mulberry32): stesso seme, stessa sequenza. */
function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Buio --------------------------------------------------------------------------------------

/**
 * Scurisce l'immagine della webcam. La luce si vede solo sullo scuro: senza questo la palla
 * azzurra su una parete chiara sparirebbe. `livello` 0..1 è la forza (0,5 = metà del buio massimo).
 */
export function disegnaBuio(ctx: CanvasRenderingContext2D, w: number, h: number, livello: number): void {
  if (livello <= 0.002) return;
  ctx.globalCompositeOperation = "source-over";
  // Un po' più scuro ai bordi che al centro (vignettatura): attira lo sguardo verso la palla.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, `rgba(2, 6, 20, ${0.58 * livello})`);
  g.addColorStop(1, `rgba(2, 6, 20, ${0.85 * livello})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// --- Particelle --------------------------------------------------------------------------------

/** Una scintilla che viene risucchiata dalla palla durante la carica. */
interface Convergente {
  ang: number; // da che angolo arriva
  dist: number; // da che distanza parte
  eta: number; // quanto è vecchia (secondi)
  vita: number; // quanto dura (secondi)
  giro: number; // quanto si avvita mentre arriva
  grana: number; // grandezza
}

/** Una scintilla che schizza via dal raggio. */
interface Scintilla {
  x: number;
  y: number;
  vx: number;
  vy: number;
  eta: number;
  vita: number;
  grana: number;
}

export class Particelle {
  private conv: Convergente[] = [];
  private sci: Scintilla[] = [];
  // «Resto»: le particelle da emettere sono un numero con la virgola (es. 2,4 per fotogramma). Si
  // emette la parte intera e si riporta il resto, altrimenti a 60 fps se ne emetterebbero sempre
  // zero e a 10 fps sempre due: la quantità dipenderebbe dalla velocità del computer.
  private restoConv = 0;
  private restoSci = 0;

  /** Emette le particelle che convergono. `raggioRif` = raggio della palla a carica piena. */
  emettiConvergenti(dt: number, carica: number, raggioRif: number, ridotto: boolean): void {
    this.restoConv += (20 + 140 * carica) * (ridotto ? 0.4 : 1) * dt;
    while (this.restoConv >= 1) {
      this.restoConv -= 1;
      this.conv.push({
        ang: rnd(0, Math.PI * 2),
        dist: raggioRif * rnd(2.0, 4.2),
        eta: 0,
        vita: rnd(0.55, 1.05),
        giro: rnd(0.6, 1.7) * (Math.random() < 0.5 ? -1 : 1),
        grana: rnd(1.2, 3.4),
      });
    }
    if (this.conv.length > 420) this.conv.splice(0, this.conv.length - 420);
  }

  /** Emette le scintille del raggio, lungo la sua parte iniziale. */
  emettiScintille(dt: number, o: Punto, d: Punto, lunghezza: number, spessore: number, ridotto: boolean): void {
    this.restoSci += (ridotto ? 40 : 150) * dt;
    const n: Punto = { x: -d.y, y: d.x }; // perpendicolare al raggio
    while (this.restoSci >= 1) {
      this.restoSci -= 1;
      const s = Math.pow(Math.random(), 2) * lunghezza * 0.6; // più fitte vicino alla palla
      const lato = rnd(-1, 1);
      const v = rnd(120, 520);
      this.sci.push({
        x: o.x + d.x * s + n.x * lato * spessore * 0.6,
        y: o.y + d.y * s + n.y * lato * spessore * 0.6,
        vx: d.x * v * 0.3 + n.x * lato * rnd(120, 320),
        vy: d.y * v * 0.3 + n.y * lato * rnd(120, 320),
        eta: 0,
        vita: rnd(0.35, 0.9),
        grana: rnd(1.2, 3.2),
      });
    }
    if (this.sci.length > 360) this.sci.splice(0, this.sci.length - 360);
  }

  /** Fa invecchiare tutte le particelle e butta via quelle morte. */
  passo(dt: number): void {
    for (const p of this.conv) p.eta += dt;
    this.conv = this.conv.filter((p) => p.eta < p.vita);
    for (const p of this.sci) {
      p.eta += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.25, dt); // l'attrito le frena
      p.vy *= Math.pow(0.25, dt);
    }
    this.sci = this.sci.filter((p) => p.eta < p.vita);
  }

  /** Disegna tutto, in additivo. `unita` = pixel per «un punto di progetto» (altezza / 480). */
  disegna(ctx: CanvasRenderingContext2D, centro: Punto, unita: number): void {
    ctx.lineCap = "round";
    for (const p of this.conv) {
      const t = p.eta / p.vita;
      // Posizione: parte lontano, accelera verso il centro (la distanza scende come 1 − t²) e si
      // avvita un poco mentre arriva, come l'acqua nello scarico.
      const pos = (u: number): Punto => {
        const d = p.dist * (1 - u * u);
        const a = p.ang + p.giro * u;
        return { x: centro.x + Math.cos(a) * d, y: centro.y + Math.sin(a) * d };
      };
      const a = pos(t);
      const b = pos(Math.max(0, t - 0.07)); // la coda: dov'era un attimo fa
      ctx.strokeStyle = `rgba(190, 235, 255, ${0.15 + 0.75 * t})`;
      ctx.lineWidth = p.grana * unita;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }
    for (const p of this.sci) {
      const t = p.eta / p.vita;
      ctx.strokeStyle = `rgba(210, 242, 255, ${(1 - t) * 0.95})`;
      ctx.lineWidth = p.grana * unita * (1 - t * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    }
  }

  svuota(): void {
    this.conv = [];
    this.sci = [];
    this.restoConv = this.restoSci = 0;
  }
}

// --- La palla di energia ------------------------------------------------------------------------

export interface StatoSfera {
  x: number;
  y: number;
  /** Raggio del nucleo in pixel (prima della pulsazione). */
  r: number;
  /** Quanto è carica: 0..1. */
  carica: number;
  /** Tempo in secondi, per pulsazione e fulmini. */
  t: number;
  ridotto: boolean;
  unita: number;
}

/** Un alone sfumato: bianco/azzurro al centro, trasparente al bordo. */
function alone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Disegna la palla (in additivo): tre aloni, il nucleo bianco, i piccoli fulmini. */
export function disegnaSfera(ctx: CanvasRenderingContext2D, s: StatoSfera): void {
  const { x, y, carica, t, ridotto, unita } = s;
  ctx.globalCompositeOperation = "lighter";

  // La pulsazione: più veloce e più ampia man mano che si carica. Con `prefers-reduced-motion`
  // quasi ferma: una luce che pulsa in fretta è proprio quello che dà fastidio a chi la teme.
  const pulsa = ridotto ? 1 + 0.012 * Math.sin(t * 2.5) : 1 + (0.045 + 0.04 * carica) * Math.sin(t * (9 + 11 * carica));
  const r = s.r * pulsa;

  alone(ctx, x, y, r * 3.6, [[0, "rgba(70, 140, 255, 0.30)"], [0.45, "rgba(40, 100, 230, 0.12)"], [1, "rgba(20, 60, 200, 0)"]]);
  alone(ctx, x, y, r * 2.0, [[0, "rgba(130, 205, 255, 0.55)"], [0.6, "rgba(70, 150, 255, 0.2)"], [1, "rgba(40, 110, 240, 0)"]]);
  alone(ctx, x, y, r * 1.2, [[0, "rgba(255, 255, 255, 0.95)"], [0.55, "rgba(185, 232, 255, 0.85)"], [1, "rgba(120, 200, 255, 0)"]]);
  alone(ctx, x, y, r * 0.55, [[0, "rgba(255, 255, 255, 1)"], [1, "rgba(255, 255, 255, 0.6)"]]);

  // I fulmini: poche linee spezzate che escono dalla palla. Il seme cambia 12 volte al secondo.
  const rand = generatore(Math.floor(t * 12) + 1);
  const quanti = ridotto ? 2 : 3 + Math.round(carica * 6);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 0; i < quanti; i++) {
    const ang = rand() * Math.PI * 2;
    const lunghezza = r * (1.15 + rand() * (0.8 + carica * 1.3));
    const pezzi = 7;
    ctx.strokeStyle = `rgba(205, 240, 255, ${0.55 + rand() * 0.35})`;
    ctx.lineWidth = (1.1 + rand() * 1.9) * unita;
    ctx.beginPath();
    for (let k = 0; k <= pezzi; k++) {
      const q = k / pezzi;
      const d = r * 0.7 + (lunghezza - r * 0.7) * q;
      const storto = (rand() - 0.5) * r * 0.38 * q; // più storto verso la punta
      const px = x + Math.cos(ang) * d - Math.sin(ang) * storto;
      const py = y + Math.sin(ang) * d + Math.cos(ang) * storto;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/** L'anello di avanzamento attorno alla palla: si riempie in senso orario fino a carica piena. */
export function disegnaAnello(ctx: CanvasRenderingContext2D, s: StatoSfera): void {
  const R = s.r * 1.5 + 9 * s.unita;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineWidth = 5 * s.unita;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
  ctx.stroke();
  if (s.carica <= 0.005) return;
  const g = ctx.createLinearGradient(s.x - R, s.y, s.x + R, s.y);
  g.addColorStop(0, "rgba(80, 170, 255, 0.95)");
  g.addColorStop(1, "rgba(255, 255, 255, 0.98)");
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(s.carica));
  ctx.stroke();
}

// --- Il raggio -----------------------------------------------------------------------------------

export interface StatoRaggio {
  /** Origine (il centro della palla al momento dello sparo, poi segue le mani). */
  x: number;
  y: number;
  /** Direzione, vettore unitario. */
  dx: number;
  dy: number;
  /** Misure della tela: servono a sapere quanto deve essere lungo per uscire dallo schermo. */
  w: number;
  h: number;
  /** Larghezza del nucleo bianco in pixel. */
  spessore: number;
  /** Avanzamento della vita del raggio: 0 (appena sparato) .. 1 (spento). */
  fase: number;
  t: number;
  ridotto: boolean;
  unita: number;
}

/**
 * Disegna il raggio. La vita è in tre tempi: esplode in avanti (primo 12%), resta stabile
 * ondeggiando, si ritira dalla coda e si assottiglia (ultimo 20%).
 *
 * Il raggio non è una linea grossa ma un **poligono** con un profilo di larghezza: stretto dove
 * esce dalle mani (55%), pieno poco dopo, con una leggera vibrazione lungo il percorso; e in fase
 * di ritiro la coda si affina fino a sparire. Con una linea spessa, invece, ogni strato avrebbe
 * avuto la testa tonda: una «pillola» azzurra con la base arrotondata, che è esattamente il difetto
 * visto nella prima versione.
 *
 * L'asse del raggio è una *spezzata* (48 segmenti) spostata di lato da un'onda che scorre: da lì
 * viene l'impressione di energia che vibra invece di un bastone luminoso.
 */
export function disegnaRaggio(ctx: CanvasRenderingContext2D, s: StatoRaggio): void {
  const lungo = Math.hypot(s.w, s.h) * 1.3;
  const estensione = liscia(s.fase / 0.12); // quanto è uscito
  const ritiro = liscia((s.fase - 0.8) / 0.2); // quanto si è ritirato dalla coda
  if (estensione <= 0 || ritiro >= 1) return;

  // Nei primi istanti è più grosso (l'esplosione), poi si assesta; alla fine si assottiglia.
  const sbalzo = 1 + 0.45 * (1 - liscia(s.fase / 0.28));
  const spessore = s.spessore * sbalzo * (1 - 0.85 * ritiro);

  const nx = -s.dy;
  const ny = s.dx;
  const da = ritiro * lungo; // dove comincia la coda
  const a = lungo * estensione; // dove arriva la punta
  const N = 48;
  const ampiezza = s.ridotto ? 0 : spessore * 0.09;

  /** Un punto dell'asse alla distanza `d` dall'origine, con l'onda (fase diversa per ogni filo). */
  const asse = (d: number, fase: number, scarto: number): Punto => {
    const onda = Math.sin(d / (55 * s.unita) - s.t * 17 + fase) * ampiezza + scarto;
    return { x: s.x + s.dx * d + nx * onda, y: s.y + s.dy * d + ny * onda };
  };

  /** Larghezza relativa alla distanza d: stretta alla base, piena dopo, coda che si affina. */
  const profilo = (d: number) => {
    const base = 0.55 + 0.45 * liscia(d / (spessore * 2.5));
    const coda = ritiro > 0 ? liscia((d - da) / (spessore * 3)) : 1;
    const vibra = s.ridotto ? 1 : 1 + 0.05 * Math.sin(d / (28 * s.unita) - s.t * 24);
    return base * coda * vibra;
  };

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Strati dal più largo e tenue al più stretto e luminoso: l'alone, la guaina, il nucleo.
  const strati: [number, string][] = [
    [5.0, "rgba(40, 110, 255, 0.14)"],
    [3.0, "rgba(70, 150, 255, 0.24)"],
    [1.75, "rgba(135, 210, 255, 0.5)"],
    [1.0, "rgba(255, 255, 255, 0.97)"],
  ];
  // Si calcolano una volta sola le posizioni e le normali dell'asse: servono a tutti gli strati.
  const punti: { p: Punto; d: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const d = da + (a - da) * (i / N);
    punti.push({ p: asse(d, 0, 0), d });
  }
  for (const [mol, colore] of strati) {
    ctx.fillStyle = colore;
    ctx.beginPath();
    // Lato sinistro andando avanti, lato destro tornando indietro: un unico contorno chiuso.
    punti.forEach(({ p, d }, i) => {
      const h = (spessore * mol * profilo(d)) / 2;
      const x = p.x + nx * h;
      const y = p.y + ny * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = punti.length - 1; i >= 0; i--) {
      const { p, d } = punti[i];
      const h = (spessore * mol * profilo(d)) / 2;
      ctx.lineTo(p.x - nx * h, p.y - ny * h);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Due fili sottili che si attorcigliano attorno al nucleo.
  ctx.lineWidth = Math.max(1.5, 2.2 * s.unita);
  ctx.strokeStyle = "rgba(210, 242, 255, 0.85)";
  for (const [fase, scarto] of [[1.7, 0.55], [4.1, -0.55]] as const) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const d = da + (a - da) * (i / N);
      const q = asse(d, fase, scarto * spessore * profilo(d));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  // Il bagliore all'origine, dove il raggio nasce dalle mani.
  const R = spessore * 3.0;
  alone(ctx, s.x, s.y, R, [[0, "rgba(255, 255, 255, 0.95)"], [0.3, "rgba(160, 220, 255, 0.6)"], [1, "rgba(50, 120, 255, 0)"]]);
}

// --- Il lampo ------------------------------------------------------------------------------------

/**
 * Il lampo bianco dello sparo. `intensita` 1 → 0 in circa un quarto di secondo: è un singolo
 * lampo, MAI una sequenza. Le linee guida sull'accessibilità (WCAG 2.3.1) vietano più di tre
 * lampeggi al secondo; qui ce n'è uno solo, e per chi ha chiesto meno movimento è appena un velo.
 */
export function disegnaLampo(ctx: CanvasRenderingContext2D, w: number, h: number, intensita: number, ridotto: boolean): void {
  if (intensita <= 0.002) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(235, 248, 255, ${(ridotto ? 0.1 : 0.62) * intensita})`;
  ctx.fillRect(0, 0, w, h);
}
