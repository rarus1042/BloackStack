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
    this.modelPath = options.modelPath ?? "models/block.glb";

    this.loader = new GLTFLoader();
    this.baseModel = null;

    this.cachedScale = null;
    this.cachedCollisionData = null;
  }

  async ensureModelLoaded() {
    if (this.baseModel) return;
    const gltf = await this.loader.loadAsync(this.modelPath);
    this.baseModel = gltf.scene;
  }

  getModelScale() {
    const temp = this.baseModel.clone(true);
    const box = new THREE.Box3().setFromObject(temp);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    return this.blockSize / maxAxis;
  }

  createRenderObject(scale) {
    const wrapper = new THREE.Group();
    const model = this.baseModel.clone(true);

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

  buildCollisionData(scale) {
    if (this.cachedCollisionData && this.cachedScale === scale) {
      return this.cachedCollisionData;
    }

    const root = this.baseModel.clone(true);
    root.scale.setScalar(scale);

    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    root.position.sub(center);
    root.updateMatrixWorld(true);

    const data = this.extractGeometryFromScene(root);

    this.cachedScale = scale;
    this.cachedCollisionData = {
      vertices: data.vertices,
      indices: data.indices,
      halfHeight: size.y / 2,
    };

    return this.cachedCollisionData;
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
    await this.ensureModelLoaded();

    const scale = this.getModelScale();
    const collision = this.buildCollisionData(scale);
    const mesh = this.createRenderObject(scale);
    const preview = this.createPreviewBody(spawnY, collision.vertices);

    return {
      id,
      mesh,
      body: preview.body,
      collider: preview.collider,
      halfHeight: collision.halfHeight,
      state: "preview",
      collision,
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