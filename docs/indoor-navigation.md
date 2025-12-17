# Indoor Navigation (MVP)

This repo includes an indoor navigation demo (Google Maps-like UX) using:

- 2D floorplan: `assets/floorplans/neue_plan.png`
- 3D model: `assets/wg.glb`
- Walkable graph (paths + POIs): `assets/graphs/neue.graph.json`

## Coordinate Frames

We use a single “plan meters” coordinate frame throughout:

- **Plan pixels (PNG)**: origin at the image **top-left**, `x` right, `y` down.
- **Plan meters**: same axes as pixels; conversion via `pixelsPerMeter`:
  - `meters.x = pixels.x / pixelsPerMeter`
  - `meters.y = pixels.y / pixelsPerMeter`
- **3D world (Three.js)**:
  - `world.x = meters.x`
  - `world.z = meters.y`
  - `world.y = up`

Heading convention:

- `0°` points “up” on the plan (towards **-Y** in meters / **-Z** in 3D).
- `90°` points right (+X).

## Walkable Graph Format

The graph is currently a plain JSON object matching `StoreMap` (`navigation/storeMap.ts`):

- `nodes[]`: `{ id, label, x, y, floor, type }`
- `edges[]`: `{ from, to, distance?, bidirectional? }`
- `anchors[]` (optional): Wi‑Fi anchors `{ bssid, label, x, y, floor, source, confidence? }`

Example path node:

```json
{ "id": "w3", "label": "Main Junction", "x": 9.2, "y": 6.5, "floor": 0, "type": "walkway" }
```

## Editing Workflow (Manual)

1. Open `assets/graphs/neue.graph.json`
2. Add / move nodes by editing `x,y` (meters in plan frame)
3. Add `edges` between walkable nodes (`walkway`, `entry`, `exit`, `poi`)
4. Restart the app

Tip: in the app, switch the House map to **2D** and use the “Scale (px/m)” control to calibrate the map overlay before fine-tuning graph coordinates.

## Positioning Backends

Implemented in `positioning/useIndoorPositioning.ts`:

- **iOS**: PDR-only (step detection + heading integration) + map matching (snap-to-graph). Wi‑Fi positioning is disabled.
- **Android / others**: PDR + Wi‑Fi correction (2D Kalman update) + map matching.

## Navigation Behavior

Implemented in `nav/useIndoorNavigation.ts` + `nav/turnByTurn.ts`:

- Blue dot + heading cone
- Follow camera (2D/3D)
- Route polyline (shortest path on graph)
- Turn-by-turn maneuvers (“In Xm, turn left/right”)
- Off-route detection + reroute (distance-to-route threshold over a time window)

## Testing

On the Nav tab → House Plan:

1. Switch map to **2D** (optional) and set Tool=**Start**, then tap the plan to set a known start.
2. Start **PDR**.
3. Pick a POI destination and start navigation.

Notes:

- iOS runs **PDR-only** (no Wi‑Fi positioning).
- Non‑iOS can enable `Wi‑Fi corr` to reduce drift (requires anchors + a dev client for Wi‑Fi scans).
