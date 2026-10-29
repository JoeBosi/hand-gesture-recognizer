# The Hand on the Computer

*by Prof. Giuseppe Bosi*

**By the end of the course** every student will have written, on their own, a small game you control
with your hand in front of the webcam: no mouse, no keyboard.

All you need is the C you learned at school and a browser. Recognizing the hand (finding the 21
finger landmarks in the image) is done by a ready-made library; what is left for us is the part you
program with `if`, `for` and a little geometry.

## The lessons

Each lesson starts by telling you **what you will have on screen at the end**. If you see it at the
end of the lesson, the lesson worked.

| # | Lesson | What you get at the end | Time |
|---|---|---|---|
| 1 | [The hand landmarks](lezioni/01-punti-della-mano.md) | Your webcam on screen, with 21 green dots following your hand | 60 min |
| 2 | How many fingers? *(in preparation)* | A big number telling how many fingers you are raising, from 0 to 5 | 60–90 min |
| 3 | The gesture *(in preparation)* | A label that recognizes the gesture: 👍 thumb up, ✊ fist, ✋ open palm | 60–90 min |
| 4 | The target *(in preparation)* | A game: touch the circles that appear with your index finger, with score and time | 90 min |
| 5 | Rock, paper, scissors *(optional)* | A match against the computer, played with your hand | 90 min |

**The minimum** is lessons 1–3, about 4 hours. **The full course**, up to the game in lesson 4,
takes about 5 and a half hours.

## What you need

- A computer with a **webcam** (a USB webcam is fine too) and the **Chrome** or **Edge** browser.
- **Internet**: you work in the p5.js web editor, without installing anything.
- Knowing what a variable, an `if`, a `for` loop and an array are. We explain everything else.

## How you work

You write the code in the **p5.js web editor**: the code on the left, the result on the right.
Press ▶ and the program starts.

The tools are two libraries:

- **p5.js**: to draw on the screen (circles, text, the webcam image);
- **ml5.js**: to recognize the hand. Inside there is an artificial intelligence model by Google
  that, given an image, finds the 21 hand landmarks.

!!! note "The webcam images stay on your computer"
    Recognition happens inside the browser. The webcam image is not sent to any server; the only
    thing downloaded from the network is the model, once, at the start.

## For the teacher: test the lab before lesson 1

Five minutes on **one** lab computer save you a lost lesson:

1. Open <https://mano.giuseppebosi.com/en/onda/> and press «Turn on camera».
2. If the browser asks for permission to use the webcam, allow it.
3. Your image must appear. Put your hands in front of it: points must appear on the fingers.

| What happens | What it means |
|---|---|
| Image and points, smooth | The lab is ready |
| Image yes, but very jerky | The PCs are slow: it will work, but better to work in pairs on the best PCs |
| «No webcam found» | The PC has no webcam: you need a USB webcam |
| The webcam is blocked | The school browser or network forbids it: talk to the technician |
| The page does not open | The school network filters the site: talk to the technician |
