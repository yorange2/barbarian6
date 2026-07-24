import { Axial, key, neighbors } from './hex';

export type Terrain = 'water' | 'grass' | 'forest' | 'hills' | 'mountain';
export type Improvement = 'farm' | 'mine' | 'lumber';

export interface Tile {
  pos: Axial;
  terrain: Terrain;
  camp?: boolean;
  improvement?: Improvement;
  /** id of the city whose territory this tile belongs to. */
  cityId?: number;
}

// Display names live in i18n.ts under 'improv.<id>' keys.
// Civ-style yields: farms feed city growth, mines/lumber camps add production.
export const IMPROVEMENT_INFO: Record<
  Improvement,
  { icon: string; prod: number; food: number; terrain: Terrain }
> = {
  farm: { icon: '🌾', prod: 0, food: 2, terrain: 'grass' },
  mine: { icon: '⛏️', prod: 2, food: 0, terrain: 'hills' },
  lumber: { icon: '🪵', prod: 1, food: 1, terrain: 'forest' },
};

// Display names live in i18n.ts under 'terrain.<id>' keys.
export const TERRAIN_INFO: Record<
  Terrain,
  { color: string; moveCost: number | null }
> = {
  water: { color: '#3d6ea5', moveCost: null },
  grass: { color: '#7aa651', moveCost: 1 },
  forest: { color: '#4e7a3a', moveCost: 2 },
  hills: { color: '#a08c5a', moveCost: 2 },
  mountain: { color: '#8a8a8a', moveCost: null },
};

export const MAP_W = 24;
export const MAP_H = 16;

export type World = Map<string, Tile>;

const WEIGHTS: [Terrain, number][] = [
  ['water', 0.14],
  ['grass', 0.42],
  ['forest', 0.2],
  ['hills', 0.14],
  ['mountain', 0.1],
];

function pick(): Terrain {
  let roll = Math.random();
  for (const [t, w] of WEIGHTS) {
    roll -= w;
    if (roll <= 0) return t;
  }
  return 'grass';
}

export function generateMap(): World {
  const world: World = new Map();
  for (let r = 0; r < MAP_H; r++) {
    const q0 = -Math.floor(r / 2);
    for (let q = q0; q < q0 + MAP_W; q++) {
      world.set(key({ q, r }), { pos: { q, r }, terrain: pick() });
    }
  }
  // Smoothing: tiles adopt the dominant terrain around them, forming clumps.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map<string, Terrain>();
    for (const tile of world.values()) {
      const counts = new Map<Terrain, number>([[tile.terrain, 1]]);
      for (const n of neighbors(tile.pos)) {
        const t = world.get(key(n));
        if (t) counts.set(t.terrain, (counts.get(t.terrain) ?? 0) + 1);
      }
      let best = tile.terrain;
      let bestN = 0;
      for (const [t, c] of counts) {
        if (c > bestN) {
          best = t;
          bestN = c;
        }
      }
      next.set(key(tile.pos), bestN >= 4 ? best : tile.terrain);
    }
    for (const [k, t] of next) world.get(k)!.terrain = t;
  }
  return world;
}
