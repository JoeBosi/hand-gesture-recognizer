// Lesson 1 — the webcam, the 21 landmarks and the bones of the hand
let video;          // the webcam image
let handPose;       // the hand "recognizer"
let mani = [];      // the hands found arrive here (a list, like an array in C)
let ossa = [];      // the pairs of points to join with a line: [0, 1], [1, 2], ...

function setup() {
  createCanvas(640, 480);            // the window: 640 x 480 pixels
  video = createCapture(VIDEO);      // turns on the webcam
  video.size(640, 480);
  video.hide();                      // we draw it ourselves in draw()
  ml5.handPose({ maxHands: 1 }, modelloPronto); // loads the model: look for ONE hand only
}

function modelloPronto(modello) {  // when it is ready, ml5 hands it to us here
  handPose = modello;
  ossa = handPose.getConnections();          // asks the model which points must be joined
  handPose.detectStart(video, maniTrovate);  // from now on it looks for the hand continuously
}

function maniTrovate(risultati) {
  mani = risultati;                  // every time it has finished, it saves what it found
}

function draw() {
  image(video, 0, 0);                // 1) draws the webcam image

  if (mani.length > 0) {             // 2) if it found the hand...
    let mano = mani[0];              //    ...the first (and only) one in the list

    stroke(255, 255, 255);           // 3) the bones: white lines
    strokeWeight(3);                 //    3 pixels thick
    for (let i = 0; i < ossa.length; i++) {
      let a = mano.keypoints[ossa[i][0]];  // the point where the bone starts
      let b = mano.keypoints[ossa[i][1]];  // the point where it ends
      line(a.x, a.y, b.x, b.y);
    }

    noStroke();                      // 4) the points: green dots, no outline
    fill(0, 255, 0);
    for (let j = 0; j < mano.keypoints.length; j++) {  // for each of the 21 points
      let punto = mano.keypoints[j];
      circle(punto.x, punto.y, 10);  // a 10-pixel dot
    }
  }
}
