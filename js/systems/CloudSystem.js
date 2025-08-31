class CloudSystem {
	constructor(sceneManager) {
		this.sceneManager = sceneManager;
		this.cloudGroup = null;
		this.clouds = [];
		this.boundaryPoly = null; // [{x,z}, ...] in grid coordinates
	}

	setupClouds({ count = 8, boundaryPoly = null } = {}) {
		if (this.cloudGroup) {
			this.sceneManager.remove(this.cloudGroup);
			this.cloudGroup.traverse(obj => {
				if (obj.isMesh) {
					obj.geometry?.dispose?.();
					obj.material?.dispose?.();
				}
			});
		}
		this.cloudGroup = new THREE.Group();
		this.cloudGroup.renderOrder = -10; // Behind most scene elements

		const baseHeights = [180, 220, 260];
		const cloudMat = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			emissive: 0xf8f8f8,
			emissiveIntensity: 0.35,
			specular: 0xffffff,
			shininess: 10,
			flatShading: true,
			transparent: true,
			opacity: 0.98
		});
		this.boundaryPoly = boundaryPoly || this.boundaryPoly;

		for (let i = 0; i < count; i++) {
			const cloud = new THREE.Group();
			const blocks = 3 + Math.floor(Math.random() * 4);
			const y = baseHeights[Math.floor(Math.random() * baseHeights.length)];
			const pos = this._randomPointInsideBoundary();
			cloud.position.set(pos.x, y, pos.z);

			for (let b = 0; b < blocks; b++) {
				const w = 2 + Math.floor(Math.random() * 3);
				const h = 1 + Math.floor(Math.random() * 2);
				const d = 2 + Math.floor(Math.random() * 3);
				const geom = new THREE.BoxGeometry(w, h, d);
				const mesh = new THREE.Mesh(geom, cloudMat);
				mesh.position.set(
					(b - blocks / 2) * 1.2 + (Math.random() - 0.5) * 0.8,
					(Math.random() - 0.5) * 0.6,
					(Math.random() - 0.5) * 0.8
				);
				mesh.castShadow = false;
				mesh.receiveShadow = false;
				cloud.add(mesh);
			}

			this.cloudGroup.add(cloud);
			this.clouds.push({ node: cloud, speed: 0.4 + Math.random() * 0.5, dir: Math.random() < 0.5 ? 1 : -1 });
		}

		this.sceneManager.add(this.cloudGroup);
	}

	animateClouds(deltaSeconds = 0.016) {
		if (!this.clouds || this.clouds.length === 0) return;
		for (const c of this.clouds) {
			c.node.position.x += c.speed * c.dir * deltaSeconds * 5;
			// wrap within boundary
			if (this.boundaryPoly && !this._pointInPolygon(c.node.position.x, c.node.position.z, this.boundaryPoly)) {
				// steer back toward center
				const cx = this.sceneManager.gridSize.width * 0.5;
				const cz = this.sceneManager.gridSize.height * 0.5;
				const dirx = cx - c.node.position.x;
				const dirz = cz - c.node.position.z;
				const len = Math.hypot(dirx, dirz) || 1;
				c.node.position.x += (dirx / len) * deltaSeconds * 10;
				c.node.position.z += (dirz / len) * deltaSeconds * 10;
			}
			c.node.rotation.y += (c.dir * 0.02) * deltaSeconds;
		}
		this.sceneManager.requestRender();
	}

	_randomPointInsideBoundary() {
		if (!this.boundaryPoly || this.boundaryPoly.length < 3) {
			const cx = this.sceneManager.gridSize.width * 0.5;
			const cz = this.sceneManager.gridSize.height * 0.5;
			return { x: cx, z: cz };
		}
		// bounding box for rejection sampling
		let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
		for (const p of this.boundaryPoly) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.z < minZ) minZ = p.z;
			if (p.z > maxZ) maxZ = p.z;
		}
		for (let tries = 0; tries < 200; tries++) {
			const x = minX + Math.random() * (maxX - minX);
			const z = minZ + Math.random() * (maxZ - minZ);
			if (this._pointInPolygon(x, z, this.boundaryPoly)) return { x, z };
		}
		// fallback to center
		const cx = this.sceneManager.gridSize.width * 0.5;
		const cz = this.sceneManager.gridSize.height * 0.5;
		return { x: cx, z: cz };
	}

	_pointInPolygon(px, pz, poly) {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const xi = poly[i].x, zi = poly[i].z;
			const xj = poly[j].x, zj = poly[j].z;
			const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
	}

	cleanup() {
		if (this.cloudGroup) {
			this.sceneManager.remove(this.cloudGroup);
			this.cloudGroup.traverse(obj => {
				if (obj.isMesh) {
					obj.geometry?.dispose?.();
					obj.material?.dispose?.();
				}
			});
			this.cloudGroup = null;
		}
		this.clouds = [];
	}
} 