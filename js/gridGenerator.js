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
            console.log('GridGenerator: Received generateGrid event');
            this.generateGrid(event.detail.bounds, event.detail.boundary);
        });

        // Set up grid panel close button
        document.getElementById('closeGrid')?.addEventListener('click', () => {
            this.hideGridPanel();
        });
    }

    async generateGrid(bounds, boundary) {
        try {
            console.log('🏗️ Starting grid generation...');
            console.log('📍 Bounds:', bounds);
            console.log('🔲 Boundary points:', boundary.length);
            
            // Reset/clear any previous abort request
            window.__abortGeneration = false;
            
            // Log area calculation
            const north = bounds.getNorth();
            const south = bounds.getSouth();
            const east = bounds.getEast();
            const west = bounds.getWest();
            const latRange = north - south;
            const lngRange = east - west;
            const avgLat = (north + south) / 2;
            
            const latRangeMeters = latRange * 111000;
            const lngRangeMeters = lngRange * 111000 * Math.cos(avgLat * Math.PI / 180);
            const areaKmSq = (latRangeMeters * lngRangeMeters) / 1000000;
            
            console.log(`📐 Area: ${areaKmSq.toFixed(3)} km² (${latRangeMeters.toFixed(0)}m × ${lngRangeMeters.toFixed(0)}m)`);
            
            // Estimate grid size before generation
            const latSpacing = 3 / 111000;
            const lngSpacing = 3 / (111000 * Math.cos(avgLat * Math.PI / 180));
            const estimatedRows = Math.ceil(latRange / latSpacing);
            const estimatedCols = Math.ceil(lngRange / lngSpacing);
            const estimatedSquares = estimatedRows * estimatedCols;
            
            console.log(`🔢 Estimated grid: ${estimatedRows} × ${estimatedCols} = ${estimatedSquares.toLocaleString()} squares`);
            
            // Memory estimation
            const estimatedMemoryMB = (estimatedSquares * 100) / 1024 / 1024; // Rough estimate
            console.log(`💾 Estimated memory: ~${estimatedMemoryMB.toFixed(1)} MB`);
            
            const startTime = performance.now();
            
            // Generate grid points within the boundary (cooperative)
            console.log('⚡ Generating grid points...');
            const gridPoints = await this.generateGridPointsAsync(bounds, boundary);
            const pointsTime = performance.now();
            console.log(`✅ Generated ${gridPoints.length} grid points in ${(pointsTime - startTime).toFixed(0)}ms`);
            
            if (gridPoints.length === 0) {
                console.warn('⚠️ No grid points generated - boundary might be too small or invalid');
                this.showError('No grid points generated. Please try drawing a larger boundary.');
                return;
            }
            
            // Generate grid data (cooperative)
            console.log('🔄 Processing grid data...');
            const gridData = await this.generateGridDataAsync(gridPoints);
            const endTime = performance.now();
            console.log(`✅ Generated ${gridData.length} grid squares in ${(endTime - pointsTime).toFixed(0)}ms`);
            console.log(`🎯 Total generation time: ${(endTime - startTime).toFixed(0)}ms`);
            
            // If aborted during processing, stop silently (timeout will alert)
            if (window.__abortGeneration) {
                console.warn('⛔ Generation aborted by timeout');
                return;
            }
            
            this.gridData = gridData;
            this.updateGridSize();

            // Dispatch event for the block builder - this will trigger stage transition
            console.log('GridGenerator: Dispatching gridGenerated event with', gridData.length, 'grid points');
            window.dispatchEvent(new CustomEvent('gridGenerated', {
                detail: {
                    gridData: gridData,
                    gridSize: this.gridSize,
                    bounds: bounds,
                    boundary: boundary
                }
            }));
            console.log('GridGenerator: Event dispatched successfully');

        } catch (error) {
            console.error('Error generating grid:', error);
            this.showError('Failed to generate grid. Please try again.');
        }
    }

    // Cooperative (yielding) grid point generation to avoid blocking the main thread
    async generateGridPointsAsync(bounds, boundary) {
        const points = [];
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();
        const avgLat = (north + south) / 2;

        const latSpacing = 3 / 111000;
        const lngSpacing = 3 / (111000 * Math.cos(avgLat * Math.PI / 180));

        let row = 0;
        let rowsSinceYield = 0;
        for (let lat = north; lat >= south; lat -= latSpacing) {
            let col = 0;
            for (let lng = west; lng <= east; lng += lngSpacing) {
                if (this.isPointInPolygon([lat, lng], boundary)) {
                    points.push({ lat, lng, row, col, gridX: col, gridY: row });
                }
                col++;
            }
            row++;

            // Cooperatively yield to the event loop every ~50 rows
            rowsSinceYield++;
            if (rowsSinceYield >= 50) {
                rowsSinceYield = 0;
                if (window.__abortGeneration) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        return points;
    }

    // Cooperative grid data construction
    async generateGridDataAsync(gridPoints) {
        const result = new Array(gridPoints.length);
        const chunkSize = 20000;
        for (let i = 0; i < gridPoints.length; i += chunkSize) {
            if (window.__abortGeneration) break;
            const chunk = gridPoints.slice(i, i + chunkSize);
            for (let j = 0; j < chunk.length; j++) {
                const point = chunk[j];
                result[i + j] = {
                    ...point,
                    id: `grid_${point.row}_${point.col}`,
                    blockHeight: 0,
                    blockColor: '#ffffff'
                };
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return window.__abortGeneration ? [] : result;
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
        try {
            if (this.gridData.length === 0) {
                this.gridSize = { width: 0, height: 0 };
                return;
            }

            // Process in chunks to avoid "too many function arguments" error
            let maxRow = -1, maxCol = -1;
            const chunkSize = 10000;
            
            for (let i = 0; i < this.gridData.length; i += chunkSize) {
                const chunk = this.gridData.slice(i, i + chunkSize);
                const chunkMaxRow = Math.max(...chunk.map(item => item.row));
                const chunkMaxCol = Math.max(...chunk.map(item => item.col));
                if (chunkMaxRow > maxRow) maxRow = chunkMaxRow;
                if (chunkMaxCol > maxCol) maxCol = chunkMaxCol;
            }
            
            this.gridSize = {
                width: maxCol + 1,
                height: maxRow + 1
            };
        } catch (error) {
            console.error('Error in updateGridSize:', error);
            // Fallback calculation
            this.gridSize = {
                width: Math.ceil(Math.sqrt(this.gridData.length)),
                height: Math.ceil(Math.sqrt(this.gridData.length))
            };
        }

        const gridSizeElement = document.getElementById('gridSize');
        if (gridSizeElement) {
            gridSizeElement.textContent = `${this.gridSize.width}×${this.gridSize.height}`;
        }
    }

    displayGrid(gridData) {
        const gridDisplay = document.getElementById('gridDisplay');
        if (!gridDisplay) {
            // In stage-based layout, we don't need the old grid panel
            console.log('DisplayGrid: Grid panel not available in stage-based layout');
            return;
        }
        
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
        if (panel) {
            panel.style.display = 'block';
            
            // Ensure map remains interactive
            if (window.mapManager?.ensureMapInteraction) {
                setTimeout(() => window.mapManager.ensureMapInteraction(), 100);
            }
        }
        // In stage-based layout, grid display is handled by stage transitions
    }

    hideGridPanel() {
        const panel = document.getElementById('gridPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        // In stage-based layout, this method is not needed
        
        if (window.mapManager) {
            window.mapManager.clearGridMarkers();
        }
    }

    showLoadingState() {
        const gridDisplay = document.getElementById('gridDisplay');
        if (gridDisplay) {
            gridDisplay.innerHTML = `
                <div class="loading">
                    <p>Generating grid...</p>
                </div>
            `;
        }
        // In stage-based layout, loading is handled by the main app
    }

    showError(message) {
        const gridDisplay = document.getElementById('gridDisplay');
        if (gridDisplay) {
            gridDisplay.innerHTML = `
                <div class="error">
                    <p>Error: ${message}</p>
                </div>
            `;
        } else {
            // In stage-based layout, show error in console
            console.error('GridGenerator Error:', message);
        }
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