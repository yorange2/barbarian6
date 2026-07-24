import { Axial, key, fromKey, neighbors, distance } from './hex';
import {
  World,
  Tile,
  Improvement,
  tileYields,
  tileMoveCost,
  tileDefense,
  generateMap,
  MAP_W,
  MAP_H,
} from './map';

export type Owner = 'player' | 'ai' | 'barbarian';
/** Owners that have cities, techs, and an economy. */
export type CivOwner = 'player' | 'ai';

export type UnitKind =
  | 'warrior'
  | 'spearman'
  | 'archer'
  | 'horseman'
  | 'scout'
  | 'settler'
  | 'builder'
  | 'barbarian';
export type ProducibleKind = Exclude<UnitKind, 'barbarian'>;

interface Template {
  nameKey: string;
  icon: string;
  hp: number;
  strength: number;
  mp: number;
  /** Ranged units: attack distance and the strength used for ranged strikes. */
  range?: number;
  rangedStrength?: number;
}

const TEMPLATES: Record<UnitKind, Template> = {
  warrior: { nameKey: 'unit.warrior', icon: '⚔️', hp: 20, strength: 8, mp: 2 },
  spearman: { nameKey: 'unit.spearman', icon: '🛡️', hp: 25, strength: 11, mp: 2 },
  archer: { nameKey: 'unit.archer', icon: '🏹', hp: 15, strength: 5, mp: 2, range: 2, rangedStrength: 8 },
  horseman: { nameKey: 'unit.horseman', icon: '🏇', hp: 22, strength: 12, mp: 4 },
  scout: { nameKey: 'unit.scout', icon: '🐎', hp: 14, strength: 5, mp: 3 },
  settler: { nameKey: 'unit.settler', icon: '🚩', hp: 10, strength: 0, mp: 2 },
  builder: { nameKey: 'unit.builder', icon: '🔨', hp: 10, strength: 0, mp: 2 },
  barbarian: { nameKey: 'unit.barbarian', icon: '🪓', hp: 16, strength: 6, mp: 2 },
};

export const PRODUCIBLE: ProducibleKind[] = [
  'warrior',
  'spearman',
  'archer',
  'horseman',
  'scout',
  'builder',
  'settler',
];
export const PRODUCTION_COST: Record<ProducibleKind, number> = {
  warrior: 12,
  spearman: 16,
  archer: 14,
  horseman: 20,
  scout: 10,
  builder: 10,
  settler: 16,
};

// --- tech tree ---

export type TechId = 'mining' | 'archery' | 'bronze' | 'wheel' | 'masonry';

export const TECHS: Record<TechId, { cost: number; requires?: TechId }> = {
  mining: { cost: 10 },
  archery: { cost: 12 },
  bronze: { cost: 18, requires: 'mining' },
  wheel: { cost: 22, requires: 'mining' },
  masonry: { cost: 20, requires: 'mining' },
};

export const UNIT_REQUIREMENTS: Partial<Record<ProducibleKind, TechId>> = {
  spearman: 'bronze',
  archer: 'archery',
  horseman: 'wheel',
};

export interface Unit {
  id: number;
  kind: UnitKind;
  nameKey: string;
  icon: string;
  owner: Owner;
  pos: Axial;
  hp: number;
  maxHp: number;
  strength: number;
  mp: number;
  maxMp: number;
  range?: number;
  rangedStrength?: number;
  /** Remaining build actions (builders only). */
  charges?: number;
  /** Asleep across turns until woken (by orders, attack, or adjacent enemy). */
  sleeping?: boolean;
  /** Standing down for this turn only; cleared at turn end. */
  skipped?: boolean;
}

export interface City {
  id: number;
  owner: CivOwner;
  pos: Axial;
  hp: number;
  maxHp: number;
  strength: number;
  pop: number;
  food: number;
  producing: ProducibleKind | null;
  progress: number;
}

interface CivState {
  techs: Set<TechId>;
  researching: TechId | null;
  progress: Partial<Record<TechId, number>>;
}

function newCiv(): CivState {
  return { techs: new Set(), researching: null, progress: {} };
}

/** Logs store i18n keys + params, not text, so language switches re-render history. */
export interface LogEntry {
  key: string;
  params?: Record<string, string | number>;
}

const MAX_BARBARIANS = 8;
const SPAWN_EVERY = 6;
const AGGRO_RANGE = 8;
const BUILDER_CHARGES = 3;
const MIN_CITY_SPACING = 3;
const CITY_BASE_PROD = 1;
const CITY_BASE_FOOD = 1;
const FOOD_PER_POP = 2;
/** One-time yields granted to the owning city when a feature is chopped. */
const CHOP_YIELDS: Record<'woods' | 'rainforest', { prod: number; food: number }> = {
  woods: { prod: 20, food: 0 },
  rainforest: { prod: 10, food: 10 },
};
const CITY_HP = 20;
const CITY_STRENGTH = 6;
const CITY_REGEN = 2;
const WALL_HP = 10;
const WALL_STRENGTH = 3;
const HEAL_PER_TURN = 4;
const BASE_SCIENCE = 2;

export class Game {
  world: World;
  units: Unit[] = [];
  cities: City[] = [];
  turn = 1;
  log: LogEntry[] = [];
  over: 'victory' | 'defeat' | null = null;
  private civs: Record<CivOwner, CivState> = { player: newCiv(), ai: newCiv() };
  private nextId = 1;

  /** Player-facing views kept for the UI. */
  get techs(): Set<TechId> {
    return this.civs.player.techs;
  }
  get researching(): TechId | null {
    return this.civs.player.researching;
  }

  constructor() {
    this.world = generateMap();
    this.setup();
  }

  private setup() {
    const midR = Math.floor(MAP_H / 2);
    const leftQ = -Math.floor(midR / 2) + 3;
    this.spawnNear('warrior', 'player', { q: leftQ, r: midR });
    this.spawnNear('warrior', 'player', { q: leftQ + 1, r: midR });
    this.spawnNear('scout', 'player', { q: leftQ, r: midR - 1 });
    this.spawnNear('settler', 'player', { q: leftQ, r: midR + 1 });
    this.spawnNear('builder', 'player', { q: leftQ + 1, r: midR - 1 });

    // Rival empire starts mirrored on the east side.
    const aiQ = -Math.floor(midR / 2) + MAP_W - 4;
    this.spawnNear('warrior', 'ai', { q: aiQ, r: midR });
    this.spawnNear('warrior', 'ai', { q: aiQ - 1, r: midR });
    this.spawnNear('settler', 'ai', { q: aiQ, r: midR - 1 });
    this.spawnNear('builder', 'ai', { q: aiQ - 1, r: midR + 1 });

    // Barbarian camps sit between the two empires, north and south.
    for (const r of [2, MAP_H - 3]) {
      const q = -Math.floor(r / 2) + Math.floor(MAP_W / 2);
      const campPos = this.nearestFree({ q, r });
      if (campPos) {
        this.world.get(key(campPos))!.camp = true;
        this.spawnNear('barbarian', 'barbarian', campPos);
      }
    }
    this.log.push({ key: 'log.intro' });
  }

  private spawnNear(kind: UnitKind, owner: Owner, near: Axial) {
    const pos = this.nearestFree(near);
    if (!pos) return;
    const t = TEMPLATES[kind];
    this.units.push({
      id: this.nextId++,
      kind,
      nameKey: t.nameKey,
      icon: t.icon,
      owner,
      pos,
      hp: t.hp,
      maxHp: t.hp,
      strength: t.strength,
      mp: t.mp,
      maxMp: t.mp,
      range: t.range,
      rangedStrength: t.rangedStrength,
      charges: kind === 'builder' ? BUILDER_CHARGES : undefined,
    });
  }

  private nearestFree(from: Axial): Axial | null {
    const seen = new Set([key(from)]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      const tile = this.world.get(key(cur));
      if (tile && this.passable(tile) && !this.unitAt(cur) && !this.cityAt(cur)) {
        return cur;
      }
      for (const n of neighbors(cur)) {
        const k = key(n);
        if (!seen.has(k) && this.world.has(k)) {
          seen.add(k);
          queue.push(n);
        }
      }
    }
    return null;
  }

  passable(tile: Tile): boolean {
    return tileMoveCost(tile) !== null;
  }

  unitAt(pos: Axial): Unit | null {
    return this.units.find(u => u.pos.q === pos.q && u.pos.r === pos.r) ?? null;
  }

  cityAt(pos: Axial): City | null {
    return this.cities.find(c => c.pos.q === pos.q && c.pos.r === pos.r) ?? null;
  }

  /** Tiles the unit can reach this turn (Dijkstra over movement costs). */
  reachable(unit: Unit): Map<string, number> {
    const dist = new Map<string, number>([[key(unit.pos), 0]]);
    const frontier: [Axial, number][] = [[unit.pos, 0]];
    while (frontier.length) {
      frontier.sort((a, b) => b[1] - a[1]);
      const [cur, cost] = frontier.pop()!;
      if (cost > (dist.get(key(cur)) ?? Infinity)) continue;
      for (const n of neighbors(cur)) {
        const tile = this.world.get(key(n));
        if (!tile || !this.passable(tile) || this.unitAt(n) || this.cityAt(n)) continue;
        const c = cost + tileMoveCost(tile)!;
        if (c <= unit.mp && c < (dist.get(key(n)) ?? Infinity)) {
          dist.set(key(n), c);
          frontier.push([n, c]);
        }
      }
    }
    dist.delete(key(unit.pos));
    return dist;
  }

  attackTargets(unit: Unit): Unit[] {
    if (unit.mp <= 0 || unit.strength <= 0) return [];
    const range = unit.range ?? 1;
    return this.units.filter(u => {
      if (u.owner === unit.owner) return false;
      const d = distance(u.pos, unit.pos);
      return d >= 1 && d <= range;
    });
  }

  move(unit: Unit, dest: Axial, cost: number) {
    unit.sleeping = false;
    unit.pos = dest;
    unit.mp = Math.max(0, unit.mp - cost);
    const tile = this.world.get(key(dest))!;
    if (tile.camp && unit.owner !== 'barbarian') {
      tile.camp = false;
      this.log.push({ key: 'log.razed', params: { unit: unit.nameKey } });
      this.checkEnd();
    }
  }

  attack(att: Unit, def: Unit) {
    att.mp = 0;
    att.sleeping = false;
    def.sleeping = false;
    const isRanged = att.rangedStrength !== undefined;
    // Civilians (strength 0) are defenseless: they die without a fight.
    if (def.strength <= 0) {
      this.log.push({ key: 'log.dies', params: { unit: def.nameKey } });
      this.units = this.units.filter(u => u !== def);
      if (!isRanged) this.move(att, def.pos, 0);
      this.checkEnd();
      return;
    }
    // Defenders benefit from their tile: hills and woods +3, marsh -2, etc.
    const attStr = att.rangedStrength ?? att.strength;
    const defTerrain = tileDefense(this.world.get(key(def.pos))!);
    const dmg = this.rollDamage(attStr, att.hp / att.maxHp, def.strength + defTerrain);
    def.hp -= dmg;
    this.log.push({
      key: 'log.hit',
      params: { att: att.nameKey, def: def.nameKey, dmg },
    });
    if (def.hp <= 0) {
      this.log.push({ key: 'log.dies', params: { unit: def.nameKey } });
      this.units = this.units.filter(u => u !== def);
      if (!isRanged) this.move(att, def.pos, 0);
    } else if (!isRanged) {
      const attTerrain = tileDefense(this.world.get(key(att.pos))!);
      const back = this.rollDamage(
        def.strength,
        def.hp / def.maxHp,
        att.strength + attTerrain,
      );
      att.hp -= back;
      this.log.push({
        key: 'log.retaliate',
        params: { def: def.nameKey, dmg: back },
      });
      if (att.hp <= 0) {
        this.log.push({ key: 'log.dies', params: { unit: att.nameKey } });
        this.units = this.units.filter(u => u !== att);
      }
    }
    this.checkEnd();
  }

  attackCity(att: Unit, city: City) {
    att.mp = 0;
    att.sleeping = false;
    const isRanged = att.rangedStrength !== undefined;
    const attStr = att.rangedStrength ?? att.strength;
    const dmg = this.rollDamage(attStr, att.hp / att.maxHp, city.strength);
    this.log.push({ key: 'log.hit', params: { att: att.nameKey, def: 'city', dmg } });
    // Only melee can take a city; ranged strikes leave it at 1 HP (Civ rule).
    if (isRanged) {
      city.hp = Math.max(1, city.hp - dmg);
      this.checkEnd();
      return;
    }
    city.hp -= dmg;
    if (city.hp <= 0) {
      if (att.owner === 'barbarian') {
        this.cities = this.cities.filter(c => c !== city);
        for (const tile of this.world.values()) {
          if (tile.cityId === city.id) tile.cityId = undefined;
        }
        this.log.push({ key: 'log.cityRazed' });
      } else {
        city.owner = att.owner as CivOwner;
        city.hp = Math.ceil(city.maxHp / 2);
        city.producing = null;
        this.log.push({ key: 'log.cityCaptured', params: { owner: `owner.${att.owner}` } });
      }
    } else {
      const back = this.rollDamage(city.strength, city.hp / city.maxHp, att.strength);
      att.hp -= back;
      this.log.push({ key: 'log.retaliate', params: { def: 'city', dmg: back } });
      if (att.hp <= 0) {
        this.log.push({ key: 'log.dies', params: { unit: att.nameKey } });
        this.units = this.units.filter(u => u !== att);
      }
    }
    this.checkEnd();
  }

  private rollDamage(attStr: number, healthFrac: number, defStr: number): number {
    const ratio = attStr / defStr;
    const health = 0.5 + 0.5 * healthFrac;
    return Math.max(1, Math.round(5 * ratio * health * (0.85 + Math.random() * 0.3)));
  }

  // --- settler: found cities ---

  canFound(unit: Unit): boolean {
    return (
      unit.kind === 'settler' &&
      this.cities.every(c => distance(c.pos, unit.pos) >= MIN_CITY_SPACING)
    );
  }

  foundCity(unit: Unit): boolean {
    if (!this.canFound(unit)) return false;
    const owner = unit.owner as CivOwner;
    const walls = this.civs[owner].techs.has('masonry');
    const hp = CITY_HP + (walls ? WALL_HP : 0);
    const city: City = {
      id: this.nextId++,
      owner,
      pos: unit.pos,
      hp,
      maxHp: hp,
      strength: CITY_STRENGTH + (walls ? WALL_STRENGTH : 0),
      pop: 1,
      food: 0,
      producing: null,
      progress: 0,
    };
    this.cities.push(city);
    this.claimTerritory(city, this.radiusForPop(city.pop));
    this.units = this.units.filter(u => u !== unit);
    this.log.push({ key: 'log.cityFounded', params: { owner: `owner.${owner}` } });
    return true;
  }

  /** Borders start at 1 hex and expand with population (pop 3 → 2, pop 5 → 3). */
  private radiusForPop(pop: number): number {
    return pop >= 5 ? 3 : pop >= 3 ? 2 : 1;
  }

  /** Claim unowned tiles within radius; claimed tiles never change hands. */
  private claimTerritory(city: City, radius: number) {
    for (const tile of this.world.values()) {
      if (tile.cityId === undefined && distance(tile.pos, city.pos) <= radius) {
        tile.cityId = city.id;
      }
    }
  }

  // --- builder: improve tiles ---

  improvementFor(pos: Axial, owner: CivOwner = 'player'): Improvement | null {
    const tile = this.world.get(key(pos));
    if (!tile || tile.improvement || !this.passable(tile)) return null;
    // Lumber camps go on woods; other features must be cleared first.
    if (tile.feature === 'woods') return 'lumber';
    if (tile.feature) return null;
    if (tile.hills) return this.civs[owner].techs.has('mining') ? 'mine' : null;
    if (tile.terrain === 'grassland' || tile.terrain === 'plains') return 'farm';
    return null;
  }

  /** How the feature on this tile can be removed by a builder, if at all. */
  removalFor(pos: Axial): 'chop' | 'drain' | null {
    const tile = this.world.get(key(pos));
    if (!tile?.feature || tile.improvement) return null;
    return tile.feature === 'woods' || tile.feature === 'rainforest'
      ? 'chop'
      : tile.feature === 'marsh'
        ? 'drain'
        : null;
  }

  chop(unit: Unit): boolean {
    if (unit.kind !== 'builder' || !unit.charges) return false;
    const removal = this.removalFor(unit.pos);
    if (!removal || !this.canBuildAt(unit.pos, unit.owner as CivOwner)) return false;
    const tile = this.world.get(key(unit.pos))!;
    const feature = tile.feature!;
    tile.feature = undefined;
    unit.charges--;
    unit.mp = 0;
    if (removal === 'chop') {
      const y = CHOP_YIELDS[feature as 'woods' | 'rainforest'];
      const city = this.cities.find(c => c.id === tile.cityId);
      if (city) {
        city.progress += y.prod;
        city.food += y.food;
      }
      this.log.push({
        key: 'log.chop',
        params: { unit: unit.nameKey, feature: `feature.${feature}`, prod: y.prod, food: y.food },
      });
    } else {
      this.log.push({ key: 'log.drain', params: { unit: unit.nameKey } });
    }
    if (unit.charges <= 0) this.units = this.units.filter(u => u !== unit);
    return true;
  }

  /** Improvements may only be built inside the owner's own territory. */
  canBuildAt(pos: Axial, owner: CivOwner = 'player'): boolean {
    const id = this.world.get(key(pos))?.cityId;
    if (id === undefined) return false;
    return this.cities.find(c => c.id === id)?.owner === owner;
  }

  build(unit: Unit): boolean {
    if (unit.kind !== 'builder' || !unit.charges) return false;
    const owner = unit.owner as CivOwner;
    const improv = this.improvementFor(unit.pos, owner);
    if (!improv || !this.canBuildAt(unit.pos, owner)) return false;
    this.world.get(key(unit.pos))!.improvement = improv;
    unit.charges--;
    unit.mp = 0;
    this.log.push({
      key: 'log.built',
      params: { unit: unit.nameKey, improv: `improv.${improv}` },
    });
    if (unit.charges <= 0) this.units = this.units.filter(u => u !== unit);
    return true;
  }

  // --- cities: growth and production ---

  canProduce(kind: ProducibleKind, owner: CivOwner = 'player'): boolean {
    const req = UNIT_REQUIREMENTS[kind];
    return !req || this.civs[owner].techs.has(req);
  }

  setProduction(city: City, kind: ProducibleKind) {
    if (this.canProduce(kind, city.owner)) city.producing = kind;
  }

  /**
   * City output: base + every tile in the territory (terrain + hills +
   * feature + improvement). Food is net of consumption (2 per pop), so it
   * can be negative when the city outgrows its land.
   */
  cityYields(city: City): { prod: number; food: number } {
    let prod = CITY_BASE_PROD;
    let food = CITY_BASE_FOOD;
    for (const tile of this.world.values()) {
      if (tile.cityId !== city.id) continue;
      const y = tileYields(tile);
      prod += y.prod;
      food += y.food;
    }
    return { prod, food: food - FOOD_PER_POP * city.pop };
  }

  growthNeed(city: City): number {
    return 8 + 4 * city.pop;
  }

  // --- research ---

  scienceYield(owner: CivOwner = 'player'): number {
    let s = BASE_SCIENCE;
    for (const c of this.cities) {
      if (c.owner === owner) s += 1 + c.pop;
    }
    return s;
  }

  availableTechs(owner: CivOwner = 'player'): TechId[] {
    const techs = this.civs[owner].techs;
    return (Object.keys(TECHS) as TechId[]).filter(id => {
      if (techs.has(id)) return false;
      const req = TECHS[id].requires;
      return !req || techs.has(req);
    });
  }

  setResearch(id: TechId) {
    if (this.availableTechs('player').includes(id)) this.civs.player.researching = id;
  }

  techTurns(id: TechId): number {
    const remaining = TECHS[id].cost - (this.civs.player.progress[id] ?? 0);
    return Math.max(1, Math.ceil(remaining / this.scienceYield('player')));
  }

  // --- turn cycle ---

  endTurn() {
    if (this.over) return;
    this.barbarianTurn();
    this.aiTurn();
    this.turn++;
    if (this.turn % SPAWN_EVERY === 0) this.spawnFromCamps();

    for (const city of this.cities) {
      city.hp = Math.min(city.maxHp, city.hp + CITY_REGEN);
      const { prod, food } = this.cityYields(city);
      city.food = Math.max(0, city.food + food);
      if (city.food >= this.growthNeed(city)) {
        city.food -= this.growthNeed(city);
        const oldRadius = this.radiusForPop(city.pop);
        city.pop++;
        if (city.owner === 'player') {
          this.log.push({ key: 'log.growth', params: { n: city.pop } });
        }
        const newRadius = this.radiusForPop(city.pop);
        if (newRadius > oldRadius) {
          this.claimTerritory(city, newRadius);
          if (city.owner === 'player') this.log.push({ key: 'log.borders' });
        }
      }
      if (city.producing) {
        city.progress += prod;
        const cost = PRODUCTION_COST[city.producing];
        if (city.progress >= cost) {
          this.spawnNear(city.producing, city.owner, city.pos);
          if (city.owner === 'player') {
            this.log.push({
              key: 'log.produced',
              params: { item: `unit.${city.producing}` },
            });
          }
          city.progress -= cost;
          city.producing = null;
        }
      }
    }

    for (const owner of ['player', 'ai'] as const) {
      const civ = this.civs[owner];
      if (!civ.researching) continue;
      const id = civ.researching;
      const p = (civ.progress[id] ?? 0) + this.scienceYield(owner);
      civ.progress[id] = p;
      if (p >= TECHS[id].cost) {
        civ.techs.add(id);
        civ.researching = null;
        if (owner === 'player') {
          this.log.push({ key: 'log.research', params: { tech: `tech.${id}` } });
        }
        if (id === 'masonry') {
          for (const c of this.cities) {
            if (c.owner !== owner) continue;
            c.maxHp += WALL_HP;
            c.hp += WALL_HP;
            c.strength += WALL_STRENGTH;
          }
        }
      }
    }

    // Units that spent the whole turn resting heal before movement resets.
    for (const u of this.units) {
      if (u.mp >= u.maxMp && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + HEAL_PER_TURN);
      }
      u.mp = u.maxMp;
      u.skipped = false;
      // An enemy closing to adjacency wakes a sleeping unit.
      if (
        u.sleeping &&
        this.units.some(e => e.owner !== u.owner && distance(e.pos, u.pos) <= 1)
      ) {
        u.sleeping = false;
      }
    }
    this.checkEnd();
  }

  private barbarianTurn() {
    for (const barb of [...this.units]) {
      if (barb.owner !== 'barbarian' || barb.hp <= 0) continue;
      const targetPositions = [
        ...this.units.filter(u => u.owner !== 'barbarian').map(u => u.pos),
        ...this.cities.map(c => c.pos),
      ];
      if (!targetPositions.length) return;

      const tryAttack = (): boolean => {
        const targets = this.attackTargets(barb);
        if (targets.length) {
          targets.sort((a, b) => a.hp - b.hp);
          this.attack(barb, targets[0]);
          return true;
        }
        if (barb.mp > 0) {
          const city = this.cities.find(c => distance(c.pos, barb.pos) === 1);
          if (city) {
            this.attackCity(barb, city);
            return true;
          }
        }
        return false;
      };

      if (tryAttack()) continue;

      let nearest = targetPositions[0];
      for (const p of targetPositions) {
        if (distance(barb.pos, p) < distance(barb.pos, nearest)) nearest = p;
      }
      if (distance(barb.pos, nearest) > AGGRO_RANGE) continue;

      const options = this.reachable(barb);
      let best: Axial | null = null;
      let bestD = distance(barb.pos, nearest);
      for (const k of options.keys()) {
        const d = distance(fromKey(k), nearest);
        if (d < bestD) {
          bestD = d;
          best = fromKey(k);
        }
      }
      if (best) {
        this.move(barb, best, options.get(key(best))!);
        tryAttack();
      }
    }
  }

  // --- rival empire AI ---

  private aiTurn() {
    // Cities: pick production; research: grab the first available tech.
    for (const city of this.cities) {
      if (city.owner === 'ai' && !city.producing) {
        city.producing = this.aiChooseProduction();
      }
    }
    if (!this.civs.ai.researching) {
      const avail = this.availableTechs('ai');
      if (avail.length) this.civs.ai.researching = avail[0];
    }
    for (const u of [...this.units]) {
      if (u.owner !== 'ai' || u.hp <= 0) continue;
      if (u.kind === 'settler') this.aiSettler(u);
      else if (u.kind === 'builder') this.aiBuilder(u);
      else this.aiMilitary(u);
    }
  }

  private aiChooseProduction(): ProducibleKind | null {
    const aiUnits = this.units.filter(u => u.owner === 'ai');
    const aiCities = this.cities.filter(c => c.owner === 'ai');
    const military = aiUnits.filter(u => u.strength > 0).length;
    const builders = aiUnits.filter(u => u.kind === 'builder').length;
    if (builders < 1 && Math.random() < 0.5) return 'builder';
    if (aiCities.length < 3 && !aiUnits.some(u => u.kind === 'settler') && military >= 2) {
      return 'settler';
    }
    // Army cap keeps the AI from drowning the map in units.
    if (military >= 4 + 2 * aiCities.length) {
      return builders < 2 ? 'builder' : null;
    }
    if (this.canProduce('archer', 'ai') && Math.random() < 0.35) return 'archer';
    if (this.canProduce('horseman', 'ai') && Math.random() < 0.3) return 'horseman';
    if (this.canProduce('spearman', 'ai')) return 'spearman';
    return 'warrior';
  }

  private aiSettler(u: Unit) {
    if (this.canFound(u)) {
      this.foundCity(u);
      return;
    }
    // Walk toward open land: maximize distance to the nearest existing city.
    const score = (p: Axial) => {
      let m = Infinity;
      for (const c of this.cities) m = Math.min(m, distance(p, c.pos));
      return Math.min(m, 5);
    };
    const options = this.reachable(u);
    let best: Axial | null = null;
    let bestS = score(u.pos);
    for (const k of options.keys()) {
      const s = score(fromKey(k));
      if (s > bestS) {
        bestS = s;
        best = fromKey(k);
      }
    }
    if (best) {
      this.move(u, best, options.get(key(best))!);
      if (this.canFound(u)) this.foundCity(u);
    }
  }

  private aiBuilder(u: Unit) {
    if (this.canBuildAt(u.pos, 'ai') && this.improvementFor(u.pos, 'ai')) {
      this.build(u);
      return;
    }
    // Head for the nearest improvable tile in AI territory.
    const spots: Axial[] = [];
    for (const tile of this.world.values()) {
      if (
        this.canBuildAt(tile.pos, 'ai') &&
        this.improvementFor(tile.pos, 'ai') &&
        !this.unitAt(tile.pos)
      ) {
        spots.push(tile.pos);
      }
    }
    if (!spots.length) return;
    let goal = spots[0];
    for (const p of spots) {
      if (distance(u.pos, p) < distance(u.pos, goal)) goal = p;
    }
    const options = this.reachable(u);
    let best: Axial | null = null;
    let bestD = distance(u.pos, goal);
    for (const k of options.keys()) {
      const d = distance(fromKey(k), goal);
      if (d < bestD) {
        bestD = d;
        best = fromKey(k);
      }
    }
    if (best) {
      this.move(u, best, options.get(key(best))!);
      if (this.canBuildAt(u.pos, 'ai') && this.improvementFor(u.pos, 'ai')) this.build(u);
    }
  }

  private aiMilitary(u: Unit) {
    const hostileCities = () => this.cities.filter(c => c.owner !== 'ai');
    const tryAttack = (): boolean => {
      const targets = this.attackTargets(u);
      if (targets.length) {
        targets.sort((a, b) => a.hp - b.hp);
        this.attack(u, targets[0]);
        return true;
      }
      if (u.mp > 0) {
        const range = u.range ?? 1;
        const city = hostileCities().find(c => distance(c.pos, u.pos) <= range);
        if (city) {
          this.attackCity(u, city);
          return true;
        }
      }
      return false;
    };
    if (tryAttack()) return;

    const targetPositions = [
      ...this.units.filter(x => x.owner !== 'ai').map(x => x.pos),
      ...hostileCities().map(c => c.pos),
      ...[...this.world.values()].filter(t => t.camp).map(t => t.pos),
    ];
    let goal: Axial | null = null;
    for (const p of targetPositions) {
      if (!goal || distance(u.pos, p) < distance(u.pos, goal)) goal = p;
    }
    if (goal && distance(u.pos, goal) > AGGRO_RANGE) {
      // Nothing near: fall back toward the closest AI city.
      const own = this.cities.filter(c => c.owner === 'ai');
      if (!own.length) return;
      let home = own[0].pos;
      for (const c of own) {
        if (distance(u.pos, c.pos) < distance(u.pos, home)) home = c.pos;
      }
      if (distance(u.pos, home) <= 2) return;
      goal = home;
    }
    if (!goal) return;
    const options = this.reachable(u);
    let best: Axial | null = null;
    let bestD = distance(u.pos, goal);
    for (const k of options.keys()) {
      const d = distance(fromKey(k), goal);
      if (d < bestD) {
        bestD = d;
        best = fromKey(k);
      }
    }
    if (best) {
      this.move(u, best, options.get(key(best))!);
      tryAttack();
    }
  }

  private spawnFromCamps() {
    const count = this.units.filter(u => u.owner === 'barbarian').length;
    if (count >= MAX_BARBARIANS) return;
    for (const tile of this.world.values()) {
      if (!tile.camp) continue;
      this.spawnNear('barbarian', 'barbarian', tile.pos);
      this.log.push({ key: 'log.spawn' });
    }
  }

  private checkEnd() {
    if (this.over) return;
    const playerAlive =
      this.units.some(u => u.owner === 'player') ||
      this.cities.some(c => c.owner === 'player');
    if (!playerAlive) {
      this.over = 'defeat';
      return;
    }
    const barbsGone =
      ![...this.world.values()].some(t => t.camp) &&
      !this.units.some(u => u.owner === 'barbarian');
    const aiGone =
      !this.units.some(u => u.owner === 'ai') &&
      !this.cities.some(c => c.owner === 'ai');
    if (barbsGone && aiGone) this.over = 'victory';
  }
}
