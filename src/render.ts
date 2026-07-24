import { Axial, axialToPixel, fromKey, hexCorners, key } from './hex';
import { TERRAIN_INFO } from './map';
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
  reachable: Map<string, number>;
  attackIds: Set<number>;
}

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
    if (tile.terrain === 'mountain') glyph(ctx, x, y, '⛰️', HEX_SIZE * 0.85);
    if (tile.terrain === 'forest') glyph(ctx, x, y, '🌲', HEX_SIZE * 0.65);
    if (tile.camp) glyph(ctx, x, y, '⛺', HEX_SIZE * 0.85);
  }

  for (const k of view.reachable.keys()) {
    const { x, y } = axialToPixel(fromKey(k), HEX_SIZE);
    pathHex(ctx, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
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
    ctx.beginPath();
    ctx.arc(x, y, HEX_SIZE * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = u.owner === 'player' ? '#2f6db3' : '#a83232';
    ctx.fill();
    if (u.id === view.selectedId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
    } else if (view.attackIds.has(u.id)) {
      ctx.strokeStyle = '#ff5533';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    glyph(ctx, x, y, u.icon, HEX_SIZE * 0.62);

    const bw = HEX_SIZE * 1.1;
    const frac = u.hp / u.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, y - HEX_SIZE * 0.88, bw, 5);
    ctx.fillStyle = frac > 0.5 ? '#5fd35f' : frac > 0.25 ? '#e0c341' : '#e05341';
    ctx.fillRect(x - bw / 2, y - HEX_SIZE * 0.88, bw * frac, 5);
  }
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
