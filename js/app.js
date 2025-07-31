/**
 * App - Main application coordinator
 * 
 * Orchestrates:
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
        
        this.init();
    }

    init() {
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
            // Initialize components
            this.mapManager = new MapManager();
            this.gridGenerator = new GridGenerator();
            this.blockBuilder = new BlockBuilder();
            
            // Make components globally accessible
            window.mapManager = this.mapManager;
            window.gridGenerator = this.gridGenerator;
            window.blockBuilder = this.blockBuilder;
            
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

        // Close grid panel on escape
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeGridPanel();
            }
        });
    }

    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + Z for undo (future feature)
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            // TODO: Implement undo functionality
        }

        // Ctrl/Cmd + S for save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.saveModel();
        }

        // Delete key to clear selection (future feature)
        if (event.key === 'Delete') {
            // TODO: Clear selected blocks
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

    closeGridPanel() {
        if (window.gridGenerator) {
            window.gridGenerator.hideGridPanel();
        }
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