/**
 * BlockBuilder - 3D block building system with Minecraft-style physics
 * 
 * Handles:
 * - THREE.js scene management and rendering
 * - Block placement, stacking, and removal
 * - Physics validation (support requirements)
 * - Camera controls and user interaction
 * - Real-world scale: 1 unit = 3 meters
 */
class BlockBuilder {
    constructor() {
        // === THREE.js Core Components ===
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // === Grid and Block Data ===
        this.gridData = [];                          // Grid points from generator
        this.blocks = new Map();                     // Block storage: "x_y_z" -> blockData
        this.gridSize = { width: 0, height: 0 };    // Grid dimensions in squares
        this.baseGrid = null;                        // Visual grid planes
        
        // === Geographic Map Overlay ===
        this.originalBounds = null;                  // Original lat/lng bounds from map
        this.originalBoundary = null;                // Original boundary points from map
        this.mapOverlayPlane = null;                 // 3D plane mesh with map texture
        this.mapOverlayVisible = true;               // Default map overlay to visible
        this.mapTexture = null;                      // Map texture for 3D plane
        this.capturedMapCanvas = null;               // Pre-captured map canvas from MapManager
        
        // === User Interaction ===
        this.selectedColor = '#ffffff';              // Currently selected block color
        this.raycaster = new THREE.Raycaster();      // Mouse picking
        this.mouse = new THREE.Vector2();            // Mouse coordinates
        
        // === Visual Feedback ===
        this.hoveredObject = null;                   // Currently hovered object
        this.hoverMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffff88, 
            transparent: true, 
            opacity: 0.8 
        });
        this.originalMaterials = new Map();          // Store original materials for hover
        
        // === Physics & Scale ===
        this.blockSize = 1.0;                        // Block size: 1 unit = 3 meters
        this.gridSpacing = 1.0;                      // Grid spacing: 1 unit = 3 meters  
        this.enableBlockPhysics = true;              // Require block support
        
        // === System State ===
        this.isInitialized = false;                  // THREE.js initialization flag
        this.needsRender = true;                     // Render flag for performance
        this.isWheelZooming = false;                // Guard to avoid boundary clamps during wheel zoom
        
        // === Boundary Overlay (projected into grid coords) ===
        this.boundaryLine = null;                    // THREE.Line for exact boundary outline
        this.latSpacing = null;                      // Latitude degrees per 3m
        this.lngSpacing = null;                      // Longitude degrees per 3m (at avg lat)
        this.capturedTextureBounds = null;           // Geographic bounds of captured map texture
        
        // === High-performance grid rendering and picking ===
        this.instancedGridMesh = null;              // Instanced mesh for grid squares
        this.instanceIdToGridPoint = [];            // Map instanceId -> gridPoint
        this.gridCellIndex = new Map();             // "x_z" -> gridPoint for O(1) lookup
        this.hoverIndicator = null;                 // Wireframe square for hover feedback
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane
        this.lastPointerNDC = new THREE.Vector2(0, 0); // Track last pointer for wheel
        this.cameraTarget = new THREE.Vector3(0, 0, 0); // Fallback target when no OrbitControls
        this.minDistance = 3;
        this.maxDistance = 100;
        this.cameraMode = null; // Current camera mode: 'rotate', 'pan', 'build', null (none selected)
        this.isRotating = false;
        this.isPanning = false;
        this.lastMouse = { x: 0, y: 0 };
        this.rotationSpeed = 0.005;
        this.panSpeed = 0.001;
        this.initialCameraState = null; // Store starting camera position and target
        
        this.init();
    }

    // =====================================
    // INITIALIZATION
    // =====================================

    /**
     * Initialize the BlockBuilder system
     * Sets up event listeners and UI components
     */
    init() {
        // Listen for grid generation from GridGenerator
        window.addEventListener('gridGenerated', (event) => {
            this.setupGrid(event.detail.gridData, event.detail.gridSize, event.detail.bounds, event.detail.boundary);
        });

        // Listen for captured map texture from MapManager
        window.addEventListener('mapTextureCaptured', (event) => {
            console.log('BlockBuilder: Received captured map texture');
            this.capturedMapCanvas = event.detail.canvas;
            // Optional: use capture bounds if provided for sizing/position
            if (event.detail.bounds) {
                this.capturedTextureBounds = event.detail.bounds;
            }
        });

        this.setupControls();
        this.setupCameraModeControls();
        this.setupColorPicker();
    }

    setupControls() {
        // Map overlay toggle button - use a delay to ensure DOM is ready
        setTimeout(() => {
            const mapOverlayBtn = document.getElementById('toggleMapOverlay');
            console.log('🔍 Map overlay button found:', mapOverlayBtn);
            if (mapOverlayBtn) {
                mapOverlayBtn.addEventListener('click', () => {
                    console.log('🖱️ Map overlay button clicked');
                    this.toggleMapOverlay();
                });
                console.log('✅ Map overlay button event listener added');
            } else {
                console.warn('⚠️ Map overlay button not found');
            }
        }, 200);
        
        // Color palette is handled in setupColorPalette()
    }

    setupCameraModeControls() {
        const modeButtons = document.querySelectorAll('.mode-btn');
        const colorPickerPopup = document.getElementById('colorPickerPopup');
        
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active from all buttons
                modeButtons.forEach(b => b.classList.remove('active'));
                // Set clicked button as active
                btn.classList.add('active');
                // Update camera mode
                this.cameraMode = btn.dataset.mode;
                console.log('📷 Camera mode changed to:', this.cameraMode);
                
                // Show/hide color picker based on mode
                if (this.cameraMode === 'build') {
                    colorPickerPopup.classList.remove('hidden');
                } else {
                    colorPickerPopup.classList.add('hidden');
                }
                
                // Update cursor style
                this.updateCursorStyle();
            });
        });
    }

    /**
     * Activate build mode when entering the builder stage
     */
    activateBuildMode() {
        const buildButton = document.querySelector('.mode-btn[data-mode="build"]');
        const colorPickerPopup = document.getElementById('colorPickerPopup');
        
        // Set build mode as active
        this.cameraMode = 'build';
        
        // Update UI to reflect build mode
        if (buildButton) {
            // Remove active from all buttons first
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            buildButton.classList.add('active');
        }
        if (colorPickerPopup) {
            colorPickerPopup.classList.remove('hidden');
        }
        
        // Update cursor style
        this.updateCursorStyle();
    }

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
                this.selectedColor = preset.dataset.color;
                // Update custom color input to match
                customColorInput.value = this.selectedColor;
                console.log('🎨 Color selected:', this.selectedColor);
            });
        });
        
        // Custom color input
        customColorInput.addEventListener('change', (e) => {
            this.selectedColor = e.target.value;
            // Remove selected class from all presets since we're using custom
            colorPresets.forEach(p => p.classList.remove('selected'));
            console.log('🎨 Custom color selected:', this.selectedColor);
        });
        
        // Set initial selected color (white)
        const whitePreset = document.querySelector('.color-preset[data-color="#ffffff"]');
        if (whitePreset) {
            whitePreset.classList.add('selected');
        }
        
        // Initially hide the popup - it will show when build mode is selected
        colorPickerPopup.classList.add('hidden');
    }

    updateCursorStyle() {
        // Don't update cursor if renderer isn't initialized yet
        if (!this.renderer || !this.renderer.domElement) {
            return;
        }
        
        const canvas = this.renderer.domElement;
        switch (this.cameraMode) {
            case 'rotate':
                canvas.style.cursor = 'all-scroll';
                break;
            case 'pan':
                canvas.style.cursor = 'move';
                break;
            case 'build':
                canvas.style.cursor = 'crosshair';
                break;
            default:
                canvas.style.cursor = 'default';
                break;
        }
    }
    
    setupGrid(gridData, gridSize, bounds, boundary) {
        console.log('🏗️ BlockBuilder: Setting up grid...');
        console.log(`📊 Grid data: ${gridData.length} points`);
        console.log(`📏 Grid size: ${gridSize.width} × ${gridSize.height}`);
        console.log('🗺️ Received bounds:', bounds);
        console.log('🔲 Received boundary:', boundary);
        
        if (!gridData || gridData.length === 0) {
            console.error('❌ No grid data received!');
            return;
        }
        
        if (!gridSize || gridSize.width === 0 || gridSize.height === 0) {
            console.error('❌ Invalid grid size!', gridSize);
            return;
        }
        
        const startTime = performance.now();
        
        this.gridData = gridData;
        this.gridSize = gridSize;
        this.originalBounds = bounds;
        this.originalBoundary = boundary;
        
        // Compute geographic spacings to match GridGenerator (3m steps)
        console.log('🌍 Computing geographic spacings...');
        this.computeGeographicSpacings(bounds);
        
        console.log('✅ Stored bounds and computed spacings');
        
        if (!this.isInitialized) {
            console.log('🎮 Initializing Three.js scene...');
            this.initThreeJS();
        }
        
        console.log('🔲 Creating base grid...');
        const gridStartTime = performance.now();
        this.createBaseGrid();
        const gridEndTime = performance.now();
        console.log(`✅ Base grid created in ${(gridEndTime - gridStartTime).toFixed(0)}ms`);
        
        // Extend camera far plane to fit very large grids to avoid background covering
        if (this.camera && this.gridSize) {
            const maxDim = Math.max(this.gridSize.width, this.gridSize.height);
            const desiredFar = Math.max(5000, maxDim * 10);
            if (this.camera.far < desiredFar) {
                this.camera.far = desiredFar;
                this.camera.updateProjectionMatrix();
            }
        }
        
        console.log('📷 Setting camera position...');
        this.setCameraPosition();
        
        // Create or update the precise boundary overlay on the grid
        this.createBoundaryLine();
        
        // Auto-show map overlay by default
        setTimeout(() => {
            this.showMapOverlay();
            const button = document.getElementById('toggleMapOverlay');
            if (button) {
                button.classList.add('active');
            }
        }, 500);
        
        // Update camera controls now that we have grid size
        if (this.controls && this.gridCenter) {
            this.controls.target.copy(this.gridCenter);
            // Update max distance to match center button
            this.controls.maxDistance = Math.max(this.gridSize.width, this.gridSize.height) * 1.2;
            this.controls.update();
            // Enforce boundaries now that we have grid size
            this.enforceBoundariesWithUpdate();
        } else if (!this.controls && this.currentTarget) {
            // For basic controls, update the target
            this.currentTarget.copy(this.gridCenter);
        }
        
        this.updateStats();
        this.needsRender = true;
        
        console.log('BlockBuilder: Grid setup complete, 3D scene ready');
        
        // Hide placeholder
        const placeholder = document.querySelector('.placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }

    /**
     * Compute degree spacings for 3m steps based on current bounds
     * Matches GridGenerator's spacing
     */
    computeGeographicSpacings(bounds) {
        if (!bounds) return;
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const avgLat = (north + south) / 2;
        this.latSpacing = 3 / 111000;
        this.lngSpacing = 3 / (111000 * Math.cos(avgLat * Math.PI / 180));
    }

    /**
     * Project a Leaflet LatLng point into grid X,Z coordinates
     */
    projectLatLngToGrid(point) {
        if (!this.originalBounds || this.latSpacing == null || this.lngSpacing == null) return null;
        const north = this.originalBounds.getNorth();
        const west = this.originalBounds.getWest();
        const x = (point.lng - west) / this.lngSpacing; // grid columns eastward
        const z = (north - point.lat) / this.latSpacing; // grid rows southward
        return new THREE.Vector3(x, 0.02, z);
    }

    /**
     * Create or update a THREE.LineLoop that traces the exact user boundary on the grid
     */
    createBoundaryLine() {
        try {
            // Remove previous line if any
            this.destroyBoundaryLine();
            
            if (!this.originalBoundary || this.originalBoundary.length < 2) return;
            
            const points3D = [];
            this.originalBoundary.forEach((pt) => {
                const p = this.projectLatLngToGrid(pt);
                if (p) points3D.push(p);
            });
            if (points3D.length < 2) return;
            
            // Close the loop
            points3D.push(points3D[0].clone());
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
            const material = new THREE.LineBasicMaterial({ color: 0x667eea, linewidth: 2, transparent: true, opacity: 0.95 });
            this.boundaryLine = new THREE.Line(geometry, material);
            this.boundaryLine.renderOrder = 2;
            
            if (this.scene) {
                this.scene.add(this.boundaryLine);
                this.needsRender = true;
            }
        } catch (err) {
            console.error('Failed to create boundary line:', err);
        }
    }

    /**
     * Remove the boundary line from the scene
     */
    destroyBoundaryLine() {
        if (this.boundaryLine && this.scene) {
            this.scene.remove(this.boundaryLine);
            if (this.boundaryLine.geometry) this.boundaryLine.geometry.dispose();
            if (this.boundaryLine.material) this.boundaryLine.material.dispose();
            this.boundaryLine = null;
        }
    }

    initThreeJS() {
        const container = document.getElementById('builderCanvas');
        
        // Clear container
        container.innerHTML = '';

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf5f5f5);

        // Camera setup - proper orientation
        const containerRect = container.getBoundingClientRect();
        this.camera = new THREE.PerspectiveCamera(
            45, 
            containerRect.width / containerRect.height, 
            0.01, 
            2000
        );

        // Renderer setup with optimization
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(containerRect.width, containerRect.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Add OrbitControls - now loaded from HTML
        this.setupCameraControls();

        // Lighting setup
        this.setupLighting();

        // Mouse event listeners
        this.setupMouseEvents();

        // Handle resize
        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);

        // Start render loop
        this.animate();
        
        // Set up wheel zoom handler AFTER everything is initialized
        console.log('🎯 Setting up wheel handler after controls are ready');
        this.setupWheelZoomHandler();
        
        // Update cursor style now that renderer is ready
        this.updateCursorStyle();
        
        this.isInitialized = true;
    }

    setupCameraControls() {
        console.log('🎮 Setting up simple camera controls');
        
        // Set initial target to grid center
            if (this.gridSize && this.gridSize.width > 0) {
                const centerX = this.gridSize.width / 2;
                const centerZ = this.gridSize.height / 2;
                this.gridCenter = new THREE.Vector3(centerX, 0, centerZ);
            this.cameraTarget.copy(this.gridCenter);
        } else {
            this.gridCenter = new THREE.Vector3(0, 0, 0);
            this.cameraTarget.copy(this.gridCenter);
        }
                
                // Set initial camera position
                this.setCameraPosition();
        
        // Set up simple pan controls
        this.setupSimplePanControls();
        
        // Set up wheel zoom handler
        console.log('🎯 Setting up wheel handler');
        this.setupWheelZoomHandler();
    }

    setupSimplePanControls() {
        const domElement = this.renderer.domElement;
        
        domElement.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                this.lastMouse.x = event.clientX;
                this.lastMouse.y = event.clientY;
                
                if (this.cameraMode === 'rotate') {
                    this.isRotating = true;
                    domElement.style.cursor = 'move';
                } else if (this.cameraMode === 'pan') {
                    this.isPanning = true;
                    domElement.style.cursor = 'grabbing';
                }
            }
        });
        
        domElement.addEventListener('mousemove', (event) => {
            const deltaX = event.clientX - this.lastMouse.x;
            const deltaY = event.clientY - this.lastMouse.y;
            
            if (this.isRotating) {
                // Rotate camera around current target
                const spherical = new THREE.Spherical();
                const offset = this.camera.position.clone().sub(this.cameraTarget);
                spherical.setFromVector3(offset);
                
                spherical.theta -= deltaX * this.rotationSpeed;
                spherical.phi += deltaY * this.rotationSpeed;
                
                // Clamp phi to prevent going underground
                spherical.phi = Math.max(0.1, Math.min(Math.PI * 0.9, spherical.phi));
                
                offset.setFromSpherical(spherical);
                this.camera.position.copy(this.cameraTarget).add(offset);
                this.camera.lookAt(this.cameraTarget);
                
                this.needsRender = true;
            } else if (this.isPanning) {
                // Pan by moving camera position directly (fly-around style)
                const distance = this.camera.position.distanceTo(this.cameraTarget);
                const panSpeed = distance * this.panSpeed * 2; // Increase pan sensitivity
                
                // Get screen-space movement vectors
                const right = new THREE.Vector3();
                const up = new THREE.Vector3();
                
                // Right = camera's local X axis
                right.setFromMatrixColumn(this.camera.matrix, 0);
                // Up = camera's local Y axis projected to horizontal plane
                up.setFromMatrixColumn(this.camera.matrix, 1);
                up.y = 0; // Keep movement horizontal
                up.normalize();
                
                // Move camera position directly
                const moveRight = right.clone().multiplyScalar(-deltaX * panSpeed);
                const moveUp = up.clone().multiplyScalar(deltaY * panSpeed); // Fixed: removed negative
                
                this.camera.position.add(moveRight);
                this.camera.position.add(moveUp);
                
                // Update target to maintain the same relative view direction
                this.cameraTarget.add(moveRight);
                this.cameraTarget.add(moveUp);
                
                this.needsRender = true;
            }
            
            this.lastMouse.x = event.clientX;
            this.lastMouse.y = event.clientY;
        });
        
        document.addEventListener('mouseup', () => {
            this.isRotating = false;
            this.isPanning = false;
            this.updateCursorStyle();
        });
    }

    setupWheelZoomHandler() {
        console.log('🔧 Setting up wheel zoom handler');
        console.log('🔍 Controls check:', !!this.controls, this.controls);
        const domElement = this.renderer.domElement;
        
        // Remove any existing handlers
        if (this._wheelHandler) {
            domElement.removeEventListener('wheel', this._wheelHandler, true);
            document.removeEventListener('wheel', this._wheelHandler, true);
            window.removeEventListener('wheel', this._wheelHandler, true);
            console.log('🗑️ Removed previous wheel handlers');
        }
        
        this._wheelHandler = (event) => {
            // Only handle if the event target is our canvas or its children
            if (!domElement.contains(event.target) && event.target !== domElement) {
                return;
            }
            
            console.log('🖱️ WHEEL EVENT CAPTURED:', event.deltaY, 'target:', event.target);
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            
            const rect = domElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Check if mouse is over the canvas
            if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
                console.log('🚫 Mouse outside canvas bounds');
                return;
            }
            
            this.handleWheelZoom(event, x, y, rect);
            return false;
        };
        
        // Add to multiple targets to ensure we catch it
        domElement.addEventListener('wheel', this._wheelHandler, { passive: false, capture: true });
        document.addEventListener('wheel', this._wheelHandler, { passive: false, capture: true });
        
        console.log('✅ Wheel handlers attached to canvas and document');
        console.log('✅ Controls available:', !!this.controls);
        
        // Test if the handler is working
        setTimeout(() => {
            console.log('🧪 Testing wheel handler attachment...');
            console.log('Canvas element:', domElement);
            console.log('Handler function:', this._wheelHandler);
            console.log('Controls still available:', !!this.controls);
        }, 100);
    }
    
    handleWheelZoom(event, mouseX, mouseY, canvasRect) {
        console.log('🎮 handleWheelZoom called with:', event.deltaY, mouseX, mouseY);
        
         this.isWheelZooming = true;

         // Convert to NDC
         const ndcX = (mouseX / canvasRect.width) * 2 - 1;
         const ndcY = -(mouseY / canvasRect.height) * 2 + 1;
         this.lastPointerNDC.set(ndcX, ndcY);
         
         console.log('📍 NDC coords:', ndcX, ndcY);
         
         this.raycaster.setFromCamera(this.lastPointerNDC, this.camera);
         
         // Find hit point
         let hitPoint = null;
         if (this.mapOverlayPlane && this.mapOverlayPlane.visible) {
             const isects = this.raycaster.intersectObject(this.mapOverlayPlane, true);
             if (isects && isects.length > 0) {
                 hitPoint = isects[0].point.clone();
                 console.log('🎯 Hit overlay at:', hitPoint);
             }
         }
         if (!hitPoint) {
             const hp = new THREE.Vector3();
             if (this.raycaster.ray.intersectPlane(this.groundPlane, hp)) {
                 hitPoint = hp;
                 console.log('🎯 Hit ground at:', hitPoint);
             }
         }
         
         if (!hitPoint) {
             console.log('❌ No hit point found');
             this.isWheelZooming = false;
             return;
         }

         // Zoom logic
         const deltaY = event.deltaY || 0;
         const isZoomIn = deltaY < 0;
         const zoomFactor = isZoomIn ? 1 / 1.1 : 1.1;
         console.log('🔍 Zoom:', isZoomIn ? 'IN' : 'OUT', 'factor:', zoomFactor);

         if (isZoomIn) {
             // ZOOM IN: Make cursor position the new center/target
             const currentDistance = this.camera.position.distanceTo(this.cameraTarget);
             const newDistance = Math.max(this.minDistance, currentDistance * zoomFactor);
             
             console.log('📷 OLD target:', this.cameraTarget.clone());
             console.log('📷 OLD camera:', this.camera.position.clone());
             
             // Set cursor hit point as new target
             this.cameraTarget.copy(hitPoint);
             
             // Position camera at appropriate distance from new target
             const currentViewDir = this.camera.position.clone().sub(this.cameraTarget).normalize();
             this.camera.position.copy(this.cameraTarget).add(currentViewDir.multiplyScalar(newDistance));
             
             console.log('📷 NEW target:', this.cameraTarget.clone());
             console.log('📷 NEW camera:', this.camera.position.clone());
            } else {
             // ZOOM OUT: Return toward initial overview as we approach max distance
             const currentDistance = this.camera.position.distanceTo(this.cameraTarget);
             const newDistance = Math.min(this.maxDistance, currentDistance * zoomFactor);
             
             // Calculate how close we are to max zoom (0 = close, 1 = at max)
             const zoomProgress = Math.min(1, newDistance / this.maxDistance);
             
             // Interpolate toward initial camera state as we zoom out
             if (this.initialCameraState && zoomProgress > 0.6) {
                 const lerpFactor = (zoomProgress - 0.6) / 0.4; // 0 to 1 as we go from 60% to 100% zoom out
                 this.cameraTarget.lerp(this.initialCameraState.target, lerpFactor * 0.3);
                 
                 // Clamp target to stay within reasonable bounds
                 if (this.gridSize && this.gridSize.width > 0) {
                     const margin = Math.max(this.gridSize.width, this.gridSize.height) * 0.3;
                     this.cameraTarget.x = Math.max(-margin, Math.min(this.gridSize.width + margin, this.cameraTarget.x));
                     this.cameraTarget.z = Math.max(-margin, Math.min(this.gridSize.height + margin, this.cameraTarget.z));
                     this.cameraTarget.y = 0; // Keep target on ground plane
                 }
                 
                 // If we're near max zoom, position camera at initial position
                 if (zoomProgress > 0.9) {
                     const direction = this.initialCameraState.position.clone().sub(this.cameraTarget);
                     direction.normalize().multiplyScalar(newDistance);
                     this.camera.position.copy(this.cameraTarget).add(direction);
                } else {
                     const viewDir = this.camera.position.clone().sub(this.cameraTarget);
                     viewDir.normalize().multiplyScalar(newDistance);
                     this.camera.position.copy(this.cameraTarget).add(viewDir);
                 }
             } else {
                 // Normal zoom out behavior when not near max
                 const viewDir = this.camera.position.clone().sub(this.cameraTarget);
                 viewDir.normalize().multiplyScalar(newDistance);
                 this.camera.position.copy(this.cameraTarget).add(viewDir);
             }
             
             // Ensure camera looks at target after zoom out
             this.camera.lookAt(this.cameraTarget);
         }

         this.needsRender = true;
         
         // Clear zooming guard
         requestAnimationFrame(() => {
             this.isWheelZooming = false;
         });
     }

    setupCenteringZoomBehavior() {
        // Wheel handler is now set up in setupWheelZoomHandler()
        console.log('🔧 setupCenteringZoomBehavior called (wheel handler already set up)');
    }

    enforceBoundaries() {
        if (!this.controls || !this.gridSize || this.gridSize.width === 0) return;
        if (this.isWheelZooming) return;
        
        // Enforce pan limits - prevent dragging off screen
        const margin = Math.max(this.gridSize.width, this.gridSize.height) * 0.5;
        const minX = -margin;
        const maxX = this.gridSize.width + margin;
        const minZ = -margin; 
        const maxZ = this.gridSize.height + margin;
        
        // Clamp target position
        this.controls.target.x = Math.max(minX, Math.min(maxX, this.controls.target.x));
        this.controls.target.z = Math.max(minZ, Math.min(maxZ, this.controls.target.z));
        this.controls.target.y = Math.max(-5, Math.min(30, this.controls.target.y));
        
        // Enforce rotation limits - prevent going under map
        const cameraOffset = this.camera.position.clone().sub(this.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(cameraOffset);
        
        const minPolarAngle = Math.PI * 0.05; // 9 degrees from top
        const maxPolarAngle = Math.PI * 0.55; // 99 degrees from top (prevents underground)
        
        let angleChanged = false;
        if (spherical.phi < minPolarAngle) {
            spherical.phi = minPolarAngle;
            angleChanged = true;
        }
        if (spherical.phi > maxPolarAngle) {
            spherical.phi = maxPolarAngle;
            angleChanged = true;
        }
        
        // Apply corrected position if angle was clamped
        if (angleChanged) {
            cameraOffset.setFromSpherical(spherical);
            this.camera.position.copy(this.controls.target).add(cameraOffset);
                 }
    }

    enforceBoundariesWithUpdate() {
        this.enforceBoundaries();
        if (this.controls) {
            this.controls.update();
        }
    }

    setCameraPosition() {
        // Set initial camera position for good overview
        if (!this.gridSize || this.gridSize.width === 0) return;
        
        // Ensure gridCenter is set
        const centerX = this.gridSize.width / 2;
        const centerZ = this.gridSize.height / 2;
        if (!this.gridCenter) {
            this.gridCenter = new THREE.Vector3(centerX, 0, centerZ);
        }
        
        const distance = Math.max(this.gridSize.width, this.gridSize.height) * 1.2;
        const height = distance * 0.7;
        
        this.camera.position.set(
            this.gridCenter.x + distance * 0.7,
            height,
            this.gridCenter.z + distance * 0.7
        );
        
        this.camera.lookAt(this.gridCenter);
        
        // Update camera target
        this.cameraTarget.copy(this.gridCenter);
        this.maxDistance = distance * 1.5; // Update max distance based on grid size
        
        // Store initial camera state for zoom out behavior
        this.initialCameraState = {
            position: this.camera.position.clone(),
            target: this.cameraTarget.clone(),
            distance: distance
        };
    }

    // Method to zoom to a specific area
    zoomToArea(centerX, centerZ, zoomLevel = 10) {
        const targetPosition = new THREE.Vector3(centerX, 0, centerZ);
        
        // Animate to new target
        this.animateCameraTo(targetPosition, zoomLevel);
    }



    // Animate camera to specific position
    animateCameraTo(targetPosition, distance = 15, duration = 1000) {
        const startTarget = this.controls ? this.controls.target.clone() : this.currentTarget;
        const startPosition = this.camera.position.clone();
        const startTime = Date.now();
        
        const endTarget = targetPosition.clone();
        const direction = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance);
        const endPosition = endTarget.clone().add(direction);
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate target and position
            this.controls.target.lerpVectors(startTarget, endTarget, eased);
            this.camera.position.lerpVectors(startPosition, endPosition, eased);
            
            this.controls.update();
            this.needsRender = true;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    // Camera control methods
    resetCameraToCenter() {
        if (this.controls) {
            // Animate back to center with OrbitControls
            this.animateCameraTo(this.gridCenter, Math.max(this.gridSize.width, this.gridSize.height) * 1.2);
        } else {
            // Fallback for basic controls
            this.currentTarget.copy(this.gridCenter);
            this.setCameraPosition();
            this.camera.lookAt(this.currentTarget);
            this.needsRender = true;
        }
    }

    setTopDownView() {
        const centerX = this.gridSize.width / 2;
        const centerZ = this.gridSize.height / 2;
        const height = Math.max(this.gridSize.width, this.gridSize.height) * 1.5;
        
        if (this.controls) {
            this.controls.target.set(centerX, 0, centerZ);
            this.animateCameraTo(new THREE.Vector3(centerX, height, centerZ), 0.1);
        } else {
            this.currentTarget.set(centerX, 0, centerZ);
            this.camera.position.set(centerX, height, centerZ);
            this.camera.lookAt(this.currentTarget);
            this.needsRender = true;
        }
    }

    zoomToFitBlocks() {
        if (this.blocks.size === 0) {
            // No blocks, zoom to fit grid
            this.resetCameraToCenter();
            return;
        }

        // Calculate bounding box of all blocks
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        this.blocks.forEach(blockData => {
            const { x, y, z } = blockData.position;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        });

        // Calculate center and size of blocks
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        const sizeX = maxX - minX + 2; // Add padding
        const sizeZ = maxZ - minZ + 2;
        const sizeY = maxY - minY + 2;
        
        const maxSize = Math.max(sizeX, sizeZ, sizeY);
        const distance = maxSize * 1.5;

        this.zoomToArea(centerX, centerZ, distance);
    }

    setupEnhancedBasicControls() {
        // Simplified fallback controls - rotation and zoom only
        let isDragging = false;
        let previousMouse = { x: 0, y: 0 };
        
        // Set up grid center (if gridSize is available)
        if (this.gridSize && this.gridSize.width > 0) {
            const centerX = this.gridSize.width / 2;
            const centerZ = this.gridSize.height / 2;
            this.gridCenter = new THREE.Vector3(centerX, 0, centerZ);
            this.currentTarget = this.gridCenter.clone();
            
            // Set initial camera position
            this.setCameraPosition();
        } else {
            // Default position if no grid size yet
            this.gridCenter = new THREE.Vector3(0, 0, 0);
            this.currentTarget = this.gridCenter.clone();
        }
        
        // Set up keyboard controls
        this.setupKeyboardControls();
        
        this.renderer.domElement.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Only left click
                isDragging = true;
                previousMouse = { x: event.clientX, y: event.clientY };
                event.preventDefault();
            }
        });

        this.renderer.domElement.addEventListener('mousemove', (event) => {
            if (isDragging) {
                const deltaX = event.clientX - previousMouse.x;
                const deltaY = event.clientY - previousMouse.y;
                
                // Panning mode (left click + drag moves view)
                const distance = this.camera.position.distanceTo(this.currentTarget);
                const panSpeed = distance * 0.002;
                
                // Calculate pan vector in camera space
                const panVector = new THREE.Vector3();
                panVector.setFromMatrixColumn(this.camera.matrix, 0); // x-axis
                panVector.multiplyScalar(-deltaX * panSpeed);
                
                const panVectorY = new THREE.Vector3();
                panVectorY.setFromMatrixColumn(this.camera.matrix, 1); // y-axis  
                panVectorY.multiplyScalar(deltaY * panSpeed);
                
                // Move both target and camera
                this.currentTarget.add(panVector).add(panVectorY);
                this.camera.position.add(panVector).add(panVectorY);
                
                // Apply panning limits to prevent going off-screen
                this.enforceBasicControlsBoundaries();
                
                this.camera.lookAt(this.currentTarget);
                previousMouse = { x: event.clientX, y: event.clientY };
                this.needsRender = true;
            }
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Enhanced zoom with return-to-starting-view behavior
        this.renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const delta = event.deltaY;
            const zoomOut = delta > 0;
            
            // Calculate max distance to match center button
            const maxDistance = this.gridSize && this.gridSize.width > 0 
                ? Math.max(this.gridSize.width, this.gridSize.height) * 1.2 
                : 50;
            const minDistance = 3;
            
            const currentDistance = this.camera.position.distanceTo(this.currentTarget);
            
            // Calculate starting camera state
            const getStartingCameraState = () => {
                if (!this.gridCenter || !this.gridSize || this.gridSize.width === 0) {
                    return null;
                }
                
                const distance = Math.max(this.gridSize.width, this.gridSize.height) * 1.2;
                const height = distance * 0.7;
                
                return {
                    position: new THREE.Vector3(
                        this.gridCenter.x + distance * 0.7,
                        height,
                        this.gridCenter.z + distance * 0.7
                    ),
                    target: this.gridCenter.clone()
                };
            };
            
            if (zoomOut) {
                // Zooming out - move towards starting view
                const zoomFactor = 1.15;
                const newDistance = Math.min(currentDistance * zoomFactor, maxDistance);
                
                // Get starting camera state
                const startingState = getStartingCameraState();
                if (startingState) {
                    // Calculate how much to interpolate towards starting view based on zoom level
                    const zoomProgress = Math.min(1, currentDistance / (maxDistance * 0.7));
                    
                    // Interpolate target towards starting target (grid center)
                    this.currentTarget.lerp(startingState.target, zoomProgress * 0.3);
                    // Apply boundaries
                    this.enforceBasicControlsBoundaries();
                    
                    // If we're near max zoom, position camera at starting position
                    if (newDistance >= maxDistance * 0.85) {
                        const direction = startingState.position.clone().sub(this.currentTarget);
                        direction.normalize().multiplyScalar(maxDistance);
                        this.camera.position.copy(this.currentTarget).add(direction);
                    } else {
                        // Normal zoom out
                        const direction = this.camera.position.clone().sub(this.currentTarget);
                        direction.normalize().multiplyScalar(newDistance);
                        this.camera.position.copy(this.currentTarget).add(direction);
                    }
                }
                
            } else {
                // Zooming in - normal behavior
                const zoomFactor = 1 / 1.15;
                const direction = this.camera.position.clone().sub(this.currentTarget);
                direction.multiplyScalar(zoomFactor);
                
                // Clamp to min distance
                if (direction.length() >= 3) {
                    this.camera.position.copy(this.currentTarget).add(direction);
                } else {
                    direction.normalize().multiplyScalar(3);
                    this.camera.position.copy(this.currentTarget).add(direction);
                }
            }
            
            this.camera.lookAt(this.currentTarget);
            this.needsRender = true;
        }, { passive: false });
    }

    enforceBasicControlsBoundaries() {
        if (!this.gridSize || this.gridSize.width === 0 || !this.currentTarget) return;
        
        // Enforce pan limits - prevent dragging off screen
        const margin = Math.max(this.gridSize.width, this.gridSize.height) * 0.5;
        const minX = -margin;
        const maxX = this.gridSize.width + margin;
        const minZ = -margin;
        const maxZ = this.gridSize.height + margin;
        
        // Clamp target position
        this.currentTarget.x = Math.max(minX, Math.min(maxX, this.currentTarget.x));
        this.currentTarget.z = Math.max(minZ, Math.min(maxZ, this.currentTarget.z));
        this.currentTarget.y = Math.max(-5, Math.min(30, this.currentTarget.y));
        
        // Enforce rotation limits - prevent going under map
        const cameraOffset = this.camera.position.clone().sub(this.currentTarget);
        const spherical = new THREE.Spherical().setFromVector3(cameraOffset);
        
        const minPolarAngle = Math.PI * 0.05; // 9 degrees from top  
        const maxPolarAngle = Math.PI * 0.55; // 99 degrees from top (prevents underground)
        
        let angleChanged = false;
        if (spherical.phi < minPolarAngle) {
            spherical.phi = minPolarAngle;
            angleChanged = true;
        }
        if (spherical.phi > maxPolarAngle) {
            spherical.phi = maxPolarAngle;
            angleChanged = true;
        }
        
        // Apply corrected position if angle was clamped
        if (angleChanged) {
            cameraOffset.setFromSpherical(spherical);
            this.camera.position.copy(this.currentTarget).add(cameraOffset);
        }
    }

    setupKeyboardControls() {
        // Set up keyboard event listener
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardInput(event);
        });
    }

    handleKeyboardInput(event) {
        if (!this.gridCenter) return;

        const rotateSpeed = 0.05; // Reduced sensitivity for smoother rotation
        let moved = false;

        switch(event.code) {
            case 'ArrowLeft':
            case 'NumpadLeft':
            case 'Numpad4':
                // Rotate camera left around center
                this.orbitAroundCenter(-rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowRight':
            case 'NumpadRight': 
            case 'Numpad6':
                // Rotate camera right around center
                this.orbitAroundCenter(rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowUp':
            case 'NumpadUp':
            case 'Numpad8':
                // Rotate camera up around center
                this.orbitVertical(-rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowDown':
            case 'NumpadDown':
            case 'Numpad2':
                // Rotate camera down around center
                this.orbitVertical(rotateSpeed);
                moved = true;
                break;
        }

        if (moved) {
            event.preventDefault();
            this.needsRender = true;
        }
    }

    orbitAroundCenter(deltaTheta) {
        const target = this.controls ? this.controls.target : this.currentTarget;
        const offset = this.camera.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        
        spherical.theta += deltaTheta;
        
        offset.setFromSpherical(spherical);
        this.camera.position.copy(target).add(offset);
        this.camera.lookAt(target);
        
        if (this.controls) {
            this.controls.update();
        } else {
            // For basic controls, enforce boundaries manually
            this.enforceBasicControlsBoundaries();
        }
    }

    orbitVertical(deltaPhi) {
        const target = this.controls ? this.controls.target : this.currentTarget;
        const offset = this.camera.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        
        spherical.phi += deltaPhi;
        spherical.phi = Math.max(Math.PI * 0.05, Math.min(Math.PI * 0.55, spherical.phi));
        
        offset.setFromSpherical(spherical);
        this.camera.position.copy(target).add(offset);
        this.camera.lookAt(target);
        
        if (this.controls) {
            this.controls.update();
        } else {
            // For basic controls, enforce boundaries manually
            this.enforceBasicControlsBoundaries();
        }
    }

    positionCamera() {
        if (!this.gridSize || this.gridSize.width === 0) return;
        
        // Position camera for proper top-down-angled view
        const centerX = this.gridSize.width / 2;
        const centerZ = this.gridSize.height / 2;
        const maxDim = Math.max(this.gridSize.width, this.gridSize.height);
        
        // Position camera at an angle that shows the grid properly oriented
        this.camera.position.set(
            centerX + maxDim * 0.8,
            maxDim * 0.6,
            centerZ + maxDim * 0.8
        );
        
        this.camera.lookAt(centerX, 0, centerZ);
        
        // Set controls target and update if available
        if (this.controls) {
            this.controls.target.set(centerX, 0, centerZ);
            this.controls.update();
        }
        
        this.needsRender = true;
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);

        // Directional light with shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 25);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.camera.left = -50;
        directionalLight.shadow.camera.right = 50;
        directionalLight.shadow.camera.top = 50;
        directionalLight.shadow.camera.bottom = -50;
        this.scene.add(directionalLight);
    }

    createBaseGrid() {
        console.log(`🔲 Creating base grid for ${this.gridData.length} squares...`);
        
        // Remove existing grid
        if (this.baseGrid) {
            this.scene.remove(this.baseGrid);
            this.baseGrid = null;
        }
        if (this.instancedGridMesh) {
            this.scene.remove(this.instancedGridMesh);
            this.instancedGridMesh.geometry?.dispose?.();
            this.instancedGridMesh.material?.dispose?.();
            this.instancedGridMesh = null;
        }

        // Prepare fast index
        this.gridCellIndex.clear();
        this.instanceIdToGridPoint = [];
        this.gridData.forEach(gp => {
            this.gridCellIndex.set(`${gp.gridX}_${gp.gridY}`, gp);
        });

        // Create a single instanced mesh for all grid squares
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
            return;
        }

        const tempMatrix = new THREE.Matrix4();
        const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        for (let i = 0; i < count; i++) {
            const gp = this.gridData[i];
            tempMatrix.identity();
            tempMatrix.multiply(rotation);
            tempMatrix.setPosition(gp.gridX, 0, gp.gridY);
            instanced.setMatrixAt(i, tempMatrix);
            this.instanceIdToGridPoint[i] = gp;
        }
        instanced.instanceMatrix.needsUpdate = true;
        instanced.renderOrder = 2; // draw after map overlay
        this.instancedGridMesh = instanced;
        this.scene.add(this.instancedGridMesh);

        // Create a reusable hover indicator if needed
        if (!this.hoverIndicator) {
            const hoverGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.blockSize, this.blockSize));
            const hoverMat = new THREE.LineBasicMaterial({ color: 0x4444ff, transparent: true, opacity: 0.8 });
            const hover = new THREE.LineSegments(hoverGeom, hoverMat);
            hover.rotation.x = -Math.PI / 2;
            hover.position.set(0, 0.002, 0);
            hover.visible = false;
            hover.renderOrder = 3;
            this.hoverIndicator = hover;
            this.scene.add(this.hoverIndicator);
        }

        this.needsRender = true;
    }

    setupMouseEvents() {
        // Mouse move for hover effects
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            if (event.target !== this.renderer.domElement) return;
            
            // Calculate mouse position
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            // Track last pointer NDC for wheel/pinch
            this.lastPointerNDC.set(this.mouse.x, this.mouse.y);

            // Hover via ground-plane intersection for performance
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const planeHit = new THREE.Vector3();
            const hasPlane = this.raycaster.ray.intersectPlane(this.groundPlane, planeHit);
            this.clearHover();
            if (hasPlane) {
                const gx = Math.round(planeHit.x);
                const gz = Math.round(planeHit.z);
                const key = `${gx}_${gz}`;
                const gp = this.gridCellIndex.get(key);
                if (gp && this.hoverIndicator) {
                    this.hoverIndicator.visible = true;
                    this.hoverIndicator.position.set(gx, 0.002, gz);
                    this.hoveredObject = this.hoverIndicator;
                    this.needsRender = true;
                    return;
                }
            }

            // If not over a grid cell, still allow hovering blocks
            const blockMeshes = [];
            this.blocks.forEach(blockData => { if (blockData.mesh) blockMeshes.push(blockData.mesh); });
            const intersects = this.raycaster.intersectObjects(blockMeshes);
            
            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;
                this.setHover(intersectedObject);
            }
        });

        // Clear hover when mouse leaves canvas
        this.renderer.domElement.addEventListener('mouseleave', () => {
            this.clearHover();
        });

        // Touch move tracking for mobile pinch
        this.renderer.domElement.addEventListener('touchmove', (event) => {
            if (!event.touches || event.touches.length === 0) return;
            const t = event.touches[0];
            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
            this.lastPointerNDC.set(x, y);
        }, { passive: true });

        // Mouse click for placing/removing blocks
        this.renderer.domElement.addEventListener('click', (event) => {
            // Don't handle clicks if we're dragging
            if (event.target !== this.renderer.domElement) return;
            
            // Only handle clicks in build mode
            if (this.cameraMode !== 'build') return;
            
            // Calculate mouse position
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast against all objects (blocks only)
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const blockMeshes = [];
            this.blocks.forEach(blockData => { if (blockData.mesh) blockMeshes.push(blockData.mesh); });
            const intersects = this.raycaster.intersectObjects(blockMeshes);

            if (intersects.length > 0 && intersects[0].object.userData.blockData) {
                const intersectedObject = intersects[0].object;
                if (event.shiftKey) {
                        this.removeBlockByMesh(intersectedObject);
                } else {
                    this.handleBlockClick(intersectedObject, intersects[0], event);
                }
                return;
            }

            // Otherwise, place/remove based on ground-plane grid cell
            const planeHit = new THREE.Vector3();
            const hasPlane = this.raycaster.ray.intersectPlane(this.groundPlane, planeHit);
            if (!hasPlane) return;
            const gx = Math.round(planeHit.x);
            const gz = Math.round(planeHit.z);
            const key = `${gx}_${gz}`;
            const gp = this.gridCellIndex.get(key);
            if (!gp) return;
            if (event.shiftKey) {
                this.removeBlock(gp);
            } else if (event.altKey) {
                this.placeBelowAtGrid(gp);
            } else {
                this.placeAtLowestAvailableAtGrid(gp);
            }
        });
    }

    // =====================================
    // BLOCK PHYSICS SYSTEM
    // =====================================

    /**
     * Validates if a block can be placed at the given position
     * @param {number} x - X coordinate
     * @param {number} yLevel - Y level (height)
     * @param {number} z - Z coordinate
     * @returns {boolean} True if placement is valid
     */
    validateBlockPlacement(x, yLevel, z) {
        // Ground level blocks on the original grid are always supported
        if (yLevel === 0 && this.isGroundLevel(x, z)) {
            return true;
        }
        
        return this.hasSupport(x, yLevel, z);
    }
    
    /**
     * Checks if a block position has support (vertical or horizontal)
     * @param {number} x - X coordinate
     * @param {number} yLevel - Y level
     * @param {number} z - Z coordinate
     * @returns {boolean} True if supported
     */
    hasSupport(x, yLevel, z) {
        // Vertical support: block directly underneath
        const belowBlockId = `${x}_${yLevel - 1}_${z}`;
        if (this.blocks.has(belowBlockId)) {
            return true;
        }
        
        // Horizontal support: adjacent block that has support
        const adjacentPositions = this.getAdjacentPositions(x, yLevel, z);
        for (const pos of adjacentPositions) {
            const adjacentBlockId = `${pos.x}_${pos.y}_${pos.z}`;
            if (this.blocks.has(adjacentBlockId)) {
                // Recursive check with cycle prevention
                if (this.hasIndirectSupport(pos.x, pos.y, pos.z, new Set([`${x}_${yLevel}_${z}`]))) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    hasIndirectSupport(x, yLevel, z, visited) {
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Avoid infinite recursion
        if (visited.has(blockId) || visited.size > 20) {
            return false;
        }
        visited.add(blockId);
        
        // Ground level blocks on the original grid are always supported
        if (yLevel === 0 && this.isGroundLevel(x, z)) {
            return true;
        }
        
        // Check if there's a block directly underneath
        const belowBlockId = `${x}_${yLevel - 1}_${z}`;
        if (this.blocks.has(belowBlockId)) {
            return true;
        }
        
        // Check adjacent blocks recursively
        const adjacentPositions = this.getAdjacentPositions(x, yLevel, z);
        for (const pos of adjacentPositions) {
            const adjacentBlockId = `${pos.x}_${pos.y}_${pos.z}`;
            if (this.blocks.has(adjacentBlockId) && !visited.has(adjacentBlockId)) {
                if (this.hasIndirectSupport(pos.x, pos.y, pos.z, new Set(visited))) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    getAdjacentPositions(x, yLevel, z) {
        return [
            { x: x + 1, y: yLevel, z: z }, // East
            { x: x - 1, y: yLevel, z: z }, // West
            { x: x, y: yLevel, z: z + 1 }, // North
            { x: x, y: yLevel, z: z - 1 }, // South
        ];
    }
    
    isGroundLevel(x, z) {
        // Check if this position is on the original grid
        return this.gridData.some(gridPoint => gridPoint.gridX === x && gridPoint.gridY === z);
    }
    
    findUnsupportedBlocks() {
        const unsupportedBlocks = [];
        
        this.blocks.forEach((blockData) => {
            const { x, z } = blockData.position;
            const { yLevel } = blockData;
            
            if (!this.hasSupport(x, yLevel, z)) {
                unsupportedBlocks.push(blockData);
            }
        });
        
        return unsupportedBlocks;
    }
    
    removeUnsupportedBlocks() {
        if (!this.enableBlockPhysics) return;
        
        let removedCount = 0;
        let hasUnsupported = true;
        
        // Keep removing unsupported blocks until none remain (cascade effect)
        while (hasUnsupported) {
            const unsupportedBlocks = this.findUnsupportedBlocks();
            hasUnsupported = unsupportedBlocks.length > 0;
            
            for (const blockData of unsupportedBlocks) {
                this.scene.remove(blockData.mesh);
                this.blocks.delete(blockData.id);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            console.log(`Removed ${removedCount} unsupported blocks`);
            this.updateStats();
            this.needsRender = true;
        }
        
        return removedCount;
    }
    
    showPlacementError(x, yLevel, z) {
        // Create a temporary red wireframe cube to show invalid placement
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.8 
        });
        
        const errorBlock = new THREE.Mesh(geometry, material);
        const yPosition = yLevel * this.blockSize + this.blockSize / 2;
        errorBlock.position.set(x, yPosition, z);
        
        this.scene.add(errorBlock);
        this.needsRender = true;
        
        // Remove the error indicator after 1 second
        setTimeout(() => {
            this.scene.remove(errorBlock);
            this.needsRender = true;
        }, 1000);
    }
    
    toggleBlockPhysics() {
        this.enableBlockPhysics = !this.enableBlockPhysics;
        console.log(`Block physics ${this.enableBlockPhysics ? 'enabled' : 'disabled'}`);
        
        if (this.enableBlockPhysics) {
            // When enabling physics, remove any unsupported blocks
            this.removeUnsupportedBlocks();
        }
        
        return this.enableBlockPhysics;
    }

    // =====================================
    // BLOCK CREATION & MANAGEMENT
    // =====================================

    /**
     * Adds a block at the specified grid position and Y level
     * @param {Object} gridPoint - Grid position with gridX, gridY coordinates
     * @param {number} yLevel - Y level (height) to place block
     * @returns {boolean} True if block was successfully placed
     */
    addBlock(gridPoint, yLevel = 0) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        
        // Check if block placement is valid (has support)
        if (this.enableBlockPhysics && !this.validateBlockPlacement(x, yLevel, z)) {
            console.log(`Cannot place block at ${x},${yLevel},${z} - no support`);
            this.showPlacementError(x, yLevel, z);
            return false;
        }
        
        // Create a new 3x3x3 block at the specified grid position and Y level
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Remove existing block at this exact position if it exists
        if (this.blocks.has(blockId)) {
            const existingBlock = this.blocks.get(blockId);
            this.scene.remove(existingBlock.mesh);
        }

        // Create new 3x3x3 block (1 unit = 3 meters in real world)
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        const yPosition = yLevel * this.blockSize + this.blockSize / 2; // Stack blocks properly
        block.position.set(x, yPosition, z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        this.scene.add(block);
        
        // Store block data and add reference to mesh userData for raycasting
        const blockData = { 
            mesh: block, 
            height: this.blockSize, // Each block represents 3x3x3 meters
            color: this.selectedColor, 
            position: { x: x, y: yPosition, z: z },
            yLevel: yLevel, // Track which level this block is at
            id: blockId
        };
        block.userData.blockData = blockData;
        this.blocks.set(blockId, blockData);
        
        this.updateStats();
        this.needsRender = true;
        
        // Update grid data for ground level blocks
        if (yLevel === 0 && window.gridGenerator) {
            window.gridGenerator.updateBlockData(gridPoint.id, 1, this.selectedColor);
        }
        
        return true;
    }

    // Enhanced method to add or stack blocks at grid positions
    addOrStackBlock(gridPoint) {
        // Find the highest block at this X,Z position
        let highestLevel = -1;
        this.blocks.forEach((blockData, blockId) => {
            if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                highestLevel = Math.max(highestLevel, blockData.yLevel);
            }
        });
        
        // Add a new block at the next level up
        const newLevel = highestLevel + 1;
        this.addBlock(gridPoint, newLevel);
        
        this.updateStats();
        this.needsRender = true;
    }

    // =====================================
    // USER INTERACTION HANDLERS
    // =====================================

    /**
     * Handles clicks on existing blocks for stacking or side placement
     * Determines if click was on top (stack) or side (adjacent placement)
     * @param {THREE.Mesh} blockMesh - The clicked block mesh
     * @param {Object} intersection - Raycast intersection data
     */
    handleBlockClick(blockMesh, intersection, mouseEvent) {
        const blockData = blockMesh.userData.blockData;
        const clickPoint = intersection.point;
        
        // Decide placement based on nearest face at the click point
        const face = this.determineClickedFace(blockMesh, intersection);
        switch (face) {
            case 'top':
            this.placeAboveBlock(blockData);
                break;
            case 'bottom':
                this.placeBelowBlock(blockData, { skipValidation: true });
                break;
            case 'east':
            case 'west':
            case 'north':
            case 'south':
            this.placeAdjacentBlock(blockData, clickPoint);
                break;
            default:
                this.placeAboveBlock(blockData);
        }
    }

    // Determine which face (top/bottom/east/west/north/south) was clicked using face normal
    determineClickedFace(blockMesh, intersection) {
        if (intersection && intersection.face) {
            // face.normal is in local space of the geometry
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
        const half = this.blockSize / 2;
        const x = localPoint.x / half;
        const y = localPoint.y / half;
        const z = localPoint.z / half;
        
        if (y > 0.5) return 'top';
        if (y < -0.6) return 'bottom';
        if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 'east' : 'west';
        return z >= 0 ? 'north' : 'south';
    }

    // Stack a block vertically (add new block on top)
    stackVertically(blockData) {
        // Find the highest block at this X,Z position
        let highestLevel = blockData.yLevel;
        this.blocks.forEach((otherBlock, blockId) => {
            if (otherBlock.position.x === blockData.position.x && otherBlock.position.z === blockData.position.z) {
                highestLevel = Math.max(highestLevel, otherBlock.yLevel);
            }
        });
        
        // Create a new block one level above the highest
        const newLevel = highestLevel + 1;
        const newBlockId = `${blockData.position.x}_${newLevel}_${blockData.position.z}`;
        
        // Create new 3x3x3 block
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        const yPosition = newLevel * this.blockSize + this.blockSize / 2;
        block.position.set(blockData.position.x, yPosition, blockData.position.z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        // Store new block data
        const newBlockData = {
            mesh: block,
            height: this.blockSize,
            color: this.selectedColor,
            position: { x: blockData.position.x, y: yPosition, z: blockData.position.z },
            yLevel: newLevel,
            id: newBlockId
        };
        block.userData.blockData = newBlockData;
        
        this.scene.add(block);
        this.blocks.set(newBlockId, newBlockData);
        
        this.updateStats();
        this.needsRender = true;
    }

    // Place a block adjacent to an existing block
    placeAdjacentBlock(existingBlockData, clickPoint, face = null) {
        const blockPos = existingBlockData.position;
        
        // Determine which side to place using face if provided, otherwise fallback to offset
        let newX = blockPos.x;
        let newZ = blockPos.z;
        if (face === 'east') newX = blockPos.x + 1;
        else if (face === 'west') newX = blockPos.x - 1;
        else if (face === 'north') newZ = blockPos.z + 1;
        else if (face === 'south') newZ = blockPos.z - 1;
        else {
            const relativeX = clickPoint.x - blockPos.x;
            const relativeZ = clickPoint.z - blockPos.z;
        if (Math.abs(relativeX) > Math.abs(relativeZ)) {
            newX = blockPos.x + (relativeX > 0 ? 1 : -1);
        } else {
            newZ = blockPos.z + (relativeZ > 0 ? 1 : -1);
            }
        }
        
        // Round to grid positions
        newX = Math.round(newX);
        newZ = Math.round(newZ);
        
        // Prefer same Y level as clicked block if free; otherwise, stack on top of adjacent column
        let newLevel = existingBlockData.yLevel;
        if (this.isOccupiedAtLevel(newX, newLevel, newZ)) {
            // Find the highest then add on top
        let highestLevel = -1;
            this.blocks.forEach((blockData) => {
            if (blockData.position.x === newX && blockData.position.z === newZ) {
                highestLevel = Math.max(highestLevel, blockData.yLevel);
            }
        });
            newLevel = highestLevel + 1;
        }
        
        this.createBlockAt(newX, newZ, newLevel);
    }

    // Create a block at specific coordinates
    createBlockAt(x, z, yLevel = 0, options = {}) {
        // Check if block placement is valid (has support)
        if (!options.skipValidation && this.enableBlockPhysics && !this.validateBlockPlacement(x, yLevel, z)) {
            console.log(`Cannot place block at ${x},${yLevel},${z} - no support`);
            this.showPlacementError(x, yLevel, z);
            return false;
        }
        
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Create new 3x3x3 block (1 unit = 3 meters in real world)
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        const yPosition = yLevel * this.blockSize + this.blockSize / 2;
        block.position.set(x, yPosition, z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        // Store block data
        const blockData = {
            mesh: block,
            height: this.blockSize, // Each block represents 3x3x3 meters
            color: this.selectedColor,
            position: { x: x, y: yPosition, z: z },
            yLevel: yLevel,
            id: blockId
        };
        block.userData.blockData = blockData;
        
        this.scene.add(block);
        this.blocks.set(blockId, blockData);
        
        this.updateStats();
        this.needsRender = true;
        
        return true;
    }

        // Remove block by mesh reference
    removeBlockByMesh(blockMesh) {
        const blockData = blockMesh.userData.blockData;
        if (blockData) {
            this.scene.remove(blockData.mesh);
            this.blocks.delete(blockData.id);
            
            // Check for and remove unsupported blocks after removal
            this.removeUnsupportedBlocks();
            
            // Update grid data if this was on the original grid
            if (window.gridGenerator) {
                const gridPoint = this.gridData.find(gp => gp.gridX === blockData.position.x && gp.gridY === blockData.position.z);
                if (gridPoint) {
                    window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
                }
            }
            
            this.updateStats();
            this.needsRender = true;
        }
    }

    removeBlock(gridPoint) {
        // Find and remove the highest block at this X,Z position
        let highestLevel = -1;
        let highestBlockId = null;
        
        this.blocks.forEach((blockData, blockId) => {
            if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                if (blockData.yLevel > highestLevel) {
                    highestLevel = blockData.yLevel;
                    highestBlockId = blockId;
                }
            }
        });
        
        if (highestBlockId) {
            const blockData = this.blocks.get(highestBlockId);
            this.scene.remove(blockData.mesh);
            this.blocks.delete(highestBlockId);
            
            // Check for and remove unsupported blocks after removal
            this.removeUnsupportedBlocks();
            
            this.updateStats();
            this.needsRender = true;
            
            // Update grid data only if no blocks remain at this position
            if (window.gridGenerator) {
                let hasRemainingBlocks = false;
                this.blocks.forEach((blockData) => {
                    if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                        hasRemainingBlocks = true;
                    }
                });
                
                if (!hasRemainingBlocks) {
                    window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
                }
            }
        }
    }

    clearAllBlocks() {
        this.blocks.forEach(blockData => {
            this.scene.remove(blockData.mesh);
        });
        this.blocks.clear();
        
        // Clear hover state and materials
        this.clearHover();
        this.originalMaterials.clear();
        
        this.updateStats();
        this.needsRender = true;
        
        // Update all grid data
        if (window.gridGenerator) {
            this.gridData.forEach(gridPoint => {
                window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
            });
        }
    }

    updateStats() {
        const blockCountElement = document.getElementById('blockCount');
        if (blockCountElement) {
            blockCountElement.textContent = this.blocks.size;
        }
    }

    // =====================================
    // MAP OVERLAY SYSTEM
    // =====================================

    /**
     * Toggle the transparent map overlay on/off
     */
    toggleMapOverlay() {
        console.log('🔄 Toggle map overlay called');
        console.log('📍 Original bounds:', this.originalBounds);
        console.log('📍 Original boundary:', this.originalBoundary);
        
        if (!this.originalBounds) {
            console.warn('❌ No map bounds available for overlay');
            return;
        }

        const button = document.getElementById('toggleMapOverlay');
        
        if (this.mapOverlayVisible) {
            console.log('🙈 Hiding map overlay');
            // Hide the overlay
            this.hideMapOverlay();
            button.classList.remove('active');
        } else {
            console.log('👁️ Showing map overlay');
            // Show the overlay with a small delay to ensure DOM is ready
            setTimeout(() => {
                this.showMapOverlay();
            }, 100);
            button.classList.add('active');  
            
            // Keep base grid visible with the overlay
            if (this.baseGrid) this.baseGrid.visible = true;
        }
        
        this.mapOverlayVisible = !this.mapOverlayVisible;
        this.needsRender = true;
    }

    /**
     * Create and show the 3D map overlay plane on the grid
     */
    async showMapOverlay() {
        try {
            console.log('🗺️ Creating 3D map overlay plane...');
            
            if (this.mapOverlayPlane) {
                // Plane already exists, just make it visible
                console.log('♻️ Map plane already exists, making visible');
                this.mapOverlayPlane.visible = true;
                return;
            }

            if (!this.originalBounds || !this.scene) {
                console.error('❌ Missing bounds or scene for 3D map overlay');
                return;
            }

            // Calculate grid bounds in 3D world coordinates (ensures plane aligns with grid positions)
            const gridBounds = this.calculateGridBounds();
            console.log('📐 Grid bounds:', gridBounds);

            // Create map texture from Leaflet (cropped to polygon bounds)
            console.log('🎨 Creating map texture...');
            const mapTexture = await this.createMapTexture();
            if (!mapTexture || !mapTexture.image) {
                console.error('❌ Map texture not available; aborting overlay creation');
                return;
            }
            console.log('🖼️ Map texture size:', mapTexture.image.width, 'x', mapTexture.image.height);

            // Create plane geometry that matches the grid size
            const planeGeometry = new THREE.PlaneGeometry(
                gridBounds.width,
                gridBounds.height
            );

            // Create material with better visibility for map reference
            const planeMaterial = new THREE.MeshBasicMaterial({
                map: mapTexture,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });

            // Push overlay slightly back to reduce z-fighting with grid squares
            planeMaterial.polygonOffset = true;
            planeMaterial.polygonOffsetFactor = 1;
            planeMaterial.polygonOffsetUnits = 1;

            // Create the map plane mesh
            this.mapOverlayPlane = new THREE.Mesh(planeGeometry, planeMaterial);

            // Position the plane exactly on the grid floor level, centered over the grid extents
            this.mapOverlayPlane.position.set(
                gridBounds.centerX,
                -0.01,
                gridBounds.centerZ
            );

            // Ensure it renders after the grid
            this.mapOverlayPlane.renderOrder = 0; // Behind the grid squares

            // Rotate to lie flat on the ground (same as grid)
            this.mapOverlayPlane.rotation.x = -Math.PI / 2;

            // Add to scene
            this.scene.add(this.mapOverlayPlane);
            this.needsRender = true;

            console.log('✅ 3D map overlay plane created and positioned');

        } catch (error) {
            console.error('❌ Error creating 3D map overlay:', error);
        }
    }

    /**
     * Calculate a plane size/center from the original lat/lng bounds using grid spacings
     */
    calculatePlaneFromBounds() {
        // Prefer captured texture bounds when available (exact capture viewport)
        const boundsObj = this.capturedTextureBounds;
        let bounds = this.originalBounds;
        if (boundsObj && this.originalBounds && typeof this.originalBounds.getNorth === 'function') {
            // Create a simple adapter with Leaflet-like getters over the captured bounds
            bounds = {
                getNorth: () => boundsObj.north,
                getSouth: () => boundsObj.south,
                getEast: () => boundsObj.east,
                getWest: () => boundsObj.west
            };
        }
        if (!bounds || this.latSpacing == null || this.lngSpacing == null) {
            // Fallback to grid bounds
            const gb = this.calculateGridBounds();
            return { width: gb.width, height: gb.height, centerX: gb.centerX, centerZ: gb.centerZ };
        }
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        // Width/height in grid units (1 unit = 3m)
        const numCols = (east - west) / this.lngSpacing;
        const numRows = (north - south) / this.latSpacing;

        const width = numCols * this.gridSpacing;
        const height = numRows * this.gridSpacing;

        // Origin (0,0) is at west/north, so plane center is half extents from origin
        const centerX = width / 2;
        const centerZ = height / 2;

        return { width, height, centerX, centerZ };
    }

    /**
     * Hide the 3D map overlay
     */
    hideMapOverlay() {
        if (this.mapOverlayPlane) {
            this.mapOverlayPlane.visible = false;
            this.needsRender = true;
        }
        // Ensure base grid remains visible
        if (this.baseGrid) this.baseGrid.visible = true;
    }

    /**
     * Calculate the bounds of the 3D grid in world coordinates
     */
    calculateGridBounds() {
        if (!this.gridData || this.gridData.length === 0) {
            return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 1, height: 1, centerX: 0, centerZ: 0 };
        }

        // Find min/max coordinates of the grid
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
     * Create a map texture using the pre-captured map canvas
     */
    async createMapTexture() {
        return new Promise((resolve, reject) => {
            try {
                console.log('🗺️ Creating texture from pre-captured map...');
                
                // Use the pre-captured canvas if available and valid
                if (this.capturedMapCanvas && this.capturedMapCanvas.width > 0 && this.capturedMapCanvas.height > 0) {
                    const isBlank = this.isCanvasBlank(this.capturedMapCanvas);
                    console.log('🧪 Captured canvas blank:', isBlank, 'size:', this.capturedMapCanvas.width, 'x', this.capturedMapCanvas.height);
                    if (!isBlank) {
                    console.log('✅ Using pre-captured map canvas');
                    
                        const croppedCanvas = this.cropCapturedCanvasToPolygonBounds(
                            this.capturedMapCanvas,
                            this.capturedTextureBounds,
                            this.originalBounds
                        );
                        console.log('🧮 Cropped canvas size:', croppedCanvas.width, 'x', croppedCanvas.height);
                        
                        const texture = new THREE.CanvasTexture(croppedCanvas);
                    texture.needsUpdate = true;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                        if (THREE && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

                    console.log('✅ Map texture created from pre-captured canvas');
                    resolve(texture);
                    return;
                    } else {
                        console.warn('⚠️ Captured canvas appears blank; falling back to tiles.');
                    }
                }

                // Fallback: build texture from map tiles (CORS-safe)
                console.warn('⚠️ No valid pre-captured canvas available, generating from tiles...');
                this.createTileTextureCanvas(this.originalBounds).then((tileCanvas) => {
                    const texture = new THREE.CanvasTexture(tileCanvas);
                        texture.needsUpdate = true;
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                    if (THREE && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
                    console.log('✅ Map texture generated from tiles');
                        resolve(texture);
                }).catch((error) => {
                    console.error('❌ Tile texture generation failed:', error);
                        this.createFallbackTexture(resolve, reject);
                    });

            } catch (error) {
                console.error('❌ Error creating map texture:', error);
                this.createFallbackTexture(resolve, reject);
            }
        });
    }

    /**
     * Determine if a canvas likely contains no rendered map content
     */
    isCanvasBlank(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const sample = 10;
            // Sample a 10x10 grid
            for (let y = 0; y < sample; y++) {
                for (let x = 0; x < sample; x++) {
                    const px = Math.floor((x + 0.5) * w / sample);
                    const py = Math.floor((y + 0.5) * h / sample);
                    const data = ctx.getImageData(px, py, 1, 1).data;
                    const a = data[3];
                    const r = data[0], g = data[1], b = data[2];
                    // Any non-transparent and non-near-white pixel indicates content
                    if (a > 0 && (r < 240 || g < 240 || b < 240)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (e) {
            // If reading pixels fails, assume not blank to avoid false negatives
            return false;
        }
    }

    /**
     * Create a canvas by stitching map tiles for the given Leaflet bounds
     */
    async createTileTextureCanvas(bounds) {
        if (!bounds) throw new Error('Missing bounds for tile texture');

        // Desired max size for longer side in pixels
        const maxSize = 1024;

        // Convert bounds to Web Mercator normalized coordinates
        const west = bounds.getWest();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const south = bounds.getSouth();

        const xW = this.lonToX(west);
        const xE = this.lonToX(east);
        const yN = this.latToY(north);
        const yS = this.latToY(south);

        // Choose a zoom such that the longer side is ~maxSize
        const estimateZoomForPixels = (dx, dy) => {
            // pixels = (delta * 256 * 2^z)
            const maxDelta = Math.max(dx, dy);
            const z = Math.max(0, Math.min(19, Math.ceil(Math.log2(maxSize / (256 * maxDelta)))));
            return z;
        };
        const zoom = estimateZoomForPixels(xE - xW, yS - yN);
        const scale = Math.pow(2, zoom);

        // Calculate pixel rectangle of bounds at this zoom
        const pxW = xW * 256 * scale;
        const pxE = xE * 256 * scale;
        const pyN = yN * 256 * scale;
        const pyS = yS * 256 * scale;
        const rectWidth = Math.max(1, Math.round(pxE - pxW));
        const rectHeight = Math.max(1, Math.round(pyS - pyN));

        // Determine tile range needed
        const tileX0 = Math.floor(pxW / 256);
        const tileY0 = Math.floor(pyN / 256);
        const tileX1 = Math.floor((pxE - 1) / 256);
        const tileY1 = Math.floor((pyS - 1) / 256);

        const tilesWide = tileX1 - tileX0 + 1;
        const tilesHigh = tileY1 - tileY0 + 1;

        // Create a canvas to draw the full tile grid and fill checkerboard background
        const tilesCanvas = document.createElement('canvas');
        tilesCanvas.width = tilesWide * 256;
        tilesCanvas.height = tilesHigh * 256;
        const tctx = tilesCanvas.getContext('2d');
        // Checkerboard for visibility
        for (let y = 0; y < tilesCanvas.height; y += 32) {
            for (let x = 0; x < tilesCanvas.width; x += 32) {
                tctx.fillStyle = ((x / 32 + y / 32) % 2 === 0) ? '#ddd' : '#bbb';
                tctx.fillRect(x, y, 32, 32);
            }
        }

        // Fetch and draw tiles (use dark tiles to match the Leaflet layer)
        const subdomains = ['a', 'b', 'c'];
        const tilePromises = [];
        let drawnCount = 0;
        for (let ty = tileY0; ty <= tileY1; ty++) {
            for (let tx = tileX0; tx <= tileX1; tx++) {
                const sx = (tx - tileX0) * 256;
                const sy = (ty - tileY0) * 256;
                const sub = subdomains[(tx + ty) % subdomains.length];
                const url = `https://${sub}.basemaps.cartocdn.com/light_all/${zoom}/${tx}/${ty}.png`;
                tilePromises.push(new Promise((res) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => { try { tctx.drawImage(img, sx, sy); drawnCount++; } catch(_) {} res(); };
                    img.onerror = () => res();
                    img.src = url;
                }));
            }
        }
        await Promise.all(tilePromises);
        console.log('🧩 Tiles drawn:', drawnCount, '/', tilesWide * tilesHigh);

        // Crop the tiles canvas to the exact pixel rect for bounds
        const cropX = Math.round(pxW - tileX0 * 256);
        const cropY = Math.round(pyN - tileY0 * 256);
        const cropped = document.createElement('canvas');
        cropped.width = rectWidth;
        cropped.height = rectHeight;
        const cctx = cropped.getContext('2d');
        cctx.drawImage(tilesCanvas, cropX, cropY, rectWidth, rectHeight, 0, 0, rectWidth, rectHeight);

        // Optional border for visibility
        cctx.strokeStyle = 'rgba(0,0,0,0.5)';
        cctx.lineWidth = 1;
        cctx.strokeRect(0.5, 0.5, rectWidth - 1, rectHeight - 1);

        return cropped;
    }

    lonToX(lon) {
        return (lon + 180) / 360;
    }

    latToY(lat) {
        const latRad = lat * Math.PI / 180;
        const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
        return (1 - y / Math.PI) / 2;
    }

    /**
     * Crop the captured canvas to the polygon's bounding box, based on capture and polygon bounds
     */
    cropCapturedCanvasToPolygonBounds(canvas, captureBounds, polygonLeafletBounds) {
        try {
            if (!canvas || !captureBounds || !polygonLeafletBounds) {
                return canvas;
            }
            const capNorth = captureBounds.north;
            const capSouth = captureBounds.south;
            const capWest = captureBounds.west;
            const capEast = captureBounds.east;

            const polyNorth = polygonLeafletBounds.getNorth();
            const polySouth = polygonLeafletBounds.getSouth();
            const polyWest = polygonLeafletBounds.getWest();
            const polyEast = polygonLeafletBounds.getEast();

            const u0 = Math.max(0, Math.min(1, (polyWest - capWest) / (capEast - capWest)));
            const u1 = Math.max(0, Math.min(1, (polyEast - capWest) / (capEast - capWest)));
            const v0 = Math.max(0, Math.min(1, (capNorth - polyNorth) / (capNorth - capSouth)));
            const v1 = Math.max(0, Math.min(1, (capNorth - polySouth) / (capNorth - capSouth)));

            const srcX = Math.round(u0 * canvas.width);
            const srcY = Math.round(v0 * canvas.height);
            const srcW = Math.max(1, Math.round((u1 - u0) * canvas.width));
            const srcH = Math.max(1, Math.round((v1 - v0) * canvas.height));

            // Guard against over-cropping which could yield an invisible texture
            if (srcW < 32 || srcH < 32) {
                return canvas;
            }

            const out = document.createElement('canvas');
            out.width = srcW;
            out.height = srcH;
            const ctx = out.getContext('2d');
            ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
            // Add a subtle border to confirm texture rendering
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, out.width - 2, out.height - 2);
            return out;
        } catch (e) {
            console.warn('Could not crop captured canvas, using full canvas', e);
            return canvas;
        }
    }

    /**
     * Create a simple fallback texture when map capture fails
     */
    createFallbackTexture(resolve, reject) {
        try {
            console.log('🎨 Creating fallback texture...');
            
            // Create a simple colored texture as fallback
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            
            // Fill with a subtle background
            ctx.fillStyle = '#e8f4f8';
            ctx.fillRect(0, 0, 1024, 1024);
            
            // Add some grid lines for reference
            ctx.strokeStyle = '#d0d0d0';
            ctx.lineWidth = 1;
            for (let i = 0; i < 1024; i += 64) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, 1024);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(1024, i);
                ctx.stroke();
            }
            
            // Add text
            ctx.fillStyle = '#666';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Map Overlay', 512, 512);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            
            console.log('✅ Fallback texture created');
            resolve(texture);
            
        } catch (error) {
            console.error('❌ Failed to create fallback texture:', error);
            reject(error);
        }
    }

    /**
     * Clean up the 3D map overlay resources
     */
    destroyMapOverlay() {
        if (this.mapOverlayPlane) {
            // Remove from scene
            this.scene.remove(this.mapOverlayPlane);
            
            // Dispose of geometry and material
            if (this.mapOverlayPlane.geometry) {
                this.mapOverlayPlane.geometry.dispose();
            }
            if (this.mapOverlayPlane.material) {
                if (this.mapOverlayPlane.material.map) {
                    this.mapOverlayPlane.material.map.dispose();
                }
                this.mapOverlayPlane.material.dispose();
            }
            
            this.mapOverlayPlane = null;
            this.needsRender = true;
        }
        
        if (this.mapTexture) {
            this.mapTexture.dispose();
            this.mapTexture = null;
        }
    }

    /**
     * Add boundary overlay to captured texture
     */
    addBoundaryToTexture(texture, canvas) {
        if (!this.originalBoundary || this.originalBoundary.length === 0) return;

        const ctx = canvas.getContext('2d');
        const bounds = this.originalBounds;
        const latRange = bounds.getNorth() - bounds.getSouth();
        const lngRange = bounds.getEast() - bounds.getWest();

        // Draw boundary outline on captured map
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 6;
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();

        this.originalBoundary.forEach((point, index) => {
            const x = ((point.lng - bounds.getWest()) / lngRange) * canvas.width;
            const y = ((bounds.getNorth() - point.lat) / latRange) * canvas.height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.closePath();
        ctx.stroke();

        // Update texture
        texture.needsUpdate = true;
    }

    /**
     * Fallback texture creation when html2canvas fails
     */
    createFallbackTexture(map, hiddenDiv, resolve, reject) {
        try {
            console.log('🎨 Creating enhanced fallback texture...');
            
            // Create canvas manually 
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');

            // Create a detailed pattern-based texture that looks more like a real map
            this.createDetailedFallbackTexture(ctx, canvas, resolve, reject, map, hiddenDiv);

        } catch (error) {
            console.error('❌ Fallback texture creation failed:', error);
            map.remove();
            document.body.removeChild(hiddenDiv);
            reject(error);
        }
    }

    /**
     * Create detailed fallback texture with better map-like appearance
     */
    createDetailedFallbackTexture(ctx, canvas, resolve, reject, map, hiddenDiv) {
        // Base color - light map-like background
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(0, 0, 1024, 1024);

        // Add major road network
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 12;
        
        // Major roads (highways)
        for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 170, 0);
            ctx.lineTo(i * 170, 1024);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * 170);
            ctx.lineTo(1024, i * 170);
            ctx.stroke();
        }

        // Secondary roads
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 6;
        for (let i = 1; i < 12; i++) {
            if (i % 2 === 0) continue; // Skip some to avoid overcrowding
            ctx.beginPath();
            ctx.moveTo(i * 85, 0);
            ctx.lineTo(i * 85, 1024);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * 85);
            ctx.lineTo(1024, i * 85);
            ctx.stroke();
        }

        // Add building blocks
        ctx.fillStyle = 'rgba(180, 180, 180, 0.4)';
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * 950;
            const y = Math.random() * 950;
            const w = 15 + Math.random() * 40;
            const h = 15 + Math.random() * 40;
            ctx.fillRect(x, y, w, h);
        }

        // Add green spaces (parks)
        ctx.fillStyle = 'rgba(144, 238, 144, 0.5)';
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * 800;
            const y = Math.random() * 800;
            const size = 40 + Math.random() * 80;
            ctx.beginPath();
            ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Add water features
        ctx.fillStyle = 'rgba(173, 216, 230, 0.6)';
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * 700;
            const y = Math.random() * 700;
            const w = 100 + Math.random() * 200;
            const h = 50 + Math.random() * 100;
            ctx.fillRect(x, y, w, h);
        }

        // Draw boundary outline - most prominent
        if (this.originalBoundary && this.originalBoundary.length > 0) {
            const bounds = this.originalBounds;
            const latRange = bounds.getNorth() - bounds.getSouth();
            const lngRange = bounds.getEast() - bounds.getWest();

            // Fill area with subtle color
            ctx.fillStyle = 'rgba(102, 126, 234, 0.08)';
            ctx.beginPath();

            this.originalBoundary.forEach((point, index) => {
                const x = ((point.lng - bounds.getWest()) / lngRange) * 1024;
                const y = ((bounds.getNorth() - point.lat) / latRange) * 1024;

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.closePath();
            ctx.fill();

            // Draw prominent outline
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 8;
            ctx.setLineDash([]);
            ctx.stroke();
        }

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Cleanup
        map.remove();
        document.body.removeChild(hiddenDiv);

        console.log('✅ Enhanced map-like texture created');
        resolve(texture);
    }

    /**
     * Attempt to manually capture map tiles
     */
    captureMapTiles(map, hiddenDiv, resolve, reject) {
        console.log('🗺️ Attempting manual tile capture...');
        // For now, fall back to enhanced detailed texture
        // In a full implementation, this would fetch individual tile images
        this.createFallbackTexture(map, hiddenDiv, resolve, reject);
    }

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

    handleResize() {
        if (!this.camera || !this.renderer) return;
        
        const container = document.getElementById('builderCanvas');
        const rect = container.getBoundingClientRect();
        
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
        this.needsRender = true;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Only render when needed for performance
        if (this.needsRender) {
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
                this.needsRender = false;
            }
        }
    }

    // Set hover effect on object
    setHover(object) {
        if (this.hoveredObject === object) return;
        
        this.hoveredObject = object;
        
        // Store original material if not already stored
        if (!this.originalMaterials.has(object)) {
            this.originalMaterials.set(object, object.material);
        }
        
        // Apply hover material
        object.material = this.hoverMaterial;
        this.needsRender = true;
    }

    // Clear hover effect
    clearHover() {
        if (this.hoverIndicator) {
            this.hoverIndicator.visible = false;
        }
        if (this.hoveredObject) {
            if (this.originalMaterials.has(this.hoveredObject)) {
            const originalMaterial = this.originalMaterials.get(this.hoveredObject);
                this.hoveredObject.material = originalMaterial;
                this.originalMaterials.delete(this.hoveredObject);
            }
            this.hoveredObject = null;
            this.needsRender = true;
        }
    }

    // Place a block beneath a clicked block (find nearest empty level below)
    placeBelowBlock(existingBlockData, options = {}) {
        const x = existingBlockData.position.x;
        const z = existingBlockData.position.z;
        let target = existingBlockData.yLevel - 1;
        while (target >= 0) {
            const id = `${x}_${target}_${z}`;
            if (!this.blocks.has(id)) break;
            target--;
        }
        if (target < 0) return; // no space below
        this.createBlockAt(x, z, target, options);
    }

    // Place a block beneath within a grid column (nearest empty below highest or at ground)
    placeBelowAtGrid(gridPoint) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        let highest = -1;
        const occupied = new Set();
        this.blocks.forEach((bd) => {
            if (bd.position.x === x && bd.position.z === z) {
                occupied.add(bd.yLevel);
                if (bd.yLevel > highest) highest = bd.yLevel;
            }
        });
        // If no blocks, place at ground
        if (highest < 0) {
            this.createBlockAt(x, z, 0);
            return;
        }
        // Find nearest empty below highest
        let target = highest - 1;
        while (target >= 0 && occupied.has(target)) target--;
        if (target >= 0) {
            this.createBlockAt(x, z, target, { skipValidation: true });
        }
    }

    isOccupiedAtLevel(x, yLevel, z) {
        return this.blocks.has(`${x}_${yLevel}_${z}`);
    }

    // Place a block directly above the clicked block (first free level above it)
    placeAboveBlock(existingBlockData, options = {}) {
        const x = existingBlockData.position.x;
        const z = existingBlockData.position.z;
        let target = existingBlockData.yLevel + 1;
        while (this.blocks.has(`${x}_${target}_${z}`)) {
            target++;
        }
        this.createBlockAt(x, z, target, options);
    }

    // Place at the lowest available level in the column (ground if empty)
    placeAtLowestAvailableAtGrid(gridPoint) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        let level = 0;
        while (this.blocks.has(`${x}_${level}_${z}`)) {
            level++;
        }
        this.createBlockAt(x, z, level);
    }
} 