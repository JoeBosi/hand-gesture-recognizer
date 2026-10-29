/**
 * prova-scheletro.ts — disegna lo scheletro su una posa inventata, senza webcam.
 *
 * Non fa parte del sito (vedi il commento in prova-scheletro.html): è lo strumento con cui si
 * verifica la forma della figura. I 33 punti qui sotto sono scritti a mano e rappresentano una
 * persona in piedi, di fronte; `?turn=` fa ruotare la testa attorno al proprio centro, così si
 * controlla che il cranio giri davvero invece di restare una palla ferma.
 *
 * Parametri (tutti gli angoli in gradi):
 *   ?turn=40    la testa gira a sinistra/destra (imbardata)
 *   ?pitch=35   la testa si china in avanti (positivo) o si alza (negativo) — il caso della persona
 *               china sullo schermo, che era quello disegnato male
 *   ?roll=15    la testa si inclina di lato
 *   ?jaw=0.8    la bocca si apre (0 = chiusa, 1 = spalancata)
 *   ?face=0     senza il modello del volto: solo i sette punti del viso della posa (il ripiego)
 *   ?hands=0    senza le mani
 *   ?zoom=head  inquadra da vicino la testa (la camera è la stessa, cambia il riquadro)
 */
import "./style.css";
import { BodyScene, type HandPoints, type PosePoint } from "./body3d";
import type { FacePose } from "./face";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const scene = new BodyScene(canvas);
scene.setFrameAspect(4 / 3);

const P = (x: number, y: number, z = 0): PosePoint => ({ x, y, z, visibility: 1 });

/** Una persona in piedi, di fronte. La testa si può girare con ?turn=... (in gradi). */
function posa(turn: number): PosePoint[] {
  const a = (turn * Math.PI) / 180;
  const half = 0.045;
  // Le orecchie ruotano attorno al centro della testa; il naso esce in avanti dalla stessa terna.
  const cx = 0.5, cy = 0.115;
  const earL = P(cx + Math.cos(a) * half, cy, Math.sin(a) * half);
  const earR = P(cx - Math.cos(a) * half, cy, -Math.sin(a) * half);
  const nose = P(cx - Math.sin(a) * 0.05, cy + 0.022, -Math.cos(a) * 0.05);

  const p: PosePoint[] = new Array(33);
  p[0] = nose;
  for (const i of [1, 2, 3]) p[i] = P(cx + 0.018, cy - 0.012);
  for (const i of [4, 5, 6]) p[i] = P(cx - 0.018, cy - 0.012);
  p[7] = earL; p[8] = earR;
  p[9] = P(cx + 0.015, cy + 0.04); p[10] = P(cx - 0.015, cy + 0.04);
  p[11] = P(0.60, 0.25); p[12] = P(0.40, 0.25);
  p[13] = P(0.665, 0.385, -0.02); p[14] = P(0.335, 0.385, -0.02);
  p[15] = P(0.705, 0.505, -0.04); p[16] = P(0.295, 0.505, -0.04);
  p[17] = P(0.722, 0.545, -0.04); p[18] = P(0.278, 0.545, -0.04);
  p[19] = P(0.712, 0.552, -0.04); p[20] = P(0.288, 0.552, -0.04);
  p[21] = P(0.694, 0.532, -0.04); p[22] = P(0.306, 0.532, -0.04);
  p[23] = P(0.565, 0.555); p[24] = P(0.435, 0.555);
  p[25] = P(0.572, 0.725); p[26] = P(0.428, 0.725);
  p[27] = P(0.578, 0.885); p[28] = P(0.422, 0.885);
  p[29] = P(0.578, 0.908); p[30] = P(0.422, 0.908);
  p[31] = P(0.600, 0.925); p[32] = P(0.400, 0.925);
  return p;
}

/** Una mano aperta di 21 punti, generata attorno al polso. */
function mano(side: "left" | "right", wx: number, wy: number): HandPoints {
  const s = side === "left" ? 1 : -1;
  const pts: { x: number; y: number; z: number }[] = [{ x: wx, y: wy, z: -0.04 }];
  const dita = [
    { base: -0.55, len: 0.052 }, // pollice
    { base: -0.15, len: 0.072 },
    { base: 0.0, len: 0.078 },
    { base: 0.16, len: 0.072 },
    { base: 0.34, len: 0.06 },
  ];
  for (const d of dita) {
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const ang = d.base;
      pts.push({
        x: wx + s * Math.sin(ang) * d.len * t * 1.2,
        y: wy + Math.cos(ang) * d.len * t,
        z: -0.04,
      });
    }
  }
  return { side, points: pts };
}

/**
 * Il volto che il modello darebbe per una testa con questa posa: nove punti costruiti su un
 * modello della testa in «unità di larghezza» e ruotati. La x e la y normalizzate hanno unità
 * diverse (larghezza e altezza dell'immagine), quindi una lunghezza della testa vale `w` in x e
 * `w · aspetto` in y; la z di MediaPipe è negativa verso la camera.
 */
function volto(turn: number, pitch: number, roll: number, jaw: number): FacePose {
  const cx = 0.5, cy = 0.115, w = 0.09, aspetto = 4 / 3;
  const yaw = (turn * Math.PI) / 180, beccheggio = (pitch * Math.PI) / 180, rollio = (roll * Math.PI) / 180;
  // Coordinate locali: x verso la sinistra della persona, y in alto, z verso la camera.
  const base = {
    rightSide: [-0.5, 0.0, -0.1], leftSide: [0.5, 0.0, -0.1],
    rightEye: [-0.36, 0.28, 0.12], leftEye: [0.36, 0.28, 0.12],
    forehead: [0, 0.6, 0.2], glabella: [0, 0.3, 0.3], nose: [0, -0.12, 0.62], mouth: [0, -0.42, 0.34], chin: [0, -0.68, 0.3],
  } as const;
  const ruota = ([x, y, z]: readonly number[]) => {
    // rollio attorno a z, poi beccheggio attorno a x, poi imbardata attorno a y
    let X = x * Math.cos(rollio) - y * Math.sin(rollio), Y = x * Math.sin(rollio) + y * Math.cos(rollio), Z = z;
    [Y, Z] = [Y * Math.cos(beccheggio) - Z * Math.sin(beccheggio), Y * Math.sin(beccheggio) + Z * Math.cos(beccheggio)];
    [X, Z] = [X * Math.cos(yaw) + Z * Math.sin(yaw), -X * Math.sin(yaw) + Z * Math.cos(yaw)];
    return { x: cx + X * w, y: cy - Y * w * aspetto, z: -Z * w };
  };
  return {
    rightSide: ruota(base.rightSide), leftSide: ruota(base.leftSide), rightEye: ruota(base.rightEye), leftEye: ruota(base.leftEye),
    forehead: ruota(base.forehead), glabella: ruota(base.glabella), nose: ruota(base.nose), mouth: ruota(base.mouth), chin: ruota(base.chin),
    jawOpen: jaw,
  };
}

const q = new URLSearchParams(location.search);
const turn = Number(q.get("turn") ?? 0);
const pitch = Number(q.get("pitch") ?? 0);
const roll = Number(q.get("roll") ?? 0);
const jaw = Number(q.get("jaw") ?? 0);
const hands = q.get("hands") !== "0";
const conVolto = q.get("face") !== "0";
scene.update(posa(turn), hands ? [mano("left", 0.705, 0.505), mano("right", 0.295, 0.505)] : [], conVolto ? volto(turn, pitch, roll, jaw) : null);
// Qualche disegno per far finire la dissolvenza in entrata.
let n = 40;
const giro = () => { scene.render(); if (--n > 0) requestAnimationFrame(giro); else document.body.dataset.pronto = "si"; };
giro();
