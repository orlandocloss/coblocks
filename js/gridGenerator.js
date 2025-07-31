/**
 * GridGenerator - Converts geographic boundaries to 3D grid coordinates
 * 
 * Handles:
 * - Converting lat/lng boundaries to 3×3m grid squares
 * - Point-in-polygon testing for boundary validation
 * - Grid data generation and coordinate mapping
 * - Integration with what3words-style addressing
 */
class GridGenerator {
    constructor() {
        // === Grid Data ===
        this.gridData = [];                          // Generated grid points
        this.gridSize = { width: 0, height: 0 };    // Grid dimensions
        
        // === UI Interaction ===
        this.isDragging = false;                     // Panel drag state
        this.dragOffset = { x: 0, y: 0 };           // Drag offset
        
        this.init();
    }

    init() {
        // Listen for grid generation requests
        window.addEventListener('generateGrid', (event) => {
            this.generateGrid(event.detail.bounds, event.detail.boundary);
        });

        // Set up grid panel close button
        document.getElementById('closeGrid')?.addEventListener('click', () => {
            this.hideGridPanel();
        });
    }

    async generateGrid(bounds, boundary) {
        try {
            this.showLoadingState();

            // Generate grid points within the boundary
            const gridPoints = this.generateGridPoints(bounds, boundary);
            
            // Generate grid data instantly
            const gridData = this.generateGridData(gridPoints);
            console.log(`Generated ${gridData.length} grid squares instantly!`);
            
            this.gridData = gridData;
            this.updateGridSize();
            
            // Display the grid
            this.displayGrid(gridData);
            
            // Show the grid panel
            this.showGridPanel();

            // Dispatch event for the block builder
            window.dispatchEvent(new CustomEvent('gridGenerated', {
                detail: {
                    gridData: gridData,
                    gridSize: this.gridSize
                }
            }));

        } catch (error) {
            console.error('Error generating grid:', error);
            this.showError('Failed to generate grid. Please try again.');
        }
    }

    /**
     * Generates 3×3m grid points within the given boundary
     * @param {L.LatLngBounds} bounds - Geographic bounds
     * @param {Array} boundary - Array of lat/lng points defining boundary
     * @returns {Array} Array of grid points with coordinates
     */
    generateGridPoints(bounds, boundary) {
        const points = [];
        
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();
        
        console.log(`Boundary: N=${north.toFixed(6)}, S=${south.toFixed(6)}, E=${east.toFixed(6)}, W=${west.toFixed(6)}`);
        
        // Calculate the actual area
        const latRange = north - south;
        const lngRange = east - west;
        const avgLat = (north + south) / 2;
        
        // Convert to meters for accurate calculation
        const latRangeMeters = latRange * 111000;
        const lngRangeMeters = lngRange * 111000 * Math.cos(avgLat * Math.PI / 180);
        const areaKmSq = (latRangeMeters * lngRangeMeters) / 1000000;
        
        console.log(`Area: ${latRangeMeters.toFixed(0)}m x ${lngRangeMeters.toFixed(0)}m = ${areaKmSq.toFixed(3)} km²`);
        
        // 3x3 meter grid spacing
        const latSpacing = 3 / 111000;
        const lngSpacing = 3 / (111000 * Math.cos(avgLat * Math.PI / 180));
        
        const estimatedRows = Math.ceil(latRange / latSpacing);
        const estimatedCols = Math.ceil(lngRange / lngSpacing);
        const estimatedSquares = estimatedRows * estimatedCols;
        
        console.log(`Grid: ${estimatedRows} rows x ${estimatedCols} cols = ${estimatedSquares} squares`);
        
        // Warn if too many squares
        if (estimatedSquares > 5000) {
            const proceed = confirm(
                `This will generate ${estimatedSquares.toLocaleString()} squares (3×3m each).\n\n` +
                `Area: ${areaKmSq.toFixed(3)} km²\n\n` +
                `Continue?`
            );
            
            if (!proceed) {
                throw new Error('Grid generation cancelled');
            }
        }

        // Generate grid points - north to south, west to east for proper orientation
        let row = 0;
        
        for (let lat = north; lat >= south; lat -= latSpacing) {
            let col = 0;
            
            for (let lng = west; lng <= east; lng += lngSpacing) {
                // Check if point is within boundary
                if (this.isPointInPolygon([lat, lng], boundary)) {
                    points.push({
                        lat: lat,
                        lng: lng,
                        row: row,
                        col: col,
                        gridX: col,
                        gridY: row
                    });
                }
                col++;
            }
            row++;
        }
        
        console.log(`Generated ${points.length} grid points within boundary`);
        return points;
    }

    isPointInPolygon(point, polygon) {
        const [lat, lng] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng;
            const yi = polygon[i].lat;
            const xj = polygon[j].lng;
            const yj = polygon[j].lat;

            if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    generateGridData(gridPoints) {
        return gridPoints.map(point => ({
            ...point,
            id: `grid_${point.row}_${point.col}`,
            blockHeight: 0,
            blockColor: '#ffffff'
        }));
    }

    updateGridSize() {
        if (this.gridData.length === 0) {
            this.gridSize = { width: 0, height: 0 };
            return;
        }

        const maxRow = Math.max(...this.gridData.map(item => item.row));
        const maxCol = Math.max(...this.gridData.map(item => item.col));
        
        this.gridSize = {
            width: maxCol + 1,
            height: maxRow + 1
        };

        const gridSizeElement = document.getElementById('gridSize');
        if (gridSizeElement) {
            gridSizeElement.textContent = `${this.gridSize.width}×${this.gridSize.height}`;
        }
    }

    displayGrid(gridData) {
        const gridDisplay = document.getElementById('gridDisplay');
        gridDisplay.innerHTML = '';

        if (gridData.length === 0) {
            gridDisplay.innerHTML = '<p>No grid points found.</p>';
            return;
        }

        // Simple grid info
        const info = document.createElement('div');
        const bounds = this.calculateGridBounds(gridData);
        
        info.innerHTML = `
            <h3>Grid (3×3m)</h3>
            <p>Squares: ${gridData.length} | Area: ~${bounds?.areaKmSq || 0} km²</p>
            <p>Size: ${this.gridSize.width}×${this.gridSize.height}</p>
        `;
        gridDisplay.appendChild(info);

        // Only show first 50 items for performance
        const displayData = gridData.slice(0, 50);
        const gridList = document.createElement('div');
        gridList.className = 'grid-list';

        displayData.forEach((item) => {
            const gridItem = document.createElement('div');
            gridItem.className = 'grid-item';
            gridItem.innerHTML = `
                <strong>Square ${item.row}:${item.col}</strong><br>
                <small>Lat: ${item.lat.toFixed(6)}, Lng: ${item.lng.toFixed(6)}</small>
            `;
            
            gridItem.addEventListener('click', () => {
                this.highlightGridSquare(item);
            });
            
            gridList.appendChild(gridItem);
        });

        gridDisplay.appendChild(gridList);

        if (gridData.length > 50) {
            const moreInfo = document.createElement('p');
            moreInfo.innerHTML = `<small>Showing first 50 of ${gridData.length} squares</small>`;
            gridDisplay.appendChild(moreInfo);
        }
    }

    calculateGridBounds(gridData) {
        if (gridData.length === 0) return null;
        
        const lats = gridData.map(item => item.lat);
        const lngs = gridData.map(item => item.lng);
        
        const north = Math.max(...lats);
        const south = Math.min(...lats);
        const east = Math.max(...lngs);
        const west = Math.min(...lngs);
        
        const avgLat = (north + south) / 2;
        const latRangeMeters = (north - south) * 111000;
        const lngRangeMeters = (east - west) * 111000 * Math.cos(avgLat * Math.PI / 180);
        const areaKmSq = ((latRangeMeters * lngRangeMeters) / 1000000).toFixed(3);
        
        return { areaKmSq };
    }

    highlightGridSquare(gridItem) {
        if (window.mapManager) {
            window.mapManager.clearGridMarkers();
            window.mapManager.highlightGridCell(gridItem.lat, gridItem.lng, `Square ${gridItem.row}:${gridItem.col}`);
        }
    }

    showGridPanel() {
        const panel = document.getElementById('gridPanel');
        panel.style.display = 'block';
        
        // Ensure map remains interactive
        if (window.mapManager?.ensureMapInteraction) {
            setTimeout(() => window.mapManager.ensureMapInteraction(), 100);
        }
    }

    hideGridPanel() {
        const panel = document.getElementById('gridPanel');
        panel.style.display = 'none';
        
        if (window.mapManager) {
            window.mapManager.clearGridMarkers();
        }
    }

    showLoadingState() {
        const gridDisplay = document.getElementById('gridDisplay');
        gridDisplay.innerHTML = `
            <div class="loading">
                <p>Generating grid...</p>
            </div>
        `;
    }

    showError(message) {
        const gridDisplay = document.getElementById('gridDisplay');
        gridDisplay.innerHTML = `
            <div class="error">
                <p>Error: ${message}</p>
            </div>
        `;
    }

    getGridData() {
        return this.gridData;
    }

    getGridSize() {
        return this.gridSize;
    }

    updateBlockData(gridId, blockHeight, blockColor) {
        const gridItem = this.gridData.find(item => item.id === gridId);
        if (gridItem) {
            gridItem.blockHeight = blockHeight;
            gridItem.blockColor = blockColor;
        }
    }

    exportModelData() {
        return {
            gridSize: this.gridSize,
            blocks: this.gridData.filter(item => item.blockHeight > 0).map(item => ({
                position: { x: item.gridX, y: item.gridY, z: item.blockHeight },
                color: item.blockColor,
                coordinates: { lat: item.lat, lng: item.lng }
            }))
        };
    }
} 