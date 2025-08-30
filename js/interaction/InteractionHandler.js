/**
 * InteractionHandler - Handles user interactions, mouse events, and hover effects
 * 
 * Manages:
 * - Mouse and touch event handling
 * - Raycasting for object selection
 * - Hover effects and visual feedback
 * - Block placement/removal interactions
 * - Color picker setup and management
 */
class InteractionHandler {
    constructor(sceneManager, cameraController, blockSystem) {
        this.sceneManager = sceneManager;
        this.cameraController = cameraController;
        this.blockSystem = blockSystem;
        
        // === Interaction State ===
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // === Visual Feedback ===
        this.hoveredObject = null;
        this.hoverMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffff88, 
            transparent: true, 
            opacity: 0.8 
        });
        this.originalMaterials = new Map();
        this.hoverIndicator = null;
        
        // === Grid Properties ===
        this.gridCellIndex = new Map();
        this.landBaseY = 0.5;
    }

    /**
     * Initialize all interaction handlers
     */
    setupInteractions() {
        this.setupMouseEvents();
        this.setupColorPicker();
        // Hover indicator will be created separately after grid setup
    }

    /**
     * Set up color picker functionality
     */
    setupColorPicker() {
        const colorPickerPopup = document.getElementById('colorPickerPopup');
        const closeBtn = document.getElementById('closeColorPicker');
        const colorPresets = document.querySelectorAll('.color-preset');
        const customColorInput = document.getElementById('customColorInput');
        
        // Close button functionality
        closeBtn.addEventListener('click', () => {
            colorPickerPopup.classList.add('hidden');
        });
        
        // Preset color selection
        colorPresets.forEach(preset => {
            preset.addEventListener('click', () => {
                // Remove selected class from all presets
                colorPresets.forEach(p => p.classList.remove('selected'));
                // Add selected class to clicked preset
                preset.classList.add('selected');
                // Update selected color
                const color = preset.dataset.color;
                this.blockSystem.setSelectedColor(color);
                // Update custom color input to match
                customColorInput.value = color;
                console.log('🎨 Color selected:', color);
            });
        });
        
        // Custom color input
        customColorInput.addEventListener('change', (e) => {
            this.blockSystem.setSelectedColor(e.target.value);
            // Remove selected class from all presets since we're using custom
            colorPresets.forEach(p => p.classList.remove('selected'));
            console.log('🎨 Custom color selected:', e.target.value);
        });
        
        // Set initial selected color (white)
        const whitePreset = document.querySelector('.color-preset[data-color="#ffffff"]');
        if (whitePreset) {
            whitePreset.classList.add('selected');
        }
        
        // Initially hide the popup
        colorPickerPopup.classList.add('hidden');
    }

    /**
     * Create hover indicator for grid cells
     */
    createHoverIndicator() {
        // Filled quad (prevents far-zoom line aliasing) + edge lines
        const quadGeom = new THREE.PlaneGeometry(this.blockSystem.blockSize, this.blockSystem.blockSize);
        const quadMat = new THREE.MeshBasicMaterial({
            color: 0x3a49ff,
            transparent: true,
            opacity: 0.16,
            depthTest: false,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const quad = new THREE.Mesh(quadGeom, quadMat);
        quad.rotation.x = -Math.PI / 2;
        quad.renderOrder = 3; // above grid/water but depth-tested against blocks
        
        const hoverGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.blockSystem.blockSize, this.blockSystem.blockSize));
        const hoverMat = new THREE.LineBasicMaterial({ 
            color: 0x4444ff, 
            transparent: true, 
            opacity: 0.9,
            depthTest: true
        });
        hoverMat.depthWrite = false;
        hoverMat.fog = false;
        const edges = new THREE.LineSegments(hoverGeom, hoverMat);
        edges.rotation.x = -Math.PI / 2;
        edges.renderOrder = 3;
        
        // Group both fill and edges
        const hover = new THREE.Group();
        hover.add(quad);
        hover.add(edges);
        hover.position.set(0, this.landBaseY + 0.03, 0); // slightly higher to avoid distant z-fight
        hover.visible = false;
        this.hoverIndicator = hover;
        this.sceneManager.add(this.hoverIndicator);
    }

    /**
     * Set up mouse event handlers
     */
    setupMouseEvents() {
        const domElement = this.sceneManager.getDomElement();
        if (!domElement) return;

        // Mouse move for hover effects
        domElement.addEventListener('mousemove', (event) => {
            this.updateMousePosition(event);
            this.handleHover();
        });

        // Clear hover when mouse leaves canvas
        domElement.addEventListener('mouseleave', () => {
            this.clearHover();
        });
        
        // Hide hover indicator when mode is not build
        document.addEventListener('click', () => {
            if (this.cameraController.cameraMode !== 'build') {
                this.clearHover();
            }
        });

        // Touch move tracking for mobile
        domElement.addEventListener('touchmove', (event) => {
            if (!event.touches || event.touches.length === 0) return;
            const t = event.touches[0];
            const rect = domElement.getBoundingClientRect();
            const x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
            this.cameraController.lastPointerNDC.set(x, y);
        }, { passive: true });

        // Mouse click for placing/removing blocks
        domElement.addEventListener('click', (event) => {
            this.handleClick(event);
        });
    }

    /**
     * Update mouse position for raycasting
     */
    updateMousePosition(event) {
        const rect = this.sceneManager.getDomElement().getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Track last pointer NDC for wheel/pinch
        this.cameraController.lastPointerNDC.set(this.mouse.x, this.mouse.y);
    }

    /**
     * Handle hover effects
     */
    handleHover() {
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        const planeHit = new THREE.Vector3();
        const hasPlane = this.raycaster.ray.intersectPlane(this.cameraController.groundPlane, planeHit);
        
        // First, try block-face hover
        const blockMeshes = this.blockSystem.getBlockMeshes();
        const intersects = this.raycaster.intersectObjects(blockMeshes);
        if (intersects.length > 0) {
            // Hide grid indicator while hovering blocks
            if (this.hoverIndicator) this.hoverIndicator.visible = false;
            this.setBlockEdgeHighlight(intersects[0]);
            return;
        } else {
            // Clear block face highlight when not hovering blocks
            this.clearBlockEdgeHighlight();
        }
        
        // Then try grid hover
        if (hasPlane) {
            const gx = Math.round(planeHit.x);
            const gz = Math.round(planeHit.z);
            const key = `${gx}_${gz}`;
            const gp = this.gridCellIndex.get(key);
            
            if (gp && this.hoverIndicator && this.cameraController.cameraMode === 'build') {
                this.hoverIndicator.visible = true;
                // Keep a safe lift to avoid distant z-fighting with map/water
                this.hoverIndicator.position.set(gx, this.landBaseY + 0.03, gz);
                this.hoveredObject = this.hoverIndicator;
                this.sceneManager.requestRender();
                return;
            }
        }
    }

    /**
     * Handle mouse clicks for block placement/removal
     */
    handleClick(event) {
        // Don't handle clicks if we're dragging
        if (event.target !== this.sceneManager.getDomElement()) return;
        
        // Only handle clicks in build mode
        if (this.cameraController.cameraMode !== 'build') return;
        
        this.updateMousePosition(event);

        // Raycast against blocks first
        this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
        const blockMeshes = this.blockSystem.getBlockMeshes();
        const intersects = this.raycaster.intersectObjects(blockMeshes);

        if (intersects.length > 0 && intersects[0].object.userData.blockData) {
            const intersectedObject = intersects[0].object;
            if (event.shiftKey) {
                this.blockSystem.removeBlockByMesh(intersectedObject);
            } else {
                this.handleBlockClick(intersectedObject, intersects[0], event);
            }
            return;
        }

        // Otherwise, place/remove based on ground-plane grid cell
        const planeHit = new THREE.Vector3();
        const hasPlane = this.raycaster.ray.intersectPlane(this.cameraController.groundPlane, planeHit);
        if (!hasPlane) return;
        
        const gx = Math.round(planeHit.x);
        const gz = Math.round(planeHit.z);
        const key = `${gx}_${gz}`;
        const gp = this.gridCellIndex.get(key);
        if (!gp) return;
        
        if (event.shiftKey) {
            this.blockSystem.removeBlock(gp);
        } else if (event.altKey) {
            this.blockSystem.placeBelowAtGrid(gp);
        } else {
            this.blockSystem.placeAtLowestAvailableAtGrid(gp);
        }
    }

    /**
     * Handle clicks on existing blocks
     */
    handleBlockClick(blockMesh, intersection, mouseEvent) {
        const blockData = blockMesh.userData.blockData;
        
        // Determine which face was clicked
        const face = this.determineClickedFace(blockMesh, intersection);
        switch (face) {
            case 'top':
                this.blockSystem.placeAboveBlock(blockData);
                break;
            case 'bottom':
                this.blockSystem.placeBelowBlock(blockData, { skipValidation: true });
                break;
            case 'east':
            case 'west':
            case 'north':
            case 'south':
                this.blockSystem.placeAdjacentBlock(blockData, intersection.point);
                break;
            default:
                this.blockSystem.placeAboveBlock(blockData);
        }
    }

    /**
     * Determine which face of a block was clicked
     */
    determineClickedFace(blockMesh, intersection) {
        if (intersection && intersection.face) {
            const n = intersection.face.normal;
            if (n.y > 0.8) return 'top';
            if (n.y < -0.8) return 'bottom';
            if (Math.abs(n.x) >= Math.abs(n.z)) {
                return n.x >= 0 ? 'east' : 'west';
            } else {
                return n.z >= 0 ? 'north' : 'south';
            }
        }
        
        // Fallback: infer from point relative to center
        const localPoint = intersection.point.clone();
        blockMesh.worldToLocal(localPoint);
        const half = this.blockSystem.blockSize / 2;
        const x = localPoint.x / half;
        const y = localPoint.y / half;
        const z = localPoint.z / half;
        
        if (y > 0.5) return 'top';
        if (y < -0.6) return 'bottom';
        if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 'east' : 'west';
        return z >= 0 ? 'north' : 'south';
    }

    /**
     * Set hover effect on object
     */
    setHover(object) {
        this.clearHover();
        
        this.hoveredObject = object;
        if (object && object.material) {
            // Store original material
            this.originalMaterials.set(object, object.material);
            // Apply hover material
            object.material = this.hoverMaterial;
            this.sceneManager.requestRender();
        }
    }

    /**
     * Clear hover effects
     */
    clearHover() {
        if (this.hoveredObject) {
            // Restore original material
            const originalMaterial = this.originalMaterials.get(this.hoveredObject);
            if (originalMaterial) {
                this.hoveredObject.material = originalMaterial;
                this.originalMaterials.delete(this.hoveredObject);
            }
            this.hoveredObject = null;
            this.sceneManager.requestRender();
        }
        
        // Hide hover indicator
        if (this.hoverIndicator) {
            this.hoverIndicator.visible = false;
        }
    }

    /**
     * Update grid cell index for fast lookups
     */
    updateGridCellIndex(gridData) {
        this.gridCellIndex.clear();
        gridData.forEach(gp => {
            this.gridCellIndex.set(`${gp.gridX}_${gp.gridY}`, gp);
        });
    }

    /**
     * Update ground plane position
     */
    updateGroundPlane(landBaseY) {
        this.landBaseY = landBaseY;
        // Ground plane is now managed by CameraController
        
        if (this.hoverIndicator) {
            this.hoverIndicator.position.y = landBaseY + 0.002;
        }
    }

    setBlockEdgeHighlight(intersection) {
        // Lazily create face outline helper (single reusable plane outline)
        if (!this._faceOutline) {
            const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.blockSystem.blockSize, this.blockSystem.blockSize));
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: true });
            edgeMat.depthWrite = false;
            const edge = new THREE.LineSegments(edgeGeom, edgeMat);
            edge.renderOrder = 3;
            this._faceOutline = edge;
            this.sceneManager.add(this._faceOutline);
        }
        this._faceOutline.visible = true;
        
        const object = intersection.object;
        const face = intersection.face;
        if (!object || !face) return;
        
        // Determine which axis the face belongs to using the dominant component of the normal
        const localNormal = face.normal.clone();
        // Map to world direction (blocks are axis-aligned, but keep robust)
        const worldNormal = localNormal.clone().transformDirection(object.matrixWorld).round();
        // Clamp to -1/0/1 to avoid tiny floats
        worldNormal.x = Math.sign(worldNormal.x);
        worldNormal.y = Math.sign(worldNormal.y);
        worldNormal.z = Math.sign(worldNormal.z);
        
        const blockSize = this.blockSystem.blockSize;
        const blockData = object.userData?.blockData;
        const blockHeight = (blockData && typeof blockData.height === 'number') ? blockData.height : blockSize;
        const halfSize = blockSize * 0.5;
        const halfHeight = blockHeight * 0.5;
        
        // Position at face center
        const center = object.position.clone();
        const offset = new THREE.Vector3(
            worldNormal.x !== 0 ? worldNormal.x * halfSize : 0,
            worldNormal.y !== 0 ? worldNormal.y * halfHeight : 0,
            worldNormal.z !== 0 ? worldNormal.z * halfSize : 0
        );
        const faceCenter = center.clone().add(offset);
        this._faceOutline.position.copy(faceCenter);
        
        // Orient outline to face and scale to match face size
        // Start with identity
        this._faceOutline.rotation.set(0, 0, 0);
        this._faceOutline.scale.set(1, 1, 1);
        
        // Default: plane is XY facing +Z. We rotate it so its normal matches face.
        if (worldNormal.y === 1) {
            // Top face: lie flat on top (match grid orientation)
            this._faceOutline.rotation.set(-Math.PI / 2, 0, 0);
            // XY plane size already blockSize x blockSize
            this._faceOutline.scale.set(1, 1, 1);
        } else if (worldNormal.y === -1) {
            // Bottom face
            this._faceOutline.rotation.set(Math.PI / 2, 0, 0);
            this._faceOutline.scale.set(1, 1, 1);
        } else if (worldNormal.z === 1) {
            // North (+Z) vertical face: plane normal +Z (no rot), height along Y
            this._faceOutline.rotation.set(0, 0, 0);
            this._faceOutline.scale.set(1, Math.max(0.001, blockHeight / blockSize), 1);
        } else if (worldNormal.z === -1) {
            // South (-Z)
            this._faceOutline.rotation.set(0, Math.PI, 0);
            this._faceOutline.scale.set(1, Math.max(0.001, blockHeight / blockSize), 1);
        } else if (worldNormal.x === 1) {
            // East (+X)
            this._faceOutline.rotation.set(0, -Math.PI / 2, 0);
            this._faceOutline.scale.set(1, Math.max(0.001, blockHeight / blockSize), 1);
        } else if (worldNormal.x === -1) {
            // West (-X)
            this._faceOutline.rotation.set(0, Math.PI / 2, 0);
            this._faceOutline.scale.set(1, Math.max(0.001, blockHeight / blockSize), 1);
        }
        
        this.sceneManager.requestRender();
    }
    
    clearBlockEdgeHighlight() {
        if (this._faceOutline) {
            this._faceOutline.visible = false;
            this.sceneManager.requestRender();
        }
    }
} 