// Lesson 1 — the webcam and the 21 hand landmarks
let video;          // the webcam image
let handPose;       // the hand "recognizer"
let mani = [];      // the hands found arrive here (a list, like an array in C)

function setup() {
  createCanvas(640, 480);            // the window: 640 x 480 pixels
  video = createCapture(VIDEO);      // turns on the webcam
  video.size(640, 480);
  video.hide();                      // we draw it ourselves in draw()
  ml5.handPose(modelloPronto);       // loads the model (it takes a few seconds)
}

function modelloPronto(modello) {  // when it is ready, ml5 passes it to us here
  handPose = modello;
  handPose.detectStart(video, maniTrovate); // from now on it looks for hands continuously
}

function maniTrovate(risultati) {
  mani = risultati;                  // every time it finishes, save what it found
}

function draw() {
  image(video, 0, 0);                // 1) draw the webcam image

  for (let i = 0; i < mani.length; i++) {          // 2) for each hand...
    let mano = mani[i];
    for (let j = 0; j < mano.keypoints.length; j++) {  // ...for each of its 21 points
      let punto = mano.keypoints[j];
      fill(0, 255, 0);               // green
      noStroke();
      circle(punto.x, punto.y, 10);  // a 10-pixel dot
    }
  }
}
