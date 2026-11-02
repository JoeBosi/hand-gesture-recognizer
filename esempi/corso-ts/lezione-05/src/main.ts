// Lesson 5, state after exercises 5.1 to 5.5 (fake hand drawn on a canvas).
const tela = document.getElementById("tela") as HTMLCanvasElement | null;
if (!tela) {
  throw new Error("canvas non trovato");
}

const ctx = tela.getContext("2d");
if (!ctx) {
  throw new Error("contesto 2d non disponibile");
}

// --- Esercizio 5.2: i ventuno punti ---
interface Punto {
  x: number;
  y: number;
}

const MANO_APERTA: Punto[] = [
  { x: 0.50, y: 0.88 },   //  0 polso
  { x: 0.42, y: 0.84 },   //  1 pollice, base
  { x: 0.36, y: 0.77 },   //  2 pollice
  { x: 0.33, y: 0.70 },   //  3 pollice
  { x: 0.30, y: 0.64 },   //  4 pollice, PUNTA
  { x: 0.44, y: 0.60 },   //  5 indice, nocca
  { x: 0.42, y: 0.50 },   //  6 indice
  { x: 0.41, y: 0.43 },   //  7 indice
  { x: 0.40, y: 0.37 },   //  8 indice, PUNTA
  { x: 0.51, y: 0.58 },   //  9 medio, nocca
  { x: 0.51, y: 0.47 },   // 10 medio
  { x: 0.51, y: 0.40 },   // 11 medio
  { x: 0.51, y: 0.33 },   // 12 medio, PUNTA
  { x: 0.57, y: 0.60 },   // 13 anulare, nocca
  { x: 0.58, y: 0.49 },   // 14 anulare
  { x: 0.59, y: 0.43 },   // 15 anulare
  { x: 0.60, y: 0.37 },   // 16 anulare, PUNTA
  { x: 0.63, y: 0.63 },   // 17 mignolo, nocca
  { x: 0.66, y: 0.55 },   // 18 mignolo
  { x: 0.68, y: 0.50 },   // 19 mignolo
  { x: 0.70, y: 0.45 },   // 20 mignolo, PUNTA
];

function aPixel(valore: number, dimensione: number): number {
  return valore * dimensione;
}

// --- Esercizio 5.3: le ossa ---
const CONNESSIONI: number[][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // pollice
  [0, 5], [5, 6], [6, 7], [7, 8],           // indice
  [5, 9], [9, 10], [10, 11], [11, 12],      // medio
  [9, 13], [13, 14], [14, 15], [15, 16],    // anulare
  [13, 17], [17, 18], [18, 19], [19, 20],   // mignolo
  [0, 17],                                  // il lato del palmo
];

// --- Esercizio 5.4: le punte ---
const PUNTE: number[] = [4, 8, 12, 16, 20];

// --- Esercizio 5.5: la seconda posa e il pulsante ---
const PUGNO: Punto[] = [
  { x: 0.50, y: 0.88 }, { x: 0.42, y: 0.84 }, { x: 0.37, y: 0.78 },
  { x: 0.36, y: 0.72 }, { x: 0.40, y: 0.68 },
  { x: 0.44, y: 0.62 }, { x: 0.43, y: 0.54 }, { x: 0.46, y: 0.56 },
  { x: 0.48, y: 0.60 },
  { x: 0.51, y: 0.60 }, { x: 0.51, y: 0.52 }, { x: 0.53, y: 0.55 },
  { x: 0.54, y: 0.60 },
  { x: 0.57, y: 0.61 }, { x: 0.58, y: 0.53 }, { x: 0.59, y: 0.57 },
  { x: 0.59, y: 0.62 },
  { x: 0.63, y: 0.64 }, { x: 0.65, y: 0.58 }, { x: 0.65, y: 0.62 },
  { x: 0.64, y: 0.66 },
];

const disegna = (punti: Punto[]): void => {
  ctx.clearRect(0, 0, tela.width, tela.height);

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  for (const osso of CONNESSIONI) {
    const a = punti[osso[0]];
    const b = punti[osso[1]];
    ctx.beginPath();
    ctx.moveTo(aPixel(a.x, tela.width), aPixel(a.y, tela.height));
    ctx.lineTo(aPixel(b.x, tela.width), aPixel(b.y, tela.height));
    ctx.stroke();
  }

  for (let i = 0; i < punti.length; i++) {
    const p = punti[i];
    const punta = PUNTE.includes(i);
    ctx.beginPath();
    ctx.arc(aPixel(p.x, tela.width), aPixel(p.y, tela.height), punta ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = punta ? "#ffffff" : "#38bdf8";
    ctx.fill();
  }
};

let aperta = true;
disegna(MANO_APERTA);

const pulsante = document.getElementById("cambia") as HTMLButtonElement | null;

if (pulsante) {
  pulsante.addEventListener("click", () => {
    aperta = !aperta;
    disegna(aperta ? MANO_APERTA : PUGNO);
  });
}
