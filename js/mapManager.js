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

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            tileSize: 256,
            zoomOffset: 0
        }).addTo(this.map);

        // Set up event listeners
        this.setupEventListeners();

        // Update coordinates display on map movement
        this.map.on('mousemove', (e) => {
            this.updateCoordinatesDisplay(e.latlng);
        });

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

        document.getElementById('generateGrid').addEventListener('click', () => {
            this.generateGrid();
        });
    }

    startDrawing() {
        this.isDrawing = true;
        this.updateCoordinatesDisplay(null, "Drawing boundary... Double-click to complete");
        
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
        
        this.updateCoordinatesDisplay(latlng, `Point ${this.boundaryPoints.length} added. Double-click to complete.`);
    }

    completeBoundary() {
        if (this.boundaryPoints.length < 3) {
            alert('Need at least 3 points to create a boundary');
            return;
        }

        this.isDrawing = false;
        
        // Create the final polygon
        this.drawnBoundary = L.polygon(this.boundaryPoints, {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            weight: 2
        });
        this.drawnBoundary.addTo(this.map);
        
        // Calculate area
        const area = this.calculatePolygonArea();
        
        // Reset cursor
        this.map.getContainer().style.cursor = '';
        
        // Enable generate button
        document.getElementById('generateGrid').disabled = false;
        
        // Update display
        this.updateCoordinatesDisplay(null, `Boundary completed! Area: ~${area.toFixed(3)} km²`);
        
        // Fit map to boundary
        this.map.fitBounds(this.drawnBoundary.getBounds(), { padding: [10, 10] });
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
        this.updateCoordinatesDisplay(null, 'Click to start drawing boundary');

        // Close grid panel if open
        if (window.gridGenerator) {
            window.gridGenerator.hideGridPanel();
        }
    }

    generateGrid() {
        if (!this.drawnBoundary || this.boundaryPoints.length === 0) {
            alert('Please draw a boundary first');
            return;
        }

        // Dispatch event for grid generation
        window.dispatchEvent(new CustomEvent('generateGrid', {
            detail: {
                bounds: this.drawnBoundary.getBounds(),
                boundary: this.boundaryPoints
            }
        }));
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

    updateCoordinatesDisplay(latlng, message) {
        const display = document.getElementById('coordinatesDisplay');
        if (!display) return;
        
        if (message) {
            display.textContent = message;
        } else if (latlng) {
            display.textContent = `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`;
        }
    }

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