/** prova-suono.ts — vedi prova-suono.html. Strumento di sviluppo, non fa parte del sito. */
import { SuonoOnda, type FaseSuono } from "./onda-audio";

const RATE = 44100;
const DURATA = 12.5;
const ctx = new OfflineAudioContext(2, Math.ceil(RATE * DURATA), RATE);
const s = new SuonoOnda(ctx);

const passo = 0.05;
const fase = (t: number): { f: FaseSuono; c: number; fraz: number; pan: number } => {
  if (t >= 0.5 && t < 4.5) return { f: "carica", c: (t - 0.5) / 4, fraz: 0, pan: 0 };
  if (t >= 4.5 && t < 7) return { f: "raggio", c: 1, fraz: (t - 4.5) / 2.5, pan: -0.8 + 1.6 * ((t - 4.5) / 2.5) };
  if (t >= 8.7 && t < 10.2) return { f: "carica", c: (t - 8.7) / 4, fraz: 0, pan: 0 };
  return { f: "idle", c: 0, fraz: 0, pan: 0 };
};
for (let t = 0; t < DURATA; t += passo) {
  const x = fase(t);
  s.aggiorna(t, x.f, x.c, x.pan, x.fraz);
}
s.ping(0.5);
s.spara(4.5);
s.ping(8.7);
s.sparisce(10.2);

const buf = await ctx.startRendering();
const L = buf.getChannelData(0), R = buf.getChannelData(1);
const inter = new Float32Array(L.length * 2);
for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
const bytes = new Uint8Array(inter.buffer);
let bin = "";
for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
document.body.dataset.esito = JSON.stringify({ rate: RATE, n: L.length, b64: btoa(bin) });
