# 🏘️ Blocks CoMap - 3D Neighborhood Builder

Build 3D neighborhoods using 3×3×3 meter blocks on real-world maps with Minecraft-style physics.

## 🚀 Quick Start

```bash
npm install
npm run dev
# Open http://localhost:8080
```

## 📋 User Action Pipeline

### 1. Draw Boundary
**User Action:** Click points on map to draw boundary  
**Behind the Scenes:**
- `MapManager` captures click coordinates (lat/lng)
- Stores boundary points in polygon array
- Validates minimum 3 points for completion
- Calculates boundary area in km²

### 2. Generate Grid  
**User Action:** Click "Generate Grid"  
**Behind the Scenes:**
- `GridGenerator.generateGridPoints()` converts lat/lng boundary to 3×3m grid squares
- Uses haversine formula for accurate meter-based spacing
- `isPointInPolygon()` filters grid points inside boundary
- Creates grid data: `{id, lat, lng, gridX, gridY, blockHeight, color}`
- Dispatches `gridGenerated` event to 3D builder

### 3. Place Block
**User Action:** Click on grid square  
**Behind the Scenes:**
- `BlockBuilder.addOrStackBlock()` called with grid coordinates
- `validateBlockPlacement()` checks physics (needs support underneath or adjacent)
- If valid: creates THREE.js BoxGeometry (1×1×1 unit = 3×3×3 meters)
- Stores in blocks Map: `{mesh, position, yLevel, color, id}`
- Updates stats and triggers render

### 4. Stack Block  
**User Action:** Click top of existing block  
**Behind the Scenes:**
- Raycast detects click on block mesh
- `handleBlockClick()` determines top vs side based on Y coordinate
- `stackVertically()` finds highest block at X,Z position
- Creates new block at `yLevel + 1`
- Physics validation ensures support exists

### 5. Side Placement
**User Action:** Click side of existing block  
**Behind the Scenes:**
- `placeAdjacentBlock()` calculates adjacent position based on click offset
- Determines direction (N/S/E/W) from relative X,Z coordinates
- Places block at same Y level as clicked block
- Physics system validates adjacent support chain

### 6. Remove Block
**User Action:** Shift+click on block  
**Behind the Scenes:**
- `removeBlockByMesh()` removes block from scene and data
- `removeUnsupportedBlocks()` cascades through all blocks
- `hasSupport()` recursively checks each block's support chain
- Unsupported blocks removed automatically (gravity effect)

### 7. Physics Validation
**Behind the Scenes (Always Active):**
- Ground level blocks on original grid always supported
- `hasIndirectSupport()` recursively traces support chains
- Adjacent blocks can support each other horizontally
- `getAdjacentPositions()` checks N/S/E/W neighbors
- Circular reference prevention with visited set

## 🏗️ Architecture

```
├── js/
│   ├── mapManager.js      # Leaflet map, boundary drawing
│   ├── gridGenerator.js   # Lat/lng to 3D grid conversion  
│   ├── blockBuilder.js    # THREE.js 3D rendering & physics
│   └── app.js            # Event coordination
├── index.html            # UI layout
└── styles.css           # Styling
```

## 🎮 Controls

- **Left Click**: Place block / Stack / Build adjacent
- **Shift+Click**: Remove block (triggers physics cascade)  
- **Mouse Wheel**: Zoom (zoom out returns to starting view)
- **Mouse Drag**: Pan camera
- **Physics Button**: Toggle support requirements on/off

## 🔧 Key Classes

**MapManager**: Handles Leaflet map interactions and boundary polygon  
**GridGenerator**: Converts geographic boundaries to 3D grid coordinates  
**BlockBuilder**: THREE.js scene management, block physics, and rendering  

## 📐 Coordinate System

- **Real World**: 1 grid square = 3×3 meters
- **3D World**: 1 unit = 3 meters (so 1×1×1 block = 3×3×3m)
- **Grid Coordinates**: Integer X,Z positions
- **Y Levels**: Integer heights (0 = ground, 1 = first level up, etc.)

## 🧱 Physics Rules

1. **Ground Rule**: Blocks on original grid (Y=0) always supported
2. **Vertical Rule**: Blocks directly underneath provide support  
3. **Adjacent Rule**: Horizontal neighbors can provide support
4. **Chain Rule**: Support chains through connected blocks
5. **Cascade Rule**: Remove support → dependent blocks fall automatically

---

**Built with Leaflet.js, THREE.js, and vanilla JavaScript** 