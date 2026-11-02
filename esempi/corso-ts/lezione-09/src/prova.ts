// src/prova.ts — la prova dell'esercizio 9.1: per usarla, scrivi in main.ts  import "./prova";
import { MediaMobile } from "./filtro";

const m = new MediaMobile(3);
m.aggiungi(10);
console.log(m.valore());   // 10
m.aggiungi(20);
console.log(m.valore());   // 15
m.aggiungi(30);
m.aggiungi(60);            // il 10 esce dalla finestra
console.log(m.valore());   // 36.66…
