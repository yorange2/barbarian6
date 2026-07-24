export type Lang = 'en' | 'zh';
export type Params = Record<string, string | number>;

const STORAGE_KEY = 'barbarian6.lang';

const dictionaries: Record<Lang, Record<string, string>> = {
  en: {
    'turn': 'Turn {n}',
    'endTurn': 'End Turn ⏭',
    'endTurn.units': '⚠️ Units awaiting orders ({n})',
    'endTurn.city': '⚠️ Choose city production',
    'endTurn.force': 'Press Enter to end the turn anyway',
    'newGame': 'New Game',
    'banner.victory': '🏆 Victory! Every barbarian camp lies in ashes.',
    'banner.defeat': '💀 Defeat! Your warband has been wiped out.',

    'unit.warrior': '⚔️ Warrior',
    'unit.spearman': '🛡️ Spearman',
    'unit.archer': '🏹 Archer',
    'unit.horseman': '🏇 Horseman',
    'unit.scout': '🐎 Scout',
    'unit.settler': '🚩 Settler',
    'unit.builder': '🔨 Builder',
    'unit.barbarian': '🪓 Barbarian',
    'city': '🏛️ City',
    'owner.player': 'player',
    'owner.barbarian': 'barbarian',

    'improv.farm': '🌾 Farm',
    'improv.mine': '⛏️ Mine',
    'improv.lumber': '🪵 Lumber Camp',

    'terrain.water': 'Water',
    'terrain.grass': 'Grassland',
    'terrain.forest': 'Forest',
    'terrain.hills': 'Hills',
    'terrain.mountain': 'Mountain',
    'tile.moveCost': 'move cost {n}',
    'tile.impassable': 'impassable',
    'tile.camp': '⛺ barbarian camp',

    'panel.stats': 'HP {hp}/{maxHp} · MP {mp}/{maxMp} · STR {str}',
    'panel.hp': 'HP {hp}/{maxHp}',
    'panel.charges': 'charges {n}',
    'panel.pop': 'pop {n}',
    'panel.cityYields': '⚙ {prod} · 🌾 {food} per turn',
    'panel.growth': 'growth in {turns} turns',
    'panel.producing': 'Producing {item} — {turns} turns left',
    'panel.chooseProduction': 'Choose production:',
    'panel.prodOption': '{item} — {cost} ⚙ ({turns} turns)',
    'panel.requires': '{item} — requires {tech}',
    'panel.science': '🧪 {n} science per turn',
    'action.foundCity': '🏛️ Found City',
    'action.build': 'Build {improv}',
    'reason.tooClose': 'Cannot found a city here — too close to another city (3 hexes required).',
    'reason.outsideTerritory': 'Improvements can only be built inside your territory (blue border).',
    'research.idle': '🧪 Choose research',
    'research.current': '🧪 {tech} ({turns} turns)',
    'tech.option': '{tech} — {cost} 🧪 ({turns} turns)',
    'tech.mining': 'Mining',
    'tech.mining.desc': 'Unlocks the ⛏️ Mine improvement on hills.',
    'tech.archery': 'Archery',
    'tech.archery.desc': 'Unlocks the 🏹 Archer — ranged, strikes 2 hexes away with no retaliation.',
    'tech.bronze': 'Bronze Working',
    'tech.bronze.desc': 'Unlocks the 🛡️ Spearman, a strong melee unit.',
    'tech.wheel': 'The Wheel',
    'tech.wheel.desc': 'Unlocks the 🏇 Horseman, fast cavalry with 4 movement.',
    'tech.masonry': 'Masonry',
    'tech.masonry.desc': 'City walls: all cities gain +10 HP and +3 strength.',
    'hint.selected': 'Click a highlighted hex to move, a red-ringed enemy to attack.',
    'hint.idle': 'Click a unit or city to select it. Drag to pan, scroll to zoom, Enter ends the turn.',

    'log.intro': 'Raze every barbarian camp ⛺ and slay the barbarians. Do not die.',
    'log.razed': '⛺ {unit} razed a barbarian camp!',
    'log.hit': '{att} hits {def} for {dmg}.',
    'log.retaliate': '{def} strikes back for {dmg}.',
    'log.dies': '{unit} dies!',
    'log.spawn': '⛺ A new barbarian emerges from a camp!',
    'log.cityFounded': '🏛️ A new city has been founded!',
    'log.built': '{unit} built {improv}.',
    'log.produced': '🏛️ The city finished {item}.',
    'log.cityRazed': '🔥 A city was razed by barbarians!',
    'log.growth': '🏛️ A city grew to population {n}!',
    'log.borders': '🏛️ City borders have expanded!',
    'log.research': '🧪 Research complete: {tech}!',
  },
  zh: {
    'turn': '第 {n} 回合',
    'endTurn': '结束回合 ⏭',
    'endTurn.units': '⚠️ 单位待命（{n}）',
    'endTurn.city': '⚠️ 城市待选生产',
    'endTurn.force': '按回车可直接结束回合',
    'newGame': '新游戏',
    'banner.victory': '🏆 胜利！所有蛮族营地已化为灰烬。',
    'banner.defeat': '💀 战败！你的战团全军覆没。',

    'unit.warrior': '⚔️ 勇士',
    'unit.spearman': '🛡️ 长矛兵',
    'unit.archer': '🏹 弓箭手',
    'unit.horseman': '🏇 骑手',
    'unit.scout': '🐎 斥候',
    'unit.settler': '🚩 开拓者',
    'unit.builder': '🔨 建造者',
    'unit.barbarian': '🪓 蛮族战士',
    'city': '🏛️ 城市',
    'owner.player': '玩家',
    'owner.barbarian': '蛮族',

    'improv.farm': '🌾 农场',
    'improv.mine': '⛏️ 矿场',
    'improv.lumber': '🪵 伐木场',

    'terrain.water': '水域',
    'terrain.grass': '草原',
    'terrain.forest': '森林',
    'terrain.hills': '丘陵',
    'terrain.mountain': '山脉',
    'tile.moveCost': '移动消耗 {n}',
    'tile.impassable': '无法通行',
    'tile.camp': '⛺ 蛮族营地',

    'panel.stats': '生命 {hp}/{maxHp} · 移动 {mp}/{maxMp} · 战力 {str}',
    'panel.hp': '生命 {hp}/{maxHp}',
    'panel.charges': '剩余次数 {n}',
    'panel.pop': '人口 {n}',
    'panel.cityYields': '每回合 ⚙ {prod} · 🌾 {food}',
    'panel.growth': '{turns} 回合后人口 +1',
    'panel.producing': '正在生产 {item}，剩余 {turns} 回合',
    'panel.chooseProduction': '选择生产项目：',
    'panel.prodOption': '{item} — {cost} ⚙（{turns} 回合）',
    'panel.requires': '{item} — 需要{tech}',
    'panel.science': '🧪 每回合 {n} 科研',
    'action.foundCity': '🏛️ 建立城市',
    'action.build': '建造{improv}',
    'reason.tooClose': '无法在此建城——离其他城市太近（需相距 3 格）。',
    'reason.outsideTerritory': '只能在己方领土（蓝色边界）内建造改良设施。',
    'research.idle': '🧪 选择科技',
    'research.current': '🧪 {tech}（剩 {turns} 回合）',
    'tech.option': '{tech} — {cost} 🧪（{turns} 回合）',
    'tech.mining': '采矿',
    'tech.mining.desc': '解锁丘陵上的 ⛏️ 矿场。',
    'tech.archery': '箭术',
    'tech.archery.desc': '解锁 🏹 弓箭手——射程 2 格的远程单位，攻击不受反击。',
    'tech.bronze': '青铜器',
    'tech.bronze.desc': '解锁强力近战单位 🛡️ 长矛兵。',
    'tech.wheel': '轮子',
    'tech.wheel.desc': '解锁 🏇 骑手，拥有 4 点移动力的快速骑兵。',
    'tech.masonry': '砖石建筑',
    'tech.masonry.desc': '城墙：所有城市 +10 生命、+3 战力。',
    'hint.selected': '点击高亮格子移动，点击红圈敌人发起攻击。',
    'hint.idle': '点击单位或城市以选中。拖动平移地图，滚轮缩放，回车键结束回合。',

    'log.intro': '摧毁所有蛮族营地 ⛺ 并消灭蛮族。不要全军覆没。',
    'log.razed': '⛺ {unit} 摧毁了一座蛮族营地！',
    'log.hit': '{att} 对 {def} 造成 {dmg} 点伤害。',
    'log.retaliate': '{def} 反击，造成 {dmg} 点伤害。',
    'log.dies': '{unit} 阵亡！',
    'log.spawn': '⛺ 营地中又出现了一个蛮族战士！',
    'log.cityFounded': '🏛️ 一座新城市建立了！',
    'log.built': '{unit} 建造了{improv}。',
    'log.produced': '🏛️ 城市完成了 {item} 的生产。',
    'log.cityRazed': '🔥 一座城市被蛮族夷为平地！',
    'log.growth': '🏛️ 城市人口增长到 {n}！',
    'log.borders': '🏛️ 城市边界扩张了！',
    'log.research': '🧪 研究完成：{tech}！',
  },
};

function detect(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'zh') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let lang: Lang = detect();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  localStorage.setItem(STORAGE_KEY, l);
}

/**
 * Translate a key, interpolating {placeholders}. String params that are
 * themselves dictionary keys (e.g. 'unit.warrior') are translated too, so
 * game logic can store keys instead of display text.
 */
export function t(key: string, params?: Params): string {
  let s = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const val =
        typeof v === 'string' && v in dictionaries.en ? t(v) : String(v);
      s = s.replaceAll(`{${k}}`, val);
    }
  }
  return s;
}
