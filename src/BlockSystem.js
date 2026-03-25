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

    this.stageSize = options.stageSize ?? 4;
    this.blockSize = options.blockSize ?? 1;
    this.failY = options.failY ?? -3;
    this.fallSpeed = options.fallSpeed ?? 1.6;

    this.spawnClearance = options.spawnClearance ?? 1.9;
    this.minSpawnHeight = options.minSpawnHeight ?? 2.8;
    this.previewClampPadding = options.previewClampPadding ?? 0.25;

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
      cellSize: options.cellSize ?? this.blockSize * 0.45,
      visualCellScale: 0.94,
      fallSpeed: this.fallSpeed,
      linearDamping: 2.0,
      angularDamping: 5.8,
    });

    this.monitor = new StructureMonitor({
      stageSize: this.stageSize,
      failY: this.failY,

      contactVerticalThreshold: 0.34,
      contactHorizontalThreshold: 0.28,
      contactFramesRequired: 2,

      landingMinFrames: 4,
      landingStableFramesRequired: 4,
      maxLandingYDelta: 0.02,
      maxLandingTime: 5.0,

      largeMoveLinearThreshold: 1.0,
      largeMoveAngularThreshold: 1.0,

      jitterLinearMin: 0.02,
      jitterLinearMax: 0.22,
      jitterAngularMin: 0.02,
      jitterAngularMax: 0.34,
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
      this.previewQuaternion.identity();

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
    const current = this.getCurrentPreviewBlock();
    const footprintRadius = current?.footprintRadius ?? 0;

    const radius = Math.max(
      0,
      this.stageSize / 2 - this.previewClampPadding - footprintRadius
    );

    const len = Math.hypot(x, z);

    if (len <= radius || len === 0) return { x, z };

    const s = radius / len;
    return { x: x * s, z: z * s };
  }

  applyPreviewTransform() {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return;

    const t = {
      x: this.previewX,
      y: this.previewY,
      z: this.previewZ,
    };

    this.currentBlock.body.setTranslation(t, true);
    this.currentBlock.body.setRotation(this.previewQuaternion, true);
  }

  setPreviewPosition(x, z) {
    if (!this.currentBlock) return;
    if (this.state !== "EDIT") return;

    const c = this.clampPreviewPosition(x, z);

    this.previewX = c.x;
    this.previewZ = c.z;
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
    if (this.state !== "ROTATE") return;

    if (axis === "x") this.tempAxis.set(1, 0, 0);
    else if (axis === "y") this.tempAxis.set(0, 1, 0);
    else if (axis === "z") this.tempAxis.set(0, 0, 1);
    else return;

    this.tempAxis.applyQuaternion(this.previewQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(this.tempAxis, angle);

    this.previewQuaternion
      .copy(this.deltaQuaternion.multiply(this.previewQuaternion))
      .normalize();

    this.applyPreviewTransform();
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

    const lastCommitted = this.blocks.find((b) => b.id === this.lastCommittedBlockId);
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
      if (this.onFail) this.onFail();
    }
  }

  reset() {
    for (const b of this.blocks) {
      this.factory.disposeBlock(b);
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