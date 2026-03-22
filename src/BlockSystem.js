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
    this.fallSpeed = options.fallSpeed ?? 0.9;
    this.spawnClearance = options.spawnClearance ?? 2.2;
    this.minSpawnHeight = options.minSpawnHeight ?? 4.2;
    this.previewClampPadding = options.previewClampPadding ?? 0.35;

    this.liveHeight = 0;
    this.stableHeight = 0;

    this.previewX = 0;
    this.previewY = 0;
    this.previewZ = 0;

    this.previewQuaternion = new THREE.Quaternion();
    this.tempQuaternion = new THREE.Quaternion();
    this.deltaQuaternion = new THREE.Quaternion();
    this.tempAxis = new THREE.Vector3();

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;

    this.structureStableFrames = 0;
    this.structureStableFramesRequired =
      options.structureStableFramesRequired ?? 36;
    this.waitingPlacedCount = 0;

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
      fallSpeed: this.fallSpeed,
      contactVerticalThreshold: 0.2,
      contactHorizontalThreshold: 0.15,
      contactFramesRequired: 3,
      stableLinearThreshold: 0.05,
      stableAngularThreshold: 0.05,
      stableFramesRequired: 24,
    });

    this.meshSync = new BlockMeshSync();
  }

  async createBlock() {
    if (this.currentBlock) return;
    if (this.state === "WAITING") return;
    if (this.isSpawning) return;

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

  getSpawnHeight() {
    return Math.max(this.stableHeight + this.spawnClearance, this.minSpawnHeight);
  }

  getCurrentPreviewBlock() {
    if (!this.currentBlock) return null;
    if (this.currentBlock.state !== "preview") return null;
    return this.currentBlock;
  }

  clampPreviewPosition(x, z) {
    const radius = Math.max(0, this.stageSize / 2 - this.previewClampPadding);
    const length = Math.hypot(x, z);

    if (length <= radius || length === 0) {
      return { x, z };
    }

    const scale = radius / length;
    return {
      x: x * scale,
      z: z * scale,
    };
  }

  getPreviewRotationQuaternion() {
    return {
      x: this.previewQuaternion.x,
      y: this.previewQuaternion.y,
      z: this.previewQuaternion.z,
      w: this.previewQuaternion.w,
    };
  }

  applyPreviewTransform() {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return;

    const translation = {
      x: this.previewX,
      y: this.previewY,
      z: this.previewZ,
    };

    const rotation = this.getPreviewRotationQuaternion();

    if (typeof this.currentBlock.body.setTranslation === "function") {
      this.currentBlock.body.setTranslation(translation, true);
    }

    if (typeof this.currentBlock.body.setRotation === "function") {
      this.currentBlock.body.setRotation(rotation, true);
    }

    if (typeof this.currentBlock.body.setNextKinematicTranslation === "function") {
      this.currentBlock.body.setNextKinematicTranslation(translation);
    }

    if (typeof this.currentBlock.body.setNextKinematicRotation === "function") {
      this.currentBlock.body.setNextKinematicRotation(rotation);
    }
  }

  setPreviewPosition(x, z) {
    if (!this.currentBlock) return;
    if (this.currentBlock.state !== "preview") return;
    if (this.state !== "EDIT") return;

    const clamped = this.clampPreviewPosition(x, z);

    this.previewX = clamped.x;
    this.previewZ = clamped.z;

    const current = this.currentBlock.body.translation();
    this.previewY = current.y;

    this.applyPreviewTransform();
  }

  enterRotateMode() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    this.state = "ROTATE";
    return true;
  }

  exitRotateMode() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "ROTATE") return false;

    this.state = "EDIT";
    return true;
  }

  rotatePreviewByAxis(axis, deltaAngle) {
    if (!this.currentBlock) return;
    if (this.currentBlock.state !== "preview") return;
    if (this.state !== "ROTATE") return;

    if (axis === "x") {
      this.tempAxis.set(1, 0, 0);
    } else if (axis === "y") {
      this.tempAxis.set(0, 1, 0);
    } else if (axis === "z") {
      this.tempAxis.set(0, 0, 1);
    } else {
      return;
    }

    this.tempAxis.applyQuaternion(this.previewQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(this.tempAxis, deltaAngle);

    this.previewQuaternion.copy(
      this.deltaQuaternion.multiply(this.previewQuaternion)
    ).normalize();

    this.applyPreviewTransform();
  }

  confirmCurrentBlock() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT" && this.state !== "ROTATE") return false;

    this.factory.convertPreviewToDynamic(this.currentBlock);

    this.structureStableFrames = 0;
    this.waitingPlacedCount = this.monitor.getPlacedBlockCount(this.blocks);

    this.currentBlock = null;
    this.state = "WAITING";

    return true;
  }

  updateHeights() {
    this.liveHeight = this.monitor.computeHeight(this.blocks, false);
  }

  tryCommitStableStructure() {
    if (this.state !== "WAITING") return;

    const placedCount = this.monitor.getPlacedBlockCount(this.blocks);

    if (placedCount !== this.waitingPlacedCount) {
      this.waitingPlacedCount = placedCount;
      this.structureStableFrames = 0;
      return;
    }

    const allStable = this.monitor.areAllPlacedBlocksStable(this.blocks);

    if (!allStable) {
      this.structureStableFrames = 0;
      return;
    }

    this.structureStableFrames += 1;

    if (this.structureStableFrames < this.structureStableFramesRequired) {
      return;
    }

    this.stableHeight = this.monitor.computeHeight(this.blocks, false);
    this.lastCommittedBlockId = this.waitingBlockId - 1;

    for (const block of this.blocks) {
      if (block.state !== "preview") {
        block.committed = true;
      }
    }

    this.structureStableFrames = 0;
    this.waitingPlacedCount = 0;
    this.state = "IDLE";
  }

  maybeSpawnNextBlock() {
    if (this.state !== "IDLE") return;
    if (this.currentBlock) return;
    if (this.isSpawning) return;

    this.createBlock();
  }

  update() {
    this.monitor.updateDynamicBlocks(this.blocks);
    this.meshSync.sync(this.blocks);
    this.updateHeights();
    this.tryCommitStableStructure();
    this.maybeSpawnNextBlock();

    if (this.monitor.checkFail(this.blocks)) {
      if (this.onFail) this.onFail();
    }
  }

  reset() {
    for (const block of this.blocks) {
      this.factory.disposeBlock(block);
    }

    this.blocks = [];
    this.currentBlock = null;
    this.state = "IDLE";
    this.isSpawning = false;

    this.liveHeight = 0;
    this.stableHeight = 0;

    this.previewX = 0;
    this.previewY = 0;
    this.previewZ = 0;
    this.previewQuaternion.identity();

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;

    this.structureStableFrames = 0;
    this.waitingPlacedCount = 0;
  }

  getMaxHeight() {
    return this.stableHeight;
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