/**
 * App - Main application coordinator with stage management
 * 
 * Orchestrates:
 * - Stage transitions (map → loading → builder)
 * - Component initialization and lifecycle
 * - Global event handling and keyboard shortcuts
 * - Cross-component communication
 * - Error handling and user feedback
 */
class App {
    constructor() {
        // === Core Components ===
        this.mapManager = null;           // Leaflet map management
        this.gridGenerator = null;        // Grid generation system
        this.blockBuilder = null;         // 3D block building system
        
        // === Stage Management ===
        this.currentStage = 'map';        // Current active stage
        this.stages = {};                 // Will be populated after DOM is ready
        
        this.init();
    }

    init() {
        console.log('🚀 Initializing Blocks CoMap...');
        
        // Note: mozPressure/mozInputSource warnings are from Leaflet library and are harmless
        console.log('ℹ️ Mozilla deprecation warnings from Leaflet are expected and harmless');
        
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeApp());
        } else {
            this.initializeApp();
        }
    }

    initializeApp() {
        console.log('🏗️ Initializing Grid Builder...');
        
        try {
            // Initialize stage elements
            this.stages = {
                map: document.getElementById('mapStage'),
                loading: document.getElementById('loadingStage'),
                builder: document.getElementById('builderStage')
            };
            
            console.log('Stage elements found:', {
                map: !!this.stages.map,
                loading: !!this.stages.loading,
                builder: !!this.stages.builder
            });
            
            // Initialize components
            this.mapManager = new MapManager();
            this.gridGenerator = new GridGenerator();
            this.blockBuilder = new BlockBuilder();
            
            // Make components globally accessible
            window.mapManager = this.mapManager;
            window.gridGenerator = this.gridGenerator;
            window.blockBuilder = this.blockBuilder;
            window.app = this;
            
            // Set up global event listeners
            this.setupGlobalEvents();
            
            console.log('✅ Grid Builder initialized successfully!');
            
        } catch (error) {
            console.error('❌ Error initializing Grid Builder:', error);
            this.showErrorMessage('Failed to initialize the application. Please refresh and try again.');
        }
    }

    setupGlobalEvents() {
        // Handle keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });

        // Stage transition events
        window.addEventListener('boundaryCompleted', () => {
            console.log('📡 Received boundaryCompleted event');
            this.transitionToLoading();
        });

        window.addEventListener('gridGenerated', (event) => {
            console.log('📡 Grid generated successfully, transitioning to builder...');
            
            // Add a small delay to ensure loading animation is visible
            setTimeout(() => {
                this.transitionToBuilder();
            }, 1200);
        });

        // Map hint removed for clean interface
    }

    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + S for save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.saveModel();
        }
    }

    handleWindowResize() {
        // Ensure map resizes properly
        if (this.mapManager && this.mapManager.map) {
            setTimeout(() => {
                this.mapManager.map.invalidateSize();
            }, 100);
        }

        // Ensure 3D canvas resizes properly
        if (this.blockBuilder && this.blockBuilder.renderer) {
            this.blockBuilder.handleResize();
        }
    }

    // =====================================
    // STAGE MANAGEMENT
    // =====================================

    /**
     * Transition to a specific stage with smooth animation
     * @param {string} stageName - Name of stage to transition to
     */
    transitionToStage(stageName) {
        if (!this.stages[stageName]) {
            console.error(`❌ Stage element not found: ${stageName}`);
            return;
        }
        
        if (this.currentStage === stageName) return;

        const currentStageEl = this.stages[this.currentStage];
        const nextStageEl = this.stages[stageName];

        console.log(`🎬 ${this.currentStage} → ${stageName}`);

        // Start transition
        nextStageEl.classList.add('entering');
        
        // After a brief delay, switch active states
        setTimeout(() => {
            currentStageEl.classList.remove('active');
            nextStageEl.classList.remove('entering');
            nextStageEl.classList.add('active');
            this.currentStage = stageName;

            // Handle stage-specific initialization
            this.onStageEntered(stageName);
        }, 100);
    }

    /**
     * Handle actions when entering a specific stage
     * @param {string} stageName - Name of entered stage
     */
    onStageEntered(stageName) {
        console.log(`Entered stage: ${stageName}`);
        switch (stageName) {
            case 'map':
                // Clean map, no hints needed
                break;
            case 'loading':
                this.startLoadingAnimation();
                break;
            case 'builder':
                console.log('Builder stage entered, checking 3D canvas...');
                // Ensure 3D canvas is properly sized
                if (this.blockBuilder) {
                    setTimeout(() => {
                        if (this.blockBuilder.renderer) {
                            console.log('Resizing 3D canvas...');
                            this.blockBuilder.renderer.setSize(
                                this.blockBuilder.renderer.domElement.clientWidth,
                                this.blockBuilder.renderer.domElement.clientHeight
                            );
                            this.blockBuilder.needsRender = true;
                        }
                    }, 300);
                }
                break;
        }
    }

    // transitionToMap removed - no back button in minimal interface

    transitionToLoading() {
        this.transitionToStage('loading');
        
        // If loading takes too long, assume selection is too large and instruct restart
        const LOADING_TIMEOUT_MS = 15000; // 15s safety timeout
        const token = Symbol('loadingTimeout');
        this._loadingTimeoutToken = token;
        
        // Start loading bar indeterminate animation
        const fill = document.getElementById('loadingBarFill');
        if (fill) {
            fill.classList.add('indeterminate');
            fill.style.width = '0%';
        }
        
        setTimeout(() => {
            // Only fire if we're still in loading and the token matches
            if (this.currentStage === 'loading' && this._loadingTimeoutToken === token) {
                console.warn('Loading timeout reached. Likely too large selection or an error occurred.');
                // Signal cooperative generators to abort
                window.__abortGeneration = true;
                alert('This selection is too large for the map to handle right now and caused an error. Please restart and try a smaller area.');
            }
        }, LOADING_TIMEOUT_MS);
    }

    transitionToBuilder() {
        // Cancel any pending loading timeout
        this._loadingTimeoutToken = null;
        
        // Complete loading bar
        const fill = document.getElementById('loadingBarFill');
        if (fill) {
            fill.classList.remove('indeterminate');
            // animate to 100%
            requestAnimationFrame(() => {
                fill.style.width = '100%';
            });
        }
        
        this.transitionToStage('builder');
    }

    // Map hint methods removed for clean interface

    startLoadingAnimation() {
        // Update loading messages
        const messages = [
            "Converting boundary to 3×3m grid...",
            "Preparing 3D environment...",
            "Ready to build!"
        ];
        
        let messageIndex = 0;
        const messageEl = document.getElementById('loadingMessage');
        
        const updateMessage = () => {
            if (messageEl && messageIndex < messages.length) {
                messageEl.textContent = messages[messageIndex];
                messageIndex++;
                if (messageIndex < messages.length) {
                    setTimeout(updateMessage, 400);
                }
            }
        };
        
        updateMessage();
    }

    saveModel() {
        if (window.blockBuilder) {
            window.blockBuilder.saveModel();
        }
    }

    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fee2e2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 1rem 2rem;
            border-radius: 6px;
            z-index: 10000;
            font-size: 0.9rem;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Initialize the app
new App(); 