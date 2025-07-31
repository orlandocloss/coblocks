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
            this.setupGrid(event.detail.gridData, event.detail.gridSize);
        });

        this.setupColorPalette();
        this.setupControls();
    }

    /**
     * Setup color palette selection
     * Handles color option clicks and sets active color
     */
    setupColorPalette() {
        const colorOptions = document.querySelectorAll('.color-option');
        
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove active state from all options
                colorOptions.forEach(opt => opt.classList.remove('active'));
                
                // Set clicked option as active
                option.classList.add('active');
                this.selectedColor = option.dataset.color;
            });
        });
        
        // Initialize with first color
        if (colorOptions.length > 0) {
            colorOptions[0].classList.add('active');
            this.selectedColor = colorOptions[0].dataset.color;
        }
    }

    setupControls() {
        document.getElementById('clearBlocks').addEventListener('click', () => {
            this.clearAllBlocks();
        });

        document.getElementById('saveModel').addEventListener('click', () => {
            this.saveModel();
        });

        // Physics toggle button
        const physicsBtn = document.getElementById('togglePhysics');
        physicsBtn.addEventListener('click', () => {
            const enabled = this.toggleBlockPhysics();
            physicsBtn.textContent = `Physics: ${enabled ? 'ON' : 'OFF'}`;
            physicsBtn.classList.toggle('active', enabled);
        });

        // Camera control buttons
        document.getElementById('resetCamera').addEventListener('click', () => {
            this.resetCameraToCenter();
        });

        document.getElementById('topView').addEventListener('click', () => {
            this.setTopDownView();
        });

        document.getElementById('zoomToFit').addEventListener('click', () => {
            this.zoomToFitBlocks();
        });
    }

    
    setupGrid(gridData, gridSize) {
        this.gridData = gridData;
        this.gridSize = gridSize;
        
        if (!this.isInitialized) {
            this.initThreeJS();
        }
        
        this.createBaseGrid();
        this.setCameraPosition();
        
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
        
        // Hide placeholder
        const placeholder = document.querySelector('.placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
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
            60, 
            containerRect.width / containerRect.height, 
            0.1, 
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
        
        this.isInitialized = true;
    }

    setupCameraControls() {
        // Use proper OrbitControls if available, fallback to basic controls
        if (window.THREE.OrbitControls) {
            console.log('✅ Using Enhanced OrbitControls for camera');
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            
            // Simplified control settings - panning and zoom only
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.enableZoom = true;
            this.controls.enableRotate = false; // Disable rotation - arrows will handle this
            this.controls.enablePan = true; // Enable panning for mouse
            
            // Strict rotation limits to prevent going beneath map
            this.controls.maxPolarAngle = Math.PI * 0.6;  // Don't go too low (108 degrees max)
            this.controls.minPolarAngle = Math.PI * 0.05; // Don't go too high (9 degrees min)
            
            // Calculate max distance to match center button
            const maxDistance = this.gridSize && this.gridSize.width > 0 
                ? Math.max(this.gridSize.width, this.gridSize.height) * 1.2 
                : 50; // Default if no grid yet
            
            // Zoom settings with center button as max distance
            this.controls.minDistance = 3;    // Minimum zoom in
            this.controls.maxDistance = maxDistance;  // Max zoom matches center button
            this.controls.zoomSpeed = 0.8;
            this.controls.rotateSpeed = 0.6;
            
            // Simplified mouse controls - only panning and zoom
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,      // Left click + drag = pan/move
                MIDDLE: THREE.MOUSE.DOLLY,  // Middle = zoom
                RIGHT: undefined            // Disable right click
            };
            
            // Touch controls for mobile - simplified
            this.controls.touches = {
                ONE: THREE.TOUCH.PAN,       // One finger = pan/move
                TWO: THREE.TOUCH.DOLLY_PAN  // Two fingers = zoom + pan
            };
            
            // Set initial target to grid center (if gridSize is available)
            if (this.gridSize && this.gridSize.width > 0) {
                const centerX = this.gridSize.width / 2;
                const centerZ = this.gridSize.height / 2;
                this.gridCenter = new THREE.Vector3(centerX, 0, centerZ);
                this.controls.target.copy(this.gridCenter);
                
                // Set initial camera position
                this.setCameraPosition();
            } else {
                // Default position if no grid size yet
                this.gridCenter = new THREE.Vector3(0, 0, 0);
                this.controls.target.copy(this.gridCenter);
            }
            
            // Set up enhanced zoom behavior - zoom out brings us to center
            this.setupCenteringZoomBehavior();
            
            // Trigger render on control changes and enforce boundaries
            this.controls.addEventListener('change', () => {
                this.enforceBoundaries();
                this.needsRender = true;
            });
            
            // Set up keyboard controls for camera movement
            this.setupKeyboardControls();
            
        } else {
            console.log('⚠️ OrbitControls not found, using enhanced fallback controls');
            this.setupEnhancedBasicControls();
        }
    }

    setupCenteringZoomBehavior() {
        // Override the zoom behavior to return to starting view when zooming out
        const domElement = this.renderer.domElement;
        
        // Store reference to original zoom handling
        const scope = this;
        
        // Calculate initial starting camera position and target
        const getStartingCameraState = () => {
            if (!scope.gridCenter || !scope.gridSize || scope.gridSize.width === 0) {
                return null;
            }
            
            const distance = Math.max(scope.gridSize.width, scope.gridSize.height) * 1.2;
            const height = distance * 0.7;
            
            return {
                position: new THREE.Vector3(
                    scope.gridCenter.x + distance * 0.7,
                    height,
                    scope.gridCenter.z + distance * 0.7
                ),
                target: scope.gridCenter.clone()
            };
        };
        
        // Custom wheel event handler
        function onMouseWheel(event) {
            event.preventDefault();
            event.stopPropagation();
            
            const delta = event.deltaY;
            const zoomOut = delta > 0;
            
            // Get current distance
            const currentDistance = scope.camera.position.distanceTo(scope.controls.target);
            const maxDistance = scope.controls.maxDistance;
            
            if (zoomOut) {
                // Zooming out - move towards starting view
                const zoomFactor = 1.1;
                const newDistance = Math.min(currentDistance * zoomFactor, maxDistance);
                
                // Get starting camera state
                const startingState = getStartingCameraState();
                if (startingState) {
                    // Calculate how much to interpolate towards starting view based on zoom level
                    const zoomProgress = Math.min(1, currentDistance / (maxDistance * 0.7));
                    
                    // Interpolate target towards starting target (grid center)
                    scope.controls.target.lerp(startingState.target, zoomProgress * 0.3);
                    
                    // If we're near max zoom, position camera at starting position
                    if (newDistance >= maxDistance * 0.85) {
                        const direction = startingState.position.clone().sub(scope.controls.target);
                        direction.normalize().multiplyScalar(maxDistance);
                        scope.camera.position.copy(scope.controls.target).add(direction);
                    } else {
                        // Normal zoom out
                        const direction = scope.camera.position.clone().sub(scope.controls.target);
                        direction.normalize().multiplyScalar(newDistance);
                        scope.camera.position.copy(scope.controls.target).add(direction);
                    }
                }
                
            } else {
                // Zooming in - normal behavior
                const zoomFactor = 1 / 1.1;
                const direction = scope.camera.position.clone().sub(scope.controls.target);
                direction.multiplyScalar(zoomFactor);
                
                // Clamp to min distance
                if (direction.length() >= scope.controls.minDistance) {
                    scope.camera.position.copy(scope.controls.target).add(direction);
                } else {
                    direction.normalize().multiplyScalar(scope.controls.minDistance);
                    scope.camera.position.copy(scope.controls.target).add(direction);
                }
            }
            
            scope.controls.update();
            scope.needsRender = true;
        }
        
        // Add the custom wheel listener
        domElement.addEventListener('wheel', onMouseWheel, { passive: false });
        
        // Disable the default OrbitControls zoom to prevent conflicts
        this.controls.enableZoom = false;
    }

    enforceBoundaries() {
        if (!this.controls || !this.gridSize || this.gridSize.width === 0) return;
        
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
        
        // Update controls if they exist
        if (this.controls) {
            this.controls.target.copy(this.gridCenter);
            this.controls.update();
        }
    }

    // Method to zoom to a specific area
    zoomToArea(centerX, centerZ, zoomLevel = 10) {
        const targetPosition = new THREE.Vector3(centerX, 0, centerZ);
        
        // Animate to new target
        this.animateCameraTo(targetPosition, zoomLevel);
    }



    // Animate camera to specific position
    animateCameraTo(targetPosition, distance = 15, duration = 1000) {
        const startTarget = this.controls.target.clone();
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
                if (direction.length() >= minDistance) {
                    this.camera.position.copy(this.currentTarget).add(direction);
                } else {
                    direction.normalize().multiplyScalar(minDistance);
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
        // Remove existing grid
        if (this.baseGrid) {
            this.scene.remove(this.baseGrid);
        }

        // Create base plane for each grid square
        const gridGroup = new THREE.Group();
        
        this.gridData.forEach(gridPoint => {
            // Create base square
            const geometry = new THREE.PlaneGeometry(this.blockSize, this.blockSize);
            const material = new THREE.MeshLambertMaterial({ 
                color: 0xe0e0e0,
                transparent: true,
                opacity: 0.3
            });
            
            const square = new THREE.Mesh(geometry, material);
            square.rotation.x = -Math.PI / 2;
            square.position.set(gridPoint.gridX, 0, gridPoint.gridY);
            square.userData = { gridPoint };
            
            gridGroup.add(square);
        });

        this.baseGrid = gridGroup;
        this.scene.add(this.baseGrid);
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

            // Raycast for hover effects
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Get all interactive objects
            const allMeshes = [];
            if (this.baseGrid) {
                allMeshes.push(...this.baseGrid.children);
            }
            this.blocks.forEach(blockData => {
                if (blockData.mesh) {
                    allMeshes.push(blockData.mesh);
                }
            });
            
            const intersects = this.raycaster.intersectObjects(allMeshes);
            
            // Clear previous hover
            this.clearHover();
            
            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;
                this.setHover(intersectedObject);
            }
        });

        // Clear hover when mouse leaves canvas
        this.renderer.domElement.addEventListener('mouseleave', () => {
            this.clearHover();
        });

        // Mouse click for placing/removing blocks
        this.renderer.domElement.addEventListener('click', (event) => {
            // Don't handle clicks if we're dragging
            if (event.target !== this.renderer.domElement) return;
            
            // Calculate mouse position
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast against all objects (blocks and base grid)
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Get all block meshes for raycasting
            const allMeshes = [];
            if (this.baseGrid) {
                allMeshes.push(...this.baseGrid.children);
            }
            this.blocks.forEach(blockData => {
                if (blockData.mesh) {
                    allMeshes.push(blockData.mesh);
                }
            });
            
            const intersects = this.raycaster.intersectObjects(allMeshes);
            
            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;
                
                if (event.shiftKey) {
                    // Remove block functionality
                    if (intersectedObject.userData.blockData) {
                        // Clicked on existing block - remove it
                        this.removeBlockByMesh(intersectedObject);
                    } else if (intersectedObject.userData.gridPoint) {
                        // Clicked on base grid - remove block at that position
                        this.removeBlock(intersectedObject.userData.gridPoint);
                    }
                } else {
                    // Add/stack block functionality
                    if (intersectedObject.userData.blockData) {
                        // Clicked on existing block - stack on top or to the side
                        this.handleBlockClick(intersectedObject, intersects[0]);
                    } else if (intersectedObject.userData.gridPoint) {
                        // Clicked on base grid - add new block
                        this.addOrStackBlock(intersectedObject.userData.gridPoint);
                    }
                }
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
        while (hasUnsupported && removedCount < 100) { // Safety limit
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
    handleBlockClick(blockMesh, intersection) {
        const blockData = blockMesh.userData.blockData;
        const clickPoint = intersection.point;
        const blockPos = blockData.position;
        
        // Determine if this is a top click (stack vertically) or side click (place adjacent)
        const relativeY = clickPoint.y - blockPos.y;
        const relativeHeight = relativeY / (this.blockSize / 2); // Use blockSize instead of height
        
        if (relativeHeight > 0.7) {
            // Click on top portion - stack vertically
            this.stackVertically(blockData);
        } else {
            // Click on side - place adjacent block
            this.placeAdjacentBlock(blockData, clickPoint);
        }
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
    placeAdjacentBlock(existingBlockData, clickPoint) {
        const blockPos = existingBlockData.position;
        
        // Determine which side was clicked
        const relativeX = clickPoint.x - blockPos.x;
        const relativeZ = clickPoint.z - blockPos.z;
        
        let newX = blockPos.x;
        let newZ = blockPos.z;
        
        // Choose the direction with the larger offset
        if (Math.abs(relativeX) > Math.abs(relativeZ)) {
            newX = blockPos.x + (relativeX > 0 ? 1 : -1);
        } else {
            newZ = blockPos.z + (relativeZ > 0 ? 1 : -1);
        }
        
        // Round to grid positions
        newX = Math.round(newX);
        newZ = Math.round(newZ);
        
        // Find the highest block at this X,Z position
        let highestLevel = -1;
        this.blocks.forEach((blockData, blockId) => {
            if (blockData.position.x === newX && blockData.position.z === newZ) {
                highestLevel = Math.max(highestLevel, blockData.yLevel);
            }
        });
        
        // Determine the Y level for the new block
        let newLevel;
        if (highestLevel >= 0) {
            // There are existing blocks - place on top of the highest one
            newLevel = highestLevel + 1;
        } else {
            // No existing blocks at this position - place at the same level as the clicked block
            newLevel = existingBlockData.yLevel;
        }
        
        this.createBlockAt(newX, newZ, newLevel);
    }

    // Create a block at specific coordinates
    createBlockAt(x, z, yLevel = 0) {
        // Check if block placement is valid (has support)
        if (this.enableBlockPhysics && !this.validateBlockPlacement(x, yLevel, z)) {
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
            
            alert(`Model saved! ${modelData.blocks.length} blocks in ${modelData.gridSize.width}×${modelData.gridSize.height} grid.`);
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
        if (this.hoveredObject) {
            // Restore original material
            const originalMaterial = this.originalMaterials.get(this.hoveredObject);
            if (originalMaterial) {
                this.hoveredObject.material = originalMaterial;
            }
            this.hoveredObject = null;
            this.needsRender = true;
        }
    }
} 