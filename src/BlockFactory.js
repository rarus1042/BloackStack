import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class BlockFactory {
  constructor(scene, physics, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.world = physics.world;

    this.blockSize = options.blockSize ?? 1;
    this.cellSize = options.cellSize ?? this.blockSize;
    this.visualCellScale = options.visualCellScale ?? 0.94;

    this.slowFallSpeed = options.slowFallSpeed ?? 0.75;
    this.fastFallSpeed = options.fastFallSpeed ?? 5.5;
    this.linearDamping = options.linearDamping ?? 2.4;
    this.angularDamping = options.angularDamping ?? 6.5;
    this.outlineScale = options.outlineScale ?? 1.045;

    this.geometryCache = new Map();
    this.materialCache = new Map();
    this.previewMaterialCache = new Map();
    this.outlineMaterialCache = new Map();

    this.shapeEntries = this.createShapeLibrary();
    this.nextShapeEntry = null;
  }

  createShapeLibrary() {
    return [
      {
        key: "I",
        name: "I Block",
        color: 0x27cfff,
        weight: 12,
        cells: [
          [-1.5, 0, 0],
          [-0.5, 0, 0],
          [0.5, 0, 0],
          [1.5, 0, 0],
        ],
      },
      {
        key: "O",
        name: "O Block",
        color: 0xffc928,
        weight: 10,
        cells: [
          [-0.5, -0.5, 0],
          [0.5, -0.5, 0],
          [-0.5, 0.5, 0],
          [0.5, 0.5, 0],
        ],
      },
      {
        key: "T",
        name: "T Block",
        color: 0xa64dff,
        weight: 12,
        cells: [
          [-1, 0, 0],
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
      {
        key: "S",
        name: "S Block",
        color: 0x30d96b,
        weight: 10,
        cells: [
          [-1, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
          [1, 1, 0],
        ],
      },
      {
        key: "Z",
        name: "Z Block",
        color: 0xff5a68,
        weight: 10,
        cells: [
          [1, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
          [-1, 1, 0],
        ],
      },
      {
        key: "J",
        name: "J Block",
        color: 0x4f7cff,
        weight: 12,
        cells: [
          [-1, 1, 0],
          [-1, 0, 0],
          [0, 0, 0],
          [1, 0, 0],
        ],
      },
      {
        key: "L",
        name: "L Block",
        color: 0xff8a1f,
        weight: 12,
        cells: [
          [1, 1, 0],
          [-1, 0, 0],
          [0, 0, 0],
          [1, 0, 0],
        ],
      },
    ];
  }

  cloneEntry(entry) {
    return {
      key: entry.key,
      name: entry.name,
      color: entry.color,
      weight: entry.weight,
      cells: entry.cells.map((c) => [...c]),
    };
  }

  getWeightedRandomEntry() {
    let totalWeight = 0;
    for (const entry of this.shapeEntries) {
      totalWeight += entry.weight ?? 1;
    }

    let r = Math.random() * totalWeight;

    for (const entry of this.shapeEntries) {
      r -= entry.weight ?? 1;
      if (r <= 0) {
        return this.cloneEntry(entry);
      }
    }

    return this.cloneEntry(this.shapeEntries[this.shapeEntries.length - 1]);
  }

  async ensureNextModelEntry() {
    if (!this.nextShapeEntry) {
      this.nextShapeEntry = this.getWeightedRandomEntry();
    }
    return this.nextShapeEntry;
  }

  async peekNextModelEntry() {
    return this.ensureNextModelEntry();
  }

  async consumeNextModelEntry() {
    const current = await this.ensureNextModelEntry();
    this.nextShapeEntry = this.getWeightedRandomEntry();
    return current;
  }

  getCubeGeometry() {
    const key = `cube-${this.cellSize}-${this.visualCellScale}`;
    if (this.geometryCache.has(key)) return this.geometryCache.get(key);

    const size = this.cellSize * this.visualCellScale;
    const geometry = new THREE.BoxGeometry(size, size, size);
    this.geometryCache.set(key, geometry);
    return geometry;
  }

  getMaterial(color) {
    const key = `normal-${color}`;
    if (this.materialCache.has(key)) return this.materialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.06,
    });

    this.materialCache.set(key, material);
    return material;
  }

  getPreviewMaterial(color) {
    const key = `preview-${color}`;
    if (this.previewMaterialCache.has(key)) return this.previewMaterialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.84,
      metalness: 0.04,
      transparent: true,
      opacity: 0.92,
    });

    this.previewMaterialCache.set(key, material);
    return material;
  }

  getOutlineMaterial(isPreview = false) {
    const key = isPreview ? "outline-preview" : "outline-normal";
    if (this.outlineMaterialCache.has(key)) return this.outlineMaterialCache.get(key);

    const material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      side: THREE.BackSide,
      transparent: true,
      opacity: isPreview ? 0.18 : 0.92,
      depthWrite: false,
    });

    this.outlineMaterialCache.set(key, material);
    return material;
  }

  buildShapeData(entry) {
  const halfExtent = this.cellSize / 2;

  // 기존 0.94보다 조금 더 줄여서
  // 보이는 블럭보다 살짝 작게 충돌하게 만듦
  const colliderHalfExtent = halfExtent * 0.90;

  const rawCellOffsets = entry.cells.map(([x, y, z]) => ({
    x: x * this.cellSize,
    y: y * this.cellSize,
    z: z * this.cellSize,
  }));

  let centerMinX = Infinity;
  let centerMaxX = -Infinity;
  let centerMinY = Infinity;
  let centerMaxY = -Infinity;
  let centerMinZ = Infinity;
  let centerMaxZ = -Infinity;

  for (const c of rawCellOffsets) {
    if (c.x < centerMinX) centerMinX = c.x;
    if (c.x > centerMaxX) centerMaxX = c.x;
    if (c.y < centerMinY) centerMinY = c.y;
    if (c.y > centerMaxY) centerMaxY = c.y;
    if (c.z < centerMinZ) centerMinZ = c.z;
    if (c.z > centerMaxZ) centerMaxZ = c.z;
  }

  const shapeCenter = {
    x: (centerMinX + centerMaxX) * 0.5,
    y: (centerMinY + centerMaxY) * 0.5,
    z: (centerMinZ + centerMaxZ) * 0.5,
  };

  let anchor = rawCellOffsets[0];
  let bestDist2 = Infinity;
  let bestTie = Infinity;

  for (const c of rawCellOffsets) {
    const dx = c.x - shapeCenter.x;
    const dy = c.y - shapeCenter.y;
    const dz = c.z - shapeCenter.z;

    const dist2 = dx * dx + dy * dy + dz * dz;

    const tie =
      Math.abs(dy) * 10000 +
      Math.abs(dx) * 100 +
      Math.abs(dz);

    if (
      dist2 < bestDist2 - 1e-9 ||
      (Math.abs(dist2 - bestDist2) <= 1e-9 && tie < bestTie)
    ) {
      bestDist2 = dist2;
      bestTie = tie;
      anchor = c;
    }
  }

  const cellOffsets = rawCellOffsets.map((c) => ({
    x: c.x - anchor.x,
    y: c.y - anchor.y,
    z: c.z - anchor.z,
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let footprintRadius = 0;

  for (const c of cellOffsets) {
    minX = Math.min(minX, c.x - colliderHalfExtent);
    maxX = Math.max(maxX, c.x + colliderHalfExtent);
    minY = Math.min(minY, c.y - colliderHalfExtent);
    maxY = Math.max(maxY, c.y + colliderHalfExtent);
    minZ = Math.min(minZ, c.z - colliderHalfExtent);
    maxZ = Math.max(maxZ, c.z + colliderHalfExtent);

    const r = Math.hypot(c.x, c.z) + colliderHalfExtent;
    if (r > footprintRadius) footprintRadius = r;
  }

  return {
    key: entry.key,
    name: entry.name,
    color: entry.color,
    weight: entry.weight,
    cellOffsets,
    halfExtent,
    colliderHalfExtent,
    halfHeight: (maxY - minY) * 0.5,
    footprintRadius,
    anchorCellOffset: { x: 0, y: 0, z: 0 },
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

  addOutlineToMesh(mesh, isPreview = false) {
    if (!mesh?.geometry) return;
    if (mesh.userData.__outlineAdded) return;

    const outline = new THREE.Mesh(mesh.geometry, this.getOutlineMaterial(isPreview));
    outline.name = "__outline";
    outline.scale.setScalar(this.outlineScale);
    outline.renderOrder = 1;
    outline.raycast = () => {};
    mesh.add(outline);

    mesh.userData.__outlineAdded = true;
  }

  createShapeGroup(shapeData, options = {}) {
    const group = new THREE.Group();
    const geometry = this.getCubeGeometry();
    const material = options.isPreview
      ? this.getPreviewMaterial(shapeData.color)
      : this.getMaterial(shapeData.color);

    for (const offset of shapeData.cellOffsets) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(offset.x, offset.y, offset.z);
      mesh.castShadow = options.castShadow ?? !options.isPreview;
      mesh.receiveShadow = options.receiveShadow ?? true;
      mesh.renderOrder = 2;

      this.addOutlineToMesh(mesh, !!options.isPreview);
      group.add(mesh);
    }

    group.userData.shapeKey = shapeData.key;
    group.userData.shapeName = shapeData.name;
    return group;
  }

  createRenderObject(shapeData) {
    const wrapper = this.createShapeGroup(shapeData, {
      isPreview: false,
      castShadow: true,
      receiveShadow: true,
    });

    this.scene.add(wrapper);
    return wrapper;
  }

  async createUiPreviewObject(entry) {
    if (!entry) return null;

    const shapeData = this.buildShapeData(entry);
    return this.createShapeGroup(shapeData, {
      isPreview: true,
      castShadow: false,
      receiveShadow: true,
    });
  }

  createPreviewBody(spawnY, shapeData) {
    const rbDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      0,
      spawnY,
      0
    );

    const body = this.world.createRigidBody(rbDesc);
    const colliders = [];
    const h = shapeData.colliderHalfExtent ?? shapeData.halfExtent;

    for (const offset of shapeData.cellOffsets) {
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(h, h, h)
        .setTranslation(offset.x, offset.y, offset.z)
        .setFriction(2.1)
        .setRestitution(0.0)
        .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

      colliders.push(this.world.createCollider(colliderDesc, body));
    }

    return { body, colliders };
  }

  createDynamicBody(position, rotation, shapeData, fallSpeed = this.fastFallSpeed) {
    const rbDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setCanSleep(true)
      .setLinearDamping(this.linearDamping)
      .setAngularDamping(this.angularDamping);

    const body = this.world.createRigidBody(rbDesc);
    body.setGravityScale(1, true);

    if (typeof body.enableCcd === "function") {
      body.enableCcd(true);
    }

    const colliders = [];
    const h = shapeData.colliderHalfExtent ?? shapeData.halfExtent;

    for (const offset of shapeData.cellOffsets) {
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(h, h, h)
        .setTranslation(offset.x, offset.y, offset.z)
        .setDensity(0.95)
        .setFriction(2.35)
        .setRestitution(0.0)
        .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

      colliders.push(this.world.createCollider(colliderDesc, body));
    }

    body.setLinvel({ x: 0, y: -fallSpeed, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    return { body, colliders };
  }

  async createPreviewBlock(spawnY, id) {
    const entry = await this.consumeNextModelEntry();
    const shapeData = this.buildShapeData(entry);
    const mesh = this.createRenderObject(shapeData);
    const preview = this.createPreviewBody(spawnY, shapeData);

    return {
      id,
      mesh,
      body: preview.body,
      collider: preview.colliders[0] ?? null,
      colliders: preview.colliders,
      halfHeight: shapeData.halfHeight,
      footprintRadius: shapeData.footprintRadius,
      state: "preview",
      collision: shapeData,
      modelPath: entry.key,
      modelFile: entry.name,
      shapeKey: entry.key,
      shapeName: entry.name,
      color: entry.color,
      weight: entry.weight,
      contactFrames: 0,
      stableFrames: 0,
      landingFrames: 0,
      landingStartY: null,
      landingStartTime: null,
      committed: false,
      primaryColor: entry.color,
    };
  }

  convertPreviewToDynamic(block, fallSpeed = this.fastFallSpeed) {
    const pos = block.body.translation();
    const rot = block.body.rotation();

    this.world.removeRigidBody(block.body);

    const dynamic = this.createDynamicBody(pos, rot, block.collision, fallSpeed);

    block.body = dynamic.body;
    block.collider = dynamic.colliders[0] ?? null;
    block.colliders = dynamic.colliders;
    block.state = "falling";
    block.contactFrames = 0;
    block.stableFrames = 0;
    block.landingFrames = 0;
    block.landingStartY = null;
    block.landingStartTime = null;
    block.committed = false;

    return block;
  }

  disposeBlock(block) {
    if (block?.mesh) this.scene.remove(block.mesh);
    if (block?.body) this.world.removeRigidBody(block.body);
  }
}