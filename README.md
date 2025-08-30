coblocks
========

Interactive boundary-to-grid builder with map overlay and 3D blocks.

- Draw a boundary on a Leaflet map
- Generate a 3×3m grid within that outline
- Build in 3D with blocks using THREE.js (stack, sides, underneath)
- Toggle a map texture overlay aligned to the boundary
- Smooth camera modes (rotate, pan, build) and cursor-centered zoom
- Optimized for huge grids via InstancedMesh; loading has a safe timeout

Quick start
----------

Prereqs: Node.js (for deps) or a simple static server.

1) Install dependencies (optional; libs are CDN-loaded):

```
npm install
```

2) Start a static server from the project root (choose one):

- Python
```
python3 -m http.server 8080
```
- Node (serve)
```
npx serve -l 8080
```

3) Open in a browser:
```
http://127.0.0.1:8080
```

How to use
----------

1) Map stage
- Draw your boundary by clicking on the map
- Click the generate button (UI handles transition)

2) Loading stage
- A single progress bar shows generation
- Very large selections will auto-timeout (~15s) and ask to restart

3) Builder stage
- Camera mode buttons:
  - Rotate: orbit around the grid (cursor: all-scroll; drag: move)
  - Pan: drag to move horizontally (cursor: move)
  - Build: place/remove blocks (cursor: crosshair)
- Map toggle: show/hide overlay texture aligned to your boundary
- Color picker: pops up in build mode for block colors
- Zoom: wheel zoom centers on the cursor; zooming out recenters to the initial overview

Controls (mouse)
----------------
- Left drag (Rotate mode): orbit view
- Left drag (Pan mode): move view horizontally
- Left click (Build mode): place on top/sides/below based on clicked face
- Wheel: zoom to cursor; far zoom returns toward the starting view

Performance
-----------
- Grid rendering uses THREE.InstancedMesh for high performance
- Designed to handle very large grids; ultimately limited by browser/GPU memory
- Loading uses cooperative chunking and a timeout, so the UI stays responsive

Tech stack
----------
- Leaflet.js (map, boundary drawing)
- THREE.js (3D scene, blocks, grid, textures)
- html2canvas (map capture when needed)
- Vanilla JS, no frameworks

Project structure
-----------------
- `index.html` — stages, controls, scripts
- `styles.css` — UI, loading bar, controls
- `js/mapManager.js` — Leaflet map, boundary capture
- `js/gridGenerator.js` — boundary → grid generation (cooperative, chunked)
- `js/blockBuilder.js` — THREE.js scene, blocks, overlay, camera, input
- `js/app.js` — stage management, loading bar, global events
-------
