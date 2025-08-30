/**
 * BlockBuilder - Main coordinator for the 3D building system
 * 
 * Orchestrates:
 * - Scene management and rendering
 * - Camera controls and interaction modes
 * - Block placement and physics system
 * - Map overlay and water effects
 * - User interaction handling
 */
class BlockBuilder {
    constructor() {
        // === Core Modules ===
        this.sceneManager = new SceneManager();
        this.mapOverlay = new MapOverlay(this.sceneManager);
        this.cameraController = new CameraController(this.sceneManager, this.mapOverlay);
        this.blockSystem = new BlockSystem(this.sceneManager);
        this.gridRenderer = new GridRenderer(this.sceneManager);
        this.waterSystem = new WaterSystem(this.sceneManager);
        this.interactionHandler = new InteractionHandler(this.sceneManager, this.cameraController, this.blockSystem);
        
        // === System State ===
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize the BlockBuilder system
     */
    init() {
        console.log('🏗️ Initializing BlockBuilder system...');
        
        // Listen for grid generation from GridGenerator
        window.addEventListener('gridGenerated', (event) => {
            this.setupGrid(event.detail.gridData, event.detail.gridSize, event.detail.bounds, event.detail.boundary);
        });

        // Initialize UI controls
        this.setupControls();
    }

    /**
     * Set up UI controls
     */
    setupControls() {
        // Controls are now handled by individual modules
        // This method exists for compatibility
    }

    /**
     * Set up the grid and initialize all systems
     */
    setupGrid(gridData, gridSize, bounds, boundary) {
        console.log('🏗️ BlockBuilder: Setting up grid...');
        console.log(`📊 Grid data: ${gridData.length} points`);
        console.log(`📏 Grid size: ${gridSize.width} × ${gridSize.height}`);
        
        if (!gridData || gridData.length === 0) {
            console.error('❌ No grid data received!');
            return;
        }
        
        if (!gridSize || gridSize.width === 0 || gridSize.height === 0) {
            console.error('❌ Invalid grid size!', gridSize);
            return;
        }
        
        const startTime = performance.now();
        
        // Initialize THREE.js if not already done
        if (!this.isInitialized) {
            console.log('🎮 Initializing Three.js scene...');
            this.sceneManager.initThreeJS();
            this.isInitialized = true;
        }
        
        // Update all modules with grid data
        this.sceneManager.updateGridSize(gridSize);
        this.cameraController.updateGridSize(gridSize);
        this.blockSystem.setupGrid(gridData, gridSize);
        
        // Set up visual systems in proper order (matching original)
        console.log('🔲 Creating base grid...');
        this.gridRenderer.createBaseGrid(gridData, gridSize);
        
        console.log('📷 Setting camera position...');
        this.cameraController.setCameraPosition();
        
        // Set up map overlay
        this.mapOverlay.setupMapOverlay(bounds, boundary);
        
        // Set up water and terrain effects with geographic data (after map overlay is ready)
        this.waterSystem.setGeographicData(bounds, boundary, this.mapOverlay.latSpacing, this.mapOverlay.lngSpacing);
        // Provide grid data to water system before creating skirt
        this.waterSystem.setupWaterSystem(gridData);
        
        // Create island skirt first, then water field with skirt exclusion (original order)
        this.waterSystem.createIslandSkirt({ rings: 3 });
        this.waterSystem.createWaterFieldWithSkirt(gridData);
        this.waterSystem.createBackgroundDome();
        
        // Set up interactions after everything is created
        this.interactionHandler.setupInteractions();
        this.interactionHandler.updateGridCellIndex(gridData);
        this.interactionHandler.updateGroundPlane(this.sceneManager.landBaseY);
        
        // Create hover indicator last, after grid is fully set up
        this.interactionHandler.createHoverIndicator();
        
        // Set up camera controls
        this.cameraController.setupCameraControls();
        
        // Update cursor style
        this.cameraController.updateCursorStyle();
        
        // Activate build mode by default
        this.activateBuildMode();
        
        const endTime = performance.now();
        console.log(`🏁 BlockBuilder: Grid setup completed in ${(endTime - startTime).toFixed(0)}ms`);
        
        // Hide placeholder
        const placeholder = document.querySelector('.placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }

    /**
     * Activate build mode
     */
    activateBuildMode() {
        this.cameraController.activateBuildMode();
    }

    /**
     * Toggle map overlay visibility
     */
    toggleMapOverlay() {
        this.mapOverlay.toggleMapOverlay();
    }

    /**
     * Save model data
     */
    saveModel() {
        if (window.gridGenerator) {
            const modelData = window.gridGenerator.exportModelData();
            
            const dataStr = JSON.stringify(modelData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'grid_model.json';
            link.click();
            
            URL.revokeObjectURL(url);
            
            console.log(`💾 Model saved: ${modelData.blocks.length} blocks in ${modelData.gridSize.width}×${modelData.gridSize.height} grid.`);
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        this.sceneManager.handleResize();
    }

    /**
     * Clear all blocks
     */
    clearAllBlocks() {
        this.blockSystem.clearAllBlocks();
        this.interactionHandler.clearHover();
    }

    /**
     * Toggle block physics
     */
    toggleBlockPhysics() {
        return this.blockSystem.toggleBlockPhysics();
    }

    /**
     * Zoom to fit all blocks
     */
    zoomToFitBlocks() {
        this.blockSystem.zoomToFitBlocks(this.cameraController);
    }

    /**
     * Reset camera to center
     */
    resetCameraToCenter() {
        this.cameraController.resetCameraToCenter();
    }

    /**
     * Set top-down view
     */
    setTopDownView() {
        this.cameraController.setTopDownView();
    }

    /**
     * Update animation systems
     */
    updateAnimations() {
        this.waterSystem.animateWater();
    }

    // === Compatibility Properties ===
    // These getters provide access to internal state for compatibility with existing code
    
    get scene() { return this.sceneManager.scene; }
    get camera() { return this.sceneManager.camera; }
    get renderer() { return this.sceneManager.renderer; }
    get needsRender() { return this.sceneManager.needsRender; }
    set needsRender(value) { this.sceneManager.needsRender = value; }
    get blocks() { return this.blockSystem.blocks; }
    get selectedColor() { return this.blockSystem.selectedColor; }
    set selectedColor(value) { this.blockSystem.setSelectedColor(value); }
    get gridData() { return this.gridRenderer.getGridData(); }
    get gridSize() { return this.gridRenderer.getGridSize(); }
    get cameraMode() { return this.cameraController.cameraMode; }
    get mapOverlayVisible() { return this.mapOverlay.mapOverlayVisible; }
} 