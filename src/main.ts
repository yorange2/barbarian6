import './style.css';
import {
  Game,
  Unit,
  City,
  ProducibleKind,
  PRODUCIBLE,
  PRODUCTION_COST,
  UNIT_REQUIREMENTS,
  TECHS,
  TechId,
} from './game';
import { render, HEX_SIZE, Cam, ViewState } from './render';
import { Axial, key, pixelToAxial, axialToPixel } from './hex';
import { tileYields, tileMoveCost, tileDefense } from './map';
import { t, getLang, setLang, Lang } from './i18n';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const ctx = canvas.getContext('2d')!;
const turnEl = document.querySelector<HTMLSpanElement>('#turn')!;
const panelEl = document.querySelector<HTMLDivElement>('#panel')!;
const logEl = document.querySelector<HTMLDivElement>('#log')!;
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!;
const bannerText = document.querySelector<HTMLDivElement>('#banner-text')!;
const endTurnBtn = document.querySelector<HTMLButtonElement>('#endturn')!;
const restartBtn = document.querySelector<HTMLButtonElement>('#restart')!;
const langSel = document.querySelector<HTMLSelectElement>('#lang')!;
const techBtn = document.querySelector<HTMLButtonElement>('#techbtn')!;
const techPanel = document.querySelector<HTMLDivElement>('#techpanel')!;

let game = new Game();
const cam: Cam = { x: 0, y: 0, zoom: 1 };
const view: ViewState = {
  hover: null,
  selectedId: null,
  selectedCityId: null,
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

function selectedCity(): City | null {
  return game.cities.find(c => c.id === view.selectedCityId) ?? null;
}

/** Pan the camera if a position is (nearly) outside the current view. */
function ensureVisible(pos: Axial) {
  const p = axialToPixel(pos, HEX_SIZE);
  const rect = canvas.getBoundingClientRect();
  const halfW = rect.width / 2 / cam.zoom;
  const halfH = rect.height / 2 / cam.zoom;
  const margin = HEX_SIZE * 2;
  if (
    p.x < cam.x - halfW + margin ||
    p.x > cam.x + halfW - margin ||
    p.y < cam.y - halfH + margin ||
    p.y > cam.y + halfH - margin
  ) {
    cam.x = p.x;
    cam.y = p.y;
  }
}

interface PendingEntry {
  id: number;
  unit?: Unit;
  city?: City;
}

/** A unit awaits orders: has moves left and is neither asleep nor skipped. */
function unitPending(u: Unit): boolean {
  return u.owner === 'player' && u.mp > 0 && !u.sleeping && !u.skipped;
}

/** Everything still awaiting orders: units with moves left, cities without production. */
function pendingEntries(): PendingEntry[] {
  return [
    ...game.units.filter(unitPending).map(u => ({ id: u.id, unit: u })),
    ...game.cities.filter(c => !c.producing).map(c => ({ id: c.id, city: c })),
  ].sort((a, b) => a.id - b.id);
}

function selectEntry(e: PendingEntry) {
  view.selectedId = e.unit?.id ?? null;
  view.selectedCityId = e.city?.id ?? null;
  ensureVisible((e.unit ?? e.city!).pos);
}

/** Cycle to the next pending item, even if the current selection still has orders. */
function focusNext() {
  const entries = pendingEntries();
  if (!entries.length) return;
  const prevId = view.selectedId ?? view.selectedCityId ?? -1;
  selectEntry(entries.find(e => e.id > prevId) ?? entries[0]);
}

/**
 * Jump to the next thing awaiting orders. Stays put if the current selection
 * still needs orders itself.
 */
function advanceSelection() {
  const curUnit = selectedUnit();
  if (curUnit && unitPending(curUnit)) return;
  const curCity = selectedCity();
  if (curCity && !curCity.producing) return;
  const entries = pendingEntries();
  if (!entries.length) {
    view.selectedId = null;
    return;
  }
  const prevId = view.selectedId ?? view.selectedCityId ?? -1;
  selectEntry(entries.find(e => e.id > prevId) ?? entries[0]);
}

function refreshSelection() {
  if (!selectedCity()) view.selectedCityId = null;
  const u = selectedUnit();
  if (!u || u.owner !== 'player') {
    view.selectedId = null;
    view.reachable = new Map();
    view.attackIds = new Set();
    return;
  }
  view.reachable = game.reachable(u);
  view.attackIds = new Set(game.attackTargets(u).map(x => x.id));
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

/** Research counts as awaiting orders when idle and something is researchable. */
function researchPending(): boolean {
  return game.researching === null && game.availableTechs().length > 0;
}

/**
 * When a player action leaves nothing awaiting orders, end the turn
 * automatically (after a beat, so the last action is visible).
 */
let autoEndTimer: number | null = null;
function maybeAutoEndTurn() {
  if (
    game.over ||
    pendingEntries().length > 0 ||
    researchPending() ||
    autoEndTimer !== null
  ) {
    return;
  }
  autoEndTimer = window.setTimeout(() => {
    autoEndTimer = null;
    if (!game.over && pendingEntries().length === 0 && !researchPending()) endTurn();
  }, 350);
}

function handleClick(hex: Axial) {
  if (game.over) return;
  const sel = selectedUnit();
  const target = game.unitAt(hex);
  const city = game.cityAt(hex);
  let acted = false;
  if (sel && target && target.owner === 'barbarian' && view.attackIds.has(target.id)) {
    game.attack(sel, target);
    advanceSelection();
    acted = true;
  } else if (sel && view.reachable.has(key(hex))) {
    game.move(sel, hex, view.reachable.get(key(hex))!);
    advanceSelection();
    acted = true;
  } else if (target && target.owner === 'player') {
    view.selectedId = target.id;
    view.selectedCityId = null;
  } else if (city) {
    view.selectedCityId = city.id;
    view.selectedId = null;
  } else {
    view.selectedId = null;
    view.selectedCityId = null;
  }
  refreshSelection();
  updateUI();
  if (acted) maybeAutoEndTurn();
}

// Action buttons inside the panel (found city / build / choose production).
panelEl.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!btn || game.over) return;
  const sel = selectedUnit();
  let acted = false;
  if (btn.dataset.action === 'found' && sel) {
    if (game.foundCity(sel)) {
      advanceSelection();
      acted = true;
    }
  } else if (btn.dataset.action === 'build' && sel) {
    if (game.build(sel)) {
      advanceSelection();
      acted = true;
    }
  } else if (btn.dataset.action === 'chop' && sel) {
    if (game.chop(sel)) {
      advanceSelection();
      acted = true;
    }
  } else if (btn.dataset.action === 'produce') {
    const c = selectedCity();
    if (c) {
      game.setProduction(c, btn.dataset.kind as ProducibleKind);
      advanceSelection();
      acted = true;
    }
  } else if (btn.dataset.action === 'sleep' && sel) {
    sel.sleeping = true;
    advanceSelection();
    acted = true;
  } else if (btn.dataset.action === 'skip' && sel) {
    sel.skipped = true;
    advanceSelection();
    acted = true;
  } else if (btn.dataset.action === 'wake' && sel) {
    sel.sleeping = false;
  }
  refreshSelection();
  updateUI();
  if (acted) maybeAutoEndTurn();
});

function endTurn() {
  if (game.over) return;
  game.endTurn();
  advanceSelection();
  refreshSelection();
  updateUI();
}

// Civ-style: while anything awaits orders, the button jumps to it instead of
// ending the turn. Enter always force-ends the turn.
endTurnBtn.addEventListener('click', () => {
  if (!game.over && pendingEntries().length) {
    focusNext();
    refreshSelection();
    updateUI();
    return;
  }
  if (!game.over && researchPending()) {
    techPanel.classList.remove('hidden');
    renderTechPanel();
    return;
  }
  endTurn();
});
techBtn.addEventListener('click', () => {
  techPanel.classList.toggle('hidden');
  renderTechPanel();
});

techPanel.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tech]');
  if (!btn || game.over) return;
  game.setResearch(btn.dataset.tech as TechId);
  techPanel.classList.add('hidden');
  updateUI();
  maybeAutoEndTurn();
});

restartBtn.addEventListener('click', () => {
  game = new Game();
  view.selectedId = null;
  view.selectedCityId = null;
  centerCamera();
  advanceSelection();
  refreshSelection();
  updateUI();
});

langSel.addEventListener('change', () => {
  setLang(langSel.value as Lang);
  document.documentElement.lang = langSel.value;
  updateUI();
});

window.addEventListener('keydown', e => {
  if (e.key === 'Enter') endTurn();
  if (e.key === ' ') {
    e.preventDefault();
    const sel = selectedUnit();
    if (sel && sel.owner === 'player' && !game.over) {
      sel.skipped = true;
      advanceSelection();
      refreshSelection();
      updateUI();
      maybeAutoEndTurn();
    }
  }
  if (e.key === 'Escape') {
    view.selectedId = null;
    view.selectedCityId = null;
    refreshSelection();
    updateUI();
  }
});

// --- UI panels ---

function renderTechPanel() {
  const all = Object.keys(TECHS) as TechId[];
  const completed = all.filter(id => game.techs.has(id));
  const available = game.availableTechs();
  const locked = all.filter(id => !game.techs.has(id) && !available.includes(id));

  const parts = [`<div class="hint">${t('panel.science', { n: game.scienceYield() })}</div>`];
  if (completed.length) {
    parts.push(
      `<div class="tech-head">${t('tech.completed')}</div>`,
      `<div class="hint">${completed.map(id => `✅ ${t(`tech.${id}`)}`).join(' · ')}</div>`,
    );
  }
  if (available.length) {
    parts.push(`<div class="tech-head">${t('tech.available')}</div>`);
    for (const id of available) {
      const mark = game.researching === id ? '● ' : '';
      parts.push(
        `<button data-tech="${id}">${mark}${t('tech.option', {
          tech: `tech.${id}`,
          cost: TECHS[id].cost,
          turns: game.techTurns(id),
        })}</button>`,
        `<div class="hint">${t(`tech.${id}.desc`)}</div>`,
      );
    }
  }
  if (locked.length) {
    parts.push(`<div class="tech-head">${t('tech.locked')}</div>`);
    for (const id of locked) {
      parts.push(
        `<button disabled>🔒 ${t(`tech.${id}`)} — ${TECHS[id].cost} 🧪 · ${t('tech.requires', { tech: `tech.${TECHS[id].requires}` })}</button>`,
        `<div class="hint">${t(`tech.${id}.desc`)}</div>`,
      );
    }
  }
  techPanel.innerHTML = parts.join('');
}

function updateUI() {
  turnEl.textContent = t('turn', { n: game.turn });
  const pendingUnits = game.units.filter(unitPending).length;
  const idleCities = game.cities.filter(c => !c.producing).length;
  if (pendingUnits > 0) {
    endTurnBtn.textContent = t('endTurn.units', { n: pendingUnits });
    endTurnBtn.classList.add('warn');
    endTurnBtn.title = t('endTurn.force');
  } else if (idleCities > 0) {
    endTurnBtn.textContent = t('endTurn.city');
    endTurnBtn.classList.add('warn');
    endTurnBtn.title = t('endTurn.force');
  } else if (researchPending()) {
    endTurnBtn.textContent = t('endTurn.research');
    endTurnBtn.classList.add('warn');
    endTurnBtn.title = t('endTurn.force');
  } else {
    endTurnBtn.textContent = t('endTurn');
    endTurnBtn.classList.remove('warn');
    endTurnBtn.title = '';
  }
  restartBtn.textContent = t('newGame');
  techBtn.textContent = game.researching
    ? t('research.current', {
        tech: `tech.${game.researching}`,
        turns: game.techTurns(game.researching),
      })
    : t('research.idle');
  techBtn.classList.toggle('warn', researchPending());
  if (!techPanel.classList.contains('hidden')) renderTechPanel();
  logEl.innerHTML = game.log
    .slice(-6)
    .map(e => `<div>${t(e.key, e.params)}</div>`)
    .join('');
  if (game.over) {
    bannerEl.classList.remove('hidden');
    bannerText.textContent = t(`banner.${game.over}`);
  } else {
    bannerEl.classList.add('hidden');
  }
  updatePanel();
}

function updatePanel() {
  const parts: string[] = [];
  const sel = selectedUnit();
  if (sel) {
    let stats = t('panel.stats', {
      hp: sel.hp,
      maxHp: sel.maxHp,
      mp: sel.mp,
      maxMp: sel.maxMp,
      str: sel.strength,
    });
    if (sel.kind === 'builder') {
      stats += ` · ${t('panel.charges', { n: sel.charges ?? 0 })}`;
    }
    parts.push(`<b>${t(sel.nameKey)}</b> — ${stats}`);
    if (sel.kind === 'settler') {
      if (game.canFound(sel)) {
        parts.push(`<button data-action="found">${t('action.foundCity')}</button>`);
      } else {
        parts.push(`<span class="hint">${t('reason.tooClose')}</span>`);
      }
    } else if (sel.kind === 'builder' && sel.mp > 0) {
      const improv = game.improvementFor(sel.pos);
      const removal = game.removalFor(sel.pos);
      const inside = game.canBuildAt(sel.pos);
      if (inside && improv) {
        parts.push(
          `<button data-action="build">${t('action.build', { improv: `improv.${improv}` })}</button>`,
        );
      }
      if (inside && removal) {
        const featKey = `feature.${game.world.get(key(sel.pos))!.feature}`;
        parts.push(
          `<button data-action="chop">${t(removal === 'chop' ? 'action.chop' : 'action.drain', { feature: featKey })}</button>`,
        );
      }
      if (!inside && (improv || removal)) {
        parts.push(`<span class="hint">${t('reason.outsideTerritory')}</span>`);
      }
    }
    if (sel.sleeping) {
      parts.push(`<button data-action="wake">${t('action.wake')}</button>`);
    } else if (sel.mp > 0) {
      parts.push(
        `<button data-action="skip">${t('action.skip')}</button>`,
        `<button data-action="sleep">${t('action.sleep')}</button>`,
      );
    }
    parts.push(`<span class="hint">${t('hint.selected')}</span>`);
  }

  const selCity = selectedCity();
  if (selCity) {
    const { prod, food } = game.cityYields(selCity);
    parts.push(
      `<b>${t('city')}</b> — ${t('panel.hp', { hp: selCity.hp, maxHp: selCity.maxHp })} · ${t('panel.pop', { n: selCity.pop })}`,
    );
    const growth =
      food > 0
        ? t('panel.growth', {
            turns: Math.ceil(Math.max(1, game.growthNeed(selCity) - selCity.food) / food),
          })
        : t('panel.growthStalled');
    parts.push(`${t('panel.cityYields', { prod, food })} · ${growth}`);
    if (selCity.producing) {
      const turns = Math.ceil(
        Math.max(0, PRODUCTION_COST[selCity.producing] - selCity.progress) / prod,
      );
      parts.push(t('panel.producing', { item: `unit.${selCity.producing}`, turns }));
    } else {
      parts.push(t('panel.chooseProduction'));
    }
    for (const kind of PRODUCIBLE) {
      if (!game.canProduce(kind)) {
        parts.push(
          `<button disabled>${t('panel.requires', {
            item: `unit.${kind}`,
            tech: `tech.${UNIT_REQUIREMENTS[kind]}`,
          })}</button>`,
        );
        continue;
      }
      const cost = PRODUCTION_COST[kind];
      const turns = Math.ceil(Math.max(1, cost - selCity.progress) / prod);
      const mark = selCity.producing === kind ? '● ' : '';
      parts.push(
        `<button data-action="produce" data-kind="${kind}">${mark}${t('panel.prodOption', { item: `unit.${kind}`, cost, turns })}</button>`,
      );
    }
  }
  if (view.hover) {
    const tile = game.world.get(key(view.hover));
    if (tile) {
      const names = [t(`terrain.${tile.terrain}`)];
      if (tile.hills) names.push(t('terrain.hillsAttr'));
      if (tile.feature) names.push(t(`feature.${tile.feature}`));
      if (tile.improvement) names.push(t(`improv.${tile.improvement}`));
      if (tile.camp) names.push(t('tile.camp'));
      parts.push(names.join(' · '));

      const y = tileYields(tile);
      const mc = tileMoveCost(tile);
      const defn = tileDefense(tile);
      const bits = [`🌾 ${y.food} · ⚙ ${y.prod}`];
      bits.push(mc === null ? t('tile.impassable') : t('tile.moveCost', { n: mc }));
      if (defn !== 0) bits.push(t('tile.defense', { n: (defn > 0 ? '+' : '') + defn }));
      parts.push(`<span class="hint">${bits.join(' · ')}</span>`);

      const u = game.unitAt(view.hover);
      if (u && u !== sel) {
        parts.push(
          `${t(u.nameKey)} (${t(`owner.${u.owner}`)}) — ${t('panel.hp', { hp: u.hp, maxHp: u.maxHp })}`,
        );
      }
    }
  }
  if (!parts.length) {
    parts.push(`<span class="hint">${t('hint.idle')}</span>`);
  }
  panelEl.innerHTML = parts.join('<br>');
}

// --- boot ---

langSel.value = getLang();
document.documentElement.lang = getLang();
resize();
centerCamera();
advanceSelection();
refreshSelection();
updateUI();

function frame() {
  render(ctx, canvas, game, cam, view);
  requestAnimationFrame(frame);
}
frame();
