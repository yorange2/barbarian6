import './style.css';
import { Game, Unit } from './game';
import { render, HEX_SIZE, Cam, ViewState } from './render';
import { Axial, key, pixelToAxial, axialToPixel } from './hex';
import { TERRAIN_INFO } from './map';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const ctx = canvas.getContext('2d')!;
const turnEl = document.querySelector<HTMLSpanElement>('#turn')!;
const panelEl = document.querySelector<HTMLDivElement>('#panel')!;
const logEl = document.querySelector<HTMLDivElement>('#log')!;
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!;
const bannerText = document.querySelector<HTMLDivElement>('#banner-text')!;

let game = new Game();
const cam: Cam = { x: 0, y: 0, zoom: 1 };
const view: ViewState = {
  hover: null,
  selectedId: null,
  reachable: new Map(),
  attackIds: new Set(),
};

function centerCamera() {
  const players = game.units.filter(u => u.owner === 'player');
  if (!players.length) return;
  let sx = 0;
  let sy = 0;
  for (const u of players) {
    const p = axialToPixel(u.pos, HEX_SIZE);
    sx += p.x;
    sy += p.y;
  }
  cam.x = sx / players.length;
  cam.y = sy / players.length;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}
window.addEventListener('resize', resize);

function screenToHex(sx: number, sy: number): Axial {
  const rect = canvas.getBoundingClientRect();
  const wx = (sx - rect.left - rect.width / 2) / cam.zoom + cam.x;
  const wy = (sy - rect.top - rect.height / 2) / cam.zoom + cam.y;
  return pixelToAxial(wx, wy, HEX_SIZE);
}

function selectedUnit(): Unit | null {
  return game.units.find(u => u.id === view.selectedId) ?? null;
}

function refreshSelection() {
  const u = selectedUnit();
  if (!u || u.owner !== 'player') {
    view.selectedId = null;
    view.reachable = new Map();
    view.attackIds = new Set();
    return;
  }
  view.reachable = game.reachable(u);
  view.attackIds = new Set(game.attackTargets(u).map(t => t.id));
}

// --- input: click to select/move/attack, drag to pan, wheel to zoom ---

let dragStart: { x: number; y: number } | null = null;
let dragged = false;

canvas.addEventListener('mousedown', e => {
  dragStart = { x: e.clientX, y: e.clientY };
  dragged = false;
});

window.addEventListener('mousemove', e => {
  if (dragStart && e.buttons & 1) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (dragged || Math.hypot(dx, dy) > 4) {
      dragged = true;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      dragStart = { x: e.clientX, y: e.clientY };
    }
  }
  view.hover = screenToHex(e.clientX, e.clientY);
  updatePanel();
});

window.addEventListener('mouseup', e => {
  if (dragStart && !dragged && e.target === canvas) {
    handleClick(screenToHex(e.clientX, e.clientY));
  }
  dragStart = null;
});

canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left - rect.width / 2;
    const sy = e.clientY - rect.top - rect.height / 2;
    const wx = sx / cam.zoom + cam.x;
    const wy = sy / cam.zoom + cam.y;
    cam.zoom = Math.min(2.5, Math.max(0.4, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
    cam.x = wx - sx / cam.zoom;
    cam.y = wy - sy / cam.zoom;
  },
  { passive: false },
);

function handleClick(hex: Axial) {
  if (game.over) return;
  const sel = selectedUnit();
  const target = game.unitAt(hex);
  if (sel && target && target.owner === 'barbarian' && view.attackIds.has(target.id)) {
    game.attack(sel, target);
  } else if (sel && view.reachable.has(key(hex))) {
    game.move(sel, hex, view.reachable.get(key(hex))!);
  } else if (target && target.owner === 'player') {
    view.selectedId = target.id;
  } else {
    view.selectedId = null;
  }
  refreshSelection();
  updateUI();
}

function endTurn() {
  if (game.over) return;
  game.endTurn();
  refreshSelection();
  updateUI();
}

document.querySelector('#endturn')!.addEventListener('click', endTurn);
document.querySelector('#restart')!.addEventListener('click', () => {
  game = new Game();
  view.selectedId = null;
  refreshSelection();
  centerCamera();
  updateUI();
});

window.addEventListener('keydown', e => {
  if (e.key === 'Enter') endTurn();
  if (e.key === 'Escape') {
    view.selectedId = null;
    refreshSelection();
    updateUI();
  }
});

// --- UI panels ---

function updateUI() {
  turnEl.textContent = `Turn ${game.turn}`;
  logEl.innerHTML = game.log.slice(-6).map(l => `<div>${l}</div>`).join('');
  if (game.over) {
    bannerEl.classList.remove('hidden');
    bannerText.textContent =
      game.over === 'victory'
        ? '🏆 Victory! Every barbarian camp lies in ashes.'
        : '💀 Defeat! Your warband has been wiped out.';
  } else {
    bannerEl.classList.add('hidden');
  }
  updatePanel();
}

function updatePanel() {
  const parts: string[] = [];
  const sel = selectedUnit();
  if (sel) {
    parts.push(
      `<b>${sel.icon} ${sel.name}</b> — HP ${sel.hp}/${sel.maxHp} · MP ${sel.mp}/${sel.maxMp} · STR ${sel.strength}`,
    );
    parts.push(
      `<span class="hint">Click a highlighted hex to move, a red-ringed enemy to attack.</span>`,
    );
  }
  if (view.hover) {
    const tile = game.world.get(key(view.hover));
    if (tile) {
      const info = TERRAIN_INFO[tile.terrain];
      const cost = info.moveCost === null ? 'impassable' : `move cost ${info.moveCost}`;
      parts.push(`${info.name} (${cost})${tile.camp ? ' · ⛺ barbarian camp' : ''}`);
      const u = game.unitAt(view.hover);
      if (u && u !== sel) {
        parts.push(`${u.icon} ${u.name} (${u.owner}) — HP ${u.hp}/${u.maxHp}`);
      }
    }
  }
  if (!parts.length) {
    parts.push(
      '<span class="hint">Click a unit to select it. Drag to pan, scroll to zoom, Enter ends the turn.</span>',
    );
  }
  panelEl.innerHTML = parts.join('<br>');
}

// --- boot ---

resize();
centerCamera();
updateUI();

function frame() {
  render(ctx, canvas, game, cam, view);
  requestAnimationFrame(frame);
}
frame();
