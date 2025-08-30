/**
 * MapOverlay - Handles 3D map texture overlay system
 * 
 * Manages:
 * - Map texture creation from captured canvas or tiles
 * - 3D plane overlay with proper UV mapping
 * - Geographic coordinate projection
 * - Boundary visualization and clipping
 */
class MapOverlay {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // === Map Overlay State ===
        this.mapOverlayPlane = null;
        this.mapOverlayVisible = true;
        this.mapTexture = null;
        this.capturedMapCanvas = null;
        
        // === Geographic Data ===
        this.originalBounds = null;
        this.originalBoundary = null;
        this.capturedTextureBounds = null;
        this.latSpacing = null;
        this.lngSpacing = null;
        this._mapTexMeta = null;
        
        // === Boundary Visualization ===
        this.boundaryLine = null;
        
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for map overlay
     */
    setupEventListeners() {
        // Listen for captured map texture from MapManager
        window.addEventListener('mapTextureCaptured', (event) => {
            console.log('MapOverlay: Received captured map texture');
            this.capturedMapCanvas = event.detail.canvas;
            if (event.detail.bounds) {
                this.capturedTextureBounds = event.detail.bounds;
            }
        });

        // Set up toggle button
        setTimeout(() => {
            const mapOverlayBtn = document.getElementById('toggleMapOverlay');
            if (mapOverlayBtn) {
                mapOverlayBtn.addEventListener('click', () => {
                    this.toggleMapOverlay();
                });
            }
        }, 200);
    }

    /**
     * Set up map overlay with geographic data
     */
    setupMapOverlay(bounds, boundary) {
        this.originalBounds = bounds;
        this.originalBoundary = boundary;
        
        // Compute geographic spacings
        this.computeGeographicSpacings(bounds);
        
        // Auto-show map overlay by default
        this.mapOverlayVisible = true;
        this.showMapOverlay();
    }

    /**
     * Compute degree spacings for 3m steps
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
        const x = (point.lng - west) / this.lngSpacing;
        const z = (north - point.lat) / this.latSpacing;
        return new THREE.Vector3(x, 0.02, z);
    }

    /**
     * Toggle the map overlay visibility
     */
    toggleMapOverlay() {
        console.log('🔄 Toggle map overlay called');
        
        if (!this.originalBounds) {
            console.warn('❌ No map bounds available for overlay');
            return;
        }

        const button = document.getElementById('toggleMapOverlay');
        
        if (this.mapOverlayVisible) {
            this.hideMapOverlay();
            button.classList.remove('active');
        } else {
            setTimeout(() => {
                this.showMapOverlay();
            }, 100);
            button.classList.add('active');
        }
        
        this.mapOverlayVisible = !this.mapOverlayVisible;
        this.sceneManager.requestRender();
    }

    /**
     * Create and show the 3D map overlay plane
     */
    async showMapOverlay() {
        try {
            console.log('🗺️ Creating 3D map overlay plane...');
            
            if (this.mapOverlayPlane) {
                this.mapOverlayPlane.visible = true;
                return;
            }

            if (!this.originalBounds || !this.sceneManager.scene) {
                console.error('❌ Missing bounds or scene for 3D map overlay');
                return;
            }

            // Create map texture
            const mapTexture = await this.createMapTexture();
            if (!mapTexture || !mapTexture.image) {
                console.error('❌ Map texture not available');
                return;
            }

            // Build polygon-shaped geometry from boundary
            const points2D = [];
            this.originalBoundary.forEach(pt => {
                const p = this.projectLatLngToGrid(pt);
                if (p) {
                    points2D.push(new THREE.Vector2(p.x, p.z));
                }
            });
            
            if (points2D.length < 3) {
                console.warn('Not enough points to build boundary overlay');
                return;
            }

            // Create shape geometry
            const shape = new THREE.Shape(points2D);
            const shapeGeometry = new THREE.ShapeGeometry(shape);
            
            // Compute UVs for proper texture mapping
            this.computeUVMapping(shapeGeometry, mapTexture);

            // Create material and mesh
            const polyMaterial = new THREE.MeshBasicMaterial({
                map: mapTexture,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });
            polyMaterial.polygonOffset = true;
            polyMaterial.polygonOffsetFactor = -1;
            polyMaterial.polygonOffsetUnits = -1;

            this.mapOverlayPlane = new THREE.Mesh(shapeGeometry, polyMaterial);
            this.mapOverlayPlane.position.set(0, this.sceneManager.landBaseY - 0.01, 0);
            this.mapOverlayPlane.rotation.x = Math.PI / 2;
            this.mapOverlayPlane.renderOrder = 0; // Render first, at bottom

            this.sceneManager.add(this.mapOverlayPlane);
            console.log('✅ 3D map overlay plane created');

        } catch (error) {
            console.error('❌ Error creating 3D map overlay:', error);
        }
    }

    /**
     * Compute UV mapping for shape geometry
     */
    computeUVMapping(shapeGeometry, mapTexture) {
        const pos = shapeGeometry.attributes.position;
        const uvs = new Float32Array(pos.count * 2);
        const meta = this._mapTexMeta;
        
        const capNorth = meta?.capNorth ?? this.originalBounds.getNorth();
        const capSouth = meta?.capSouth ?? this.originalBounds.getSouth();
        const capWest = meta?.capWest ?? this.originalBounds.getWest();
        const capEast = meta?.capEast ?? this.originalBounds.getEast();
        const srcX = meta?.srcX ?? 0;
        const srcY = meta?.srcY ?? 0;
        const srcW = meta?.srcW ?? (mapTexture.image?.width || 1);
        const srcH = meta?.srcH ?? (mapTexture.image?.height || 1);
        const canvasW = meta?.canvasW ?? (mapTexture.image?.width || 1);
        const canvasH = meta?.canvasH ?? (mapTexture.image?.height || 1);
        
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getY(i);
            const lng = capWest + x * this.lngSpacing;
            const lat = capNorth - z * this.latSpacing;
            const uNorm = (lng - capWest) / (capEast - capWest);
            const vNorm = (capNorth - lat) / (capNorth - capSouth);
            const uPix = uNorm * canvasW;
            const vPix = vNorm * canvasH;
            const u = (uPix - srcX) / srcW;
            const v = (vPix - srcY) / srcH;
            uvs[i * 2] = u;
            uvs[i * 2 + 1] = v;
        }
        
        shapeGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    /**
     * Hide the map overlay
     */
    hideMapOverlay() {
        if (this.mapOverlayPlane) {
            this.mapOverlayPlane.visible = false;
            this.sceneManager.requestRender();
        }
    }

    /**
     * Create map texture from captured canvas or tiles
     */
    async createMapTexture() {
        return new Promise((resolve, reject) => {
            try {
                console.log('🗺️ Creating texture from pre-captured map...');
                
                // Use pre-captured canvas if available
                if (this.capturedMapCanvas && this.capturedMapCanvas.width > 0 && this.capturedMapCanvas.height > 0) {
                    const isBlank = this.isCanvasBlank(this.capturedMapCanvas);
                    if (!isBlank) {
                        console.log('✅ Using pre-captured map canvas');
                        
                        const croppedCanvas = this.cropCapturedCanvasToPolygonBounds(
                            this.capturedMapCanvas,
                            this.capturedTextureBounds,
                            this.originalBounds,
                            null
                        );
                        
                        const texture = new THREE.CanvasTexture(croppedCanvas);
                        texture.needsUpdate = true;
                        texture.flipY = false;
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        if (THREE && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

                        resolve(texture);
                        return;
                    }
                }

                // Fallback: create from tiles
                this.createTileTextureCanvas(this.originalBounds).then((tileCanvas) => {
                    const texture = new THREE.CanvasTexture(tileCanvas);
                    texture.needsUpdate = true;
                    texture.flipY = false;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    if (THREE && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
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
     * Check if canvas is blank
     */
    isCanvasBlank(canvas) {
        try {
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const sample = 10;
            
            for (let y = 0; y < sample; y++) {
                for (let x = 0; x < sample; x++) {
                    const px = Math.floor((x + 0.5) * w / sample);
                    const py = Math.floor((y + 0.5) * h / sample);
                    const data = ctx.getImageData(px, py, 1, 1).data;
                    const a = data[3];
                    const r = data[0], g = data[1], b = data[2];
                    
                    if (a > 0 && (r < 240 || g < 240 || b < 240)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Create texture canvas from map tiles
     */
    async createTileTextureCanvas(bounds) {
        if (!bounds) throw new Error('Missing bounds for tile texture');

        const maxSize = 1024;
        const west = bounds.getWest();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const south = bounds.getSouth();

        const xW = this.lonToX(west);
        const xE = this.lonToX(east);
        const yN = this.latToY(north);
        const yS = this.latToY(south);

        // Choose appropriate zoom level
        const estimateZoomForPixels = (dx, dy) => {
            const maxDelta = Math.max(dx, dy);
            const z = Math.max(0, Math.min(19, Math.ceil(Math.log2(maxSize / (256 * maxDelta)))));
            return z;
        };
        const zoom = estimateZoomForPixels(xE - xW, yS - yN);
        const scale = Math.pow(2, zoom);

        // Calculate pixel bounds
        const pxW = xW * 256 * scale;
        const pxE = xE * 256 * scale;
        const pyN = yN * 256 * scale;
        const pyS = yS * 256 * scale;
        const rectWidth = Math.max(1, Math.round(pxE - pxW));
        const rectHeight = Math.max(1, Math.round(pyS - pyN));

        // Determine tile range
        const tileX0 = Math.floor(pxW / 256);
        const tileY0 = Math.floor(pyN / 256);
        const tileX1 = Math.floor((pxE - 1) / 256);
        const tileY1 = Math.floor((pyS - 1) / 256);

        const tilesWide = tileX1 - tileX0 + 1;
        const tilesHigh = tileY1 - tileY0 + 1;

        // Create canvas for tiles
        const tilesCanvas = document.createElement('canvas');
        tilesCanvas.width = tilesWide * 256;
        tilesCanvas.height = tilesHigh * 256;
        const tctx = tilesCanvas.getContext('2d');
        
        // Checkerboard background
        for (let y = 0; y < tilesCanvas.height; y += 32) {
            for (let x = 0; x < tilesCanvas.width; x += 32) {
                tctx.fillStyle = ((x / 32 + y / 32) % 2 === 0) ? '#ddd' : '#bbb';
                tctx.fillRect(x, y, 32, 32);
            }
        }

        // Fetch tiles
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
                    img.onload = () => { 
                        try { 
                            tctx.drawImage(img, sx, sy); 
                            drawnCount++; 
                        } catch(_) {} 
                        res(); 
                    };
                    img.onerror = () => res();
                    img.src = url;
                }));
            }
        }
        
        await Promise.all(tilePromises);

        // Crop to exact bounds
        const cropX = Math.round(pxW - tileX0 * 256);
        const cropY = Math.round(pyN - tileY0 * 256);
        const cropped = document.createElement('canvas');
        cropped.width = rectWidth;
        cropped.height = rectHeight;
        const cctx = cropped.getContext('2d');
        cctx.drawImage(tilesCanvas, cropX, cropY, rectWidth, rectHeight, 0, 0, rectWidth, rectHeight);

        return cropped;
    }

    /**
     * Crop captured canvas to polygon bounds
     */
    cropCapturedCanvasToPolygonBounds(canvas, captureBounds, polygonLeafletBounds, boundaryPoints) {
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

            if (srcW < 32 || srcH < 32) {
                return canvas;
            }

            const out = document.createElement('canvas');
            out.width = srcW;
            out.height = srcH;
            const ctx = out.getContext('2d');
            ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

            // Store metadata for UV mapping
            this._mapTexMeta = {
                capNorth, capSouth, capWest, capEast,
                srcX, srcY, srcW, srcH,
                canvasW: canvas.width, canvasH: canvas.height
            };

            return out;
        } catch (e) {
            console.warn('Could not crop captured canvas, using full canvas', e);
            return canvas;
        }
    }

    /**
     * Create fallback texture when map capture fails
     */
    createFallbackTexture(resolve, reject) {
        try {
            console.log('🎨 Creating fallback texture...');
            
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            
            // Fill with subtle background
            ctx.fillStyle = '#e8f4f8';
            ctx.fillRect(0, 0, 1024, 1024);
            
            // Add grid lines
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
            
            resolve(texture);
            
        } catch (error) {
            console.error('❌ Failed to create fallback texture:', error);
            reject(error);
        }
    }

    /**
     * Convert longitude to Web Mercator X
     */
    lonToX(lon) {
        return (lon + 180) / 360;
    }

    /**
     * Convert latitude to Web Mercator Y
     */
    latToY(lat) {
        const latRad = lat * Math.PI / 180;
        const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
        return (1 - y / Math.PI) / 2;
    }

    /**
     * Clean up map overlay resources
     */
    destroyMapOverlay() {
        if (this.mapOverlayPlane) {
            this.sceneManager.remove(this.mapOverlayPlane);
            
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
        }
        
        if (this.mapTexture) {
            this.mapTexture.dispose();
            this.mapTexture = null;
        }
    }
} 