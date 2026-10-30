// Lezione 1 — la webcam, i 21 punti e le ossa della mano
let video;          // l'immagine della webcam
let handPose;       // il "riconoscitore" di mani
let mani = [];      // qui arrivano le mani trovate (un elenco, come un array in C)
let ossa = [];      // le coppie di punti da unire con una linea: [0, 1], [1, 2], ...

function setup() {
  createCanvas(640, 480);            // la finestra: 640 x 480 pixel
  video = createCapture(VIDEO);      // accende la webcam
  video.size(640, 480);
  video.hide();                      // la disegniamo noi nel draw()
  ml5.handPose({ maxHands: 1 }, modelloPronto); // carica il modello: cerca UNA mano sola
}

function modelloPronto(modello) {  // quando è pronto, ml5 ce lo passa qui
  handPose = modello;
  ossa = handPose.getConnections();          // chiede al modello quali punti vanno uniti
  handPose.detectStart(video, maniTrovate);  // da adesso cerca la mano in continuazione
}

function maniTrovate(risultati) {
  mani = risultati;                  // ogni volta che ha finito, salva cosa ha trovato
}

function draw() {
  image(video, 0, 0);                // 1) disegna l'immagine della webcam

  if (mani.length > 0) {             // 2) se ha trovato la mano...
    let mano = mani[0];              //    ...la prima (e unica) dell'elenco

    stroke(255, 255, 255);           // 3) le ossa: linee bianche
    strokeWeight(3);                 //    spesse 3 pixel
    for (let i = 0; i < ossa.length; i++) {
      let a = mano.keypoints[ossa[i][0]];  // il punto dove comincia l'osso
      let b = mano.keypoints[ossa[i][1]];  // il punto dove finisce
      line(a.x, a.y, b.x, b.y);
    }

    noStroke();                      // 4) i punti: pallini verdi, senza bordo
    fill(0, 255, 0);
    for (let j = 0; j < mano.keypoints.length; j++) {  // per ognuno dei 21 punti
      let punto = mano.keypoints[j];
      circle(punto.x, punto.y, 10);  // un pallino di 10 pixel
    }
  }
}
