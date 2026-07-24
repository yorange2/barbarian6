import { Axial, DIRS, axialToPixel, fromKey, hexCorners, key } from './hex';
import { TERRAIN_INFO, FEATURE_INFO, IMPROVEMENT_INFO } from './map';
import { Game } from './game';

export const HEX_SIZE = 34;

export interface Cam {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewState {
  hover: Axial | null;
  selectedId: number | null;
  selectedCityId: number | null;
  reachable: Map<string, number>;
  attackIds: Set<number>;
  attackCityIds: Set<number>;
}

const CIV_COLORS = {
  player: { unit: '#2f6db3', unitSpent: '#1f4a77', tint: 'rgba(110, 170, 230,', border: '#5f9fdc' },
  ai: { unit: '#8a4fb0', unitSpent: '#8a4fb0', tint: 'rgba(178, 122, 233,', border: '#a877d6' },
} as const;

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: Game,
  cam: Cam,
  view: ViewState,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#141c26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(
    dpr * cam.zoom, 0, 0, dpr * cam.zoom,
    dpr * (w / 2 - cam.x * cam.zoom),
    dpr * (h / 2 - cam.y * cam.zoom),
  );

  for (const tile of game.world.values()) {
    const { x, y } = axialToPixel(tile.pos, HEX_SIZE);
    pathHex(ctx, x, y);
    ctx.fillStyle = TERRAIN_INFO[tile.terrain].color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (tile.cityId !== undefined) {
      const owner = game.cities.find(c => c.id === tile.cityId)?.owner ?? 'player';
      const alpha = tile.cityId === view.selectedCityId ? '0.32)' : '0.16)';
      pathHex(ctx, x, y);
      ctx.fillStyle = CIV_COLORS[owner].tint + alpha;
      ctx.fill();
    }
    if (tile.hills) {
      // Two shaded humps hint at the hills attribute under any terrain.
      ctx.beginPath();
      ctx.arc(x - HEX_SIZE * 0.22, y + HEX_SIZE * 0.08, HEX_SIZE * 0.18, Math.PI, 0);
      ctx.arc(x + HEX_SIZE * 0.2, y + HEX_SIZE * 0.14, HEX_SIZE * 0.24, Math.PI, 0);
      ctx.fillStyle = 'rgba(60, 45, 25, 0.30)';
      ctx.fill();
    }
    if (tile.terrain === 'mountain') glyph(ctx, x, y, '⛰️', HEX_SIZE * 0.85);
    if (tile.feature) {
      glyph(ctx, x, y, FEATURE_INFO[tile.feature].icon, HEX_SIZE * 0.6);
    }
    if (tile.camp) glyph(ctx, x, y, '⛺', HEX_SIZE * 0.85);
    if (tile.improvement) {
      glyph(ctx, x, y + HEX_SIZE * 0.42, IMPROVEMENT_INFO[tile.improvement].icon, HEX_SIZE * 0.66);
    }
  }

  // Territory borders: draw each edge where ownership changes.
  ctx.lineWidth = 2;
  for (const tile of game.world.values()) {
    if (tile.cityId === undefined) continue;
    const owner = game.cities.find(c => c.id === tile.cityId)?.owner ?? 'player';
    ctx.strokeStyle = CIV_COLORS[owner].border;
    const { x, y } = axialToPixel(tile.pos, HEX_SIZE);
    const pts = hexCorners(x, y, HEX_SIZE);
    DIRS.forEach((d, i) => {
      const n = game.world.get(key({ q: tile.pos.q + d.q, r: tile.pos.r + d.r }));
      if (n && n.cityId === tile.cityId) return;
      const c1 = (6 - i) % 6;
      const c2 = (c1 + 1) % 6;
      ctx.beginPath();
      ctx.moveTo(pts[c1][0], pts[c1][1]);
      ctx.lineTo(pts[c2][0], pts[c2][1]);
      ctx.stroke();
    });
  }

  for (const city of game.cities) {
    const { x, y } = axialToPixel(city.pos, HEX_SIZE);
    pathHex(ctx, x, y);
    ctx.fillStyle = CIV_COLORS[city.owner].tint + '0.45)';
    ctx.fill();
    // Idle player cities (no production chosen) get the gold ring; enemy
    // cities in attack range get the red ring.
    if (city.id === view.selectedCityId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
    } else if (view.attackCityIds.has(city.id)) {
      ctx.strokeStyle = '#ff5533';
      ctx.lineWidth = 3;
    } else if (city.owner === 'player' && !city.producing) {
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = CIV_COLORS[city.owner].unit;
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    glyph(ctx, x, y, '🏛️', HEX_SIZE * 0.8);
    drawHpBar(ctx, x, y, city.hp / city.maxHp);
  }

  // Reachable tiles: bright cyan fill + outline, gently pulsing so the
  // movement range stands out against any terrain.
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 350);
  for (const k of view.reachable.keys()) {
    const { x, y } = axialToPixel(fromKey(k), HEX_SIZE);
    pathHex(ctx, x, y);
    ctx.fillStyle = `rgba(110, 205, 255, ${0.30 + 0.16 * pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(180, 240, 255, ${0.75 + 0.2 * pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (view.hover && game.world.has(key(view.hover))) {
    const { x, y } = axialToPixel(view.hover, HEX_SIZE);
    pathHex(ctx, x, y);
    ctx.strokeStyle = 'rgba(255,255,180,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const u of game.units) {
    const { x, y } = axialToPixel(u.pos, HEX_SIZE);
    const awake = u.mp > 0 && !u.sleeping && !u.skipped;
    ctx.beginPath();
    ctx.arc(x, y, HEX_SIZE * 0.52, 0, Math.PI * 2);
    // Player units that already acted (or stand down) are drawn dimmer.
    ctx.fillStyle =
      u.owner === 'barbarian'
        ? '#a83232'
        : awake || u.owner !== 'player'
          ? CIV_COLORS[u.owner].unit
          : CIV_COLORS.player.unitSpent;
    ctx.fill();
    if (u.id === view.selectedId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
    } else if (view.attackIds.has(u.id)) {
      ctx.strokeStyle = '#ff5533';
      ctx.lineWidth = 3;
    } else if (u.owner === 'player' && awake) {
      // Gold ring: this unit still awaits orders.
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    glyph(ctx, x, y, u.icon, HEX_SIZE * 0.62);
    if (u.sleeping) glyph(ctx, x + HEX_SIZE * 0.42, y - HEX_SIZE * 0.42, '💤', HEX_SIZE * 0.5);
    drawHpBar(ctx, x, y, u.hp / u.maxHp);
  }
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number) {
  const bw = HEX_SIZE * 1.1;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - bw / 2, y - HEX_SIZE * 0.88, bw, 5);
  ctx.fillStyle = frac > 0.5 ? '#5fd35f' : frac > 0.25 ? '#e0c341' : '#e05341';
  ctx.fillRect(x - bw / 2, y - HEX_SIZE * 0.88, bw * frac, 5);
}

function pathHex(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const pts = hexCorners(x, y, HEX_SIZE);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function glyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  size: number,
) {
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
