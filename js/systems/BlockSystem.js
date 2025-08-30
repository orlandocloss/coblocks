/**
 * BlockSystem - Handles block creation, physics, and management
 * 
 * Manages:
 * - Block placement, stacking, and removal
 * - Physics validation (support requirements)
 * - Block data storage and tracking
 * - Block statistics and state updates
 */
class BlockSystem {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // === Block Data ===
        this.blocks = new Map(); // Block storage: "x_y_z" -> blockData
        this.selectedColor = '#ffffff';
        
        // === Physics & Scale ===
        this.blockSize = 1.0; // Block size: 1 unit = 3 meters
        this.enableBlockPhysics = true; // Require block support
        this.landBaseY = 0.5; // Raise land above water
        
        // === Grid Data ===
        this.gridData = [];
        this.gridSize = { width: 0, height: 0 };
        this.gridCellIndex = new Map(); // "x_z" -> gridPoint for O(1) lookup
    }

    /**
     * Set up the grid data for block placement
     */
    setupGrid(gridData, gridSize) {
        this.gridData = gridData;
        this.gridSize = gridSize;
        
        // Prepare fast index
        this.gridCellIndex.clear();
        this.gridData.forEach(gp => {
            this.gridCellIndex.set(`${gp.gridX}_${gp.gridY}`, gp);
        });
    }

    /**
     * Validates if a block can be placed at the given position
     */
    validateBlockPlacement(x, yLevel, z) {
        // Ground level blocks on the original grid are always supported
        if (yLevel === 0 && this.isGroundLevel(x, z)) {
            return true;
        }
        
        return this.hasSupport(x, yLevel, z);
    }
    
    /**
     * Checks if a block position has support (vertical or horizontal)
     */
    hasSupport(x, yLevel, z) {
        // Vertical support: block directly underneath
        const belowBlockId = `${x}_${yLevel - 1}_${z}`;
        if (this.blocks.has(belowBlockId)) {
            return true;
        }
        
        // Horizontal support: adjacent block that has support
        const adjacentPositions = this.getAdjacentPositions(x, yLevel, z);
        for (const pos of adjacentPositions) {
            const adjacentBlockId = `${pos.x}_${pos.y}_${pos.z}`;
            if (this.blocks.has(adjacentBlockId)) {
                // Recursive check with cycle prevention
                if (this.hasIndirectSupport(pos.x, pos.y, pos.z, new Set([`${x}_${yLevel}_${z}`]))) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Check for indirect support through connected blocks
     */
    hasIndirectSupport(x, yLevel, z, visited) {
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Avoid infinite recursion
        if (visited.has(blockId) || visited.size > 20) {
            return false;
        }
        visited.add(blockId);
        
        // Ground level blocks on the original grid are always supported
        if (yLevel === 0 && this.isGroundLevel(x, z)) {
            return true;
        }
        
        // Check if there's a block directly underneath
        const belowBlockId = `${x}_${yLevel - 1}_${z}`;
        if (this.blocks.has(belowBlockId)) {
            return true;
        }
        
        // Check adjacent blocks recursively
        const adjacentPositions = this.getAdjacentPositions(x, yLevel, z);
        for (const pos of adjacentPositions) {
            const adjacentBlockId = `${pos.x}_${pos.y}_${pos.z}`;
            if (this.blocks.has(adjacentBlockId) && !visited.has(adjacentBlockId)) {
                if (this.hasIndirectSupport(pos.x, pos.y, pos.z, new Set(visited))) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Get adjacent positions for support checking
     */
    getAdjacentPositions(x, yLevel, z) {
        return [
            { x: x + 1, y: yLevel, z: z }, // East
            { x: x - 1, y: yLevel, z: z }, // West
            { x: x, y: yLevel, z: z + 1 }, // North
            { x: x, y: yLevel, z: z - 1 }, // South
        ];
    }
    
    /**
     * Check if position is on the original grid
     */
    isGroundLevel(x, z) {
        return this.gridData.some(gridPoint => gridPoint.gridX === x && gridPoint.gridY === z);
    }

    /**
     * Create a block at specific coordinates
     */
    createBlockAt(x, z, yLevel = 0, options = {}) {
        // Check if block placement is valid (has support)
        if (!options.skipValidation && this.enableBlockPhysics && !this.validateBlockPlacement(x, yLevel, z)) {
            console.log(`Cannot place block at ${x},${yLevel},${z} - no support`);
            this.showPlacementError(x, yLevel, z);
            return false;
        }
        
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Create new block with appropriate height
        let height = this.blockSize;
        // Visual surface cap: thin base at level 0 when column empty
        const isEmptyColumn = !Array.from(this.blocks.values()).some(bd => 
            bd.position.x === x && bd.position.z === z
        );
        if (yLevel === 0 && isEmptyColumn) {
            height = 0.22;
        } else if (yLevel === 1) {
            // If base is thin, do not make the second block taller; instead, inflate the base to fill the missing gap
            const baseId = `${x}_0_${z}`;
            const base = this.blocks.get(baseId);
            if (base && base.height < this.blockSize) {
                const needed = this.blockSize - base.height;
                base.height += needed;
                if (base.mesh) {
                    // Replace base geometry to the new height and adjust its Y position
                    base.mesh.geometry.dispose();
                    base.mesh.geometry = new THREE.BoxGeometry(this.blockSize, base.height, this.blockSize);
                    base.mesh.position.y = this.landBaseY + base.height / 2;
                }
                height = this.blockSize;
            }
        }
        
        const geometry = new THREE.BoxGeometry(this.blockSize, height, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        const yPosition = this._calculateYPosition(x, z, yLevel, height);
        block.position.set(x, yPosition, z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        this.sceneManager.add(block);
        
        // Store block data
        const blockData = { 
            mesh: block, 
            height: height,
            color: this.selectedColor, 
            position: { x: x, y: yPosition, z: z },
            yLevel: yLevel,
            id: blockId
        };
        block.userData.blockData = blockData;
        this.blocks.set(blockId, blockData);
        
        this.updateStats();
        
        // Update grid data for ground level blocks
        if (yLevel === 0 && window.gridGenerator) {
            const gridPoint = this.gridData.find(gp => gp.gridX === x && gp.gridY === z);
            if (gridPoint) {
                window.gridGenerator.updateBlockData(gridPoint.id, 1, this.selectedColor);
            }
        }
        
        return true;
    }

    /**
     * Add a block at the specified grid position and Y level
     */
    addBlock(gridPoint, yLevel = 0) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        
        // Check if block placement is valid (has support)
        if (this.enableBlockPhysics && !this.validateBlockPlacement(x, yLevel, z)) {
            console.log(`Cannot place block at ${x},${yLevel},${z} - no support`);
            this.showPlacementError(x, yLevel, z);
            return false;
        }
        
        const blockId = `${x}_${yLevel}_${z}`;
        
        // Remove existing block at this exact position if it exists
        if (this.blocks.has(blockId)) {
            const existingBlock = this.blocks.get(blockId);
            this.sceneManager.remove(existingBlock.mesh);
        }

        // Create new block
        let height = this.blockSize;
        const isEmptyColumn2 = !Array.from(this.blocks.values()).some(bd => 
            bd.position.x === x && bd.position.z === z
        );
        if (yLevel === 0 && isEmptyColumn2) {
            height = 0.22;
        } else if (yLevel === 1) {
            const baseId = `${x}_0_${z}`;
            const base = this.blocks.get(baseId);
            if (base && base.height < this.blockSize) {
                const needed = this.blockSize - base.height;
                base.height += needed;
                if (base.mesh) {
                    base.mesh.geometry.dispose();
                    base.mesh.geometry = new THREE.BoxGeometry(this.blockSize, base.height, this.blockSize);
                    base.mesh.position.y = this.landBaseY + base.height / 2;
                }
                height = this.blockSize;
            }
        }
        
        const geometry = new THREE.BoxGeometry(this.blockSize, height, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        // Calculate Y position based on actual cumulative height of blocks below
        const yPosition = this._calculateYPosition(x, z, yLevel, height);
        block.position.set(x, yPosition, z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        this.sceneManager.add(block);
        
        // Store block data
        const blockData = { 
            mesh: block, 
            height: height,
            color: this.selectedColor, 
            position: { x: x, y: yPosition, z: z },
            yLevel: yLevel,
            id: blockId
        };
        block.userData.blockData = blockData;
        this.blocks.set(blockId, blockData);
        
        this.updateStats();
        
        // Update grid data for ground level blocks
        if (yLevel === 0 && window.gridGenerator) {
            window.gridGenerator.updateBlockData(gridPoint.id, 1, this.selectedColor);
        }
        
        return true;
    }

    /**
     * Remove block by mesh reference
     */
    removeBlockByMesh(blockMesh) {
        const blockData = blockMesh.userData.blockData;
        if (blockData) {
            this.sceneManager.remove(blockData.mesh);
            this.blocks.delete(blockData.id);
            
            // Check for and remove unsupported blocks after removal
            this.removeUnsupportedBlocks();
            
            // Update grid data if this was on the original grid
            if (window.gridGenerator) {
                const gridPoint = this.gridData.find(gp => gp.gridX === blockData.position.x && gp.gridY === blockData.position.z);
                if (gridPoint) {
                    window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
                }
            }
            
            this.updateStats();
        }
    }

    /**
     * Remove highest block at grid position
     */
    removeBlock(gridPoint) {
        let highestLevel = -1;
        let highestBlockId = null;
        
        this.blocks.forEach((blockData, blockId) => {
            if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                if (blockData.yLevel > highestLevel) {
                    highestLevel = blockData.yLevel;
                    highestBlockId = blockId;
                }
            }
        });
        
        if (highestBlockId) {
            const blockData = this.blocks.get(highestBlockId);
            this.sceneManager.remove(blockData.mesh);
            this.blocks.delete(highestBlockId);
            
            // Check for and remove unsupported blocks after removal
            this.removeUnsupportedBlocks();
            
            this.updateStats();
            
            // Update grid data only if no blocks remain at this position
            if (window.gridGenerator) {
                let hasRemainingBlocks = false;
                this.blocks.forEach((blockData) => {
                    if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                        hasRemainingBlocks = true;
                    }
                });
                
                if (!hasRemainingBlocks) {
                    window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
                }
            }
        }
    }

    /**
     * Clear all blocks from the scene
     */
    clearAllBlocks() {
        this.blocks.forEach(blockData => {
            this.sceneManager.remove(blockData.mesh);
        });
        this.blocks.clear();
        
        this.updateStats();
        
        // Update all grid data
        if (window.gridGenerator) {
            this.gridData.forEach(gridPoint => {
                window.gridGenerator.updateBlockData(gridPoint.id, 0, '#ffffff');
            });
        }
    }

    /**
     * Find blocks that lack support
     */
    findUnsupportedBlocks() {
        const unsupportedBlocks = [];
        
        this.blocks.forEach((blockData) => {
            const { x, z } = blockData.position;
            const { yLevel } = blockData;
            
            if (!this.hasSupport(x, yLevel, z)) {
                unsupportedBlocks.push(blockData);
            }
        });
        
        return unsupportedBlocks;
    }
    
    /**
     * Remove all unsupported blocks (cascade effect)
     */
    removeUnsupportedBlocks() {
        if (!this.enableBlockPhysics) return;
        
        let removedCount = 0;
        let hasUnsupported = true;
        
        // Keep removing unsupported blocks until none remain
        while (hasUnsupported) {
            const unsupportedBlocks = this.findUnsupportedBlocks();
            hasUnsupported = unsupportedBlocks.length > 0;
            
            for (const blockData of unsupportedBlocks) {
                this.sceneManager.remove(blockData.mesh);
                this.blocks.delete(blockData.id);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            console.log(`Removed ${removedCount} unsupported blocks`);
            this.updateStats();
        }
        
        return removedCount;
    }

    /**
     * Show placement error indicator
     */
    showPlacementError(x, yLevel, z) {
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.8 
        });
        
        const errorBlock = new THREE.Mesh(geometry, material);
        const yPosition = this._calculateYPosition(x, z, yLevel, this.blockSize);
        errorBlock.position.set(x, yPosition, z);
        
        this.sceneManager.add(errorBlock);
        
        // Remove the error indicator after 1 second
        setTimeout(() => {
            this.sceneManager.remove(errorBlock);
        }, 1000);
    }

    /**
     * Toggle block physics on/off
     */
    toggleBlockPhysics() {
        this.enableBlockPhysics = !this.enableBlockPhysics;
        console.log(`Block physics ${this.enableBlockPhysics ? 'enabled' : 'disabled'}`);
        
        if (this.enableBlockPhysics) {
            this.removeUnsupportedBlocks();
        }
        
        return this.enableBlockPhysics;
    }

    /**
     * Place block above existing block
     */
    placeAboveBlock(existingBlockData, options = {}) {
        const x = existingBlockData.position.x;
        const z = existingBlockData.position.z;
        let target = existingBlockData.yLevel + 1;
        while (this.blocks.has(`${x}_${target}_${z}`)) {
            target++;
        }
        this.createBlockAt(x, z, target, options);
    }

    /**
     * Place block below existing block
     */
    placeBelowBlock(existingBlockData, options = {}) {
        const x = existingBlockData.position.x;
        const z = existingBlockData.position.z;
        let target = existingBlockData.yLevel - 1;
        while (target >= 0) {
            const id = `${x}_${target}_${z}`;
            if (!this.blocks.has(id)) break;
            target--;
        }
        if (target < 0) return;
        this.createBlockAt(x, z, target, options);
    }

    /**
     * Place block adjacent to existing block
     */
    placeAdjacentBlock(existingBlockData, clickPoint, face = null) {
        const blockPos = existingBlockData.position;
        
        let newX = blockPos.x;
        let newZ = blockPos.z;
        if (face === 'east') newX = blockPos.x + 1;
        else if (face === 'west') newX = blockPos.x - 1;
        else if (face === 'north') newZ = blockPos.z + 1;
        else if (face === 'south') newZ = blockPos.z - 1;
        else {
            const relativeX = clickPoint.x - blockPos.x;
            const relativeZ = clickPoint.z - blockPos.z;
            if (Math.abs(relativeX) > Math.abs(relativeZ)) {
                newX = blockPos.x + (relativeX > 0 ? 1 : -1);
            } else {
                newZ = blockPos.z + (relativeZ > 0 ? 1 : -1);
            }
        }
        
        newX = Math.round(newX);
        newZ = Math.round(newZ);
        
        // Find appropriate level
        let newLevel = existingBlockData.yLevel;
        if (this.isOccupiedAtLevel(newX, newLevel, newZ)) {
            let highestLevel = -1;
            this.blocks.forEach((blockData) => {
                if (blockData.position.x === newX && blockData.position.z === newZ) {
                    highestLevel = Math.max(highestLevel, blockData.yLevel);
                }
            });
            newLevel = highestLevel + 1;
        }
        
        this.createBlockAt(newX, newZ, newLevel);
    }

    /**
     * Place at lowest available level in column
     */
    placeAtLowestAvailableAtGrid(gridPoint) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        let level = 0;
        while (this.blocks.has(`${x}_${level}_${z}`)) {
            level++;
        }
        this.createBlockAt(x, z, level);
    }

    /**
     * Place below at grid position
     */
    placeBelowAtGrid(gridPoint) {
        const x = gridPoint.gridX;
        const z = gridPoint.gridY;
        let highest = -1;
        const occupied = new Set();
        this.blocks.forEach((bd) => {
            if (bd.position.x === x && bd.position.z === z) {
                occupied.add(bd.yLevel);
                if (bd.yLevel > highest) highest = bd.yLevel;
            }
        });
        
        if (highest < 0) {
            this.createBlockAt(x, z, 0);
            return;
        }
        
        let target = highest - 1;
        while (target >= 0 && occupied.has(target)) target--;
        if (target >= 0) {
            this.createBlockAt(x, z, target, { skipValidation: true });
        }
    }

    /**
     * Check if position is occupied at specific level
     */
    isOccupiedAtLevel(x, yLevel, z) {
        return this.blocks.has(`${x}_${yLevel}_${z}`);
    }

    /**
     * Calculate Y position based on cumulative height of blocks below
     */
    _calculateYPosition(x, z, yLevel, blockHeight) {
        // Pure accumulation of actual placed block heights; no global normalization here.
        let cumulativeHeight = this.landBaseY;
        for (let level = 0; level < yLevel; level++) {
            const belowId = `${x}_${level}_${z}`;
            const belowBlock = this.blocks.get(belowId);
            if (belowBlock) {
                cumulativeHeight += belowBlock.height;
            } else {
                cumulativeHeight += this.blockSize;
            }
        }
        return cumulativeHeight + blockHeight / 2;
    }

    /**
     * Update block count statistics
     */
    updateStats() {
        const blockCountElement = document.getElementById('blockCount');
        if (blockCountElement) {
            blockCountElement.textContent = this.blocks.size;
        }
    }

    /**
     * Get all block meshes for raycasting
     */
    getBlockMeshes() {
        const blockMeshes = [];
        this.blocks.forEach(blockData => { 
            if (blockData.mesh) blockMeshes.push(blockData.mesh); 
        });
        return blockMeshes;
    }

    /**
     * Zoom camera to fit all blocks
     */
    zoomToFitBlocks(cameraController) {
        if (this.blocks.size === 0) {
            cameraController.resetCameraToCenter();
            return;
        }

        // Calculate bounding box of all blocks
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        this.blocks.forEach(blockData => {
            const { x, y, z } = blockData.position;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        });

        // Calculate center and size of blocks
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        const sizeX = maxX - minX + 2;
        const sizeZ = maxZ - minZ + 2;
        const sizeY = maxY - minY + 2;
        
        const maxSize = Math.max(sizeX, sizeZ, sizeY);
        const distance = maxSize * 1.5;

        cameraController.zoomToArea(centerX, centerZ, distance);
    }

    /**
     * Set selected color for new blocks
     */
    setSelectedColor(color) {
        this.selectedColor = color;
    }

    /**
     * Add or stack block at grid position
     */
    addOrStackBlock(gridPoint) {
        // Find the highest block at this X,Z position
        let highestLevel = -1;
        this.blocks.forEach((blockData, blockId) => {
            if (blockData.position.x === gridPoint.gridX && blockData.position.z === gridPoint.gridY) {
                highestLevel = Math.max(highestLevel, blockData.yLevel);
            }
        });
        
        // Add a new block at the next level up
        const newLevel = highestLevel + 1;
        this.addBlock(gridPoint, newLevel);
        
        this.updateStats();
    }

    /**
     * Stack a block vertically (add new block on top)
     */
    stackVertically(blockData) {
        // Find the highest block at this X,Z position
        let highestLevel = blockData.yLevel;
        this.blocks.forEach((otherBlock, blockId) => {
            if (otherBlock.position.x === blockData.position.x && otherBlock.position.z === blockData.position.z) {
                highestLevel = Math.max(highestLevel, otherBlock.yLevel);
            }
        });
        
        // Create a new block one level above the highest
        const newLevel = highestLevel + 1;
        const newBlockId = `${blockData.position.x}_${newLevel}_${blockData.position.z}`;
        
        // Create new block
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshLambertMaterial({ color: this.selectedColor });
        
        const block = new THREE.Mesh(geometry, material);
        const yPosition = this._calculateYPosition(blockData.position.x, blockData.position.z, newLevel, this.blockSize);
        block.position.set(blockData.position.x, yPosition, blockData.position.z);
        block.castShadow = true;
        block.receiveShadow = true;
        
        // Store new block data
        const newBlockData = {
            mesh: block,
            height: this.blockSize,
            color: this.selectedColor,
            position: { x: blockData.position.x, y: yPosition, z: blockData.position.z },
            yLevel: newLevel,
            id: newBlockId
        };
        block.userData.blockData = newBlockData;
        
        this.sceneManager.add(block);
        this.blocks.set(newBlockId, newBlockData);
        
        this.updateStats();
    }
} 