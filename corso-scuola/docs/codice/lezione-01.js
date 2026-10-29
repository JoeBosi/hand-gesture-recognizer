// Lezione 1 — la webcam e i 21 punti della mano
let video;          // l'immagine della webcam
let handPose;       // il "riconoscitore" di mani
let mani = [];      // qui arrivano le mani trovate (un elenco, come un array in C)

function setup() {
  createCanvas(640, 480);            // la finestra: 640 x 480 pixel
  video = createCapture(VIDEO);      // accende la webcam
  video.size(640, 480);
  video.hide();                      // la disegniamo noi nel draw()
  ml5.handPose(modelloPronto);       // carica il modello (ci vuole qualche secondo)
}

function modelloPronto(modello) {  // quando è pronto, ml5 ce lo passa qui
  handPose = modello;
  handPose.detectStart(video, maniTrovate); // da adesso cerca le mani in continuazione
}

function maniTrovate(risultati) {
  mani = risultati;                  // ogni volta che ha finito, salva cosa ha trovato
}

function draw() {
  image(video, 0, 0);                // 1) disegna l'immagine della webcam

  for (let i = 0; i < mani.length; i++) {          // 2) per ogni mano...
    let mano = mani[i];
    for (let j = 0; j < mano.keypoints.length; j++) {  // ...per ognuno dei suoi 21 punti
      let punto = mano.keypoints[j];
      fill(0, 255, 0);               // verde
      noStroke();
      circle(punto.x, punto.y, 10);  // un pallino di 10 pixel
    }
  }
}
