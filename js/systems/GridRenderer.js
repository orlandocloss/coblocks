/**
 * GridRenderer - Handles high-performance grid rendering and visualization
 * 
 * Manages:
 * - Instanced mesh grid rendering for performance
 * - Grid cell indexing and fast lookups
 * - Fog and visual effects for large grids
 * - Grid bounds calculation and positioning
 */
class GridRenderer {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // === Grid Rendering ===
        this.instancedGridMesh = null;
        this.instanceIdToGridPoint = [];
        this.gridCellIndex = new Map(); // "x_z" -> gridPoint for O(1) lookup
        this.baseGrid = null;
        
        // === Grid Properties ===
        this.gridData = [];
        this.gridSize = { width: 0, height: 0 };
        this.blockSize = 1.0;
        this.gridSpacing = 1.0;
        this.landBaseY = 0.5;
    }

    /**
     * Create the base grid visualization
     */
    createBaseGrid(gridData, gridSize) {
        console.log(`🔲 Creating base grid for ${gridData.length} squares...`);
        
        this.gridData = gridData;
        this.gridSize = gridSize;
        
        // Remove existing grid
        this.cleanup();
        
        // Prepare fast index
        this.gridCellIndex.clear();
        this.instanceIdToGridPoint = [];
        this.gridData.forEach(gp => {
            this.gridCellIndex.set(`${gp.gridX}_${gp.gridY}`, gp);
        });
        
        // Create instanced mesh for all grid squares
        const geometry = new THREE.PlaneGeometry(this.blockSize, this.blockSize);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
        });
        material.blending = THREE.NormalBlending;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
        
        const count = this.gridData.length;
        let instanced;
        
        try {
            instanced = new THREE.InstancedMesh(geometry, material, count);
        } catch (error) {
            console.error('❌ Failed to create instanced mesh:', error);
            alert('This selection is too large for the map to handle right now and caused an error. Please restart and try a smaller area.');
            return null;
        }
        
        // Position each grid square
        const tempMatrix = new THREE.Matrix4();
        const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        
        for (let i = 0; i < count; i++) {
            const gp = this.gridData[i];
            tempMatrix.identity();
            tempMatrix.multiply(rotation);
            tempMatrix.setPosition(gp.gridX, this.landBaseY, gp.gridY);
            instanced.setMatrixAt(i, tempMatrix);
            this.instanceIdToGridPoint[i] = gp;
        }
        
        instanced.instanceMatrix.needsUpdate = true;
        instanced.renderOrder = 2; // draw after water and map overlay
        this.instancedGridMesh = instanced;
        this.sceneManager.add(this.instancedGridMesh);
        
        // Set up fog for large grids
        this.setupFog();
        
        this.sceneManager.requestRender();
        return instanced;
    }

    /**
     * Set up fog based on grid size
     */
    setupFog() {
        // Calculate grid bounds for fog
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < this.gridData.length; i++) {
            const gp = this.gridData[i];
            if (gp.gridX < minX) minX = gp.gridX;
            if (gp.gridX > maxX) maxX = gp.gridX;
            if (gp.gridY < minZ) minZ = gp.gridY;
            if (gp.gridY > maxZ) maxZ = gp.gridY;
        }
        
        // Set up fog tuned to grid size
        const sizeHint = Math.max(20, Math.max(maxX - minX, maxZ - minZ));
        const fogNear = sizeHint * 1.3;
        const fogFar = sizeHint * 3.6;
        this.sceneManager.scene.fog = new THREE.Fog(0xe8f0f8, fogNear, fogFar);
    }

    /**
     * Calculate grid bounds in world coordinates
     */
    calculateGridBounds() {
        if (!this.gridData || this.gridData.length === 0) {
            return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 1, height: 1, centerX: 0, centerZ: 0 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        this.gridData.forEach(point => {
            if (point.gridX < minX) minX = point.gridX;
            if (point.gridX > maxX) maxX = point.gridX;
            if (point.gridY < minZ) minZ = point.gridY;
            if (point.gridY > maxZ) maxZ = point.gridY;
        });
        
        return {
            minX, maxX, minZ, maxZ,
            width: (maxX - minX + 1) * this.gridSpacing,
            height: (maxZ - minZ + 1) * this.gridSpacing,
            centerX: (minX + maxX) * this.gridSpacing / 2,
            centerZ: (minZ + maxZ) * this.gridSpacing / 2
        };
    }

    /**
     * Get grid cell by coordinates
     */
    getGridCell(x, z) {
        const key = `${x}_${z}`;
        return this.gridCellIndex.get(key);
    }

    /**
     * Check if coordinates are on the grid
     */
    isOnGrid(x, z) {
        const key = `${x}_${z}`;
        return this.gridCellIndex.has(key);
    }

    /**
     * Get all grid data
     */
    getGridData() {
        return this.gridData;
    }

    /**
     * Get grid size
     */
    getGridSize() {
        return this.gridSize;
    }

    /**
     * Clean up grid resources
     */
    cleanup() {
        if (this.baseGrid) {
            this.sceneManager.remove(this.baseGrid);
            this.baseGrid = null;
        }
        
        if (this.instancedGridMesh) {
            this.sceneManager.remove(this.instancedGridMesh);
            this.instancedGridMesh.geometry?.dispose?.();
            this.instancedGridMesh.material?.dispose?.();
            this.instancedGridMesh = null;
        }
    }
} 