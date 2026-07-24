import { Axial, key, fromKey, neighbors, distance } from './hex';
import { World, Tile, TERRAIN_INFO, generateMap, MAP_W, MAP_H } from './map';

export type Owner = 'player' | 'barbarian';

export interface Unit {
  id: number;
  name: string;
  icon: string;
  owner: Owner;
  pos: Axial;
  hp: number;
  maxHp: number;
  strength: number;
  mp: number;
  maxMp: number;
}

const TEMPLATES = {
  warrior: { name: 'Warrior', icon: '⚔️', hp: 20, strength: 8, mp: 2 },
  scout: { name: 'Scout', icon: '🐎', hp: 14, strength: 5, mp: 3 },
  barbarian: { name: 'Barbarian', icon: '🪓', hp: 16, strength: 6, mp: 2 },
} as const;

const MAX_BARBARIANS = 8;
const SPAWN_EVERY = 6;
const AGGRO_RANGE = 8;

export class Game {
  world: World;
  units: Unit[] = [];
  turn = 1;
  log: string[] = [];
  over: 'victory' | 'defeat' | null = null;
  private nextId = 1;

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

    for (const r of [4, MAP_H - 4]) {
      const q = -Math.floor(r / 2) + MAP_W - 4;
      const campPos = this.nearestFree({ q, r });
      if (campPos) {
        this.world.get(key(campPos))!.camp = true;
        this.spawnNear('barbarian', 'barbarian', campPos);
      }
    }
    this.log.push('Raze every barbarian camp ⛺ and slay the barbarians. Do not die.');
  }

  private spawnNear(kind: keyof typeof TEMPLATES, owner: Owner, near: Axial) {
    const pos = this.nearestFree(near);
    if (!pos) return;
    const t = TEMPLATES[kind];
    this.units.push({
      id: this.nextId++,
      name: t.name,
      icon: t.icon,
      owner,
      pos,
      hp: t.hp,
      maxHp: t.hp,
      strength: t.strength,
      mp: t.mp,
      maxMp: t.mp,
    });
  }

  private nearestFree(from: Axial): Axial | null {
    const seen = new Set([key(from)]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      const tile = this.world.get(key(cur));
      if (tile && this.passable(tile) && !this.unitAt(cur)) return cur;
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
    return TERRAIN_INFO[tile.terrain].moveCost !== null;
  }

  unitAt(pos: Axial): Unit | null {
    return this.units.find(u => u.pos.q === pos.q && u.pos.r === pos.r) ?? null;
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
        if (!tile || !this.passable(tile) || this.unitAt(n)) continue;
        const c = cost + TERRAIN_INFO[tile.terrain].moveCost!;
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
    if (unit.mp <= 0) return [];
    return this.units.filter(
      u => u.owner !== unit.owner && distance(u.pos, unit.pos) === 1,
    );
  }

  move(unit: Unit, dest: Axial, cost: number) {
    unit.pos = dest;
    unit.mp = Math.max(0, unit.mp - cost);
    const tile = this.world.get(key(dest))!;
    if (tile.camp && unit.owner === 'player') {
      tile.camp = false;
      this.log.push(`⛺ ${unit.name} razed a barbarian camp!`);
      this.checkEnd();
    }
  }

  attack(att: Unit, def: Unit) {
    att.mp = 0;
    const dmg = this.damage(att, def);
    def.hp -= dmg;
    this.log.push(`${att.icon} ${att.name} hits ${def.icon} ${def.name} for ${dmg}.`);
    if (def.hp <= 0) {
      this.log.push(`${def.icon} ${def.name} dies!`);
      this.units = this.units.filter(u => u !== def);
      this.move(att, def.pos, 0);
    } else {
      const back = this.damage(def, att);
      att.hp -= back;
      this.log.push(`${def.icon} ${def.name} strikes back for ${back}.`);
      if (att.hp <= 0) {
        this.log.push(`${att.icon} ${att.name} dies!`);
        this.units = this.units.filter(u => u !== att);
      }
    }
    this.checkEnd();
  }

  private damage(att: Unit, def: Unit): number {
    const ratio = att.strength / def.strength;
    const health = 0.5 + 0.5 * (att.hp / att.maxHp);
    return Math.max(1, Math.round(5 * ratio * health * (0.85 + Math.random() * 0.3)));
  }

  endTurn() {
    if (this.over) return;
    this.barbarianTurn();
    this.turn++;
    if (this.turn % SPAWN_EVERY === 0) this.spawnFromCamps();
    for (const u of this.units) u.mp = u.maxMp;
    this.checkEnd();
  }

  private barbarianTurn() {
    for (const barb of [...this.units]) {
      if (barb.owner !== 'barbarian' || barb.hp <= 0) continue;
      const players = this.units.filter(u => u.owner === 'player');
      if (!players.length) return;

      const targets = this.attackTargets(barb);
      if (targets.length) {
        targets.sort((a, b) => a.hp - b.hp);
        this.attack(barb, targets[0]);
        continue;
      }

      let nearest = players[0];
      for (const p of players) {
        if (distance(barb.pos, p.pos) < distance(barb.pos, nearest.pos)) nearest = p;
      }
      if (distance(barb.pos, nearest.pos) > AGGRO_RANGE) continue;

      const options = this.reachable(barb);
      let best: Axial | null = null;
      let bestD = distance(barb.pos, nearest.pos);
      for (const k of options.keys()) {
        const d = distance(fromKey(k), nearest.pos);
        if (d < bestD) {
          bestD = d;
          best = fromKey(k);
        }
      }
      if (best) {
        this.move(barb, best, options.get(key(best))!);
        const after = this.attackTargets(barb);
        if (after.length) this.attack(barb, after[0]);
      }
    }
  }

  private spawnFromCamps() {
    const count = this.units.filter(u => u.owner === 'barbarian').length;
    if (count >= MAX_BARBARIANS) return;
    for (const tile of this.world.values()) {
      if (!tile.camp) continue;
      this.spawnNear('barbarian', 'barbarian', tile.pos);
      this.log.push('⛺ A new barbarian emerges from a camp!');
    }
  }

  private checkEnd() {
    if (this.over) return;
    if (!this.units.some(u => u.owner === 'player')) {
      this.over = 'defeat';
      return;
    }
    const camps = [...this.world.values()].some(t => t.camp);
    const barbs = this.units.some(u => u.owner === 'barbarian');
    if (!camps && !barbs) this.over = 'victory';
  }
}
