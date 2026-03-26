export class StructureMonitor {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 5;
    this.stageHalf = this.stageSize / 2;
    this.failY = options.failY ?? -3;
    this.failGraceTime = options.failGraceTime ?? 2; // 초
    this.failCandidateSince = null;

    this.contactVerticalThreshold = options.contactVerticalThreshold ?? 0.32;
    this.contactHorizontalThreshold = options.contactHorizontalThreshold ?? 0.26;
    this.contactFramesRequired = options.contactFramesRequired ?? 2;

    this.landingMinFrames = options.landingMinFrames ?? 4;
    this.landingStableFramesRequired = options.landingStableFramesRequired ?? 4;
    this.maxLandingYDelta = options.maxLandingYDelta ?? 0.02;
    this.maxLandingTime = options.maxLandingTime ?? 5.0;
    this.landingLockDelay = options.landingLockDelay ?? 0.34;

    this.largeMoveLinearThreshold = options.largeMoveLinearThreshold ?? 0.9;
    this.largeMoveAngularThreshold = options.largeMoveAngularThreshold ?? 0.9;

    this.jitterLinearMin = options.jitterLinearMin ?? 0.02;
    this.jitterLinearMax = options.jitterLinearMax ?? 0.22;
    this.jitterAngularMin = options.jitterAngularMin ?? 0.02;
    this.jitterAngularMax = options.jitterAngularMax ?? 0.32;

    this.jitterPositionDeltaMax = options.jitterPositionDeltaMax ?? 0.006;
    this.jitterYDeltaMax = options.jitterYDeltaMax ?? 0.006;
    this.jitterFramesRequired = options.jitterFramesRequired ?? 16;
  }

  forceSettle(block) {
    block.state = "settled";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.landingStartY = null;
    block.landingStartTime = null;
    block.jitterFrames = 0;
    block.prevPosForJitter = null;
    block.snapApplied = false;

    block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    if (typeof block.body.sleep === "function") {
      block.body.sleep();
    }
  }

  resetToFalling(block) {
    block.state = "falling";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.landingStartY = null;
    block.landingStartTime = null;
    block.jitterFrames = 0;
    block.prevPosForJitter = null;
    block.snapApplied = false;
  }

  refreshLandingWindow(block) {
    const pos = block.body.translation();
    block.state = "landing";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.jitterFrames = 0;
    block.landingStartY = pos.y;
    block.landingStartTime = performance.now();
    block.prevPosForJitter = { x: pos.x, y: pos.y, z: pos.z };
    block.snapApplied = false;
  }

  updateDynamicBlocks(blocks, options = {}) {
    const now = performance.now();
    const slowLanding = !!options.slowLanding;

    const contactVerticalThreshold = slowLanding
      ? this.contactVerticalThreshold * 0.72
      : this.contactVerticalThreshold;

    const contactHorizontalThreshold = slowLanding
      ? this.contactHorizontalThreshold * 0.9
      : this.contactHorizontalThreshold;

    const contactFramesRequired = slowLanding
      ? Math.max(this.contactFramesRequired, 10)
      : this.contactFramesRequired;

    const landingMinFrames = slowLanding
      ? Math.max(this.landingMinFrames, 8)
      : this.landingMinFrames;

    const landingStableFramesRequired = slowLanding
      ? Math.max(this.landingStableFramesRequired, 10)
      : this.landingStableFramesRequired;

    const maxLandingTime = slowLanding
      ? Math.max(this.maxLandingTime, 7.5)
      : this.maxLandingTime;

    const landingLockDelay = slowLanding
      ? Math.max(this.landingLockDelay, 0.42)
      : this.landingLockDelay;

    for (const block of blocks) {
      if (
        block.state !== "falling" &&
        block.state !== "landing" &&
        block.state !== "settled"
      ) {
        continue;
      }

      const lv = block.body.linvel();
      const av = block.body.angvel();
      const pos = block.body.translation();

      const horizontalSpeed = Math.hypot(lv.x, lv.z);
      const verticalSpeed = Math.abs(lv.y);
      const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angularSpeed = Math.hypot(av.x, av.y, av.z);
      const currentY = pos.y;

      if (block.state === "falling") {
        const looksLikeContact =
          verticalSpeed < contactVerticalThreshold &&
          horizontalSpeed < contactHorizontalThreshold;

        block.contactFrames = looksLikeContact ? (block.contactFrames ?? 0) + 1 : 0;

        if (block.contactFrames >= contactFramesRequired) {
          block.state = "landing";
          block.landingFrames = 0;
          block.stableFrames = 0;
          block.jitterFrames = 0;
          block.landingStartY = currentY;
          block.landingStartTime = now;
          block.prevPosForJitter = { x: pos.x, y: pos.y, z: pos.z };

          const settleDamping = slowLanding ? 0.6 : 0.35;

          block.body.setLinvel(
            {
              x: lv.x * settleDamping,
              y: lv.y * settleDamping,
              z: lv.z * settleDamping,
            },
            true
          );

          block.body.setAngvel(
            {
              x: av.x * settleDamping,
              y: av.y * settleDamping,
              z: av.z * settleDamping,
            },
            true
          );
        }

        continue;
      }

      if (block.state === "landing") {
        block.landingFrames = (block.landingFrames ?? 0) + 1;

        const linearDampingFactor = slowLanding ? 0.9 : 0.82;
        const angularDampingFactor = slowLanding ? 0.88 : 0.78;

        block.body.setLinvel(
          {
            x: lv.x * linearDampingFactor,
            y: lv.y * linearDampingFactor,
            z: lv.z * linearDampingFactor,
          },
          true
        );

        block.body.setAngvel(
          {
            x: av.x * angularDampingFactor,
            y: av.y * angularDampingFactor,
            z: av.z * angularDampingFactor,
          },
          true
        );

        const yDelta = Math.abs(currentY - (block.landingStartY ?? currentY));

        if (block.landingFrames >= landingMinFrames) {
          if (
            yDelta <= this.maxLandingYDelta &&
            linearSpeed <= contactHorizontalThreshold &&
            angularSpeed <= contactHorizontalThreshold
          ) {
            block.stableFrames = (block.stableFrames ?? 0) + 1;
          } else {
            block.stableFrames = 0;
            block.landingStartY = currentY;
          }
        }

        const prev = block.prevPosForJitter ?? { x: pos.x, y: pos.y, z: pos.z };
        const posDelta = Math.hypot(pos.x - prev.x, pos.z - prev.z);
        const yPosDelta = Math.abs(pos.y - prev.y);

        const looksLikeJitter =
          linearSpeed >= this.jitterLinearMin &&
          linearSpeed <= this.jitterLinearMax &&
          angularSpeed >= this.jitterAngularMin &&
          angularSpeed <= this.jitterAngularMax &&
          posDelta <= this.jitterPositionDeltaMax &&
          yPosDelta <= this.jitterYDeltaMax;

        block.jitterFrames = looksLikeJitter ? (block.jitterFrames ?? 0) + 1 : 0;
        block.prevPosForJitter = { x: pos.x, y: pos.y, z: pos.z };

        const movedLarge =
          linearSpeed > this.largeMoveLinearThreshold ||
          angularSpeed > this.largeMoveAngularThreshold;

        if (movedLarge) {
          this.resetToFalling(block);
          continue;
        }

        const landingElapsedSec = (now - (block.landingStartTime ?? now)) / 1000;
        const isLockDelayActive = landingElapsedSec < landingLockDelay;

        if (!isLockDelayActive && block.stableFrames >= landingStableFramesRequired) {
          this.forceSettle(block);
          continue;
        }

        if (!isLockDelayActive && (block.jitterFrames ?? 0) >= this.jitterFramesRequired) {
          this.forceSettle(block);
          continue;
        }

        if (landingElapsedSec >= maxLandingTime) {
          this.forceSettle(block);
          continue;
        }

        continue;
      }

      if (block.state === "settled") {
        const movedLarge =
          linearSpeed > this.largeMoveLinearThreshold ||
          angularSpeed > this.largeMoveAngularThreshold;

        if (movedLarge) {
          this.resetToFalling(block);
        }
      }
    }
  }

  getPlacedBlocks(blocks) {
    return blocks.filter((b) => b.state !== "preview");
  }

  getPlacedBlockCount(blocks) {
    return this.getPlacedBlocks(blocks).length;
  }

  hasLandingBlocks(blocks) {
    return blocks.some((b) => b.state === "landing");
  }

  areAllPlacedBlocksStable(blocks) {
    const activeBlocks = this.getPlacedBlocks(blocks);
    if (activeBlocks.length === 0) return false;

    for (const block of activeBlocks) {
      if (block.state !== "settled") {
        return false;
      }
    }

    return true;
  }

  computeHeight(blocks, includePreview = false) {
    let highest = 0;

    for (const block of blocks) {
      if (!includePreview && block.state === "preview") continue;

      const topY = block.body.translation().y + block.halfHeight;
      if (topY > highest) highest = topY;
    }

    return highest;
  }

  computeSettledHeight(blocks) {
    let highest = 0;

    for (const block of blocks) {
      if (block.state !== "settled") continue;

      const topY = block.body.translation().y + block.halfHeight;
      if (topY > highest) highest = topY;
    }

    return highest;
  }

  checkFail(blocks) {
    const now = performance.now();
    const margin = 1.15;

    let hasFailCandidate = false;

    for (const block of blocks) {
      if (block.state === "preview") continue;

      const pos = block.body.translation();

      const outOfStage =
        Math.abs(pos.x) > this.stageSize * 0.5 + margin ||
        Math.abs(pos.z) > this.stageSize * 0.5 + margin;

      const belowStage = pos.y < this.failY - 0.35;

      if (outOfStage || belowStage) {
        hasFailCandidate = true;
        break;
      }
    }

    if (!hasFailCandidate) {
      this.failCandidateSince = null;
      return false;
    }

    if (this.failCandidateSince === null) {
      this.failCandidateSince = now;
      return false;
    }

    const elapsedSec = (now - this.failCandidateSince) / 1000;
    if (elapsedSec < this.failGraceTime) {
      return false;
    }

    return true;
  }
}