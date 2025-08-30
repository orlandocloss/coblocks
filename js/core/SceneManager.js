/**
 * SceneManager - Handles THREE.js scene setup, lighting, and rendering
 * 
 * Manages:
 * - Scene, camera, and renderer initialization
 * - Lighting setup (ambient, hemisphere, directional)
 * - Render loop and performance optimization
 * - Window resize handling
 */
class SceneManager {
    constructor() {
        // === THREE.js Core Components ===
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // === Rendering State ===
        this.needsRender = true;
        this.isInitialized = false;
        
        // === Grid Properties ===
        this.gridSize = { width: 0, height: 0 };
        this.landBaseY = 0.5; // Raise land above water
    }

    /**
     * Initialize THREE.js scene, camera, renderer, and lighting
     */
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
            powerPreference: "high-performance",
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(containerRect.width, containerRect.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0xe8f0f8, 1); // Light blue-turquoise background
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Lighting setup
        this.setupLighting();

        // Handle resize
        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);

        // Start render loop
        this.animate();
        
        this.isInitialized = true;
    }

    /**
     * Set up scene lighting
     */
    setupLighting() {
        // Ambient light for base illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Hemisphere light for cosy sky-ground ambience
        const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0xd8f2e0, 0.65);
        hemiLight.position.set(0, 60, 0);
        this.scene.add(hemiLight);

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

    /**
     * Handle window resize
     */
    handleResize() {
        if (!this.camera || !this.renderer) return;
        
        const container = document.getElementById('builderCanvas');
        const rect = container.getBoundingClientRect();
        
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
        this.needsRender = true;
    }

    /**
     * Update grid size and adjust camera far plane
     */
    updateGridSize(gridSize) {
        this.gridSize = gridSize;
        
        // Extend camera far plane to fit very large grids
        if (this.camera && this.gridSize) {
            const maxDim = Math.max(this.gridSize.width, this.gridSize.height);
            const desiredFar = Math.max(5000, maxDim * 10);
            if (this.camera.far < desiredFar) {
                this.camera.far = desiredFar;
                this.camera.updateProjectionMatrix();
            }
        }
    }

    /**
     * Main animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Trigger animation updates in other systems
        if (window.blockBuilder && window.blockBuilder.updateAnimations) {
            window.blockBuilder.updateAnimations();
        }
        
        // Only render when needed for performance
        if (this.needsRender) {
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
                this.needsRender = false;
            }
        }
    }

    /**
     * Request a render on the next frame
     */
    requestRender() {
        this.needsRender = true;
    }

    /**
     * Add object to scene
     */
    add(object) {
        if (this.scene) {
            this.scene.add(object);
            this.requestRender();
        }
    }

    /**
     * Remove object from scene
     */
    remove(object) {
        if (this.scene) {
            this.scene.remove(object);
            this.requestRender();
        }
    }

    /**
     * Get the renderer's DOM element
     */
    getDomElement() {
        return this.renderer ? this.renderer.domElement : null;
    }
} 