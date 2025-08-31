coblocks
========

Interactive boundary-to-grid 3D builder with a map overlay.

Description
-----------
Draw a polygon on a Leaflet map, generate a snapped grid inside the boundary, and build in 3D with blocks using THREE.js. The experience includes camera modes (rotate/pan/build), cursor-centered zoom, a textured map overlay aligned to your boundary, animated water with an island skirt, and fast grid rendering via InstancedMesh.

Pipeline (high-level)
---------------------
1) Map boundary
- `js/mapManager.js` presents a Leaflet map and captures a polygon boundary and bounds.

2) Grid generation
- `js/gridGenerator.js` converts the boundary to grid cells and world coordinates in cooperative chunks.

3) Scene orchestration
- `js/app/blockBuilder.js` coordinates initialization in order:
  - `js/core/SceneManager.js` sets up THREE scene, camera, renderer, lighting, render loop.
  - `js/core/CameraController.js` configures camera modes and cursor-centered zoom.
  - `js/systems/GridRenderer.js` builds the InstancedMesh grid.
  - `js/systems/MapOverlay.js` creates the textured map overlay aligned to the boundary.
  - `js/systems/WaterSystem.js` generates the island skirt, water rings, and background dome; drives wave animation.
  - `js/systems/BlockSystem.js` manages block placement, stacking, physics validation, and stats.
  - `js/interaction/InteractionHandler.js` handles raycasting, hover indicators, block-face highlighting, and clicks.

4) Runtime
- Render loop lives in `SceneManager`; it defers to `blockBuilder.updateAnimations()` for water motion and requests renders on demand for performance.

Scripts by directory
--------------------
Core (`js/core/`)
- `SceneManager.js`: THREE scene, camera, renderer, lighting, resize, render loop, `requestRender()`.
- `CameraController.js`: camera modes (rotate/pan/build), cursor-centered wheel zoom, keyboard helpers, bounds.

Systems (`js/systems/`)
- `GridRenderer.js`: Instanced grid geometry/materials; fog and bounds helpers.
- `MapOverlay.js`: map texture capture/alignment, overlay mesh material/depth config.
- `WaterSystem.js`: water ring generation, skirt, dome, and wave animation parameters.
- `BlockSystem.js`: create/remove/stack blocks, support checks, height logic (thin surface cap handling), Y-positioning.

Interaction (`js/interaction/`)
- `InteractionHandler.js`: mouse/touch input, raycasting, grid hover (filled quad + edges), block-face outline.

App (`js/app/`)
- `blockBuilder.js`: central coordinator wiring core, systems, and interaction in the correct order.

App shell
- `index.html`: UI, script ordering.
- `styles.css`: layout and controls.
- `js/app.js`: stage flow (map → loading → builder), loading/progress UI, global events.
- `js/mapManager.js`: Leaflet boundary capture.
- `js/gridGenerator.js`: boundary to grid conversion.
