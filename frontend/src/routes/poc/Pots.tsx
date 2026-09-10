// frontend/src/routes/poc/Pots.tsx
import { createSignal } from "solid-js";

// Proof of concept: generates a single, randomized pottery vase and
// renders it directly as an SVG element -- no canvas, no p5, no extra
// dependency. Loosely inspired by cache/zen-pots's silhouette, but
// reimplemented from scratch: instead of hand-composed easing-curve
// segments, the radius at each height is the base radius plus a few
// randomized gaussian "bumps" (belly, neck pinch, rim flare). That's
// enough for an organic vase silhouette without much code.

interface VaseProfilePoint {
  y: number;
  r: number;
}

interface Palette {
  body: string;
  highlight: string;
  stroke: string;
}

const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 650;

// Earthy glaze palettes to pick from.
const PALETTES: Palette[] = [
  {
    body: "hsl(18 55% 55%)",
    highlight: "hsl(30 30% 85%)",
    stroke: "hsl(18 60% 25%)",
  }, // terracotta
  {
    body: "hsl(95 25% 45%)",
    highlight: "hsl(95 15% 65%)",
    stroke: "hsl(100 40% 20%)",
  }, // sage
  {
    body: "hsl(205 20% 35%)",
    highlight: "hsl(205 10% 55%)",
    stroke: "hsl(210 35% 15%)",
  }, // slate blue
  {
    body: "hsl(40 15% 85%)",
    highlight: "hsl(40 8% 92%)",
    stroke: "hsl(35 25% 45%)",
  }, // cream
];

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// A smooth bump centered on `center` (0-1), shaped like a gaussian
// curve. `width` controls how wide the bump spreads.
function gaussianBump(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

// 0 below `edge0`, 1 above `edge1`, eased in between. Used for the
// rim flare and foot taper.
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Returns points describing the vase's silhouette, from the base
// (y=0) to the rim (y=height). `r` is the horizontal radius at that
// height. Built from a few gaussian bumps (belly, neck pinch, rim
// flare) layered on the base radius -- gives an organic silhouette
// without hand-authored control points.
function generateVaseProfile(
  height: number,
  baseRadius: number,
  segments: number,
): VaseProfilePoint[] {
  const bellyCenter = random(0.32, 0.5);
  const bellyAmount = random(0.28, 0.55);
  const neckCenter = random(0.74, 0.88);
  const neckAmount = random(0.15, 0.35);
  const rimFlare = random(0.05, 0.22);

  const points: VaseProfilePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let r = baseRadius;
    r += baseRadius * bellyAmount * gaussianBump(t, bellyCenter, 0.22);
    r -= baseRadius * neckAmount * gaussianBump(t, neckCenter, 0.09);
    r += baseRadius * rimFlare * smoothstep(0.9, 1.0, t);
    r *= lerp(0.6, 1.0, smoothstep(0, 0.06, t)); // narrow foot at the base
    points.push({ y: t * height, r: Math.max(r, 6) });
  }
  return points;
}

interface Vase {
  profile: VaseProfilePoint[];
  height: number;
  palette: Palette;
}

function generateVase(): Vase {
  const height = CANVAS_HEIGHT * random(0.55, 0.7);
  const baseRadius = CANVAS_WIDTH * random(0.16, 0.24);
  return {
    profile: generateVaseProfile(height, baseRadius, 48),
    height,
    palette: pick(PALETTES),
  };
}

// Builds the SVG path "d" attribute for the vase body: right edge
// base-to-rim, then left edge rim-to-base (mirrored), closed.
function bodyPath(
  profile: VaseProfilePoint[],
  cx: number,
  baseY: number,
): string {
  const right = profile.map((p) => `${cx + p.r},${baseY - p.y}`);
  const left = [...profile].reverse().map((p) => `${cx - p.r},${baseY - p.y}`);
  return `M ${[...right, ...left].join(" L ")} Z`;
}

const cx = CANVAS_WIDTH / 2;
const baseY = CANVAS_HEIGHT * 0.85;

// Standalone proof-of-concept page: one randomly generated pottery
// vase, rendered as real SVG (downloadable). No animation -- each
// button click regenerates or exports it once.
export default function PocPots() {
  const [vase, setVase] = createSignal(generateVase());
  let svgRef: SVGSVGElement | undefined;

  // Derived accessors instead of destructuring `vase()` once, so each
  // JSX attribute below tracks the signal independently and updates
  // when regenerate() runs.
  const rim = () => vase().profile[vase().profile.length - 1];
  const foot = () => vase().profile[0];
  const bodyD = () => bodyPath(vase().profile, cx, baseY);

  const regenerate = () => setVase(generateVase());

  const downloadSvg = () => {
    if (!svgRef) return;
    const blob = new Blob([svgRef.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pot.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="flex flex-col items-center gap-4 py-8">
      <h1 class="font-serif text-2xl text-text">Pot Generator (PoC)</h1>
      <p class="max-w-md text-center text-sm text-text">
        A single, randomly generated vase rendered as SVG. No animation -- each
        button click regenerates or exports it once.
      </p>
      <div class="flex gap-2">
        <button type="button" class="btn" onClick={regenerate}>
          New pot
        </button>
        <button type="button" class="btn" onClick={downloadSvg}>
          Download SVG
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        class="border border-border bg-field"
      >
        <ellipse
          cx={cx}
          cy={baseY + 4}
          rx={foot().r * 1.2}
          ry={foot().r * 0.4}
          fill="rgba(0,0,0,0.15)"
        />
        <path
          d={bodyD()}
          fill={vase().palette.body}
          stroke={vase().palette.stroke}
          stroke-width={2}
        />
        <ellipse
          cx={cx - rim().r * 0.4}
          cy={baseY - vase().height * 0.55}
          rx={rim().r * 0.25}
          ry={vase().height * 0.35}
          fill={vase().palette.highlight}
          opacity={0.55}
        />
        <ellipse
          cx={cx}
          cy={baseY - vase().height}
          rx={rim().r}
          ry={rim().r * 0.275}
          fill={vase().palette.body}
          stroke={vase().palette.stroke}
          stroke-width={2}
        />
      </svg>
    </div>
  );
}
