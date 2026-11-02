// src/disegna.ts
export interface Punto {
  x: number;
  y: number;
  z: number;
}

/** Le 21 ossa della mano: ogni coppia dice quali due punti collegare. */
export const OSSA: number[][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function disegnaPunti(ctx: CanvasRenderingContext2D, punti: Punto[], colore = "#ffffff"): void {
  ctx.fillStyle = colore;
  for (const p of punti) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function disegnaOssa(ctx: CanvasRenderingContext2D, punti: Punto[], colore = "#38bdf8"): void {
  ctx.strokeStyle = colore;
  ctx.lineWidth = 3;
  for (const osso of OSSA) {
    const a = punti[osso[0]];
    const b = punti[osso[1]];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
