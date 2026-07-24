# 🪓 Barbarian 6

A simplified Civilization-style hex strategy game for the browser. Raze every
barbarian camp and slay the barbarians before they wipe out your warband.

## Run it

```sh
npm install
npm run dev      # dev server with hot reload
npm run build    # production build in dist/ (deployable to GitHub Pages / itch.io)
```

## How to play

- **Click** one of your units (blue) to select it; highlighted hexes are where it can move this turn.
- **Click** a red-ringed adjacent enemy to attack (defender strikes back).
- **Drag** to pan the map, **scroll** to zoom, **Enter** (or the button) ends the turn.
- Forests and hills cost 2 movement; water and mountains are impassable.
- Camps ⛺ spawn a new barbarian every 6 turns — raze them by moving onto them.

## Code layout

| File | What it does |
| --- | --- |
| `src/hex.ts` | Axial hex-coordinate math (see [Red Blob Games](https://www.redblobgames.com/grids/hexagons/)) |
| `src/map.ts` | Terrain types and random map generation |
| `src/game.ts` | Game rules: units, movement, combat, barbarian AI, win/lose |
| `src/render.ts` | Canvas 2D rendering of the map, units, and highlights |
| `src/main.ts` | Input handling, camera, and DOM UI wiring |
