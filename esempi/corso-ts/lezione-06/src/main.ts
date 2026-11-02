import "./style.css";
import { disegnaOssa, disegnaPunti, type Punto } from "./disegna";
import { MANO_FINTA, aPixel } from "./punti";

const tela = document.getElementById("tela") as HTMLCanvasElement;
const ctx = tela.getContext("2d") as CanvasRenderingContext2D;

const punti: Punto[] = MANO_FINTA.map((p) => aPixel(p, tela.width, tela.height));
ctx.clearRect(0, 0, tela.width, tela.height);
disegnaOssa(ctx, punti);
disegnaPunti(ctx, punti);
