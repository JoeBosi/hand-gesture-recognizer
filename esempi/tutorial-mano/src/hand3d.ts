import * as THREE from "three";
import { HAND_CONNECTIONS } from "./tracker";

/** A point in space. Valid both for normalized points and for scene points. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Wrist (0), thumb base (1) and the four knuckles (5, 9, 13, 17). */
const PALM = [0, 1, 5, 9, 13, 17];
/** Fingertips: thumb 4, index 8, middle 12, ring 16, little 20. */
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
/** The depth from MediaPipe is small compared with the other two axes: amplify it a little. */
const DEPTH_GAIN = 1.6;
/** One color per side, so two hands stay distinguishable. */
const COLORS = { Right: 0x38bdf8, Left: 0xf472b6 } as const;
export type Side = keyof typeof COLORS;

/** One hand: 21 spheres, one cylinder per connection, and the palm. */
class StylizedHand {
  readonly group = new THREE.Group();
  private readonly joints: THREE.Mesh[] = [];
  private readonly bones: THREE.Mesh[] = [];
  private readonly palm: THREE.Mesh;
  private readonly solid: THREE.MeshStandardMaterial;
  private readonly tips: THREE.MeshStandardMaterial;
  private readonly palmMaterial: THREE.MeshStandardMaterial;
  private opacity = 0;
  private targetOpacity = 0;
  /** Work positions reused at every frame, so 21 vectors are not allocated each time. */
  private readonly world = Array.from({ length: 21 }, () => new THREE.Vector3());

  constructor(color: number, jointGeo: THREE.BufferGeometry, boneGeo: THREE.BufferGeometry) {
    this.solid = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, transparent: true });
    this.tips = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      transparent: true,
    });
    this.palmMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < 21; i++) {
      const joint = new THREE.Mesh(jointGeo, FINGERTIPS.has(i) ? this.tips : this.solid);
      this.joints.push(joint);
      this.group.add(joint);
    }
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const bone = new THREE.Mesh(boneGeo, this.solid);
      this.bones.push(bone);
      this.group.add(bone);
    }

    // The palm is a hand-built geometry: six vertices that move at every frame.
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PALM.length * 3), 3));
    palmGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
    this.palm = new THREE.Mesh(palmGeo, this.palmMaterial);
    this.palm.frustumCulled = false;
    this.group.add(this.palm);

    this.group.visible = false;
  }

  update(points: Point3[]): void {
    this.targetOpacity = 1;
    for (let i = 0; i < 21; i++) this.world[i].set(points[i].x, points[i].y, points[i].z);

    // Thickness proportional to the hand (wrist to middle knuckle distance).
    const size = this.world[0].distanceTo(this.world[9]);
    const jointR = size * 0.075;
    const boneR = size * 0.05;

    this.joints.forEach((j, i) => {
      j.position.copy(this.world[i]);
      j.scale.setScalar(FINGERTIPS.has(i) ? jointR * 1.15 : i === 0 ? jointR * 1.4 : jointR);
    });

    // Every bone is a cylinder 1 high and 1 wide that must be taken from A to B.
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    HAND_CONNECTIONS.forEach(({ start, end }, i) => {
      const a = this.world[start];
      const b = this.world[end];
      const bone = this.bones[i];
      dir.subVectors(b, a);
      const len = dir.length();
      bone.position.addVectors(a, b).multiplyScalar(0.5);
      if (len > 1e-6) bone.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
      bone.scale.set(boneR, len, boneR);
    });

    const pos = this.palm.geometry.getAttribute("position") as THREE.BufferAttribute;
    PALM.forEach((idx, k) => pos.setXYZ(k, this.world[idx].x, this.world[idx].y, this.world[idx].z));
    pos.needsUpdate = true;
    this.palm.geometry.computeVertexNormals();
  }

  hide(): void {
    this.targetOpacity = 0;
  }

  /** One fade step, about a tenth of a second at any frame rate. */
  tick(dt: number): void {
    this.opacity += (this.targetOpacity - this.opacity) * Math.min(1, dt * 12);
    if (this.opacity < 0.01 && this.targetOpacity === 0) this.opacity = 0;

    this.group.visible = this.opacity > 0;
    this.solid.opacity = this.opacity;
    this.tips.opacity = this.opacity;
    this.palmMaterial.opacity = this.opacity * 0.35;
  }
}

/** The 3D scene: renderer, camera, lights, window fitting, coordinate conversion and the two hands. */
export class HandScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private readonly canvas: HTMLCanvasElement;
  private readonly hands: Record<Side, StylizedHand>;

  private frameAspect = 4 / 3; // proportions of the webcam video
  private frameHeight = 1; // height, in the 3D world, of the area that represents the video
  private lastTick = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // `alpha: true`: the background comes from the CSS, the canvas stays transparent.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Camera FIXED in front of the origin: the hand moves, not the view.
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x818cf8, 1.2);
    rim.position.set(-4, -2, -6);
    this.scene.add(rim);

    // Two geometries for the WHOLE scene: a sphere of radius 1 and a cylinder 1 high.
    const jointGeo = new THREE.SphereGeometry(1, 20, 14);
    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.hands = {
      Right: new StylizedHand(COLORS.Right, jointGeo, boneGeo),
      Left: new StylizedHand(COLORS.Left, jointGeo, boneGeo),
    };
    this.scene.add(this.hands.Right.group, this.hands.Left.group);

    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  setFrameAspect(aspect: number): void {
    this.frameAspect = aspect;
    this.resize();
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const visibleH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fit = this.camera.aspect > this.frameAspect ? visibleH : (visibleH * this.camera.aspect) / this.frameAspect;
    const zoom = Math.min(1.4, Math.max(1, this.frameAspect / this.camera.aspect));
    this.frameHeight = fit * 0.92 * zoom;
  }

  /** From MediaPipe coordinates (0 to 1) to scene coordinates: centered, mirrored, y upside down. */
  toWorld(p: Point3): Point3 {
    const width = this.frameAspect * this.frameHeight;
    return {
      x: (0.5 - p.x) * width,
      y: (0.5 - p.y) * this.frameHeight,
      z: -p.z * width * DEPTH_GAIN,
    };
  }

  /** Moves one hand, or fades it out if `points` is null. */
  update(side: Side, points: Point3[] | null): void {
    if (points) this.hands[side].update(points.map((p) => this.toWorld(p)));
    else this.hands[side].hide();
  }

  render(): void {
    const now = performance.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.hands.Right.tick(dt);
    this.hands.Left.tick(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
