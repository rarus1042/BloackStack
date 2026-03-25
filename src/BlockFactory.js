import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class BlockFactory {
  constructor(scene, physics, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.world = physics.world;

    this.blockSize = options.blockSize ?? 1;
    this.cellSize = options.cellSize ?? this.blockSize * 0.45;
    this.visualCellScale = options.visualCellScale ?? 0.94;

    this.fallSpeed = options.fallSpeed ?? 1.6;
    this.linearDamping = options.linearDamping ?? 2.0;
    this.angularDamping = options.angularDamping ?? 5.8;
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
    { key: "I4",       name: "I Bar",      color: 0x27cfff, weight: 12, cells: [[-1.5,0,0],[-0.5,0,0],[0.5,0,0],[1.5,0,0]] },
    { key: "O4",       name: "Square",     color: 0xffc928, weight: 10, cells: [[-0.5,-0.5,0],[0.5,-0.5,0],[-0.5,0.5,0],[0.5,0.5,0]] },
    { key: "L4",       name: "L Block",    color: 0xff8a1f, weight: 12, cells: [[-1,0,0],[0,0,0],[1,0,0],[1,1,0]] },
    { key: "T4",       name: "T Block",    color: 0xa64dff, weight: 12, cells: [[-1,0,0],[0,0,0],[1,0,0],[0,1,0]] },
    { key: "S4",       name: "S Block",    color: 0x30d96b, weight: 10, cells: [[-1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
    { key: "Corner3D", name: "3D Corner",  color: 0xff4d57, weight: 12, cells: [[0,0,0],[1,0,0],[0,1,0],[0,0,1]] },
    { key: "Tripod",   name: "Tripod",     color: 0x18d7c3, weight: 9,  cells: [[0,0,0],[1,0,0],[0,0,1],[0,1,0]] },
    { key: "Pillar3",  name: "Pillar",     color: 0xe14cff, weight: 8,  cells: [[0,-1,0],[0,0,0],[0,1,0]] },
    { key: "Bridge",   name: "Bridge",     color: 0x2f8fff, weight: 9,  cells: [[-1,0,0],[0,0,0],[1,0,0],[0,1,0],[0,0,1]] },
    { key: "Step3D",   name: "3D Step",    color: 0xff4fb2, weight: 10, cells: [[-1,0,0],[0,0,0],[0,1,0],[1,1,0],[1,1,1]] },
  ];
}
  getWeightedRandomEntry() {
    let totalWeight = 0;
    for (const entry of this.shapeEntries) totalWeight += entry.weight ?? 1;

    let r = Math.random() * totalWeight;
    for (const entry of this.shapeEntries) {
      r -= entry.weight ?? 1;
      if (r <= 0) {
        return {
          key: entry.key,
          name: entry.name,
          color: entry.color,
          weight: entry.weight,
          cells: entry.cells.map((c) => [...c]),
        };
      }
    }

    const last = this.shapeEntries[this.shapeEntries.length - 1];
    return {
      key: last.key,
      name: last.name,
      color: last.color,
      weight: last.weight,
      cells: last.cells.map((c) => [...c]),
    };
  }

  async ensureNextModelEntry() {
    if (!this.nextShapeEntry) this.nextShapeEntry = this.getWeightedRandomEntry();
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
    roughness: 0.72,
    metalness: 0.06,
    transparent: true,
    opacity: 0.92,
  });

  this.previewMaterialCache.set(key, material);
  return material;
}

  getPreviewMaterial(color) {
    const key = `preview-${color}`;
    if (this.previewMaterialCache.has(key)) return this.previewMaterialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
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

    const cellOffsets = entry.cells.map(([x, y, z]) => ({
      x: x * this.cellSize,
      y: y * this.cellSize,
      z: z * this.cellSize,
    }));

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let footprintRadius = 0;

    for (const c of cellOffsets) {
      minX = Math.min(minX, c.x - halfExtent);
      maxX = Math.max(maxX, c.x + halfExtent);
      minY = Math.min(minY, c.y - halfExtent);
      maxY = Math.max(maxY, c.y + halfExtent);
      minZ = Math.min(minZ, c.z - halfExtent);
      maxZ = Math.max(maxZ, c.z + halfExtent);

      const r = Math.hypot(c.x, c.z) + halfExtent;
      if (r > footprintRadius) footprintRadius = r;
    }

    return {
      key: entry.key,
      name: entry.name,
      color: entry.color,
      weight: entry.weight,
      cellOffsets,
      halfExtent,
      halfHeight: (maxY - minY) * 0.5,
      footprintRadius,
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
    const rbDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, spawnY, 0);

    const body = this.world.createRigidBody(rbDesc);
    const colliders = [];

    for (const offset of shapeData.cellOffsets) {
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        shapeData.halfExtent,
        shapeData.halfExtent,
        shapeData.halfExtent
      )
        .setTranslation(offset.x, offset.y, offset.z)
        .setFriction(2.1)
        .setRestitution(0.0)
        .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

      colliders.push(this.world.createCollider(colliderDesc, body));
    }

    return { body, colliders };
  }

  createDynamicBody(position, rotation, shapeData) {
    const rbDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setCanSleep(true)
      .setLinearDamping(this.linearDamping)
      .setAngularDamping(this.angularDamping);

    const body = this.world.createRigidBody(rbDesc);
    body.setGravityScale(1, true);

    if (typeof body.enableCcd === "function") body.enableCcd(true);

    const colliders = [];

    for (const offset of shapeData.cellOffsets) {
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        shapeData.halfExtent,
        shapeData.halfExtent,
        shapeData.halfExtent
      )
        .setTranslation(offset.x, offset.y, offset.z)
        .setDensity(0.95)
        .setFriction(2.35)
        .setRestitution(0.0)
        .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

      colliders.push(this.world.createCollider(colliderDesc, body));
    }

    body.setLinvel({ x: 0, y: -this.fallSpeed, z: 0 }, true);
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

  convertPreviewToDynamic(block) {
    const pos = block.body.translation();
    const rot = block.body.rotation();

    this.world.removeRigidBody(block.body);

    const dynamic = this.createDynamicBody(pos, rot, block.collision);

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