/**
 * WaterSystem - Handles water effects, island terrain, and background visuals
 * 
 * Manages:
 * - Animated water field around the island
 * - Island terrain skirt (rocky edges)
 * - Background gradient dome
 * - Wave animation and water physics
 */
class WaterSystem {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // === Water System ===
        this.waterInstances = []; // Array of instanced water meshes
        this.waterTiles = []; // Flattened array for animation
        this.staticWaterPlane = null;
        this.farOceanPlane = null;
        this.farOceanInnerRadius = 0;
        
        // === Water Parameters ===
        this.waterParams = {
            amplitude: 4,                // Larger wave height
            baseHeight: 0.03,           // Taller columns
            speed: 1.5,                 // Wave speed
            phaseStep: 0.7,             // Phase per Chebyshev ring step
            waterDepth: 2               // Vertical offset below land surface so crests meet skirt base
        };
        
        // === Island System ===
        this.islandCenter = new THREE.Vector3(0, 0, 0);
        this.landBaseY = 0.5;
        this.skirtTiles = new Set();
        this.terrainGroup = null;
        this.backgroundDome = null;
        this.waterOuterCells = 72;
        
        // === Animation ===
        this._waveTimeStart = performance.now();
        
        // === Grid Properties ===
        this.gridData = [];
        this.blockSize = 1.0;
    }

    /**
     * Set up water system with grid data
     */
    setupWaterSystem(gridData) {
        this.gridData = gridData;
        
        // Compute island center from grid bounds
        this.computeIslandCenter();
    }

    /**
     * Create water field with skirt exclusion (matches original order)
     */
    createWaterFieldWithSkirt(gridData) {
        this.gridData = gridData;
        this.computeIslandCenter();
        
        // Calculate bounds for water field (original approach)
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        this.gridData.forEach(gp => {
            if (gp.gridX < minX) minX = gp.gridX;
            if (gp.gridX > maxX) maxX = gp.gridX;
            if (gp.gridY < minZ) minZ = gp.gridY;
            if (gp.gridY > maxZ) maxZ = gp.gridY;
        });

        const bounds = {
            minX: Math.floor(minX - 120),
            maxX: Math.ceil(maxX + 120),
            minZ: Math.floor(minZ - 120),
            maxZ: Math.ceil(maxZ + 120)
        };


        this.createWaterField(bounds, this.skirtTiles, this.waterOuterCells);
    }

    /**
     * Compute island center from grid bounds
     */
    computeIslandCenter() {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < this.gridData.length; i++) {
            const gp = this.gridData[i];
            if (gp.gridX < minX) minX = gp.gridX;
            if (gp.gridX > maxX) maxX = gp.gridX;
            if (gp.gridY < minZ) minZ = gp.gridY;
            if (gp.gridY > maxZ) maxZ = gp.gridY;
        }
        
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        this.islandCenter.set(centerX, 0, centerZ);
    }

    /**
     * Create boundary-shaped terrain skirt via BFS rings
     */
    createIslandSkirt({ rings = 3 }) {
        const group = new THREE.Group();
        const geom = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const ringMats = [
            new THREE.MeshLambertMaterial({ color: 0xc8d0d4 }), // light rock
            new THREE.MeshLambertMaterial({ color: 0x9aa3a7 }), // mid rock
            new THREE.MeshLambertMaterial({ color: 0x6f777c })  // dark rock
        ];

        // Land set (inside boundary)
        const land = new Set();
        this.gridData.forEach(gp => land.add(`${gp.gridX}_${gp.gridY}`));
        


        // BFS frontier init: neighbors of land that are not land
        let frontier = new Set();
        const addNeighbors = (x, z, into) => {
            into.add(`${x+1}_${z}`);
            into.add(`${x-1}_${z}`);
            into.add(`${x}_${z+1}`);
            into.add(`${x}_${z-1}`);
        };
        
        land.forEach(key => {
            const [sx, sz] = key.split('_').map(Number);
            const tmp = new Set();
            addNeighbors(sx, sz, tmp);
            tmp.forEach(k => { if (!land.has(k)) frontier.add(k); });
        });

        const visited = new Set(land);
        this.skirtTiles.clear();

        for (let r = 1; r <= rings; r++) {
            const mat = ringMats[Math.min(r - 1, ringMats.length - 1)];
            const current = Array.from(frontier).filter(k => !visited.has(k));
            if (current.length === 0) break;

            const heightY = this.landBaseY - r * 0.22; // step down outward
            const inst = new THREE.InstancedMesh(geom, mat, current.length);
            inst.castShadow = true;
            inst.receiveShadow = true;

            const m = new THREE.Matrix4();
            const p = new THREE.Vector3();
            for (let i = 0; i < current.length; i++) {
                const [xStr, zStr] = current[i].split('_');
                const x = Number(xStr), z = Number(zStr);
                p.set(x, heightY, z);
                m.identity();
                m.setPosition(p);
                inst.setMatrixAt(i, m);
                this.skirtTiles.add(current[i]);
            }
            inst.instanceMatrix.needsUpdate = true;
            group.add(inst);

            // Prepare next frontier
            const next = new Set();
            current.forEach(k => {
                const [xStr, zStr] = k.split('_');
                const x = Number(xStr), z = Number(zStr);
                addNeighbors(x, z, next);
            });
            next.forEach(k => { if (!visited.has(k)) frontier.add(k); });
            current.forEach(k => visited.add(k));
        }

        group.renderOrder = 1.8; // Render before grid but after water
        this.terrainGroup = group;
        this.sceneManager.add(group);
        

    }



    /**
     * Create animated water field around the island
     */
    createWaterField(bounds, excludeSet = null, outerCells = 36) {
        // Single material for all water (original working approach)
        const material = new THREE.MeshPhongMaterial({
            color: 0xbfe0f5,      // Lighter blue
            transparent: true,
            opacity: 0.75,        // Base opacity (will be modulated per tile)
            shininess: 80,
            specular: 0xd8eafe,   // Lighter highlights
            emissive: 0xb0d6ee,   // Lighter glow
            emissiveIntensity: 0.08
        });

        // Box columns that will be Y-scaled for waves
        const geometry = new THREE.BoxGeometry(this.blockSize, 1, this.blockSize);
        const basePoly = this._getBoundaryPolygonGrid();
        const landSet = new Set();
        this.gridData.forEach(gp => landSet.add(`${gp.gridX}_${gp.gridY}`));

        // Organize tiles by distance rings for layered transparency (original approach)
        const tilesByRing = [];
        const ringSize = Math.max(6, outerCells / 6);
        for (let r = 0; r < 6; r++) tilesByRing.push([]);
        
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
            for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
                const key = `${x}_${z}`;
                
                // Skip land and skirt tiles
                if (landSet.has(key)) continue;
                if (excludeSet && excludeSet.has(key)) continue;
                
                // Ensure tile is outside island
                const insideIsland = this._pointInPolygonGrid(x + 0.0, z + 0.0, basePoly);
                if (insideIsland) continue;
                
                // Check distance from boundary
                const d = this._minDistanceToPolygon({ x: x + 0.0, z: z + 0.0 }, basePoly);
                if (d > outerCells) continue;
                 
                // Assign to ring based on distance
                const ringIndex = Math.min(5, Math.floor(d / ringSize));
                const tile = { x, z, distToBoundary: d };
                tile.randomOffset = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1.0;
                tilesByRing[ringIndex].push(tile);
            }
        }

        // Create separate instanced mesh for each ring with same material (original approach)
        this.waterInstances = [];
        this.waterTiles = [];
        
        const tempMatrix = new THREE.Matrix4();
        const tempPosition = new THREE.Vector3();
        const tempScale = new THREE.Vector3(1, 1, 1);
        const { baseHeight, waterDepth } = this.waterParams;
        
        for (let ringIdx = 0; ringIdx < tilesByRing.length; ringIdx++) {
            const ringTiles = tilesByRing[ringIdx];
            if (ringTiles.length === 0) continue;
            
            // Per-ring material to create layered transparency and subtle color shift
            const ringFactor = tilesByRing.length > 1 ? (ringIdx / (tilesByRing.length - 1)) : 0;
            const waterColor = new THREE.Color(0x6dcaf0);
            const bgColor = new THREE.Color(0xf5fbff);
            const blendedColor = waterColor.clone().lerp(bgColor, ringFactor * 0.2);
            const opacity = 0.75 * (1.0 - Math.pow(ringFactor, 1.8));
            const ringMaterial = new THREE.MeshPhongMaterial({
                color: blendedColor,
                transparent: true,
                opacity: Math.max(0.08, Math.min(0.75, opacity)),
                shininess: 75 * (1.0 - ringFactor * 0.3),
                specular: new THREE.Color(0xaed6f2).lerp(bgColor, ringFactor * 0.4),
                emissive: new THREE.Color(0x8fccef).lerp(bgColor, ringFactor * 0.5),
                emissiveIntensity: 0.08 * (1.0 - ringFactor * 0.5),
                depthWrite: false,
                depthTest: true
            });
            const instanced = new THREE.InstancedMesh(geometry, ringMaterial, ringTiles.length);
            instanced.castShadow = false;
            instanced.receiveShadow = true;
            instanced.renderOrder = 1 + ringIdx * 0.001; // Layer rings
            
            for (let i = 0; i < ringTiles.length; i++) {
                const t = ringTiles[i];
                const h = baseHeight;
                tempPosition.set(t.x, this.landBaseY - waterDepth + h * 0.5, t.z);
                tempScale.set(1, Math.max(0.05, h), 1);
                
                tempMatrix.identity();
                tempMatrix.makeScale(tempScale.x, tempScale.y, tempScale.z);
                tempMatrix.setPosition(tempPosition);
                
                // Store random offset for this tile (consistent per tile)
                if (!t.randomOffset) {
                    t.randomOffset = (Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1.0;
                }
            }
            instanced.instanceMatrix.needsUpdate = true;
            
            this.sceneManager.add(instanced);
            this.waterInstances.push(instanced);
            this.waterTiles.push(...ringTiles); // Flatten for animation
        }

        // Compute inner radius for far ocean plane (start just beyond last water tile)
        let maxRadius = 0;
        for (let i = 0; i < this.waterTiles.length; i++) {
            const t = this.waterTiles[i];
            const dx = t.x - this.islandCenter.x;
            const dz = t.z - this.islandCenter.z;
            const r = Math.hypot(dx, dz);
            if (r > maxRadius) maxRadius = r;
        }
        // Add a small gap so nothing overlaps
        this.farOceanInnerRadius = maxRadius + this.blockSize * 1.5;
    }

    /**
     * Create a large, still far-ocean ring that begins where animated water ends
     */
    createFarOceanPlane() {
        // Remove previous
        if (this.farOceanPlane) {
            this.sceneManager.remove(this.farOceanPlane);
            this.farOceanPlane.geometry?.dispose?.();
            this.farOceanPlane.material?.dispose?.();
            this.farOceanPlane = null;
        }

        // Use the color of the highest-transparency water ring (outermost ring color)
        const waterColor = new THREE.Color(0x99d6ee);
        const bgColor = new THREE.Color(0xf5fbff);
        const innerBlendColor = waterColor.clone().lerp(bgColor, 0.5);
        const horizonColor = new THREE.Color(0xbfe0f5); // match dome's uOuterColor

        // Single large plane as far ocean background (no hole/cut)
        const extent = 8000; // very large to cover horizon
        const geo = new THREE.PlaneGeometry(extent, extent, 1, 1);
        geo.rotateX(-Math.PI / 2); // Lay flat on XZ

        // Gradient shader to blend toward the sky's deep blue at horizon
        const innerRadius = Math.max(0, this.farOceanInnerRadius);
        const outerRadius = 1200.0; // matches dome gradient scale (length/1200)
        const uniforms = {
            uCenter: { value: new THREE.Vector3(this.islandCenter.x, this.landBaseY, this.islandCenter.z) },
            uInnerRadius: { value: innerRadius },
            uOuterRadius: { value: outerRadius },
            uInnerColor: { value: innerBlendColor },
            uOuterColor: { value: horizonColor }
        };
        const mat = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPos;
                uniform vec3 uInnerColor;
                uniform vec3 uOuterColor;
                uniform vec3 uCenter;
                uniform float uInnerRadius;
                uniform float uOuterRadius;
                void main() {
                    vec2 p = vWorldPos.xz - uCenter.xz;
                    float d = length(p);
                    float t = clamp((d - uInnerRadius) / max(1.0, (uOuterRadius - uInnerRadius)), 0.0, 1.0);
                    vec3 col = mix(uInnerColor, uOuterColor, t);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            transparent: false,
            depthTest: false,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        // Slightly below animated water to avoid z-fighting
        mesh.position.set(this.islandCenter.x, this.landBaseY - this.waterParams.waterDepth - 0.02, this.islandCenter.z);
        mesh.receiveShadow = false;
        // Render before overlay (0) and water (>1), after dome (-100)
        mesh.renderOrder = -50;

        this.sceneManager.add(mesh);
        this.farOceanPlane = mesh;
        this.sceneManager.requestRender();
    }

    /**
     * Create background gradient dome
     */
    createBackgroundDome() {
        if (this.backgroundDome) {
            this.sceneManager.remove(this.backgroundDome);
            this.backgroundDome.geometry?.dispose?.();
            this.backgroundDome.material?.dispose?.();
            this.backgroundDome = null;
        }

        const radius = 2000;
        const geo = new THREE.SphereGeometry(radius, 32, 24);
        const uniforms = {
            uInnerColor: { value: new THREE.Color(0xf7fbff) },
            uOuterColor: { value: new THREE.Color(0xbfe0f5) },
            uCenter: { value: new THREE.Vector3(this.islandCenter.x, this.landBaseY, this.islandCenter.z) }
        };
        
        const mat = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPos;
                uniform vec3 uInnerColor;
                uniform vec3 uOuterColor;
                uniform vec3 uCenter;
                void main() {
                    vec2 p = vWorldPos.xz - uCenter.xz;
                    float d = length(p) / 1200.0;
                    d = clamp(d, 0.0, 1.0);
                    vec3 col = mix(uInnerColor, uOuterColor, d);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false
        });
        
        const dome = new THREE.Mesh(geo, mat);
        dome.position.copy(this.islandCenter);
        dome.renderOrder = -100; // Ensure it renders before everything else
        this.sceneManager.add(dome);
        this.backgroundDome = dome;
    }

    /**
     * Animate water waves
     */
    animateWater() {
        if (this.waterInstances && this.waterInstances.length > 0) {
            const now = performance.now();
            const t = (now - this._waveTimeStart) * 0.001;
            const tempMatrix = new THREE.Matrix4();
            const tempPosition = new THREE.Vector3();
            const tempScale = new THREE.Vector3(1, 1, 1);
            const { amplitude, baseHeight, speed, phaseStep, waterDepth } = this.waterParams;

            // Animate water tiles (original working method)
            let tileIndex = 0;
            for (let i = 0; i < this.waterTiles.length; i++) {
                const tile = this.waterTiles[i];
                const d = tile.distToBoundary != null ? tile.distToBoundary : 0;
                // Keep uniform wave propagation, add random height variation
                const randomOffset = tile.randomOffset || 0;
                const phase = d * phaseStep - t * speed; // Keep uniform wave front
                
                // Random amplitude variation per tile (0.7 to 1.3 of base amplitude)
                const amplitudeVariation = 0.7 + 0.6 * randomOffset;
                let h = baseHeight + amplitude * amplitudeVariation * (Math.sin(phase) * 0.5 + 0.5);
                
                // Add subtle secondary ripple with random timing
                const secondaryPhase = phase * 1.7 + randomOffset * 6.28; // Full random phase offset
                h += amplitude * 0.2 * amplitudeVariation * (Math.sin(secondaryPhase) * 0.5 + 0.5);
                
                // Ensure wave tops remain below the bottom of the skirt's first ring
                const skirtBottomY = this.landBaseY - 0.22 - 0.5; // ring1 center minus half height
                const topLimitH = (skirtBottomY - 0.02) - (this.landBaseY - waterDepth);
                h = Math.min(h, Math.max(0.05, topLimitH));

                tempPosition.set(tile.x, this.landBaseY - waterDepth + h * 0.5, tile.z);
                tempScale.set(1, Math.max(0.05, h), 1);

                tempMatrix.identity();
                tempMatrix.makeScale(tempScale.x, tempScale.y, tempScale.z);
                tempMatrix.setPosition(tempPosition);

                // Find which instance this tile belongs to and update it
                let cumulativeTiles = 0;
                for (let instIdx = 0; instIdx < this.waterInstances.length; instIdx++) {
                    const inst = this.waterInstances[instIdx];
                    if (i < cumulativeTiles + inst.count) {
                        const localIdx = i - cumulativeTiles;
                        inst.setMatrixAt(localIdx, tempMatrix);
                        break;
                    }
                    cumulativeTiles += inst.count;
                }
            }
            
            // Update all instances
            this.waterInstances.forEach(inst => {
                inst.instanceMatrix.needsUpdate = true;
            });
            this.sceneManager.requestRender();
        }


    }

    /**
     * Project boundary to grid-space polygon
     */
    _getBoundaryPolygonGrid() {
        const out = [];
        if (!this.originalBoundary || !this.latSpacing || !this.lngSpacing || !this.originalBounds) return out;
        
        for (let i = 0; i < this.originalBoundary.length; i++) {
            const pt = this.originalBoundary[i];
            const north = this.originalBounds.getNorth();
            const west = this.originalBounds.getWest();
            const x = (pt.lng - west) / this.lngSpacing;
            const z = (north - pt.lat) / this.latSpacing;
            out.push({ x: x, z: z });
        }
        return out;
    }

    /**
     * Set geographic data for water system
     */
    setGeographicData(bounds, boundary, latSpacing, lngSpacing) {
        this.originalBounds = bounds;
        this.originalBoundary = boundary;
        this.latSpacing = latSpacing;
        this.lngSpacing = lngSpacing;
        

    }

    /**
     * Point-in-polygon test for grid coordinates
     */
    _pointInPolygonGrid(px, pz, poly) {
        if (!poly || poly.length < 3) return false;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, zi = poly[i].z;
            const xj = poly[j].x, zj = poly[j].z;
            const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Minimum distance from point to polygon edges
     */
    _minDistanceToPolygon(p, poly) {
        if (!poly || poly.length < 2) return Infinity;
        let minD = Infinity;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[j];
            const b = poly[i];
            const d = this._distancePointToSegment(p, a, b);
            if (d < minD) minD = d;
        }
        return minD;
    }

    /**
     * Distance from point to line segment
     */
    _distancePointToSegment(p, a, b) {
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        const wx = p.x - a.x;
        const wz = p.z - a.z;
        const c1 = vx * wx + vz * wz;
        if (c1 <= 0) return Math.hypot(p.x - a.x, p.z - a.z);
        const c2 = vx * vx + vz * vz;
        if (c2 <= c1) return Math.hypot(p.x - b.x, p.z - b.z);
        const t = c1 / c2;
        const projX = a.x + t * vx;
        const projZ = a.z + t * vz;
        return Math.hypot(p.x - projX, p.z - projZ);
    }

    // --- Helpers for far ocean polygon offset ---
    _polygonArea(poly) {
        let a = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            a += (poly[j].x * poly[i].z - poly[i].x * poly[j].z);
        }
        return 0.5 * a;
    }

    _isClockwise(poly) {
        return this._polygonArea(poly) < 0;
    }

    _computeOffsetPolygon(poly, d) {
        if (!poly || poly.length < 3) return null;

        // Determine winding; for CCW, outward normal is to the right of the edge
        const isCW = this._isClockwise(poly);
        const s = isCW ? -1 : 1; // flip for CW to keep outward direction

        const n = poly.length;
        const out = [];
        for (let i = 0; i < n; i++) {
            const p0 = poly[(i + n - 1) % n];
            const p1 = poly[i];
            const p2 = poly[(i + 1) % n];

            // Edge unit normals (outward)
            const e1x = p1.x - p0.x, e1z = p1.z - p0.z;
            const e2x = p2.x - p1.x, e2z = p2.z - p1.z;
            const e1len = Math.hypot(e1x, e1z) || 1;
            const e2len = Math.hypot(e2x, e2z) || 1;
            const n1x = s * (e1z / e1len), n1z = s * (-e1x / e1len);
            const n2x = s * (e2z / e2len), n2z = s * (-e2x / e2len);

            // Angle bisector of the normals
            let bx = n1x + n2x;
            let bz = n1z + n2z;
            let bl = Math.hypot(bx, bz);
            if (bl < 1e-6) {
                // Nearly straight or reflex; fall back to single normal
                bx = n1x;
                bz = n1z;
                bl = Math.hypot(bx, bz) || 1;
            }
            bx /= bl; bz /= bl;

            // Compute scale to keep approximate distance d from both edges
            // Use 1 / cos(theta/2) approximation via dot of normals
            const dot = (n1x * bx + n1z * bz);
            const scale = Math.max(1.0, 1.0 / Math.max(0.2, dot));

            out.push({ x: p1.x + bx * d * scale, z: p1.z + bz * d * scale });
        }
        return out;
    }

    /**
     * Public: Return an outward offset polygon for cloud bounds (island + water extent)
     */
    getCloudBoundaryPolygon() {
        const basePoly = this._getBoundaryPolygonGrid();
        if (!basePoly || basePoly.length < 3) return null;
        const d = Math.max(8, (this.waterOuterCells || 72) - 2);
        const offset = this._computeOffsetPolygon(basePoly, d);
        return offset && offset.length >= 3 ? offset : basePoly;
    }

    /**
     * Clean up water system resources
     */
    cleanup() {
        // Remove water instances
        if (this.waterInstances) {
            this.waterInstances.forEach(inst => {
                this.sceneManager.remove(inst);
                inst.geometry?.dispose?.();
                inst.material?.dispose?.();
            });
            this.waterInstances = [];
            this.waterTiles = [];
        }
        
        // Remove static water plane
        if (this.staticWaterPlane) {
            this.sceneManager.remove(this.staticWaterPlane);
            this.staticWaterPlane.geometry?.dispose?.();
            this.staticWaterPlane.material?.dispose?.();
            this.staticWaterPlane = null;
        }
        
        // Remove far ocean plane
        if (this.farOceanPlane) {
            this.sceneManager.remove(this.farOceanPlane);
            this.farOceanPlane.geometry?.dispose?.();
            this.farOceanPlane.material?.dispose?.();
            this.farOceanPlane = null;
        }
        
        // Remove terrain group
        if (this.terrainGroup) {
            this.sceneManager.remove(this.terrainGroup);
            this.terrainGroup.traverse(obj => {
                if (obj.isMesh) {
                    obj.geometry?.dispose?.();
                    obj.material?.dispose?.();
                }
            });
            this.terrainGroup = null;
        }
        
        // Remove background dome
        if (this.backgroundDome) {
            this.sceneManager.remove(this.backgroundDome);
            this.backgroundDome.geometry?.dispose?.();
            this.backgroundDome.material?.dispose?.();
            this.backgroundDome = null;
        }
    }
} 