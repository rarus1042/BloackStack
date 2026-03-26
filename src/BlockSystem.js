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
    this.gameStarted = false;

    this.stageSize = options.stageSize ?? 6;
    this.blockSize = options.blockSize ?? 1;
    this.gridStep = options.gridStep ?? this.blockSize;
    this.failY = options.failY ?? -4;

    this.slowFallSpeed = options.slowFallSpeed ?? 0.75;
    this.fastFallSpeed = options.fastFallSpeed ?? 5.5;

    this.spawnClearance = options.spawnClearance ?? 5.2;
    this.minSpawnHeight = options.minSpawnHeight ?? 5.5;
    this.previewClampPadding = options.previewClampPadding ?? 0.4;

    this.liveHeight = 0;
    this.stableHeight = 0;
    this.peakStableHeight = 0;
    this.heightStep = options.heightStep ?? 0.5;

    this.previewX = 0;
    this.previewY = 0;
    this.previewZ = 0;
    this.previewQuaternion = new THREE.Quaternion();

    this.tempAxis = new THREE.Vector3();
    this.deltaQuaternion = new THREE.Quaternion();

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;

    this.worldAxisX = new THREE.Vector3(1, 0, 0);
    this.worldAxisY = new THREE.Vector3(0, 1, 0);
    this.worldAxisZ = new THREE.Vector3(0, 0, 1);

    this.tmpVecA = new THREE.Vector3();
    this.tmpVecB = new THREE.Vector3();
    this.tmpVecC = new THREE.Vector3();

    this.predictionCoarsePos = new THREE.Vector3();

    this.factory = new BlockFactory(scene, physics, {
      blockSize: this.blockSize,
      cellSize: this.gridStep,
      slowFallSpeed: this.slowFallSpeed,
      fastFallSpeed: this.fastFallSpeed,
      linearDamping: 2.2,
      angularDamping: 6.3,
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

  setGameStarted(started) {
    this.gameStarted = !!started;
  }

  getGridStep() {
    return this.gridStep;
  }

  quantizeHeightUp(height) {
    const step = this.heightStep;
    if (step <= 0) return height;
    return Math.floor(height / step) * step;
  }

  getSpawnHeight() {
    const steppedHeight = this.quantizeHeightUp(this.stableHeight);
    return Math.max(steppedHeight + this.spawnClearance, this.minSpawnHeight);
  }

  snapToGrid(value) {
    const step = this.gridStep || 1;
    return Math.round(value / step) * step;
  }

  clampPreviewPosition(x, z) {
    const half = this.stageSize / 2 - this.previewClampPadding;
    return {
      x: THREE.MathUtils.clamp(this.snapToGrid(x), -half, half),
      z: THREE.MathUtils.clamp(this.snapToGrid(z), -half, half),
    };
  }

  getCurrentPreviewBlock() {
    if (!this.currentBlock) return null;
    if (this.currentBlock.state !== "preview") return null;
    return this.currentBlock;
  }

  getCurrentPreviewPosition() {
    return new THREE.Vector3(this.previewX, this.previewY, this.previewZ);
  }

  getCurrentPreviewQuaternion() {
    return this.previewQuaternion.clone();
  }

  async createBlock() {
    if (!this.gameStarted) return;
    if (this.currentBlock) return;
    if (this.isSpawning) return;
    if (this.state === "WAITING") return;

    this.isSpawning = true;

    try {
      const spawnY = this.getSpawnHeight();
      const block = await this.factory.createPreviewBlock(spawnY, this.waitingBlockId++);

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
    if (this.currentBlock.state !== "preview") return;
    if (this.state !== "EDIT") return;

    const clamped = this.clampPreviewPosition(x, z);
    this.previewX = clamped.x;
    this.previewZ = clamped.z;
    this.applyPreviewTransform();
  }

  movePreviewByGrid(dx, dz) {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    this.setPreviewPosition(this.previewX + dx, this.previewZ + dz);
    return true;
  }

  rotatePreviewByAxis(axis, angle) {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

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

  dropCurrentBlockFast() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;

    this.factory.convertPreviewToDynamic(block, this.fastFallSpeed);
    block.committed = true;
    this.lastCommittedBlockId = block.id;

    this.currentBlock = null;
    this.state = "WAITING";
    return true;
  }

  autoCommitPreviewAtCurrentPosition() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;

    this.factory.convertPreviewToDynamic(block, this.slowFallSpeed);
    block.committed = true;
    this.lastCommittedBlockId = block.id;

    this.currentBlock = null;
    this.state = "WAITING";
    return true;
  }

  updateHeights() {
    this.liveHeight = this.monitor.computeHeight(this.blocks, false);
    this.stableHeight = this.monitor.computeSettledHeight(this.blocks);

    if (this.stableHeight > this.peakStableHeight) {
      this.peakStableHeight = this.stableHeight;
    }
  }

  tryFinishCurrentLanding() {
    if (this.state !== "WAITING") return;

    const lastCommitted = this.blocks.find((block) => block.id === this.lastCommittedBlockId);
    if (!lastCommitted) return;

    if (lastCommitted.state === "settled") {
      this.state = "IDLE";
    }
  }

  maybeSpawnNextBlock() {
    if (!this.gameStarted) return;
    if (this.state !== "IDLE") return;
    if (this.currentBlock) return;
    this.createBlock();
  }

  getPlacementPrediction() {
    const block = this.getCurrentPreviewBlock();
    if (!block?.collision) return null;

    const startPosition = new THREE.Vector3(this.previewX, this.previewY, this.previewZ);
    return this.computePlacementPrediction(block, startPosition, this.previewQuaternion);
  }

  updatePreviewAutoFall(dt = 0.016) {
    const block = this.getCurrentPreviewBlock();
    if (!block) return;

    const prediction = this.getPlacementPrediction();
    if (!prediction?.position) return;

    const targetY = prediction.position.y;
    const nextY = Math.max(targetY, this.previewY - this.slowFallSpeed * dt);

    this.previewY = nextY;
    this.applyPreviewTransform();

    if (Math.abs(this.previewY - targetY) <= 0.0001) {
      this.autoCommitPreviewAtCurrentPosition();
    }
  }

  computePlacementPrediction(block, startPosition, quaternion) {
    const shapeData = block?.collision;
    if (!shapeData?.cellOffsets?.length) return null;

    const groundTopY = 0;
    const coarseStep = Math.max(0.04, shapeData.halfExtent * 0.4);
    const searchMinY = Math.min(this.failY - 1.0, groundTopY - 3.0);

    if (this.collidesShapeAt(startPosition, quaternion, shapeData, block)) {
      const currentExtents = this.getShapeVerticalExtents(startPosition, quaternion, shapeData);
      return {
        position: startPosition.clone(),
        quaternion: quaternion.clone(),
        currentBottomY: currentExtents.minY,
        predictedBottomY: currentExtents.minY,
      };
    }

    const currentExtents = this.getShapeVerticalExtents(startPosition, quaternion, shapeData);

    let lastFreeY = startPosition.y;
    let hitY = null;

    for (let y = startPosition.y - coarseStep; y >= searchMinY; y -= coarseStep) {
      this.predictionCoarsePos.set(startPosition.x, y, startPosition.z);

      if (this.collidesShapeAt(this.predictionCoarsePos, quaternion, shapeData, block)) {
        hitY = y;
        break;
      }

      lastFreeY = y;
    }

    if (hitY === null) {
      return null;
    }

    let low = hitY;
    let high = lastFreeY;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) * 0.5;
      this.predictionCoarsePos.set(startPosition.x, mid, startPosition.z);

      if (this.collidesShapeAt(this.predictionCoarsePos, quaternion, shapeData, block)) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const finalPosition = new THREE.Vector3(startPosition.x, high, startPosition.z);
    const finalExtents = this.getShapeVerticalExtents(finalPosition, quaternion, shapeData);

    return {
      position: finalPosition,
      quaternion: quaternion.clone(),
      currentBottomY: currentExtents.minY,
      predictedBottomY: finalExtents.minY,
    };
  }

  collidesShapeAt(position, quaternion, shapeData, ignoreBlock = null) {
    const currentExtents = this.getShapeVerticalExtents(position, quaternion, shapeData);

    if (currentExtents.minY <= 0) {
      return true;
    }

    const axesA = this.getQuaternionAxes(quaternion);
    const cellsA = this.getWorldCellCenters(position, quaternion, shapeData);

    for (const other of this.blocks) {
      if (!other || other === ignoreBlock) continue;
      if (other.state === "preview") continue;
      if (!other.collision?.cellOffsets?.length) continue;

      const otherPosRaw = other.body.translation();
      const otherRotRaw = other.body.rotation();

      const otherPos = new THREE.Vector3(otherPosRaw.x, otherPosRaw.y, otherPosRaw.z);
      const otherQuat = new THREE.Quaternion(
        otherRotRaw.x,
        otherRotRaw.y,
        otherRotRaw.z,
        otherRotRaw.w
      );

      const approxRange =
        (shapeData.footprintRadius ?? 0) +
        (other.collision.footprintRadius ?? 0) +
        (shapeData.colliderHalfExtent ?? shapeData.halfExtent) +
        (other.collision.colliderHalfExtent ?? other.collision.halfExtent) +
        0.05;

      const dx = otherPos.x - position.x;
      const dz = otherPos.z - position.z;

      if (dx * dx + dz * dz > approxRange * approxRange) {
        continue;
      }

      const otherExtents = this.getShapeVerticalExtents(otherPos, otherQuat, other.collision);

      if (
        currentExtents.maxY < otherExtents.minY - 0.02 ||
        currentExtents.minY > otherExtents.maxY + 0.02
      ) {
        continue;
      }

      const axesB = this.getQuaternionAxes(otherQuat);
      const cellsB = this.getWorldCellCenters(otherPos, otherQuat, other.collision);

      for (const cellA of cellsA) {
        for (const cellB of cellsB) {
          if (
            this.obbOverlap(
              cellA,
              axesA,
              shapeData.colliderHalfExtent ?? shapeData.halfExtent,
              cellB,
              axesB,
              other.collision.colliderHalfExtent ?? other.collision.halfExtent
            )
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getQuaternionAxes(quaternion) {
    return [
      this.worldAxisX.clone().applyQuaternion(quaternion).normalize(),
      this.worldAxisY.clone().applyQuaternion(quaternion).normalize(),
      this.worldAxisZ.clone().applyQuaternion(quaternion).normalize(),
    ];
  }

  getWorldCellCenters(position, quaternion, shapeData) {
    return shapeData.cellOffsets.map((offset) =>
      new THREE.Vector3(offset.x, offset.y, offset.z)
        .applyQuaternion(quaternion)
        .add(position)
    );
  }

  getShapeVerticalExtents(position, quaternion, shapeData) {
    const cells = this.getWorldCellCenters(position, quaternion, shapeData);
    const half = shapeData.colliderHalfExtent ?? shapeData.halfExtent ?? 0.5;

    let minY = Infinity;
    let maxY = -Infinity;

    for (const cell of cells) {
      const y0 = cell.y - half;
      const y1 = cell.y + half;
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }

    if (!Number.isFinite(minY)) minY = position.y - half;
    if (!Number.isFinite(maxY)) maxY = position.y + half;

    return { minY, maxY };
  }

  obbOverlap(centerA, axesA, halfA, centerB, axesB, halfB) {
    const EPSILON = 1e-5;

    const R = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const AbsR = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R[i][j] = axesA[i].dot(axesB[j]);
        AbsR[i][j] = Math.abs(R[i][j]) + EPSILON;
      }
    }

    const tVec = this.tmpVecA.copy(centerB).sub(centerA);
    const t = [tVec.dot(axesA[0]), tVec.dot(axesA[1]), tVec.dot(axesA[2])];

    for (let i = 0; i < 3; i++) {
      const ra = halfA;
      const rb = halfB * (AbsR[i][0] + AbsR[i][1] + AbsR[i][2]);
      if (Math.abs(t[i]) > ra + rb) return false;
    }

    for (let j = 0; j < 3; j++) {
      const ra = halfA * (AbsR[0][j] + AbsR[1][j] + AbsR[2][j]);
      const rb = halfB;
      const val = Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]);
      if (val > ra + rb) return false;
    }

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const ra = halfA * (AbsR[(i + 1) % 3][j] + AbsR[(i + 2) % 3][j]);
        const rb = halfB * (AbsR[i][(j + 1) % 3] + AbsR[i][(j + 2) % 3]);

        const val = Math.abs(
          t[(i + 2) % 3] * R[(i + 1) % 3][j] -
            t[(i + 1) % 3] * R[(i + 2) % 3][j]
        );

        if (val > ra + rb) return false;
      }
    }

    return true;
  }

  update(dt = 0.016) {
    if (this.currentBlock?.state === "preview" && this.state === "EDIT") {
      this.updatePreviewAutoFall(dt);
    }

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
    for (const block of this.blocks) {
      this.factory.disposeBlock(block);
    }

    this.blocks = [];
    this.currentBlock = null;
    this.state = "IDLE";

    this.liveHeight = 0;
    this.stableHeight = 0;
    this.peakStableHeight = 0;

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

  getPeakStableHeight() {
    return this.peakStableHeight;
  }

  getLiveHeight() {
    return this.liveHeight;
  }

  isStructureStable() {
    return this.state !== "WAITING";
  }

  getBlockCount() {
    return this.blocks.filter((block) => block && block.committed).length;
  }

  getCommittedBlockCount() {
    return this.getBlockCount();
  }
}