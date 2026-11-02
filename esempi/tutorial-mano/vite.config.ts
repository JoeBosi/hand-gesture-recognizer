import { defineConfig, type Plugin } from "vite";

/**
 * @mediapipe/tasks-vision 1.0.1 sends usage metrics (no images) to a Google endpoint every
 * 60 seconds and offers no switch to turn it off. This plugin empties the sending function.
 * If a library update changes the exact string, the build STOPS with a clear message instead
 * of silently shipping the telemetry again.
 */
function disableMediapipeTelemetry(): Plugin {
  const pattern = "flush(t,e){if(this.error)";
  return {
    name: "disable-mediapipe-telemetry",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@mediapipe/tasks-vision/vision_bundle")) return null;
      if (!code.includes(pattern)) {
        this.error("MediaPipe telemetry: pattern not found, check the patch");
      }
      return { code: code.replace(pattern, "flush(t,e){this.h=[];t?.();return;if(this.error)"), map: null };
    },
  };
}

export default defineConfig({
  plugins: [disableMediapipeTelemetry()],
  // Vite pre-bundles dependencies in dev mode and plugins do not run there:
  // excluding MediaPipe makes the patch work with `npm run dev` too.
  optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  build: { chunkSizeWarningLimit: 900 },
});
