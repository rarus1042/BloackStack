import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { BlockFactory } from "./BlockFactory.js";
import { StructureMonitor } from "./StructureMonitor.js";
import { BlockMeshSync } from "./BlockMeshSync.js";

export class BlockSystem {
  constructor(scene, physics, onFail, options = {}) {
    this.scene = scene;
    this.physics = physics;
    this.onFail = onFail;

    this.state = "IDLE";

    this.blocks = [];
    this.currentBlock = null;
    this.isSpawning = false;

    this.stageSize = options.stageSize ?? 5;
    this.blockSize = options.blockSize ?? 1;
    this.failY = options.failY ?? -3;
    this.fallSpeed = options.fallSpeed ?? 2;

    this.spawnClearance = options.spawnClearance ?? 1.6;
    this.minSpawnHeight = options.minSpawnHeight ?? 2.3;
    this.previewClampPadding = options.previewClampPadding ?? 0.35;

    this.spawnQuaternionA = new THREE.Quaternion();
this.spawnQuaternionB = new THREE.Quaternion();
this.spawnQuaternionC = new THREE.Quaternion();

    this.liveHeight = 0;
    this.stableHeight = 0;
    this.heightStep = options.heightStep ?? 0.5;

    this.previewX = 0;
    this.previewY = 0;
    this.previewZ = 0;
    this.previewQuaternion = new THREE.Quaternion();

    this.tempAxis = new THREE.Vector3();
    this.deltaQuaternion = new THREE.Quaternion();

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;

    this.factory = new BlockFactory(scene, physics, {
      blockSize: this.blockSize,
      fallSpeed: this.fallSpeed,
      linearDamping: 2.2,
      angularDamping: 6.5,
      modelListPath: "models/model-list.json",
    });

    this.monitor = new StructureMonitor({
      stageSize: this.stageSize,
      failY: this.failY,

      contactVerticalThreshold: 0.32,
      contactHorizontalThreshold: 0.26,
      contactFramesRequired: 2,

      landingMinFrames: 4,
      landingStableFramesRequired: 4,
      maxLandingYDelta: 0.02,
      maxLandingTime: 5.0,

      largeMoveLinearThreshold: 0.9,
      largeMoveAngularThreshold: 0.9,

      jitterLinearMin: 0.02,
      jitterLinearMax: 0.22,
      jitterAngularMin: 0.02,
      jitterAngularMax: 0.32,
      jitterPositionDeltaMax: 0.006,
      jitterYDeltaMax: 0.006,
      jitterFramesRequired: 16,
    });

    this.meshSync = new BlockMeshSync();
  }

  async createBlock() {
    if (this.currentBlock) return;
    if (this.isSpawning) return;
    if (this.state === "WAITING") return;

    this.isSpawning = true;

    try {
      const spawnY = this.getSpawnHeight();

      const block = await this.factory.createPreviewBlock(
        spawnY,
        this.waitingBlockId++
      );

  this.previewX = 0;
this.previewY = spawnY;
this.previewZ = 0;
this.previewQuaternion.copy(this.getRandomRightAngleQuaternion());

      this.currentBlock = block;
      this.blocks.push(block);

      this.applyPreviewTransform();
      this.state = "EDIT";
    } finally {
      this.isSpawning = false;
    }
  }

  async getNextBlockInfo() {
    return this.factory.peekNextModelEntry();
  }

  getRandomRightAngleQuaternion() {
  const quarterTurn = Math.PI / 2;

  const xTurns = Math.floor(Math.random() * 4);
  const yTurns = Math.floor(Math.random() * 4);
  const zTurns = Math.floor(Math.random() * 4);

  const qx = this.spawnQuaternionA.setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    xTurns * quarterTurn
  );

  const qy = this.spawnQuaternionB.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yTurns * quarterTurn
  );

  const qz = this.spawnQuaternionC.setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    zTurns * quarterTurn
  );

  return new THREE.Quaternion()
    .copy(qy)
    .multiply(qx)
    .multiply(qz)
    .normalize();
}

  quantizeHeightUp(height) {
    const step = this.heightStep;
    if (step <= 0) return height;
    return Math.floor(height / step) * step;
  }

  getSpawnHeight() {
    const steppedHeight = this.quantizeHeightUp(this.stableHeight);

    return Math.max(
      steppedHeight + this.spawnClearance,
      this.minSpawnHeight
    );
  }

  getCurrentPreviewBlock() {
    if (!this.currentBlock) return null;
    if (this.currentBlock.state !== "preview") return null;
    return this.currentBlock;
  }

  clampPreviewPosition(x, z) {
    const radius = Math.max(0, this.stageSize / 2 - this.previewClampPadding);
    const len = Math.hypot(x, z);

    if (len <= radius || len === 0) {
      return { x, z };
    }

    const scale = radius / len;
    return {
      x: x * scale,
      z: z * scale,
    };
  }

  applyPreviewTransform() {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return;

    this.currentBlock.body.setTranslation(
      {
        x: this.previewX,
        y: this.previewY,
        z: this.previewZ,
      },
      true
    );

    this.currentBlock.body.setRotation(this.previewQuaternion, true);
  }

  setPreviewPosition(x, z) {
    if (!this.currentBlock) return;
    if (this.state !== "EDIT" && this.state !== "ROTATE") return;

    const clamped = this.clampPreviewPosition(x, z);

    this.previewX = clamped.x;
    this.previewZ = clamped.z;
    this.previewY = this.currentBlock.body.translation().y;

    this.applyPreviewTransform();
  }

  enterRotateMode() {
    if (this.state !== "EDIT") return false;
    this.state = "ROTATE";
    return true;
  }

  exitRotateMode() {
    if (this.state !== "ROTATE") return false;
    this.state = "EDIT";
    return true;
  }

  rotatePreviewByAxis(axis, angle) {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT" && this.state !== "ROTATE") return false;

    if (axis === "x") this.tempAxis.set(1, 0, 0);
    else if (axis === "y") this.tempAxis.set(0, 1, 0);
    else if (axis === "z") this.tempAxis.set(0, 0, 1);
    else return false;

    this.tempAxis.applyQuaternion(this.previewQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(this.tempAxis, angle);

    this.previewQuaternion
      .copy(this.deltaQuaternion.multiply(this.previewQuaternion))
      .normalize();

    this.applyPreviewTransform();
    return true;
  }

  rotatePreview90(axis, turns = 1) {
    const normalizedTurns = Math.trunc(turns);
    if (!normalizedTurns) return false;
    return this.rotatePreviewByAxis(axis, (Math.PI / 2) * normalizedTurns);
  }

  confirmCurrentBlock() {
    if (!this.currentBlock) return false;
    if (this.state !== "EDIT" && this.state !== "ROTATE") return false;

    const block = this.currentBlock;

    this.factory.convertPreviewToDynamic(block);

    block.committed = true;
    this.lastCommittedBlockId = block.id;

    this.currentBlock = null;
    this.state = "WAITING";

    return true;
  }

  updateHeights() {
    this.liveHeight = this.monitor.computeHeight(this.blocks, false);
    this.stableHeight = this.monitor.computeSettledHeight(this.blocks);
  }

  tryFinishCurrentLanding() {
    if (this.state !== "WAITING") return;

    const lastCommitted = this.blocks.find(
      (block) => block.id === this.lastCommittedBlockId
    );

    if (!lastCommitted) return;

    if (lastCommitted.state === "settled") {
      this.state = "IDLE";
    }
  }

  maybeSpawnNextBlock() {
    if (this.state !== "IDLE") return;
    if (this.currentBlock) return;
    this.createBlock();
  }

  update() {
    this.monitor.updateDynamicBlocks(this.blocks);
    this.meshSync.sync(this.blocks);
    this.updateHeights();
    this.tryFinishCurrentLanding();
    this.maybeSpawnNextBlock();

    if (this.monitor.checkFail(this.blocks)) {
      if (this.onFail) {
        this.onFail();
      }
    }
  }

  reset() {
    for (const block of this.blocks) {
      this.factory.disposeBlock(block);
    }

    this.blocks = [];
    this.currentBlock = null;
    this.state = "IDLE";

    this.liveHeight = 0;
    this.stableHeight = 0;

    this.previewX = 0;
    this.previewY = 0;
    this.previewZ = 0;
    this.previewQuaternion.identity();

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;
  }

  getMaxHeight() {
    return Math.max(this.liveHeight, this.stableHeight);
  }

  getStableHeight() {
    return this.stableHeight;
  }

  getLiveHeight() {
    return this.liveHeight;
  }

  isStructureStable() {
    return this.state !== "WAITING";
  }
}