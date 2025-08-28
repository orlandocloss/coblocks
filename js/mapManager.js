/**
 * MapManager - Handles Leaflet map interactions and boundary drawing
 * 
 * Manages:
 * - Interactive map with OpenStreetMap tiles
 * - Boundary polygon drawing via click events
 * - Coordinate display and validation
 * - Map state management
 */
class MapManager {
    constructor() {
        // === Map Components ===
        this.map = null;                    // Leaflet map instance
        this.drawnBoundary = null;          // Current boundary polygon
        this.boundaryPoints = [];           // Array of lat/lng points
        this.markers = [];                  // Visual markers for points
        
        // === Drawing State ===
        this.isDrawing = false;             // Drawing mode flag
        
        this.init();
    }

    init() {
        // Initialize the Leaflet map with explicit options
        this.map = L.map('map', {
            zoomControl: true,
            dragging: true,
            scrollWheelZoom: true,
            doubleClickZoom: false, // Disable since we use double-click for boundary completion
            boxZoom: true,
            keyboard: true,
            zoomSnap: 1,
            zoomDelta: 1
        }).setView([51.505, -0.09], 13);

        // Add CORS-enabled tiles for capture-friendly rendering
        this.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors, © CARTO',
            maxZoom: 19,
            tileSize: 256,
            zoomOffset: 0,
            crossOrigin: 'anonymous'
        }).addTo(this.map);

        // Set up event listeners
        this.setupEventListeners();

        // Map ready for clean UI

        // Force map to invalidate size after initialization
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);

        // Ensure map interactions work when grid panel is open
        this.map.on('movestart', () => {
            this.ensureMapInteraction();
        });
    }

    setupEventListeners() {
        // Map click handler for boundary drawing
        this.map.on('click', (e) => {
            if (!this.isDrawing) {
                this.startDrawing();
            }
            this.addBoundaryPoint(e.latlng);
        });

        // Double-click to complete the boundary
        this.map.on('dblclick', (e) => {
            e.originalEvent.preventDefault();
            if (this.isDrawing && this.boundaryPoints.length >= 3) {
                this.completeBoundary();
            }
        });

        // Button event listeners
        document.getElementById('clearBoundary').addEventListener('click', () => {
            this.clearBoundary();
        });
    }

    startDrawing() {
        this.isDrawing = true;
        
        // Change cursor to indicate drawing mode
        this.map.getContainer().style.cursor = 'crosshair';
    }

    addBoundaryPoint(latlng) {
        this.boundaryPoints.push(latlng);
        
        // Add marker for this point
        const marker = L.circleMarker(latlng, {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.7,
            radius: 5
        });
        marker.addTo(this.map);
        this.markers.push(marker);
        
        // Draw lines between points
        if (this.boundaryPoints.length > 1) {
            const line = L.polyline([
                this.boundaryPoints[this.boundaryPoints.length - 2],
                this.boundaryPoints[this.boundaryPoints.length - 1]
            ], {
                color: '#3b82f6',
                weight: 2,
                opacity: 0.8
            });
            line.addTo(this.map);
            this.markers.push(line);
        }
        
        // Point added to boundary
    }

    completeBoundary() {
        if (this.boundaryPoints.length < 3) {
            return;
        }

        this.isDrawing = false;
        
        // Create the final polygon
        this.drawnBoundary = L.polygon(this.boundaryPoints, {
            color: '#667eea',
            fillColor: '#667eea',
            fillOpacity: 0.3,
            weight: 3
        });
        this.drawnBoundary.addTo(this.map);
        
        // Reset cursor
        this.map.getContainer().style.cursor = '';
        
        // Fit map to boundary
        this.map.fitBounds(this.drawnBoundary.getBounds(), { padding: [20, 20] });
        
        // Capture the map texture before transitioning stages
        setTimeout(() => {
            this.captureMapTexture();
        }, 500); // Wait for map to settle after fitBounds
        
        // Dispatch event to transition to loading stage
        window.dispatchEvent(new CustomEvent('boundaryCompleted'));
        
        // Auto-generate grid after a brief delay
        setTimeout(() => {
            console.log('MapManager: Auto-generating grid...');
            this.generateGrid();
        }, 1000);
    }

    /**
     * Capture the current map view as a texture for the 3D overlay
     */
    async captureMapTexture() {
        try {
            console.log('🗺️ Capturing map texture...');
            
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                console.error('❌ Map element not found for capture');
                return;
            }

            // Ensure visible tiles for the current view are loaded
            await this.waitForVisibleTiles();

            // Temporarily hide boundary polygon and markers to avoid drawing twice
            const hiddenLayers = { polygon: null, markers: [] };
            if (this.drawnBoundary && this.map.hasLayer(this.drawnBoundary)) {
                hiddenLayers.polygon = this.drawnBoundary;
                this.map.removeLayer(this.drawnBoundary);
            }
            if (this.markers && this.markers.length > 0) {
                this.markers.forEach(layer => {
                    if (this.map.hasLayer(layer)) {
                        hiddenLayers.markers.push(layer);
                        this.map.removeLayer(layer);
                    }
                });
            }

            if (typeof html2canvas !== 'undefined') {
                const rect = mapElement.getBoundingClientRect();
                const width = Math.round(rect.width);
                const height = Math.round(rect.height);
                const canvas = await html2canvas(mapElement, {
                    useCORS: true,
                    allowTaint: false,
                    width: width,
                    height: height,
                    scale: 1
                });

                // Do not draw boundary on the captured canvas; boundary is shown as a 3D line overlay

                // Store the captured canvas for later use
                this.capturedMapCanvas = canvas;
                console.log('✅ Map texture captured successfully');
                
                // Compute the geographic bounds of the captured canvas
                const tl = this.map.containerPointToLatLng([0, 0]);
                const br = this.map.containerPointToLatLng([width, height]);
                const captureBounds = {
                    north: Math.max(tl.lat, br.lat),
                    south: Math.min(tl.lat, br.lat),
                    west: Math.min(tl.lng, br.lng),
                    east: Math.max(tl.lng, br.lng)
                };
                
                // Dispatch event with the captured texture and capture bounds
                window.dispatchEvent(new CustomEvent('mapTextureCaptured', {
                    detail: { canvas: canvas, bounds: captureBounds }
                }));
                
            } else {
                console.warn('⚠️ html2canvas not available for map capture');
            }
            
            // Restore hidden boundary layers
            if (hiddenLayers.polygon) {
                hiddenLayers.polygon.addTo(this.map);
            }
            if (hiddenLayers.markers.length > 0) {
                hiddenLayers.markers.forEach(layer => layer.addTo(this.map));
            }
            
        } catch (error) {
            console.error('❌ Error capturing map texture:', error);
        }
    }

    /**
     * Wait for the current view's tiles to finish loading
     */
    waitForVisibleTiles() {
        return new Promise((resolve) => {
            // If no tile layer reference, resolve immediately
            if (!this.tileLayer) {
                resolve();
                return;
            }
            let timeoutId = null;
            const onLoad = () => {
                if (timeoutId) clearTimeout(timeoutId);
                this.tileLayer.off('load', onLoad);
                resolve();
            };
            this.tileLayer.on('load', onLoad);
            // Safety timeout in case the event doesn't fire
            timeoutId = setTimeout(() => {
                this.tileLayer.off('load', onLoad);
                resolve();
            }, 1500);
        });
    }

    clearBoundary() {
        // Clear all markers and lines
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
        
        // Clear boundary
        if (this.drawnBoundary) {
            this.map.removeLayer(this.drawnBoundary);
            this.drawnBoundary = null;
        }
        
        // Reset state
        this.boundaryPoints = [];
        this.isDrawing = false;
        this.map.getContainer().style.cursor = '';
        
        // Disable generate button
        document.getElementById('generateGrid').disabled = true;
        
        // Update display
        // Ready for boundary drawing

        // Close grid panel if open
        if (window.gridGenerator) {
            window.gridGenerator.hideGridPanel();
        }
    }

    generateGrid() {
        if (!this.drawnBoundary || this.boundaryPoints.length === 0) {
            console.warn('No boundary drawn; cannot generate grid.');
            return;
        }

        // Dispatch event for grid generation
        console.log('MapManager: Dispatching generateGrid event');
        window.dispatchEvent(new CustomEvent('generateGrid', {
            detail: {
                bounds: this.drawnBoundary.getBounds(),
                boundary: this.boundaryPoints
            }
        }));
        console.log('MapManager: generateGrid event dispatched');
    }

    calculatePolygonArea() {
        if (this.boundaryPoints.length < 3) return 0;
        
        let area = 0;
        const coords = this.boundaryPoints.map(p => [p.lat, p.lng]);
        
        for (let i = 0; i < coords.length; i++) {
            const j = (i + 1) % coords.length;
            area += coords[i][0] * coords[j][1];
            area -= coords[j][0] * coords[i][1];
        }
        
        area = Math.abs(area) / 2;
        
        // Convert to km²
        const kmPerDegree = 111;
        return area * kmPerDegree * kmPerDegree;
    }

    // Coordinate display removed for clean UI

    // Grid highlighting methods
    clearGridMarkers() {
        // Remove existing grid highlights
        this.map.eachLayer((layer) => {
            if (layer.options && layer.options.className === 'grid-highlight') {
                this.map.removeLayer(layer);
            }
        });
    }

    highlightGridCell(lat, lng, label) {
        this.clearGridMarkers();
        
        // Add highlight marker
        const marker = L.circleMarker([lat, lng], {
            className: 'grid-highlight',
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.7,
            radius: 8,
            weight: 2
        });
        
        marker.bindPopup(label).openPopup();
        marker.addTo(this.map);
        
        // Pan to marker
        this.map.panTo([lat, lng]);
    }

    ensureMapInteraction() {
        // Force map container to be interactive
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.style.pointerEvents = 'auto';
            mapContainer.style.touchAction = 'auto';
        }
        
        // Invalidate size to ensure proper rendering
        if (this.map) {
            this.map.invalidateSize();
        }
    }
} 