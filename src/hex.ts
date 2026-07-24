// Axial coordinates for pointy-top hexes.
// Reference: https://www.redblobgames.com/grids/hexagons/

export interface Axial {
  q: number;
  r: number;
}

export const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const key = (h: Axial) => `${h.q},${h.r}`;

export const fromKey = (k: string): Axial => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export function neighbors(h: Axial): Axial[] {
  return DIRS.map(d => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function distance(a: Axial, b: Axial): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.r - b.r) +
      Math.abs(a.q + a.r - b.q - b.r)) / 2
  );
}

export function axialToPixel(h: Axial, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    y: size * 1.5 * h.r,
  };
}

export function pixelToAxial(x: number, y: number, size: number): Axial {
  const qf = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  return axialRound(qf, rf);
}

function axialRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts;
}
