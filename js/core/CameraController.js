/**
 * CameraController - Handles camera positioning, controls, and interaction modes
 * 
 * Manages:
 * - Camera modes (rotate, pan, build)
 * - Mouse and keyboard controls
 * - Zoom behavior with cursor centering
 * - Camera positioning and boundaries
 */
class CameraController {
    constructor(sceneManager, mapOverlay = null) {
        this.sceneManager = sceneManager;
        this.mapOverlay = mapOverlay;
        
        // === Camera State ===
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.gridCenter = new THREE.Vector3(0, 0, 0);
        this.cameraMode = 'rotate'; // 'rotate' | 'pan' | 'build'
        this.initialCameraState = null;
        
        // === Control State ===
        this.isRotating = false;
        this.isPanning = false;
        this.lastMouse = { x: 0, y: 0 };
        this.rotationSpeed = 0.005;
        this.panSpeed = 0.001;
        
        // === Zoom Settings ===
        this.minDistance = 3;
        this.maxDistance = 100;
        this.isWheelZooming = false;
        this.lastPointerNDC = new THREE.Vector2(0, 0);
        
        // === Ground Plane for Raycasting ===
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        // === Grid Properties ===
        this.gridSize = { width: 0, height: 0 };
    }

    /**
     * Initialize camera controls and event listeners
     */
    setupCameraControls() {
        console.log('🎮 Setting up camera controls');
        
        this.setupCameraModeControls();
        this.setupSimplePanControls();
        this.setupKeyboardControls();
        this.setupWheelZoomHandler();
    }

    /**
     * Set up camera mode buttons (rotate, pan, build)
     */
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
     * Activate build mode programmatically
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

    /**
     * Update cursor style based on camera mode
     */
    updateCursorStyle() {
        const canvas = this.sceneManager.getDomElement();
        if (!canvas) return;
        
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

    /**
     * Set up mouse controls for camera movement
     */
    setupSimplePanControls() {
        const domElement = this.sceneManager.getDomElement();
        if (!domElement) return;
        
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
                this.handleRotation(deltaX, deltaY);
            } else if (this.isPanning) {
                this.handlePanning(deltaX, deltaY);
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

    /**
     * Handle camera rotation
     */
    handleRotation(deltaX, deltaY) {
        const spherical = new THREE.Spherical();
        const offset = this.sceneManager.camera.position.clone().sub(this.cameraTarget);
        spherical.setFromVector3(offset);
        
        spherical.theta -= deltaX * this.rotationSpeed;
        spherical.phi += deltaY * this.rotationSpeed;
        
        // Clamp phi to prevent going underground
        spherical.phi = Math.max(0.1, Math.min(Math.PI * 0.9, spherical.phi));
        
        offset.setFromSpherical(spherical);
        this.sceneManager.camera.position.copy(this.cameraTarget).add(offset);
        this.sceneManager.camera.lookAt(this.cameraTarget);
        
        this.sceneManager.requestRender();
    }

    /**
     * Handle camera panning
     */
    handlePanning(deltaX, deltaY) {
        const distance = this.sceneManager.camera.position.distanceTo(this.cameraTarget);
        const panSpeed = distance * this.panSpeed * 2;
        
        // Get screen-space movement vectors
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        
        // Right = camera's local X axis
        right.setFromMatrixColumn(this.sceneManager.camera.matrix, 0);
        // Up = camera's local Y axis projected to horizontal plane
        up.setFromMatrixColumn(this.sceneManager.camera.matrix, 1);
        up.y = 0; // Keep movement horizontal
        up.normalize();
        
        // Move camera position directly
        const moveRight = right.clone().multiplyScalar(-deltaX * panSpeed);
        const moveUp = up.clone().multiplyScalar(deltaY * panSpeed);
        
        this.sceneManager.camera.position.add(moveRight);
        this.sceneManager.camera.position.add(moveUp);
        
        // Update target to maintain the same relative view direction
        this.cameraTarget.add(moveRight);
        this.cameraTarget.add(moveUp);
        
        this.sceneManager.requestRender();
    }

    /**
     * Set up wheel zoom handling
     */
    setupWheelZoomHandler() {
        console.log('🔧 Setting up wheel zoom handler');
        const domElement = this.sceneManager.getDomElement();
        if (!domElement) return;
        
        // Remove any existing handlers
        if (this._wheelHandler) {
            domElement.removeEventListener('wheel', this._wheelHandler, true);
            document.removeEventListener('wheel', this._wheelHandler, true);
        }
        
        this._wheelHandler = (event) => {
            // Only handle if the event target is our canvas or its children
            if (!domElement.contains(event.target) && event.target !== domElement) {
                return;
            }
            
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            
            const rect = domElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Check if mouse is over the canvas
            if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
                return;
            }
            
            this.handleWheelZoom(event, x, y, rect);
            return false;
        };
        
        // Add to multiple targets to ensure we catch it
        domElement.addEventListener('wheel', this._wheelHandler, { passive: false, capture: true });
        document.addEventListener('wheel', this._wheelHandler, { passive: false, capture: true });
    }

    /**
     * Handle wheel zoom with cursor centering
     */
    handleWheelZoom(event, mouseX, mouseY, canvasRect) {
        this.isWheelZooming = true;

        // Convert to NDC
        const ndcX = (mouseX / canvasRect.width) * 2 - 1;
        const ndcY = -(mouseY / canvasRect.height) * 2 + 1;
        this.lastPointerNDC.set(ndcX, ndcY);
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.lastPointerNDC, this.sceneManager.camera);
        
        // Find hit point - try map overlay first, then ground plane
        let hitPoint = null;
        if (this.mapOverlay && this.mapOverlay.mapOverlayPlane && this.mapOverlay.mapOverlayPlane.visible) {
            const isects = raycaster.intersectObject(this.mapOverlay.mapOverlayPlane, true);
            if (isects && isects.length > 0) {
                hitPoint = isects[0].point.clone();
            }
        }
        if (!hitPoint) {
            const hp = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(this.groundPlane, hp)) {
                hitPoint = hp;
            }
        }
        
        if (!hitPoint) {
            this.isWheelZooming = false;
            return;
        }

        // Zoom logic
        const deltaY = event.deltaY || 0;
        const isZoomIn = deltaY < 0;
        const zoomFactor = isZoomIn ? 1 / 1.1 : 1.1;

        if (isZoomIn) {
            // ZOOM IN: Make cursor position the new center/target
            const currentDistance = this.sceneManager.camera.position.distanceTo(this.cameraTarget);
            const newDistance = Math.max(this.minDistance, currentDistance * zoomFactor);
            
            // Set cursor hit point as new target
            this.cameraTarget.copy(hitPoint);
            
            // Position camera at appropriate distance from new target
            const currentViewDir = this.sceneManager.camera.position.clone().sub(this.cameraTarget).normalize();
            this.sceneManager.camera.position.copy(this.cameraTarget).add(currentViewDir.multiplyScalar(newDistance));
        } else {
            // ZOOM OUT: Return toward initial overview as we approach max distance
            const currentDistance = this.sceneManager.camera.position.distanceTo(this.cameraTarget);
            const newDistance = Math.min(this.maxDistance, currentDistance * zoomFactor);
            
            // Calculate how close we are to max zoom (0 = close, 1 = at max)
            const zoomProgress = Math.min(1, newDistance / this.maxDistance);
            
            // Interpolate toward initial camera state as we zoom out
            if (this.initialCameraState && zoomProgress > 0.6) {
                const lerpFactor = (zoomProgress - 0.6) / 0.4;
                this.cameraTarget.lerp(this.initialCameraState.target, lerpFactor * 0.3);
                
                // Clamp target to stay within reasonable bounds
                if (this.gridSize && this.gridSize.width > 0) {
                    const margin = Math.max(this.gridSize.width, this.gridSize.height) * 0.3;
                    this.cameraTarget.x = Math.max(-margin, Math.min(this.gridSize.width + margin, this.cameraTarget.x));
                    this.cameraTarget.z = Math.max(-margin, Math.min(this.gridSize.height + margin, this.cameraTarget.z));
                    this.cameraTarget.y = 0;
                }
                
                // Position camera based on zoom level
                if (zoomProgress > 0.9) {
                    const direction = this.initialCameraState.position.clone().sub(this.cameraTarget);
                    direction.normalize().multiplyScalar(newDistance);
                    this.sceneManager.camera.position.copy(this.cameraTarget).add(direction);
                } else {
                    const viewDir = this.sceneManager.camera.position.clone().sub(this.cameraTarget);
                    viewDir.normalize().multiplyScalar(newDistance);
                    this.sceneManager.camera.position.copy(this.cameraTarget).add(viewDir);
                }
            } else {
                // Normal zoom out behavior when not near max
                const viewDir = this.sceneManager.camera.position.clone().sub(this.cameraTarget);
                viewDir.normalize().multiplyScalar(newDistance);
                this.sceneManager.camera.position.copy(this.cameraTarget).add(viewDir);
            }
            
            // Ensure camera looks at target after zoom out
            this.sceneManager.camera.lookAt(this.cameraTarget);
        }

        this.sceneManager.requestRender();
        
        // Clear zooming guard
        requestAnimationFrame(() => {
            this.isWheelZooming = false;
        });
    }

    /**
     * Set up keyboard controls
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardInput(event);
        });
    }

    /**
     * Handle keyboard input for camera movement
     */
    handleKeyboardInput(event) {
        if (!this.gridCenter) return;

        const rotateSpeed = 0.05;
        let moved = false;

        switch(event.code) {
            case 'ArrowLeft':
            case 'NumpadLeft':
            case 'Numpad4':
                this.orbitAroundCenter(-rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowRight':
            case 'NumpadRight': 
            case 'Numpad6':
                this.orbitAroundCenter(rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowUp':
            case 'NumpadUp':
            case 'Numpad8':
                this.orbitVertical(-rotateSpeed);
                moved = true;
                break;
                
            case 'ArrowDown':
            case 'NumpadDown':
            case 'Numpad2':
                this.orbitVertical(rotateSpeed);
                moved = true;
                break;
        }

        if (moved) {
            event.preventDefault();
            this.sceneManager.requestRender();
        }
    }

    /**
     * Orbit camera horizontally around center
     */
    orbitAroundCenter(deltaTheta) {
        const offset = this.sceneManager.camera.position.clone().sub(this.cameraTarget);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        
        spherical.theta += deltaTheta;
        
        offset.setFromSpherical(spherical);
        this.sceneManager.camera.position.copy(this.cameraTarget).add(offset);
        this.sceneManager.camera.lookAt(this.cameraTarget);
    }

    /**
     * Orbit camera vertically around center
     */
    orbitVertical(deltaPhi) {
        const offset = this.sceneManager.camera.position.clone().sub(this.cameraTarget);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        
        spherical.phi += deltaPhi;
        spherical.phi = Math.max(Math.PI * 0.05, Math.min(Math.PI * 0.55, spherical.phi));
        
        offset.setFromSpherical(spherical);
        this.sceneManager.camera.position.copy(this.cameraTarget).add(offset);
        this.sceneManager.camera.lookAt(this.cameraTarget);
    }

    /**
     * Set camera position based on grid size
     */
    setCameraPosition() {
        if (!this.gridSize || this.gridSize.width === 0) return;
        
        // Ensure gridCenter is set
        const centerX = this.gridSize.width / 2;
        const centerZ = this.gridSize.height / 2;
        this.gridCenter.set(centerX, 0, centerZ);
        
        const distance = Math.max(this.gridSize.width, this.gridSize.height) * 1.2;
        const height = distance * 0.7;
        
        this.sceneManager.camera.position.set(
            this.gridCenter.x + distance * 0.7,
            height,
            this.gridCenter.z + distance * 0.7
        );
        
        this.sceneManager.camera.lookAt(this.gridCenter);
        
        // Update camera target
        this.cameraTarget.copy(this.gridCenter);
        this.maxDistance = distance * 1.5;
        
        // Store initial camera state for zoom out behavior
        this.initialCameraState = {
            position: this.sceneManager.camera.position.clone(),
            target: this.cameraTarget.clone(),
            distance: distance
        };

        // Update ground plane for land level
        this.groundPlane.constant = -this.sceneManager.landBaseY;
    }

    /**
     * Update grid size and recalculate camera bounds
     */
    updateGridSize(gridSize) {
        this.gridSize = gridSize;
        
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
        
        this.setCameraPosition();
    }

    /**
     * Reset camera to center overview
     */
    resetCameraToCenter() {
        this.cameraTarget.copy(this.gridCenter);
        this.setCameraPosition();
        this.sceneManager.camera.lookAt(this.cameraTarget);
        this.sceneManager.requestRender();
    }

    /**
     * Set top-down view
     */
    setTopDownView() {
        const centerX = this.gridSize.width / 2;
        const centerZ = this.gridSize.height / 2;
        const height = Math.max(this.gridSize.width, this.gridSize.height) * 1.5;
        
        this.cameraTarget.set(centerX, 0, centerZ);
        this.sceneManager.camera.position.set(centerX, height, centerZ);
        this.sceneManager.camera.lookAt(this.cameraTarget);
        this.sceneManager.requestRender();
    }

    /**
     * Zoom to fit specific area
     */
    zoomToArea(centerX, centerZ, zoomLevel = 10) {
        const targetPosition = new THREE.Vector3(centerX, 0, centerZ);
        this.animateCameraTo(targetPosition, zoomLevel);
    }

    /**
     * Animate camera to specific position
     */
    animateCameraTo(targetPosition, distance = 15, duration = 1000) {
        const startTarget = this.cameraTarget.clone();
        const startPosition = this.sceneManager.camera.position.clone();
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
            this.cameraTarget.lerpVectors(startTarget, endTarget, eased);
            this.sceneManager.camera.position.lerpVectors(startPosition, endPosition, eased);
            
            this.sceneManager.requestRender();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
} 