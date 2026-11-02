// Opens the built page in Chromium with a FAKE webcam (a video file) and checks the essentials.
// Usage:   npm run build && npx vite preview --port 4173 &      (or any static server on dist/)
//          node tests/fake-webcam/run.mjs http://localhost:4173/ tests/fake-webcam/hand.mjpeg
// Needs:   npm install --save-dev playwright@1.63.0 && npx playwright install chromium
import { chromium } from "playwright";

const [url = "http://localhost:4173/", video = "tests/fake-webcam/hand.mjpeg"] = process.argv.slice(2);

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream", // grants the permission without showing the pop-up
    "--use-fake-device-for-media-stream", // uses a simulated camera...
    `--use-file-for-fake-video-capture=${video}`, // ...fed by the video file
    "--enable-unsafe-swiftshader", // WebGL in software: a server has no graphics card
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().startsWith("INFO") && errors.push(m.text()));

// `?e2e` makes the page write what it sees into data-* attributes (see main.ts).
await page.goto(`${url}?e2e&delegate=cpu`);
await page.click("#start");
await page.waitForFunction(() => Number(document.body.dataset.hands) >= 1, null, { timeout: 90000 });
const seen = await page.evaluate(() => ({ ...document.body.dataset }));
console.log("state:", seen.state, "| hands:", seen.hands, "| side:", seen.sides, "| gesture:", seen.gestures);

await page.screenshot({ path: "tests/fake-webcam/result.png" });

// generous timeout: on a slow machine the page is busy recognizing and answers the click late
await page.click("#stop", { timeout: 120000 });
await page.waitForFunction(() => document.getElementById("video").srcObject === null);
console.log("after stop: video.srcObject is null, the camera is released");

console.log("errors:", errors.length === 0 ? "none" : errors);
await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
