import { Axial, key, neighbors } from './hex';

// Civ-style two-layer tiles: terrain is the land itself (exactly one per
// tile, hills as an attribute), features sit on top (at most one per tile).
export type Terrain = 'water' | 'grassland' | 'plains' | 'desert' | 'tundra' | 'mountain';
export type Feature = 'woods' | 'rainforest' | 'marsh' | 'oasis';
export type Improvement = 'farm' | 'mine' | 'lumber';

export interface Tile {
  pos: Axial;
  terrain: Terrain;
  hills: boolean;
  feature?: Feature;
  camp?: boolean;
  improvement?: Improvement;
  /** id of the city whose territory this tile belongs to. */
  cityId?: number;
}

export interface Yields {
  food: number;
  prod: number;
}

// Display names live in i18n.ts under 'terrain.<id>' keys.
export const TERRAIN_INFO: Record<
  Terrain,
  { color: string; passable: boolean; food: number; prod: number }
> = {
  water: { color: '#3d6ea5', passable: false, food: 0, prod: 0 },
  grassland: { color: '#7aa651', passable: true, food: 2, prod: 0 },
  plains: { color: '#b5a95e', passable: true, food: 1, prod: 1 },
  desert: { color: '#d9c47f', passable: true, food: 0, prod: 0 },
  tundra: { color: '#9fae9b', passable: true, food: 1, prod: 0 },
  mountain: { color: '#8a8a8a', passable: false, food: 0, prod: 0 },
};

// Display names live in i18n.ts under 'feature.<id>' keys.
export const FEATURE_INFO: Record<
  Feature,
  {
    icon: string;
    food: number;
    prod: number;
    moveExtra: number;
    defense: number;
    removal: 'chop' | 'drain' | null;
  }
> = {
  woods: { icon: '🌲', food: 0, prod: 1, moveExtra: 1, defense: 3, removal: 'chop' },
  rainforest: { icon: '🌴', food: 1, prod: 0, moveExtra: 1, defense: 3, removal: 'chop' },
  marsh: { icon: '🌿', food: 1, prod: 0, moveExtra: 1, defense: -2, removal: 'drain' },
  oasis: { icon: '🏝️', food: 3, prod: 0, moveExtra: 0, defense: 0, removal: null },
};

// Display names live in i18n.ts under 'improv.<id>' keys.
export const IMPROVEMENT_INFO: Record<Improvement, { icon: string; food: number; prod: number }> = {
  farm: { icon: '🌾', food: 1, prod: 0 },
  mine: { icon: '⛏️', food: 0, prod: 1 },
  lumber: { icon: '🪵', food: 0, prod: 1 },
};

const HILLS_PROD = 1;
const HILLS_MOVE = 1;
const HILLS_DEFENSE = 3;

/** Total tile yields: terrain + hills + feature + improvement. */
export function tileYields(tile: Tile): Yields {
  const t = TERRAIN_INFO[tile.terrain];
  let food = t.food;
  let prod = t.prod;
  if (tile.hills) prod += HILLS_PROD;
  if (tile.feature) {
    food += FEATURE_INFO[tile.feature].food;
    prod += FEATURE_INFO[tile.feature].prod;
  }
  if (tile.improvement) {
    food += IMPROVEMENT_INFO[tile.improvement].food;
    prod += IMPROVEMENT_INFO[tile.improvement].prod;
  }
  return { food, prod };
}

/** Movement cost to enter (1 + hills + feature), or null if impassable. */
export function tileMoveCost(tile: Tile): number | null {
  if (!TERRAIN_INFO[tile.terrain].passable) return null;
  let cost = 1;
  if (tile.hills) cost += HILLS_MOVE;
  if (tile.feature) cost += FEATURE_INFO[tile.feature].moveExtra;
  return cost;
}

/** Combat strength bonus for a defender standing on this tile. */
export function tileDefense(tile: Tile): number {
  let d = tile.hills ? HILLS_DEFENSE : 0;
  if (tile.feature) d += FEATURE_INFO[tile.feature].defense;
  return d;
}

export const MAP_W = 24;
export const MAP_H = 16;

export type World = Map<string, Tile>;

function pick<T extends string>(weights: [T, number][]): T {
  let roll = Math.random();
  for (const [t, w] of weights) {
    roll -= w;
    if (roll <= 0) return t;
  }
  return weights[weights.length - 1][0];
}

type Landform = 'water' | 'mountain' | 'hills' | 'flat';

export function generateMap(): World {
  // Pass 1: landforms (smoothed into clumps).
  const landforms = new Map<string, Landform>();
  for (let r = 0; r < MAP_H; r++) {
    const q0 = -Math.floor(r / 2);
    for (let q = q0; q < q0 + MAP_W; q++) {
      landforms.set(
        key({ q, r }),
        pick([
          ['water', 0.13],
          ['mountain', 0.08],
          ['hills', 0.18],
          ['flat', 0.61],
        ]),
      );
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map<string, Landform>();
    for (const [k, lf] of landforms) {
      const [q, r] = k.split(',').map(Number);
      const counts = new Map<Landform, number>([[lf, 1]]);
      for (const n of neighbors({ q, r })) {
        const l = landforms.get(key(n));
        if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      let best = lf;
      let bestN = 0;
      for (const [l, c] of counts) {
        if (c > bestN) {
          best = l;
          bestN = c;
        }
      }
      next.set(k, bestN >= 4 ? best : lf);
    }
    for (const [k, l] of next) landforms.set(k, l);
  }

  // Pass 2: biome by latitude band, then features.
  const world: World = new Map();
  for (const [k, lf] of landforms) {
    const [q, r] = k.split(',').map(Number);
    const polar = r <= 1 || r >= MAP_H - 2;
    const hot = Math.abs(r - MAP_H / 2) <= 1.5;

    let terrain: Terrain;
    let hills = false;
    if (lf === 'water') terrain = 'water';
    else if (lf === 'mountain') terrain = 'mountain';
    else {
      hills = lf === 'hills';
      if (polar) {
        terrain = pick([
          ['tundra', 0.65],
          ['plains', 0.35],
        ]);
      } else if (hot) {
        terrain = pick([
          ['desert', 0.3],
          ['plains', 0.4],
          ['grassland', 0.3],
        ]);
      } else {
        terrain = pick([
          ['grassland', 0.5],
          ['plains', 0.4],
          ['tundra', 0.1],
        ]);
      }
    }

    let feature: Feature | undefined;
    const roll = Math.random();
    if (terrain === 'plains' && hot && roll < 0.35) feature = 'rainforest';
    else if (
      (terrain === 'grassland' || terrain === 'plains' || terrain === 'tundra') &&
      roll < 0.25
    ) {
      feature = 'woods';
    } else if (terrain === 'grassland' && !hills && roll < 0.32) feature = 'marsh';
    else if (terrain === 'desert' && !hills && roll < 0.08) feature = 'oasis';

    world.set(k, { pos: { q, r }, terrain, hills, feature });
  }
  return world;
}
