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

    this.tmpVecA = new THREE.Vector3();
    this.tmpVecB = new THREE.Vector3();
    this.tmpVecC = new THREE.Vector3();
    this.tmpVecD = new THREE.Vector3();

    this.worldAxisX = new THREE.Vector3(1, 0, 0);
    this.worldAxisY = new THREE.Vector3(0, 1, 0);
    this.worldAxisZ = new THREE.Vector3(0, 0, 1);

    this.waitingBlockId = 1;
    this.lastCommittedBlockId = 0;

    this.waitingSince = 0;
    this.waitingAutoFinishMs = options.waitingAutoFinishMs ?? 650;

    this.stackSupportTolerance =
      options.stackSupportTolerance ?? Math.max(0.24, this.gridStep * 0.3);

    this.previewSupportGap = options.previewSupportGap ?? 0.045;
    this.preCommitSnapGap =
      options.preCommitSnapGap ?? Math.max(0.02, this.previewSupportGap);

    this.previewMaxImmediateDrop =
      options.previewMaxImmediateDrop ?? Math.max(0.35, this.gridStep * 0.45);

    this.previewCollisionPushStep =
      options.previewCollisionPushStep ?? Math.max(0.08, this.gridStep * 0.12);

    this.previewCollisionMaxPushSteps =
      options.previewCollisionMaxPushSteps ?? 7;

    this.previewCollisionExtraGap =
      options.previewCollisionExtraGap ?? 0.04;

    this.previewCollisionMaxOffset =
      options.previewCollisionMaxOffset ?? Math.max(0.22, this.gridStep * 0.32);

    this.rotationPlacementLiftStep =
      options.rotationPlacementLiftStep ?? 0.09;

    this.rotationPlacementMaxLiftSteps =
      options.rotationPlacementMaxLiftSteps ?? 12;

    this.ghostTiltAnglesDegMove =
      options.ghostTiltAnglesDegMove ?? [0, -6, 6, -12, 12];

    this.ghostTiltAnglesDegRotate =
      options.ghostTiltAnglesDegRotate ?? [0, -4, 4, -8, 8];

    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;
    this.rotateFallMultiplier = options.rotateFallMultiplier ?? 0.18;

    this.landingMoveWindowMs = options.landingMoveWindowMs ?? 380;
    this.landingRotateWindowMs = options.landingRotateWindowMs ?? 420;

    this.snapQuaternions = this.buildRightAngleQuaternionSet();

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
    this.lastRotateInputTime = this.isPreviewRotating ? performance.now() : 0;
  }

  isSlowLandingMode() {
    return !!this.isPreviewRotating;
  }

  setPreviewPositionFromWorldPoint(worldPoint) {
    if (!worldPoint) return false;
    return this.setPreviewPosition(worldPoint.x, worldPoint.z);
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

    return (
      shapeData.colliderHalfExtent ??
      shapeData.halfExtent ??
      this.gridStep * 0.5
    );
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

  clampContinuousXZToStage(x, z) {
    const half = this.stageSize / 2 - this.previewClampPadding;
    return {
      x: THREE.MathUtils.clamp(x, -half, half),
      z: THREE.MathUtils.clamp(z, -half, half),
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
      this.waitingSince = 0;
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

  getQuaternionAxes(quaternion) {
    return [
      this.worldAxisX.clone().applyQuaternion(quaternion).normalize(),
      this.worldAxisY.clone().applyQuaternion(quaternion).normalize(),
      this.worldAxisZ.clone().applyQuaternion(quaternion).normalize(),
    ];
  }

  getRotatedCellOffsets(quaternion, shapeData) {
    if (!shapeData?.cellOffsets?.length) return [];

    return shapeData.cellOffsets.map((offset) =>
      new THREE.Vector3(offset.x, offset.y, offset.z).applyQuaternion(quaternion)
    );
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
      const verticalHalf = this.getCellVerticalHalfExtent(quaternion, half);
      const y0 = cell.y - verticalHalf;
      const y1 = cell.y + verticalHalf;
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }

    if (!Number.isFinite(minY)) minY = position.y - half;
    if (!Number.isFinite(maxY)) maxY = position.y + half;

    return { minY, maxY };
  }

  getCellVerticalHalfExtent(quaternion, halfExtent) {
    const axes = this.getQuaternionAxes(quaternion);
    const up = this.worldAxisY;

    const projected =
      Math.abs(axes[0].dot(up)) +
      Math.abs(axes[1].dot(up)) +
      Math.abs(axes[2].dot(up));

    return halfExtent * projected;
  }

  getCellTopY(cellCenter, quaternion, halfExtent) {
    return cellCenter.y + this.getCellVerticalHalfExtent(quaternion, halfExtent);
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
        0.06;

      const dx = otherPos.x - position.x;
      const dz = otherPos.z - position.z;

      if (dx * dx + dz * dz > approxRange * approxRange) {
        continue;
      }

      const otherExtents = this.getShapeVerticalExtents(
        otherPos,
        otherQuat,
        other.collision
      );

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

  getPreviewOverlapContacts(block, position, quaternion) {
    const shapeData = block?.collision;
    if (!shapeData?.cellOffsets?.length) return [];

    const contacts = [];
    const axesA = this.getQuaternionAxes(quaternion);
    const cellsA = this.getWorldCellCenters(position, quaternion, shapeData);
    const rotatedOffsets = this.getRotatedCellOffsets(quaternion, shapeData);

    const halfA = shapeData.colliderHalfExtent ?? shapeData.halfExtent ?? 0.5;
    const cellAVerticalHalf = this.getCellVerticalHalfExtent(quaternion, halfA);

    for (let i = 0; i < cellsA.length; i++) {
      const cellA = cellsA[i];
      const rotatedOffsetA = rotatedOffsets[i];

      for (const other of this.blocks) {
        if (!other || other === block) continue;
        if (other.state === "preview") continue;
        if (!other.collision?.cellOffsets?.length) continue;

        const otherPosRaw = other.body.translation();
        const otherRotRaw = other.body.rotation();

        const otherPos = new THREE.Vector3(
          otherPosRaw.x,
          otherPosRaw.y,
          otherPosRaw.z
        );
        const otherQuat = new THREE.Quaternion(
          otherRotRaw.x,
          otherRotRaw.y,
          otherRotRaw.z,
          otherRotRaw.w
        );

        const axesB = this.getQuaternionAxes(otherQuat);
        const cellsB = this.getWorldCellCenters(otherPos, otherQuat, other.collision);
        const halfB =
          other.collision.colliderHalfExtent ??
          other.collision.halfExtent ??
          0.5;

        for (const cellB of cellsB) {
          if (
            !this.obbOverlap(
              cellA,
              axesA,
              halfA,
              cellB,
              axesB,
              halfB
            )
          ) {
            continue;
          }

          const otherTopY = this.getCellTopY(cellB, otherQuat, halfB);

          contacts.push({
            cellA: cellA.clone(),
            cellB: cellB.clone(),
            rotatedOffsetA: rotatedOffsetA.clone(),
            otherTopY,
            cellAVerticalHalf,
          });
        }
      }
    }

    return contacts;
  }

  findTopSupportAtXZ(x, z, ignoreBlock = null) {
    let bestTop = 0;
    let bestPoint = new THREE.Vector3(x, 0, z);

    for (const other of this.blocks) {
      if (!other || other === ignoreBlock) continue;
      if (other.state === "preview") continue;
      if (!other.collision?.cellOffsets?.length) continue;

      const otherPosRaw = other.body.translation();
      const otherRotRaw = other.body.rotation();

      const otherPosition = new THREE.Vector3(
        otherPosRaw.x,
        otherPosRaw.y,
        otherPosRaw.z
      );

      const otherQuaternion = new THREE.Quaternion(
        otherRotRaw.x,
        otherRotRaw.y,
        otherRotRaw.z,
        otherRotRaw.w
      );

      const otherHalf = this.getShapeHalfExtent(other.collision, "settle");
      const otherCells = this.getWorldCellCenters(
        otherPosition,
        otherQuaternion,
        other.collision
      );

      for (const otherCell of otherCells) {
        if (
          Math.abs(otherCell.x - x) > this.stackSupportTolerance ||
          Math.abs(otherCell.z - z) > this.stackSupportTolerance
        ) {
          continue;
        }

        const top = this.getCellTopY(otherCell, otherQuaternion, otherHalf);

        if (top > bestTop) {
          bestTop = top;
          bestPoint = new THREE.Vector3(otherCell.x, top, otherCell.z);
        }
      }
    }

    return {
      topY: bestTop,
      point: bestPoint,
      isGround: bestTop <= 0,
    };
  }

  resolveSupportOnlyPlacement(block, x, z, quaternion) {
    const shapeData = block?.collision;
    if (!shapeData?.cellOffsets?.length) return null;

    const clamped = this.clampPreviewPosition(x, z);
    const baseX = clamped.x;
    const baseZ = clamped.z;

    const rotatedOffsets = this.getRotatedCellOffsets(quaternion, shapeData);
    const baseHalf = this.getShapeHalfExtent(shapeData, "collision");
    const rotatedCellVerticalHalf = this.getCellVerticalHalfExtent(
      quaternion,
      baseHalf
    );

    let targetY = rotatedCellVerticalHalf + (this.previewSupportGap ?? 0.045);
    let bestContactPoint = new THREE.Vector3(baseX, 0.012, baseZ);

    for (const rotatedOffset of rotatedOffsets) {
      const cellX = baseX + rotatedOffset.x;
      const cellZ = baseZ + rotatedOffset.z;

      const support = this.findTopSupportAtXZ(cellX, cellZ, block);
      const requiredCenterY =
        support.topY +
        rotatedCellVerticalHalf -
        rotatedOffset.y +
        (this.previewSupportGap ?? 0.045);

      if (requiredCenterY > targetY) {
        targetY = requiredCenterY;
      }

      if (support.topY > bestContactPoint.y) {
        bestContactPoint = support.point.clone();
      }
    }

    return {
      position: new THREE.Vector3(baseX, targetY, baseZ),
      quaternion: quaternion.clone(),
      contactPoint: bestContactPoint.clone(),
      contactNormal: new THREE.Vector3(0, 1, 0),
    };
  }

  refineGhostPlacement(block, basePosition, quaternion, strict = false) {
    const position = basePosition.clone();
    const startX = basePosition.x;
    const startZ = basePosition.z;
    const maxPush = this.previewCollisionMaxOffset ?? Math.max(0.22, this.gridStep * 0.32);

    for (let step = 0; step < (this.previewCollisionMaxPushSteps ?? 7); step++) {
      const contacts = this.getPreviewOverlapContacts(block, position, quaternion);
      if (!contacts.length) {
        return {
          position,
          success: true,
        };
      }

      let pushX = 0;
      let pushZ = 0;
      let requiredY = position.y;

      for (const contact of contacts) {
        let dx = contact.cellA.x - contact.cellB.x;
        let dz = contact.cellA.z - contact.cellB.z;
        let len = Math.hypot(dx, dz);

        if (len < 1e-5) {
          dx = position.x - contact.cellB.x;
          dz = position.z - contact.cellB.z;
          len = Math.hypot(dx, dz);
        }

        if (len < 1e-5) {
          dx = 1;
          dz = 0;
          len = 1;
        }

        dx /= len;
        dz /= len;

        pushX += dx;
        pushZ += dz;

        const nextRequiredY =
          contact.otherTopY +
          contact.cellAVerticalHalf -
          contact.rotatedOffsetA.y +
          (this.previewSupportGap ?? 0.045) +
          (this.previewCollisionExtraGap ?? 0.04);

        if (nextRequiredY > requiredY) {
          requiredY = nextRequiredY;
        }
      }

      const pushLen = Math.hypot(pushX, pushZ);
      if (pushLen > 1e-5) {
        pushX /= pushLen;
        pushZ /= pushLen;

        position.x += pushX * (this.previewCollisionPushStep ?? 0.1);
        position.z += pushZ * (this.previewCollisionPushStep ?? 0.1);

        const offsetX = position.x - startX;
        const offsetZ = position.z - startZ;
        const offsetLen = Math.hypot(offsetX, offsetZ);

        if (offsetLen > maxPush && offsetLen > 1e-5) {
          const s = maxPush / offsetLen;
          position.x = startX + offsetX * s;
          position.z = startZ + offsetZ * s;
        }

        const clamped = this.clampContinuousXZToStage(position.x, position.z);
        position.x = clamped.x;
        position.z = clamped.z;
      }

      if (requiredY > position.y) {
        position.y = requiredY;
      }
    }

    const remainingCollision = this.collidesShapeAt(
      position,
      quaternion,
      block.collision,
      block
    );

    if (strict && remainingCollision) {
      return {
        position,
        success: false,
      };
    }

    return {
      position,
      success: !remainingCollision,
    };
  }

  buildGhostQuaternionCandidates(desiredQuaternion, mode = "move") {
    const candidates = [];
    const pushCandidate = (q) => {
      const normalized = q.clone().normalize();
      for (const existing of candidates) {
        if (Math.abs(existing.dot(normalized)) > 0.9999) {
          return;
        }
      }
      candidates.push(normalized);
    };

    pushCandidate(desiredQuaternion);

    const anglesDeg =
      mode === "rotate"
        ? this.ghostTiltAnglesDegRotate
        : this.ghostTiltAnglesDegMove;

    const localAxes = this.getQuaternionAxes(desiredQuaternion);
    const localX = localAxes[0];
    const localZ = localAxes[2];

    for (const ax of anglesDeg) {
      for (const az of anglesDeg) {
        if (ax === 0 && az === 0) continue;

        const qx = new THREE.Quaternion().setFromAxisAngle(
          localX,
          THREE.MathUtils.degToRad(ax)
        );
        const qz = new THREE.Quaternion().setFromAxisAngle(
          localZ,
          THREE.MathUtils.degToRad(az)
        );

        const candidate = qz
          .clone()
          .multiply(qx)
          .multiply(desiredQuaternion)
          .normalize();

        pushCandidate(candidate);
      }
    }

    return candidates;
  }

  solveGhostPlacement(block, x, z, desiredQuaternion, options = {}) {
    const mode = options.mode ?? "move";
    const strict = mode === "rotate";
    const allowOrientationSearch = options.allowOrientationSearch !== false;

    const clampedGrid = this.clampPreviewPosition(x, z);
    const baseX = clampedGrid.x;
    const baseZ = clampedGrid.z;

    const quaternionCandidates = allowOrientationSearch
      ? this.buildGhostQuaternionCandidates(desiredQuaternion, mode)
      : [desiredQuaternion.clone().normalize()];

    let best = null;
    let bestScore = Infinity;

    for (const quat of quaternionCandidates) {
      const supportPlacement = this.resolveSupportOnlyPlacement(
        block,
        baseX,
        baseZ,
        quat
      );
      if (!supportPlacement?.position) continue;

      const refined = this.refineGhostPlacement(
        block,
        supportPlacement.position,
        quat,
        strict
      );

      if (!refined?.position) continue;
      if (strict && !refined.success) continue;

      const dx = refined.position.x - baseX;
      const dz = refined.position.z - baseZ;
      const dy = refined.position.y - supportPlacement.position.y;
      const rotPenalty = 1 - Math.abs(quat.dot(desiredQuaternion));
      const collisionPenalty = refined.success ? 0 : 1000;

      const score =
        collisionPenalty +
        Math.abs(dx) * 3 +
        Math.abs(dz) * 3 +
        Math.max(0, dy) * 1.5 +
        rotPenalty * 20;

      if (score < bestScore) {
        bestScore = score;
        best = {
          position: refined.position.clone(),
          quaternion: quat.clone(),
          contactPoint: supportPlacement.contactPoint.clone(),
          contactNormal: supportPlacement.contactNormal.clone(),
        };
      }
    }

    if (!best) {
      const fallback = this.resolveSupportOnlyPlacement(
        block,
        baseX,
        baseZ,
        desiredQuaternion
      );
      if (!fallback?.position) return null;
      return fallback;
    }

    return best;
  }

  setPreviewPosition(x, z) {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;
    if (!block.collision) return false;

    const resolved = this.solveGhostPlacement(
      block,
      x,
      z,
      this.previewQuaternion,
      {
        mode: "move",
        allowOrientationSearch: true,
      }
    );

    if (!resolved?.position) return false;

    const beforeX = this.previewX;
    const beforeY = this.previewY;
    const beforeZ = this.previewZ;

    this.previewX = resolved.position.x;
    this.previewZ = resolved.position.z;

    const desiredY = resolved.position.y;
    const maxDrop =
      this.previewMaxImmediateDrop ?? Math.max(0.35, this.gridStep * 0.45);

    if (desiredY >= this.previewY) {
      this.previewY = desiredY;
    } else {
      this.previewY = Math.max(desiredY, this.previewY - maxDrop);
    }

    // 중요:
    // resolved.quaternion은 고스트 가이드용일 뿐,
    // 실제 preview 블럭 회전값은 바꾸지 않는다.
    this.applyPreviewTransform();

    return (
      Math.abs(this.previewX - beforeX) > 1e-9 ||
      Math.abs(this.previewY - beforeY) > 1e-9 ||
      Math.abs(this.previewZ - beforeZ) > 1e-9
    );
  }
  movePreviewByGrid(dx, dz) {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const targetX = this.previewX + dx;
    const targetZ = this.previewZ + dz;
    return this.setPreviewPosition(targetX, targetZ);
  }

  rotatePreviewByAxis(axis, angle) {
    if (!this.currentBlock || this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;
    if (!block.collision) return false;

    if (axis === "x") this.tempAxis.set(1, 0, 0);
    else if (axis === "y") this.tempAxis.set(0, 1, 0);
    else if (axis === "z") this.tempAxis.set(0, 0, 1);
    else return false;

    this.tempAxis.applyQuaternion(this.previewQuaternion).normalize();
    this.deltaQuaternion.setFromAxisAngle(this.tempAxis, angle);

    const desiredQuaternion = this.deltaQuaternion
      .clone()
      .multiply(this.previewQuaternion)
      .normalize();

    const resolved = this.solveGhostPlacement(
      block,
      this.previewX,
      this.previewZ,
      desiredQuaternion,
      {
        mode: "rotate",
        allowOrientationSearch: true,
      }
    );

    if (!resolved?.position) return false;

    this.previewX = resolved.position.x;
    this.previewZ = resolved.position.z;

    const desiredY = resolved.position.y;
    if (desiredY > this.previewY) {
      this.previewY = desiredY;
    }

    // 중요:
    // 실제 블럭 회전은 사용자가 만든 desiredQuaternion만 유지
    this.previewQuaternion.copy(desiredQuaternion);

    this.lastRotateInputTime = performance.now();
    this.applyPreviewTransform();
    return true;
  }

  enterRotateMode() {
    if (this.state !== "EDIT") return false;
    this.setPreviewRotating(true);
    return true;
  }

  exitRotateMode() {
    if (this.state !== "EDIT") return false;
    this.setPreviewRotating(false);
    return true;
  }

  rotatePreview90(axis, turns = 1) {
    const normalizedTurns = Math.trunc(turns);
    if (!normalizedTurns) return false;
    return this.rotatePreviewByAxis(axis, (Math.PI / 2) * normalizedTurns);
  }

  findSpinAssistPlacement(block, basePosition, rotatedQuaternion) {
    const candidates = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.gridStep, 0, 0),
      new THREE.Vector3(-this.gridStep, 0, 0),
      new THREE.Vector3(0, 0, this.gridStep),
      new THREE.Vector3(0, 0, -this.gridStep),
      new THREE.Vector3(this.gridStep * 0.5, 0, 0),
      new THREE.Vector3(-this.gridStep * 0.5, 0, 0),
      new THREE.Vector3(0, 0, this.gridStep * 0.5),
      new THREE.Vector3(0, 0, -this.gridStep * 0.5),
    ];

    let best = null;
    let bestScore = Infinity;

    for (const offset of candidates) {
      const resolved = this.solveGhostPlacement(
        block,
        basePosition.x + offset.x,
        basePosition.z + offset.z,
        rotatedQuaternion,
        {
          mode: "rotate",
          allowOrientationSearch: true,
        }
      );

      if (!resolved?.position) continue;

      const dx = resolved.position.x - basePosition.x;
      const dz = resolved.position.z - basePosition.z;
      const dy = Math.abs(resolved.position.y - basePosition.y);
      const rotPenalty = 1 - Math.abs(resolved.quaternion.dot(rotatedQuaternion));

      const score =
        Math.abs(dx) +
        Math.abs(dz) +
        dy * 0.25 +
        rotPenalty * 5;

      if (score < bestScore) {
        bestScore = score;
        best = {
          position: resolved.position.clone(),
          quaternion: resolved.quaternion.clone(),
        };
      }
    }

    return best;
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

   snapPreviewToSupportBeforeCommit() {
    const block = this.getCurrentPreviewBlock();
    if (!block) return null;

    const resolved = this.solveGhostPlacement(
      block,
      this.previewX,
      this.previewZ,
      this.previewQuaternion,
      {
        mode: "commit",
        allowOrientationSearch: true,
      }
    );

    if (!resolved?.position) return null;

    this.previewX = resolved.position.x;
    this.previewY = resolved.position.y + (this.preCommitSnapGap ?? 0.02);
    this.previewZ = resolved.position.z;

    // 중요:
    // commit 직전에도 실제 회전은 사용자가 만든 previewQuaternion 유지
    this.applyPreviewTransform();
    return resolved;
  }

  dropCurrentBlockFast() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;
    const dropSpeed = Math.max(this.fastFallSpeed, this.slowFallSpeed * 10);

    this.snapPreviewToSupportBeforeCommit();

    this.factory.convertPreviewToDynamic(block, dropSpeed);
    block.committed = true;
    this.lastCommittedBlockId = block.id;

    this.currentBlock = null;
    this.previewFallMultiplier = 1;
    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;
    this.state = "WAITING";
    this.waitingSince = performance.now();
    return true;
  }

  autoCommitPreviewAtCurrentPosition() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const block = this.currentBlock;

    this.snapPreviewToSupportBeforeCommit();

    this.factory.convertPreviewToDynamic(
      block,
      Math.max(this.slowFallSpeed, 1.4)
    );
    block.committed = true;
    this.lastCommittedBlockId = block.id;

    this.currentBlock = null;
    this.previewFallMultiplier = 1;
    this.isPreviewRotating = false;
    this.lastRotateInputTime = 0;
    this.state = "WAITING";
    this.waitingSince = performance.now();
    return true;
  }

  instantDropCurrentBlock() {
    if (!this.currentBlock) return false;
    if (this.currentBlock.state !== "preview") return false;
    if (this.state !== "EDIT") return false;

    const prediction = this.getPlacementPrediction();
    if (prediction?.position) {
      this.previewX = prediction.position.x;
      this.previewY = prediction.position.y;
      this.previewZ = prediction.position.z;

      if (prediction.quaternion) {
        this.previewQuaternion.copy(prediction.quaternion);
      }

      this.applyPreviewTransform();
    }

    return this.autoCommitPreviewAtCurrentPosition();
  }

  tryMoveLandingBlockByGrid(dx, dz) {
    const block = this.getLastCommittedLandingBlock();
    if (!block) return false;
    if (!this.canManipulateLandingBlock(block, "move")) return false;

    const pos = block.body.translation();
    const rot = block.body.rotation();

    const currentPosition = new THREE.Vector3(pos.x, pos.y, pos.z);
    const currentQuaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const resolved = this.solveGhostPlacement(
      block,
      currentPosition.x + dx,
      currentPosition.z + dz,
      currentQuaternion,
      {
        mode: "move",
        allowOrientationSearch: false,
      }
    );

    if (!resolved?.position) return false;

    block.body.setTranslation(
      {
        x: resolved.position.x,
        y: resolved.position.y,
        z: resolved.position.z,
      },
      true
    );
    block.body.setRotation(resolved.quaternion, true);
    block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.refreshLandingBlockState(block, resolved.position.y);
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

    const lastCommitted = this.blocks.find(
      (block) => block.id === this.lastCommittedBlockId
    );

    if (!lastCommitted || !lastCommitted.body) {
      this.state = "IDLE";
      this.waitingSince = 0;
      return;
    }

    if (lastCommitted.state === "settled") {
      this.state = "IDLE";
      this.waitingSince = 0;
      return;
    }

    const lv = lastCommitted.body.linvel();
    const av = lastCommitted.body.angvel();
    const pos = lastCommitted.body.translation();

    const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
    const angularSpeed = Math.hypot(av.x, av.y, av.z);

    const bodySleeping =
      typeof lastCommitted.body.isSleeping === "function" &&
      lastCommitted.body.isSleeping();

    const almostStopped =
      linearSpeed <= 0.035 &&
      angularSpeed <= 0.05 &&
      Math.abs(lv.y) <= 0.02;

    const nearPlayableZone =
      pos.y > this.failY - 1.0 &&
      Math.abs(pos.x) <= this.stageSize &&
      Math.abs(pos.z) <= this.stageSize;

    const elapsedWaiting =
      this.waitingSince > 0 ? performance.now() - this.waitingSince : 0;

    const timedOutButStopped =
      elapsedWaiting >= this.waitingAutoFinishMs &&
      almostStopped &&
      nearPlayableZone;

    if (bodySleeping || timedOutButStopped) {
      if (typeof this.monitor.forceSettle === "function") {
        this.monitor.forceSettle(lastCommitted);
      } else {
        lastCommitted.state = "settled";
      }

      this.state = "IDLE";
      this.waitingSince = 0;
    }
  }

  maybeSpawnNextBlock() {
    if (!this.gameStarted) return;
    if (this.state !== "IDLE") return;
    if (this.currentBlock) return;
    this.createBlock();
  }

  computePlacementPrediction(block, startPosition, quaternion) {
    const resolved = this.solveGhostPlacement(
      block,
      startPosition.x,
      startPosition.z,
      quaternion,
      {
        mode: this.isPreviewRotating ? "rotate" : "move",
        allowOrientationSearch: true,
      }
    );

    if (!resolved?.position) return null;

    const currentExtents = this.getShapeVerticalExtents(
      startPosition,
      quaternion,
      block.collision
    );

    const finalExtents = this.getShapeVerticalExtents(
      resolved.position,
      resolved.quaternion,
      block.collision
    );

    return {
      position: resolved.position.clone(),
      quaternion: resolved.quaternion.clone(),
      currentBottomY: currentExtents.minY,
      predictedBottomY: finalExtents.minY,
      contactPoint: resolved.contactPoint.clone(),
      contactNormal: resolved.contactNormal.clone(),
    };
  }

  getPlacementPrediction() {
    const block = this.getCurrentPreviewBlock();
    if (!block?.collision) return null;

    const startPosition = new THREE.Vector3(
      this.previewX,
      this.previewY,
      this.previewZ
    );
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

    // 중요:
    // prediction.quaternion은 고스트용 예측 자세일 뿐
    // 실제 previewQuaternion에는 반영하지 않는다.
    this.applyPreviewTransform();

    const reachedTarget = Math.abs(this.previewY - targetY) <= 0.0001;

    if (reachedTarget && !this.isPreviewRotating) {
      this.autoCommitPreviewAtCurrentPosition();
    }
  }
  getPlacedBlocks() {
    return this.blocks.filter((block) => block && block.state !== "preview");
  }

  canPlacePreviewAt(position, quaternion) {
    const block = this.getCurrentPreviewBlock();
    if (!block?.collision) return false;
    return !this.collidesShapeAt(position, quaternion, block.collision, block);
  }

  update(dt = 0.016) {
    if (this.currentBlock?.state === "preview" && this.state === "EDIT") {
      this.updatePreviewAutoFall(dt);
    }

    this.monitor.updateDynamicBlocks(this.blocks, {
      slowLanding: this.isSlowLandingMode(),
    });

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
    this.waitingSince = 0;
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
        const verticalHalf = this.getCellVerticalHalfExtent(quaternion, half);

        min.x = Math.min(min.x, cell.x - half);
        min.y = Math.min(min.y, cell.y - verticalHalf);
        min.z = Math.min(min.z, cell.z - half);

        max.x = Math.max(max.x, cell.x + half);
        max.y = Math.max(max.y, cell.y + verticalHalf);
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