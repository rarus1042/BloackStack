import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js";

export class BlockFactory {
  constructor(scene, physics, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.RAPIER = physics.RAPIER;
    this.world = physics.world;

    this.blockSize = options.blockSize ?? 1;
    this.fallSpeed = options.fallSpeed ?? 0.9;
    this.linearDamping = options.linearDamping ?? 2.2;
    this.angularDamping = options.angularDamping ?? 6.5;

    this.modelListPath = options.modelListPath ?? "models/model-list.json";

    this.loader = new GLTFLoader();

    // [{ path, scaleFactor }]
    this.modelEntries = [];
    this.modelListLoaded = false;

    this.modelCache = new Map();
    this.scaleCache = new Map();
    this.collisionCache = new Map();
  }

 normalizeModelEntry(entry) {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;

    return {
      path: `models/${trimmed}`,
      scaleFactor: 1.0,
      weight: 50, // 기본값
    };
  }

  if (entry && typeof entry === "object") {
    const file =
      typeof entry.file === "string"
        ? entry.file.trim()
        : typeof entry.name === "string"
        ? entry.name.trim()
        : "";

    if (!file) return null;

    let scaleFactor =
      typeof entry.scaleFactor === "number"
        ? entry.scaleFactor
        : typeof entry.scale === "number"
        ? entry.scale
        : 1.0;

    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
      scaleFactor = 1.0;
    }

    let weight =
      typeof entry.weight === "number"
        ? Math.round(entry.weight)
        : 50;

    // 🔥 1~100 강제 제한
    weight = Math.max(1, Math.min(100, weight));

    return {
      path: `models/${file}`,
      scaleFactor,
      weight,
    };
  }

  return null;
}

getWeightedRandomEntry() {
  if (!this.modelEntries.length) {
    throw new Error("BlockFactory: modelEntries is empty.");
  }

  let totalWeight = 0;

  for (const entry of this.modelEntries) {
    totalWeight += entry.weight;
  }

  // 🔥 정수 기반 랜덤
  let r = Math.floor(Math.random() * totalWeight) + 1;

  for (const entry of this.modelEntries) {
    r -= entry.weight;
    if (r <= 0) {
      return entry;
    }
  }

  return this.modelEntries[this.modelEntries.length - 1];
}

  async ensureModelListLoaded() {
    if (this.modelListLoaded) return;

    const response = await fetch(this.modelListPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Failed to load model list: ${this.modelListPath} (${response.status})`
      );
    }

    const data = await response.json();
    const files = Array.isArray(data?.files) ? data.files : [];

    this.modelEntries = files
      .map((entry) => this.normalizeModelEntry(entry))
      .filter(Boolean);

    this.modelListLoaded = true;

    if (!this.modelEntries.length) {
      throw new Error(
        "Model list is empty. Add .glb files to models/ and regenerate model-list.json"
      );
    }
  }

getRandomModelEntry() {
  return this.getWeightedRandomEntry();
}

  async loadModel(modelPath) {
    if (this.modelCache.has(modelPath)) {
      return this.modelCache.get(modelPath);
    }

    const gltf = await this.loader.loadAsync(modelPath);
    const scene = gltf.scene;
    this.modelCache.set(modelPath, scene);
    return scene;
  }

  getModelScale(baseModel, modelPath, scaleFactor = 1.0) {
    const cacheKey = `${modelPath}::${scaleFactor}`;

    if (this.scaleCache.has(cacheKey)) {
      return this.scaleCache.get(cacheKey);
    }

    const temp = baseModel.clone(true);
    const box = new THREE.Box3().setFromObject(temp);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const baseScale = this.blockSize / maxAxis;
    const scale = baseScale * scaleFactor;

    this.scaleCache.set(cacheKey, scale);
    return scale;
  }

  createRenderObject(baseModel, scale) {
    const wrapper = new THREE.Group();
    const model = baseModel.clone(true);

    model.scale.setScalar(scale);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    model.position.sub(center);
    wrapper.add(model);

    this.scene.add(wrapper);
    return wrapper;
  }

  extractGeometryFromScene(root) {
    root.updateMatrixWorld(true);

    const vertices = [];
    const indices = [];
    let vertexOffset = 0;

    root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;

      const geometry = child.geometry.clone();
      const pos = geometry.attributes.position;
      if (!pos) return;

      if (geometry.index) {
        const indexArray = geometry.index.array;

        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          v.applyMatrix4(child.matrixWorld);
          vertices.push(v.x, v.y, v.z);
        }

        for (let i = 0; i < indexArray.length; i++) {
          indices.push(indexArray[i] + vertexOffset);
        }

        vertexOffset += pos.count;
      } else {
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          v.applyMatrix4(child.matrixWorld);
          vertices.push(v.x, v.y, v.z);
          indices.push(vertexOffset++);
        }
      }
    });

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
    };
  }

  buildCollisionData(baseModel, modelPath, scale) {
    const cacheKey = `${modelPath}::${scale}`;

    if (this.collisionCache.has(cacheKey)) {
      return this.collisionCache.get(cacheKey);
    }

    const root = baseModel.clone(true);
    root.scale.setScalar(scale);

    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    root.position.sub(center);
    root.updateMatrixWorld(true);

    const data = this.extractGeometryFromScene(root);

    const collisionData = {
      vertices: data.vertices,
      indices: data.indices,
      halfHeight: size.y / 2,
    };

    this.collisionCache.set(cacheKey, collisionData);
    return collisionData;
  }

  createPreviewBody(spawnY, vertices) {
    const rbDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, spawnY, 0);

    const body = this.world.createRigidBody(rbDesc);

    let colliderDesc = this.RAPIER.ColliderDesc.convexHull(vertices);
    if (!colliderDesc) {
      colliderDesc = this.RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }

    colliderDesc
      .setFriction(2.0)
      .setRestitution(0.0)
      .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
      .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  createDynamicBody(position, rotation, vertices) {
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

    let colliderDesc = this.RAPIER.ColliderDesc.convexHull(vertices);
    if (!colliderDesc) {
      colliderDesc = this.RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }

    colliderDesc
      .setFriction(2.2)
      .setRestitution(0.0)
      .setDensity(1.0)
      .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
      .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

    const collider = this.world.createCollider(colliderDesc, body);

    body.setLinvel({ x: 0, y: -this.fallSpeed, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    return { body, collider };
  }

  async createPreviewBlock(spawnY, id) {
    await this.ensureModelListLoaded();

    const modelEntry = this.getRandomModelEntry();
    const modelPath = modelEntry.path;
    const scaleFactor = modelEntry.scaleFactor ?? 1.0;

    const baseModel = await this.loadModel(modelPath);

    const scale = this.getModelScale(baseModel, modelPath, scaleFactor);
    const collision = this.buildCollisionData(baseModel, modelPath, scale);
    const mesh = this.createRenderObject(baseModel, scale);
    const preview = this.createPreviewBody(spawnY, collision.vertices);

    return {
      id,
      mesh,
      body: preview.body,
      collider: preview.collider,
      halfHeight: collision.halfHeight,
      state: "preview",
      collision,
      modelPath,
      scaleFactor,
      contactFrames: 0,
      stableFrames: 0,
      landingFrames: 0,
      landingStartY: null,
      committed: false,
    };
  }

  convertPreviewToDynamic(block) {
    const pos = block.body.translation();
    const rot = block.body.rotation();

    this.world.removeRigidBody(block.body);

    const dynamic = this.createDynamicBody(pos, rot, block.collision.vertices);

    block.body = dynamic.body;
    block.collider = dynamic.collider;
    block.state = "falling";
    block.contactFrames = 0;
    block.stableFrames = 0;
    block.landingFrames = 0;
    block.landingStartY = null;
    block.committed = false;

    return block;
  }

  disposeBlock(block) {
    this.scene.remove(block.mesh);
    this.world.removeRigidBody(block.body);
  }
}