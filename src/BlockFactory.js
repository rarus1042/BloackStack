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

    this.modelPaths = [];
    this.modelListLoaded = false;

    this.modelCache = new Map();
    this.scaleCache = new Map();
    this.collisionCache = new Map();
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

    this.modelPaths = files
      .filter((name) => typeof name === "string" && name.trim().length > 0)
      .map((name) => `models/${name}`);

    this.modelListLoaded = true;

    if (!this.modelPaths.length) {
      throw new Error("Model list is empty. Add .glb files to models/ and regenerate model-list.json");
    }
  }

  getRandomModelPath() {
    if (!this.modelPaths.length) {
      throw new Error("BlockFactory: modelPaths is empty.");
    }

    const index = Math.floor(Math.random() * this.modelPaths.length);
    return this.modelPaths[index];
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

  getModelScale(baseModel, modelPath) {
    if (this.scaleCache.has(modelPath)) {
      return this.scaleCache.get(modelPath);
    }

    const temp = baseModel.clone(true);
    const box = new THREE.Box3().setFromObject(temp);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = this.blockSize / maxAxis;

    this.scaleCache.set(modelPath, scale);
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
    if (this.collisionCache.has(modelPath)) {
      return this.collisionCache.get(modelPath);
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

    this.collisionCache.set(modelPath, collisionData);
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
    body.setGravityScale(0, true);

    if (typeof body.enableCcd === "function") {
      body.enableCcd(true);
    }

    let colliderDesc = this.RAPIER.ColliderDesc.convexHull(vertices);
    if (!colliderDesc) {
      colliderDesc = this.RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }

    colliderDesc
      .setFriction(2.0)
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

    const modelPath = this.getRandomModelPath();
    const baseModel = await this.loadModel(modelPath);

    const scale = this.getModelScale(baseModel, modelPath);
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
      contactFrames: 0,
      stableFrames: 0,
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
    block.committed = false;

    return block;
  }

  disposeBlock(block) {
    this.scene.remove(block.mesh);
    this.world.removeRigidBody(block.body);
  }
}