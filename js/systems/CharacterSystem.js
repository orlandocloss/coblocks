class CharacterSystem {
	constructor(sceneManager, gridRenderer, blockSystem) {
		this.sceneManager = sceneManager;
		this.gridRenderer = gridRenderer;
		this.blockSystem = blockSystem;
		this.character = null;
		this.path = [];
		this.currentTarget = null;
		this.speed = 2.0; // cells per second
		this.gridY = 0; // y-level on land surface
	}

	createCharacter() {
		if (this.character) {
			this.sceneManager.remove(this.character);
		}

		// Simple block person: body + head
		const group = new THREE.Group();
		const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4477ee });
		const headMat = new THREE.MeshLambertMaterial({ color: 0xffe0bd });
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), bodyMat);
		const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), headMat);
		body.position.y = 0.45;
		head.position.y = 0.9 + 0.2;
		group.add(body);
		group.add(head);
		group.castShadow = true;
		group.receiveShadow = false;

		// Place initially on a random land cell
		const gridData = this.gridRenderer.getGridData();
		if (!gridData || gridData.length === 0) return;
		const start = gridData[Math.floor(Math.random() * gridData.length)];
		this.gridY = this.sceneManager.landBaseY; // surface baseline
		group.position.set(start.gridX, this.gridY, start.gridY);
		group.renderOrder = 2.1; // above grid but below hover indicator

		this.sceneManager.add(group);
		this.character = group;
		this._chooseNewTarget();
	}

	_chooseNewTarget() {
		const gridData = this.gridRenderer.getGridData();
		if (!gridData || gridData.length === 0) return;
		const target = gridData[Math.floor(Math.random() * gridData.length)];
		this.currentTarget = new THREE.Vector3(target.gridX, this.gridY, target.gridY);
	}

	update(deltaSeconds) {
		if (!this.character || !this.currentTarget) return;
		const pos = this.character.position;
		const dir = new THREE.Vector3().subVectors(this.currentTarget, pos);
		const dist = dir.length();
		if (dist < 0.05) {
			this._chooseNewTarget();
			return;
		}
		dir.normalize();
		const step = this.speed * deltaSeconds;
		pos.addScaledVector(dir, step);
		// face movement direction
		this.character.rotation.y = Math.atan2(dir.x, dir.z);
		this.sceneManager.requestRender();
	}

	cleanup() {
		if (this.character) {
			this.sceneManager.remove(this.character);
			this.character.traverse(obj => {
				if (obj.isMesh) {
					obj.geometry?.dispose?.();
					obj.material?.dispose?.();
				}
			});
			this.character = null;
		}
	}
} 