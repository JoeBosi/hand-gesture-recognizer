/**
 * Anti-jitter filter: the "One Euro filter" (Casiez, Roussel, Vogel, CHI 2012).
 * It filters a lot when the point is almost still (no vibration) and little when it moves fast
 * (no visible lag).
 */

/** Elementary low-pass filter: `y = a*x + (1-a)*previous_y`. */
class LowPass {
  private y: number | null = null;

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  last(): number | null {
    return this.y;
  }
}

/** Converts a cutoff frequency in hertz into the low-pass coefficient, using the REAL time between frames. */
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuroFilter {
  private x = new LowPass(); // filters the value
  private dx = new LowPass(); // filters its speed
  private lastTime: number | null = null;

  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  constructor(minCutoff = 1.2, beta = 8, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timeMs: number): number {
    const prev = this.x.last();

    // Elapsed seconds. First time: assume 30 fps; the 1 ms minimum avoids a division by zero.
    const dt = this.lastTime === null ? 1 / 30 : Math.max((timeMs - this.lastTime) / 1000, 1e-3);
    this.lastTime = timeMs;

    // Estimated speed of the point (units per second), filtered too.
    const derivative = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dx.filter(derivative, alpha(this.dCutoff, dt));

    // The heart of the method: the cutoff grows with the speed.
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}

/** One independent filter per coordinate: 21 points x 3 axes = 63 filters. */
export class LandmarkSmoother {
  private filters = Array.from({ length: 21 * 3 }, () => new OneEuroFilter());

  smooth(points: { x: number; y: number; z: number }[], timeMs: number) {
    return points.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, timeMs),
      y: this.filters[i * 3 + 1].filter(p.y, timeMs),
      z: this.filters[i * 3 + 2].filter(p.z, timeMs),
    }));
  }
}
