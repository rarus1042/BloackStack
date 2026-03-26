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
    this.previewFallMultiplier = 1;

    this.spawnClearance = options.spawnClearance ?? 30.0;
    this.minSpawnHeight = options.minSpawnHeight ?? 30.0;
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
this.tmpVecD = new THREE.Vector3();

this.predictionCoarsePos = new THREE.Vector3();

this.settleGapSlack = options.settleGapSlack ?? 0.12;
this.settleSnapHorizontalTolerance = options.settleSnapHorizontalTolerance ?? 0.38;
this.settleSnapRotationDotMin = options.settleSnapRotationDotMin ?? 0.9;
this.settleSupportBias = options.settleSupportBias ?? 0.16;

// 추가
this.settleSnapPositionStrength = options.settleSnapPositionStrength ?? 0.35;
this.settleSnapRotationStrength = options.settleSnapRotationStrength ?? 0.45;
this.settleSnapLinearVelocityKeep = options.settleSnapLinearVelocityKeep ?? 0.08;
this.settleSnapAngularVelocityKeep = options.settleSnapAngularVelocityKeep ?? 0.18;
this.settleSnapMaxVerticalSpeed = options.settleSnapMaxVerticalSpeed ?? 0.0025;

this.snapQuaternions = this.buildRightAngleQuaternionSet();


    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;
    this.rotateSlowLandingWindowMs = options.rotateSlowLandingWindowMs ?? 300;
    this.rotateFallMultiplier = options.rotateFallMultiplier ?? 0.18;

    this.landingMoveWindowMs = options.landingMoveWindowMs ?? 380;
    this.landingRotateWindowMs = options.landingRotateWindowMs ?? 420;

this.factory = new BlockFactory(scene, physics, {
  blockSize: this.blockSize,
  cellSize: this.gridStep,
  collisionCellScale: 0.99,
  settleCellScale: 1,
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
      landingMinFrames: 6,
      landingStableFramesRequired: 7,
      maxLandingYDelta: 0.02,
      maxLandingTime: 5.5,
      landingLockDelay: 0.34,
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

  setPreviewRotating(rotating) {
    this.isPreviewRotating = !!rotating;

    if (rotating) {
      this.lastRotateInputTime = performance.now();
    }
  }

  isSlowLandingMode() {
    const now = performance.now();
    return now - this.lastRotateInputTime < this.rotateSlowLandingWindowMs;
  }

  getPreviewFallSpeedMultiplier() {
    return this.isSlowLandingMode() ? this.rotateFallMultiplier : 1;
  }

 buildRightAngleQuaternionSet() {
  const axes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  const visited = new Map();
  const queue = [new THREE.Quaternion()];
  const result = [];

  const keyOf = (q) =>
    [
      Math.round(q.x * 1000),
      Math.round(q.y * 1000),
      Math.round(q.z * 1000),
      Math.round(q.w * 1000),
    ].join(",");

  const negated = (q) =>
    new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);

  while (queue.length) {
    const current = queue.shift().clone().normalize();

    const variantA = current;
    const variantB = negated(current);

    const keyA = keyOf(variantA);
    const keyB = keyOf(variantB);
    const canonicalKey = keyA < keyB ? keyA : keyB;

    if (visited.has(canonicalKey)) continue;
    visited.set(canonicalKey, true);
    result.push(current.clone());

    for (const axis of axes) {
      const delta = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2);
      const next = delta.clone().multiply(current).normalize();
      queue.push(next);
    }
  }

  return result;
}

getNearestRightAngleQuaternion(quaternion) {
  let best = this.snapQuaternions[0]?.clone() ?? new THREE.Quaternion();
  let bestDot = -Infinity;

  for (const candidate of this.snapQuaternions) {
    const dot = Math.abs(candidate.dot(quaternion));
    if (dot > bestDot) {
      bestDot = dot;
      best = candidate;
    }
  }

  return {
    quaternion: best.clone(),
    dot: bestDot,
  };
}

getShapeHalfExtent(shapeData, mode = "collision") {
  if (!shapeData) return this.gridStep * 0.5;

  if (mode === "settle") {
    return (
      shapeData.settleHalfExtent ??
      shapeData.colliderHalfExtent ??
      shapeData.halfExtent ??
      this.gridStep * 0.5
    );
  }

  return shapeData.colliderHalfExtent ?? shapeData.halfExtent ?? this.gridStep * 0.5;
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

  clampGridPositionToStage(position) {
    const clamped = this.clampPreviewPosition(position.x, position.z);
    return new THREE.Vector3(clamped.x, position.y, clamped.z);
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

  getLastCommittedLandingBlock() {
    const block = this.blocks.find((b) => b.id === this.lastCommittedBlockId);
    if (!block) return null;
    if (block.state !== "landing") return null;
    return block;
  }

  canManipulateLandingBlock(block, action = "move") {
    if (!block || block.state !== "landing") return false;

    const now = performance.now();
    const startTime = block.landingStartTime ?? now;
    const elapsedMs = now - startTime;

    if (action === "rotate") {
      return elapsedMs <= this.landingRotateWindowMs;
    }

    return elapsedMs <= this.landingMoveWindowMs;
  }

  refreshLandingBlockState(block, positionY = null) {
    const pos = block.body.translation();
    const nextY = positionY ?? pos.y;

    block.state = "landing";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.jitterFrames = 0;
    block.landingStartTime = performance.now();
    block.landingStartY = nextY;
    block.prevPosForJitter = { x: pos.x, y: nextY, z: pos.z };
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
      this.previewFallMultiplier = 1;
      this.isPreviewRotating = false;
      this.lastRotateInputTime = 0;

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
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;
    const shapeData = block.collision;
    if (!shapeData) return false;

    const startX = this.previewX;
    const startZ = this.previewZ;

    const clampedTarget = this.clampPreviewPosition(x, z);
    const targetX = clampedTarget.x;
    const targetZ = clampedTarget.z;

    const deltaX = targetX - startX;
    const deltaZ = targetZ - startZ;

    if (Math.abs(deltaX) < 1e-9 && Math.abs(deltaZ) < 1e-9) {
      return true;
    }

    const distance = Math.hypot(deltaX, deltaZ);
    const subStepSize = Math.max(0.08, this.gridStep * 0.2);
    const steps = Math.max(1, Math.ceil(distance / subStepSize));

    let lastFreeX = startX;
    let lastFreeZ = startZ;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const testX = startX + deltaX * t;
      const testZ = startZ + deltaZ * t;

      const testPosition = new THREE.Vector3(testX, this.previewY, testZ);

      if (this.collidesShapeAt(testPosition, this.previewQuaternion, shapeData, block)) {
        break;
      }

      lastFreeX = testX;
      lastFreeZ = testZ;
    }

    this.previewX = this.snapToGrid(lastFreeX);
    this.previewZ = this.snapToGrid(lastFreeZ);
    this.applyPreviewTransform();
    return true;
  }

  movePreviewByGrid(dx, dz) {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const beforeX = this.previewX;
    const beforeZ = this.previewZ;

    const moved = this.setPreviewPosition(this.previewX + dx, this.previewZ + dz);
    if (!moved) return false;

    return (
      Math.abs(this.previewX - beforeX) > 1e-9 ||
      Math.abs(this.previewZ - beforeZ) > 1e-9
    );
  }

  tryMoveLandingBlockByGrid(dx, dz) {
    const block = this.getLastCommittedLandingBlock();
    if (!block) return false;
    if (!this.canManipulateLandingBlock(block, "move")) return false;

    const pos = block.body.translation();
    const rot = block.body.rotation();

    const currentPosition = new THREE.Vector3(pos.x, pos.y, pos.z);
    const currentQuaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const targetPosition = this.clampGridPositionToStage(
      new THREE.Vector3(
        this.snapToGrid(currentPosition.x + dx),
        currentPosition.y,
        this.snapToGrid(currentPosition.z + dz)
      )
    );

    if (this.collidesShapeAt(targetPosition, currentQuaternion, block.collision, block)) {
      return false;
    }

    block.body.setTranslation(
      {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
      },
      true
    );
    block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.refreshLandingBlockState(block, targetPosition.y);
    return true;
  }

  rotatePreviewByAxis(axis, angle) {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;
    const shapeData = block.collision;
    if (!shapeData) return false;

    if (axis === "x") this.tempAxis.set(1, 0, 0);
    else if (axis === "y") this.tempAxis.set(0, 1, 0);
    else if (axis === "z") this.tempAxis.set(0, 0, 1);
    else return false;

    this.tempAxis.applyQuaternion(this.previewQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(this.tempAxis, angle);

    const nextQuaternion = this.deltaQuaternion
      .clone()
      .multiply(this.previewQuaternion)
      .normalize();

    const testPosition = new THREE.Vector3(this.previewX, this.previewY, this.previewZ);

    const assisted = this.findSpinAssistPlacement(block, testPosition, nextQuaternion);
    if (!assisted) {
      return false;
    }

    this.previewX = assisted.position.x;
    this.previewY = assisted.position.y;
    this.previewZ = assisted.position.z;
    this.previewQuaternion.copy(assisted.quaternion);
    this.lastRotateInputTime = performance.now();

    this.applyPreviewTransform();
    return true;
  }

  rotatePreview90(axis, turns = 1) {
    const normalizedTurns = Math.trunc(turns);
    if (!normalizedTurns) return false;
    return this.rotatePreviewByAxis(axis, (Math.PI / 2) * normalizedTurns);
  }

  tryRotateLandingBlock90(axis, turns = 1) {
    const block = this.getLastCommittedLandingBlock();
    if (!block) return false;
    if (!this.canManipulateLandingBlock(block, "rotate")) return false;

    const normalizedTurns = Math.trunc(turns);
    if (!normalizedTurns) return false;

    const pos = block.body.translation();
    const rot = block.body.rotation();

    const currentPosition = new THREE.Vector3(pos.x, pos.y, pos.z);
    const currentQuaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    if (axis === "x") this.tempAxis.set(1, 0, 0);
    else if (axis === "y") this.tempAxis.set(0, 1, 0);
    else if (axis === "z") this.tempAxis.set(0, 0, 1);
    else return false;

    this.tempAxis.applyQuaternion(currentQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(
      this.tempAxis,
      (Math.PI / 2) * normalizedTurns
    );

    const rotatedQuaternion = this.deltaQuaternion
      .clone()
      .multiply(currentQuaternion)
      .normalize();

    const assisted = this.findSpinAssistPlacement(
      block,
      currentPosition,
      rotatedQuaternion
    );

    if (!assisted) return false;

    block.body.setRotation(assisted.quaternion, true);
    block.body.setTranslation(
      {
        x: assisted.position.x,
        y: assisted.position.y,
        z: assisted.position.z,
      },
      true
    );
    block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.refreshLandingBlockState(block, assisted.position.y);
    this.lastRotateInputTime = performance.now();
    return true;
  }

  findSpinAssistPlacement(block, basePosition, rotatedQuaternion) {
    const halfStep = this.gridStep * 0.5;

    const candidates = [
      new THREE.Vector3(0, 0, 0),

      new THREE.Vector3(this.gridStep, 0, 0),
      new THREE.Vector3(-this.gridStep, 0, 0),
      new THREE.Vector3(0, 0, this.gridStep),
      new THREE.Vector3(0, 0, -this.gridStep),

      new THREE.Vector3(halfStep, 0, 0),
      new THREE.Vector3(-halfStep, 0, 0),
      new THREE.Vector3(0, 0, halfStep),
      new THREE.Vector3(0, 0, -halfStep),

      new THREE.Vector3(this.gridStep, -0.18, 0),
      new THREE.Vector3(-this.gridStep, -0.18, 0),
      new THREE.Vector3(0, -0.18, this.gridStep),
      new THREE.Vector3(0, -0.18, -this.gridStep),

      new THREE.Vector3(halfStep, -0.18, 0),
      new THREE.Vector3(-halfStep, -0.18, 0),
      new THREE.Vector3(0, -0.18, halfStep),
      new THREE.Vector3(0, -0.18, -halfStep),

      new THREE.Vector3(0, -0.3, 0),
      new THREE.Vector3(0, -0.42, 0),
    ];

    for (const offset of candidates) {
      const testPosition = basePosition.clone().add(offset);
      testPosition.x = this.snapToGrid(testPosition.x);
      testPosition.z = this.snapToGrid(testPosition.z);

      const clamped = this.clampGridPositionToStage(testPosition);

      if (!this.collidesShapeAt(clamped, rotatedQuaternion, block.collision, block)) {
        return {
          position: clamped,
          quaternion: rotatedQuaternion.clone(),
        };
      }
    }

    return null;
  }

  beginFastDropHold() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    this.previewFallMultiplier = 30;
    return true;
  }

  endFastDropHold() {
    this.previewFallMultiplier = 1;
  }

dropCurrentBlockFast() {
  if (!this.currentBlock) return false;
  if (this.currentBlock.state !== "preview") return false;
  if (this.state !== "EDIT") return false;

  const block = this.currentBlock;
  const dropSpeed = Math.max(this.fastFallSpeed, this.slowFallSpeed * 10);

  this.factory.convertPreviewToDynamic(block, dropSpeed);
  block.committed = true;
  this.lastCommittedBlockId = block.id;

  this.currentBlock = null;
  this.previewFallMultiplier = 1;
  this.isPreviewRotating = false;
  this.lastRotateInputTime = 0;
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
    this.previewFallMultiplier = 1;
    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;
    this.state = "WAITING";
    return true;
  }

  instantDropCurrentBlock() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const prediction = this.getPlacementPrediction();
    if (!prediction?.position) {
      return this.autoCommitPreviewAtCurrentPosition();
    }

    this.previewX = prediction.position.x;
    this.previewY = prediction.position.y;
    this.previewZ = prediction.position.z;

    if (prediction.quaternion) {
      this.previewQuaternion.copy(prediction.quaternion);
    }

    this.applyPreviewTransform();
    return this.autoCommitPreviewAtCurrentPosition();
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
    const baseSpeed = this.slowFallSpeed * this.previewFallMultiplier;
    const rotationMultiplier = this.getPreviewFallSpeedMultiplier();
    const speed = baseSpeed * rotationMultiplier;
    const nextY = Math.max(targetY, this.previewY - speed * dt);

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
  const contact = this.computePredictionContact(block, startPosition, quaternion);

  return {
    position: startPosition.clone(),
    quaternion: quaternion.clone(),
    currentBottomY: currentExtents.minY,
    predictedBottomY: currentExtents.minY,
    contactPoint: contact.contactPoint,
    contactNormal: contact.contactNormal,
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

const contact = this.computePredictionContact(block, finalPosition, quaternion);

return {
  position: finalPosition,
  quaternion: quaternion.clone(),
  currentBottomY: currentExtents.minY,
  predictedBottomY: finalExtents.minY,
  contactPoint: contact.contactPoint,
  contactNormal: contact.contactNormal,
};
  }

  computePredictionContact(block, position, quaternion) {
  const shapeData = block?.collision;
  if (!shapeData?.cellOffsets?.length) {
    return {
      contactPoint: new THREE.Vector3(position.x, 0, position.z),
      contactNormal: new THREE.Vector3(0, 1, 0),
    };
  }

  const halfA = shapeData.colliderHalfExtent ?? shapeData.halfExtent ?? 0.5;
  const cellsA = this.getWorldCellCenters(position, quaternion, shapeData);

  let bestGap = Infinity;
  let bestPoint = null;
  let bestNormal = null;

  // 1) ground 우선 검사
  for (const cellA of cellsA) {
    const gapToGround = cellA.y - halfA;

    if (gapToGround < bestGap) {
      bestGap = gapToGround;
      bestPoint = new THREE.Vector3(cellA.x, 0.012, cellA.z);
      bestNormal = new THREE.Vector3(0, 1, 0);
    }
  }

  // 2) 기존 블럭 상면/경사면 근사 검사
  for (const other of this.blocks) {
    if (!other || other === block) continue;
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

    const axesB = this.getQuaternionAxes(otherQuat);
    const cellsB = this.getWorldCellCenters(otherPos, otherQuat, other.collision);
    const halfB = other.collision.colliderHalfExtent ?? other.collision.halfExtent ?? 0.5;

    // local Y축을 접촉면 normal 후보로 사용
    const supportNormal = axesB[1].clone().normalize();
    if (supportNormal.y < 0) {
      supportNormal.multiplyScalar(-1);
    }

    const lateralLimit = (halfA + halfB) * 0.9 + 0.08;

    for (const cellA of cellsA) {
      for (const cellB of cellsB) {
        const diff = this.tmpVecA.copy(cellA).sub(cellB);

        const verticalSep = diff.dot(supportNormal);

        const lateral = this.tmpVecB
          .copy(diff)
          .addScaledVector(supportNormal, -verticalSep);

        const lateralDist = lateral.length();
        const gap = verticalSep - (halfA + halfB);

        // 가까운 접촉면 후보만 채택
        if (lateralDist > lateralLimit) continue;
        if (gap < -0.08) continue;

        if (gap < bestGap) {
          bestGap = gap;
          bestNormal = supportNormal.clone();
          bestPoint = cellB.clone().addScaledVector(supportNormal, halfB + 0.012);
        }
      }
    }
  }

  if (!bestPoint || !bestNormal) {
    return {
      contactPoint: new THREE.Vector3(position.x, 0.012, position.z),
      contactNormal: new THREE.Vector3(0, 1, 0),
    };
  }

  return {
    contactPoint: bestPoint,
    contactNormal: bestNormal,
  };
}

computeSupportPlan(block, position, quaternion) {
  const shapeData = block?.collision;
  if (!shapeData?.cellOffsets?.length) {
    return null;
  }

  const half = this.getShapeHalfExtent(shapeData, "settle");
  const worldCells = this.getWorldCellCenters(position, quaternion, shapeData);
  const supportThreshold = this.gridStep * 0.18;
  const maxGapForSupport = this.settleGapSlack + this.settleSupportBias;

  let targetY = -Infinity;
  let supportCount = 0;
  let weightedSupportX = 0;
  let weightedSupportZ = 0;
  const supportCells = [];

  for (let i = 0; i < worldCells.length; i++) {
    const cell = worldCells[i];
    const offset = shapeData.cellOffsets[i];

    let bestTop = 0;
    let bestSupportPoint = new THREE.Vector3(cell.x, 0, cell.z);

    for (const other of this.blocks) {
      if (!other || other === block) continue;
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

      const otherHalf = this.getShapeHalfExtent(other.collision, "settle");
      const otherCells = this.getWorldCellCenters(otherPos, otherQuat, other.collision);

      for (const otherCell of otherCells) {
        if (
          Math.abs(otherCell.x - cell.x) > supportThreshold ||
          Math.abs(otherCell.z - cell.z) > supportThreshold
        ) {
          continue;
        }

        const top = otherCell.y + otherHalf;
        const gap = cell.y - half - top;

        if (gap < -0.08) continue;
        if (gap > maxGapForSupport) continue;

        if (top > bestTop) {
          bestTop = top;
          bestSupportPoint = new THREE.Vector3(otherCell.x, top, otherCell.z);
        }
      }
    }

    const requiredCenterY = bestTop + half - offset.y;
    if (requiredCenterY > targetY) {
      targetY = requiredCenterY;
    }

    const gapToChosenSupport = cell.y - half - bestTop;
    if (bestTop > 0 || gapToChosenSupport <= maxGapForSupport) {
      if (Math.abs(gapToChosenSupport) <= maxGapForSupport) {
        supportCount += 1;
        weightedSupportX += bestSupportPoint.x;
        weightedSupportZ += bestSupportPoint.z;
        supportCells.push(bestSupportPoint);
      }
    }
  }

  if (!Number.isFinite(targetY)) {
    return null;
  }

  const supportCenter =
    supportCount > 0
      ? new THREE.Vector3(
          weightedSupportX / supportCount,
          targetY - half,
          weightedSupportZ / supportCount
        )
      : new THREE.Vector3(position.x, targetY - half, position.z);

  return {
    targetY,
    supportCount,
    supportCenter,
    supportCells,
  };
}

shouldApplySettleSnap(
  block,
  currentPosition,
  currentQuaternion,
  snapPosition,
  snapQuaternion,
  supportPlan
) {
  if (!supportPlan) return false;

  const horizontalError = Math.hypot(
    currentPosition.x - snapPosition.x,
    currentPosition.z - snapPosition.z
  );

  if (horizontalError > this.settleSnapHorizontalTolerance) {
    return false;
  }

  const verticalError = Math.abs(currentPosition.y - snapPosition.y);
  if (verticalError > Math.max(0.24, this.gridStep * 0.35)) {
    return false;
  }

  const rotationDot = Math.abs(currentQuaternion.dot(snapQuaternion));
  if (rotationDot < this.settleSnapRotationDotMin) {
    return false;
  }

  if (supportPlan.supportCount <= 0) {
    return false;
  }

  const centerOffset = Math.hypot(
    snapPosition.x - supportPlan.supportCenter.x,
    snapPosition.z - supportPlan.supportCenter.z
  );

  if (supportPlan.supportCount === 1 && centerOffset > this.gridStep * 0.55) {
    return false;
  }

  if (supportPlan.supportCount === 2 && centerOffset > this.gridStep * 0.9) {
    return false;
  }

  return true;
}

applySettleSnap(block) {
  if (!block || block.state !== "settled") return false;
  if (block.snapApplied) return false;
  if (!block.collision?.cellOffsets?.length) return false;

  const posRaw = block.body.translation();
  const rotRaw = block.body.rotation();

  const currentPosition = new THREE.Vector3(posRaw.x, posRaw.y, posRaw.z);
  const currentQuaternion = new THREE.Quaternion(
    rotRaw.x,
    rotRaw.y,
    rotRaw.z,
    rotRaw.w
  );

  const snappedRotation = this.getNearestRightAngleQuaternion(currentQuaternion);
  const snapQuaternion = snappedRotation.quaternion;

  const snapPosition = this.clampGridPositionToStage(
    new THREE.Vector3(
      this.snapToGrid(currentPosition.x),
      currentPosition.y,
      this.snapToGrid(currentPosition.z)
    )
  );

  const supportPlan = this.computeSupportPlan(block, snapPosition, snapQuaternion);
  if (!supportPlan) {
    block.snapApplied = true;
    return false;
  }

  snapPosition.y = supportPlan.targetY;

  if (
    !this.shouldApplySettleSnap(
      block,
      currentPosition,
      currentQuaternion,
      snapPosition,
      snapQuaternion,
      supportPlan
    )
  ) {
    block.snapApplied = true;
    return false;
  }

  const positionStrength = THREE.MathUtils.clamp(
    this.settleSnapPositionStrength ?? 0.35,
    0,
    1
  );
  const rotationStrength = THREE.MathUtils.clamp(
    this.settleSnapRotationStrength ?? 0.45,
    0,
    1
  );

  const blendedPosition = currentPosition.clone().lerp(snapPosition, positionStrength);
  const blendedQuaternion = currentQuaternion
    .clone()
    .slerp(snapQuaternion, rotationStrength)
    .normalize();

  block.body.setRotation(blendedQuaternion, true);
  block.body.setTranslation(
    {
      x: blendedPosition.x,
      y: blendedPosition.y,
      z: blendedPosition.z,
    },
    true
  );

  const lv = block.body.linvel();
  const av = block.body.angvel();

  const linearKeep = THREE.MathUtils.clamp(
    this.settleSnapLinearVelocityKeep ?? 0.08,
    0,
    1
  );
  const angularKeep = THREE.MathUtils.clamp(
    this.settleSnapAngularVelocityKeep ?? 0.18,
    0,
    1
  );
  const maxVerticalSpeed = this.settleSnapMaxVerticalSpeed ?? 0.0025;

  block.body.setLinvel(
    {
      x: lv.x * linearKeep,
      y: Math.max(-maxVerticalSpeed, Math.min(maxVerticalSpeed, lv.y * 0.04)),
      z: lv.z * linearKeep,
    },
    true
  );

  block.body.setAngvel(
    {
      x: av.x * angularKeep,
      y: av.y * angularKeep,
      z: av.z * angularKeep,
    },
    true
  );

  block.snapApplied = true;
  block.snapIntent = {
    x: snapPosition.x,
    y: snapPosition.y,
    z: snapPosition.z,
    supportCount: supportPlan.supportCount,
  };

  return true;
}

applySettleSnapToAll() {
  for (const block of this.blocks) {
    if (!block || block.state !== "settled") continue;
    this.applySettleSnap(block);
  }
}

  canPlacePreviewAt(position, quaternion) {
    const block = this.getCurrentPreviewBlock();
    if (!block?.collision) return false;

    return !this.collidesShapeAt(position, quaternion, block.collision, block);
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

  this.monitor.updateDynamicBlocks(this.blocks, {
    slowLanding: this.isSlowLandingMode(),
  });

  this.applySettleSnapToAll();
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
    this.previewFallMultiplier = 1;

    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;
  }

    getStructureBounds(includePreview = false) {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    let found = false;

    for (const block of this.blocks) {
      if (!block) continue;
      if (!includePreview && block.state === "preview") continue;
      if (!block.collision?.cellOffsets?.length) continue;

      const posRaw = block.body.translation();
      const rotRaw = block.body.rotation();

      const position = new THREE.Vector3(posRaw.x, posRaw.y, posRaw.z);
      const quaternion = new THREE.Quaternion(
        rotRaw.x,
        rotRaw.y,
        rotRaw.z,
        rotRaw.w
      );

      const half = this.getShapeHalfExtent(block.collision, "settle");
      const cells = this.getWorldCellCenters(position, quaternion, block.collision);

      for (const cell of cells) {
        min.x = Math.min(min.x, cell.x - half);
        min.y = Math.min(min.y, cell.y - half);
        min.z = Math.min(min.z, cell.z - half);

        max.x = Math.max(max.x, cell.x + half);
        max.y = Math.max(max.y, cell.y + half);
        max.z = Math.max(max.z, cell.z + half);

        found = true;
      }
    }

    if (!found) {
      return {
        min: new THREE.Vector3(-1, 0, -1),
        max: new THREE.Vector3(1, 2, 1),
        center: new THREE.Vector3(0, 1, 0),
      };
    }

    return {
      min,
      max,
      center: new THREE.Vector3(
        (min.x + max.x) * 0.5,
        (min.y + max.y) * 0.5,
        (min.z + max.z) * 0.5
      ),
    };
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