export class StructureMonitor {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 5;
    this.stageHalf = this.stageSize / 2;
    this.failY = options.failY ?? -3;
    this.failGraceTime = options.failGraceTime ?? 0.5;
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

    this.failOuterMargin = options.failOuterMargin ?? 1.35;
    this.failHardBelowY = options.failHardBelowY ?? (this.failY - 1.0);

    this.failMovingLinearThreshold = options.failMovingLinearThreshold ?? 0.22;
    this.failMovingAngularThreshold = options.failMovingAngularThreshold ?? 0.2;

    this.failOutsideFramesRequired = options.failOutsideFramesRequired ?? 18;
    this.failCollapseFramesRequired = options.failCollapseFramesRequired ?? 10;

    this.firstContactLinearDamping = options.firstContactLinearDamping ?? 0.2;
    this.firstContactAngularDamping = options.firstContactAngularDamping ?? 0.24;
    this.firstContactMaxDownSpeed = options.firstContactMaxDownSpeed ?? 0.11;
    this.firstContactMaxHorizontalSpeed =
      options.firstContactMaxHorizontalSpeed ?? 0.05;

    this.landingLinearDamping = options.landingLinearDamping ?? 0.7;
    this.landingAngularDamping = options.landingAngularDamping ?? 0.64;
    this.landingMaxDownSpeed = options.landingMaxDownSpeed ?? 0.08;
    this.landingMaxHorizontalSpeed = options.landingMaxHorizontalSpeed ?? 0.04;
    this.landingMaxAngularSpeed = options.landingMaxAngularSpeed ?? 0.14;

    this.landingResetGraceFrames = options.landingResetGraceFrames ?? 12;
    this.landingResetLinearMultiplier =
      options.landingResetLinearMultiplier ?? 2.2;
    this.landingResetAngularMultiplier =
      options.landingResetAngularMultiplier ?? 2.0;

    this.settledWakeImmunityMs = options.settledWakeImmunityMs ?? 1500;
    this.settledWakeFramesRequired = options.settledWakeFramesRequired ?? 12;
    this.settledMicroLinearThreshold =
      options.settledMicroLinearThreshold ?? 0.14;
    this.settledMicroAngularThreshold =
      options.settledMicroAngularThreshold ?? 0.16;

    this.highTowerStartHeight = options.highTowerStartHeight ?? 80;
    this.highTowerFullHeight = options.highTowerFullHeight ?? 220;
    this.highTowerWakeLinearBoost = options.highTowerWakeLinearBoost ?? 1.35;
    this.highTowerWakeAngularBoost = options.highTowerWakeAngularBoost ?? 1.2;

    this.rewakeProtectionMs = options.rewakeProtectionMs ?? 900;
  }

  ensureBlockRuntimeFields(block) {
    if (!block) return;

    block.contactFrames ??= 0;
    block.landingFrames ??= 0;
    block.stableFrames ??= 0;
    block.jitterFrames ??= 0;
    block.failOutsideFrames ??= 0;
    block.failCollapseFrames ??= 0;
    block.wakeFrames ??= 0;
    block.settledAt ??= 0;
    block.lastWakeAt ??= 0;
    block.prevPosForJitter ??= null;
    block.landingStartY ??= null;
    block.landingStartTime ??= null;
  }

  clampAbs(value, limit) {
    if (!Number.isFinite(value)) return 0;
    if (value > limit) return limit;
    if (value < -limit) return -limit;
    return value;
  }

  clampHorizontal(x, z, maxLen) {
    const len = Math.hypot(x, z);
    if (len <= maxLen || len <= 1e-8) {
      return { x, z };
    }
    const s = maxLen / len;
    return { x: x * s, z: z * s };
  }

  getTowerWakeScale(settledHeight) {
    if (settledHeight <= this.highTowerStartHeight) {
      return { linear: 1, angular: 1 };
    }

    const denom = Math.max(
      1,
      this.highTowerFullHeight - this.highTowerStartHeight
    );
    const t = Math.min(
      1,
      Math.max(0, (settledHeight - this.highTowerStartHeight) / denom)
    );

    return {
      linear: 1 + (this.highTowerWakeLinearBoost - 1) * t,
      angular: 1 + (this.highTowerWakeAngularBoost - 1) * t,
    };
  }

  forceSettle(block) {
    this.ensureBlockRuntimeFields(block);

    block.state = "settled";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.landingStartY = null;
    block.landingStartTime = null;
    block.jitterFrames = 0;
    block.prevPosForJitter = null;
    block.failOutsideFrames = 0;
    block.failCollapseFrames = 0;
    block.wakeFrames = 0;

    const now = performance.now();
    block.settledAt = now;
    block.lastWakeAt = now;
    block.justSettledAt = now;

    const lv = block.body.linvel();
    const av = block.body.angvel();

    block.body.setLinvel(
      {
        x: lv.x * 0.2,
        y: 0,
        z: lv.z * 0.2,
      },
      true
    );

    block.body.setAngvel(
      {
        x: av.x * 0.35,
        y: av.y * 0.35,
        z: av.z * 0.35,
      },
      true
    );

    if (typeof block.body.sleep === "function") {
      block.body.sleep();
    }
  }

  resetToFalling(block) {
    this.ensureBlockRuntimeFields(block);

    block.state = "falling";
    block.contactFrames = 0;
    block.landingFrames = 0;
    block.stableFrames = 0;
    block.landingStartY = null;
    block.landingStartTime = null;
    block.jitterFrames = 0;
    block.prevPosForJitter = null;
    block.failOutsideFrames = 0;
    block.failCollapseFrames = 0;
    block.wakeFrames = 0;
    block.lastWakeAt = performance.now();
  }

  refreshLandingWindow(block) {
    this.ensureBlockRuntimeFields(block);

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
    const settledHeight = this.computeSettledHeight(blocks);
    const wakeScale = this.getTowerWakeScale(settledHeight);

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

    const wakeLinearThreshold = this.largeMoveLinearThreshold * wakeScale.linear;
    const wakeAngularThreshold =
      this.largeMoveAngularThreshold * wakeScale.angular;

    for (const block of blocks) {
      if (
        block.state !== "falling" &&
        block.state !== "landing" &&
        block.state !== "settled"
      ) {
        continue;
      }

      this.ensureBlockRuntimeFields(block);

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

        block.contactFrames = looksLikeContact ? block.contactFrames + 1 : 0;

        if (block.contactFrames >= contactFramesRequired) {
          block.state = "landing";
          block.landingFrames = 0;
          block.stableFrames = 0;
          block.jitterFrames = 0;
          block.landingStartY = currentY;
          block.landingStartTime = now;
          block.prevPosForJitter = { x: pos.x, y: pos.y, z: pos.z };

          const linearDamping = slowLanding
            ? Math.min(0.34, this.firstContactLinearDamping * 1.4)
            : this.firstContactLinearDamping;

          const angularDamping = slowLanding
            ? Math.min(0.38, this.firstContactAngularDamping * 1.35)
            : this.firstContactAngularDamping;

          const dampedHorizontal = this.clampHorizontal(
            lv.x * linearDamping,
            lv.z * linearDamping,
            this.firstContactMaxHorizontalSpeed
          );

          block.body.setLinvel(
            {
              x: dampedHorizontal.x,
              y: this.clampAbs(
                lv.y * linearDamping,
                this.firstContactMaxDownSpeed
              ),
              z: dampedHorizontal.z,
            },
            true
          );

          block.body.setAngvel(
            {
              x: this.clampAbs(
                av.x * angularDamping,
                this.landingMaxAngularSpeed
              ),
              y: this.clampAbs(
                av.y * angularDamping,
                this.landingMaxAngularSpeed
              ),
              z: this.clampAbs(
                av.z * angularDamping,
                this.landingMaxAngularSpeed
              ),
            },
            true
          );
        }

        continue;
      }

      if (block.state === "landing") {
        block.landingFrames += 1;

        const linearDampingFactor = slowLanding
          ? Math.max(0.8, this.landingLinearDamping)
          : this.landingLinearDamping;

        const angularDampingFactor = slowLanding
          ? Math.max(0.76, this.landingAngularDamping)
          : this.landingAngularDamping;

        const dampedHorizontal = this.clampHorizontal(
          lv.x * linearDampingFactor,
          lv.z * linearDampingFactor,
          this.landingMaxHorizontalSpeed
        );

        block.body.setLinvel(
          {
            x: dampedHorizontal.x,
            y: this.clampAbs(
              lv.y * linearDampingFactor,
              this.landingMaxDownSpeed
            ),
            z: dampedHorizontal.z,
          },
          true
        );

        block.body.setAngvel(
          {
            x: this.clampAbs(
              av.x * angularDampingFactor,
              this.landingMaxAngularSpeed
            ),
            y: this.clampAbs(
              av.y * angularDampingFactor,
              this.landingMaxAngularSpeed
            ),
            z: this.clampAbs(
              av.z * angularDampingFactor,
              this.landingMaxAngularSpeed
            ),
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
            block.stableFrames += 1;
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

        block.jitterFrames = looksLikeJitter ? block.jitterFrames + 1 : 0;
        block.prevPosForJitter = { x: pos.x, y: pos.y, z: pos.z };

        const landingResetLinearThreshold =
          wakeLinearThreshold * this.landingResetLinearMultiplier;
        const landingResetAngularThreshold =
          wakeAngularThreshold * this.landingResetAngularMultiplier;

        const movedTooLargeForTooLong =
          block.landingFrames > this.landingResetGraceFrames &&
          (linearSpeed > landingResetLinearThreshold ||
            angularSpeed > landingResetAngularThreshold);

        if (movedTooLargeForTooLong) {
          this.resetToFalling(block);
          continue;
        }

        const landingElapsedSec = (now - (block.landingStartTime ?? now)) / 1000;
        const isLockDelayActive = landingElapsedSec < landingLockDelay;

        const bodySleeping =
          typeof block.body.isSleeping === "function" && block.body.isSleeping();

        const almostStopped =
          linearSpeed <= 0.03 &&
          angularSpeed <= 0.04 &&
          yDelta <= 0.01 &&
          block.landingFrames >= landingMinFrames;

        if (!isLockDelayActive && (bodySleeping || almostStopped)) {
          this.forceSettle(block);
          continue;
        }

        if (!isLockDelayActive && block.stableFrames >= landingStableFramesRequired) {
          this.forceSettle(block);
          continue;
        }

        if (!isLockDelayActive && block.jitterFrames >= this.jitterFramesRequired) {
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
        const elapsedSinceSettled = now - (block.settledAt ?? 0);
        const elapsedSinceWake = now - (block.lastWakeAt ?? 0);

        if (elapsedSinceWake < this.rewakeProtectionMs) {
          block.wakeFrames = 0;
          continue;
        }

        if (
          linearSpeed <= this.settledMicroLinearThreshold &&
          angularSpeed <= this.settledMicroAngularThreshold
        ) {
          block.wakeFrames = 0;

          if (linearSpeed > 0 || angularSpeed > 0) {
            block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

            if (typeof block.body.sleep === "function") {
              block.body.sleep();
            }
          }

          continue;
        }

        if (elapsedSinceSettled < this.settledWakeImmunityMs) {
          block.wakeFrames = 0;
          continue;
        }

        const movedLarge =
          linearSpeed > wakeLinearThreshold || angularSpeed > wakeAngularThreshold;

        if (!movedLarge) {
          block.wakeFrames = 0;
          continue;
        }

        block.wakeFrames += 1;

        if (block.wakeFrames >= this.settledWakeFramesRequired) {
          this.resetToFalling(block);
          continue;
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
    let hasActiveCollapseCandidate = false;

    for (const block of blocks) {
      if (!block || block.state === "preview") continue;

      const pos = block.body.translation();
      const lv = block.body.linvel();
      const av = block.body.angvel();

      const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angularSpeed = Math.hypot(av.x, av.y, av.z);

      const outOfStage =
        Math.abs(pos.x) > this.stageSize * 0.5 + this.failOuterMargin ||
        Math.abs(pos.z) > this.stageSize * 0.5 + this.failOuterMargin;

      const belowHard = pos.y < this.failHardBelowY;
      if (belowHard) {
        return true;
      }

      if (outOfStage) {
        if (
          linearSpeed > this.failMovingLinearThreshold ||
          angularSpeed > this.failMovingAngularThreshold ||
          pos.y < this.failY
        ) {
          block.failOutsideFrames = (block.failOutsideFrames ?? 0) + 1;
        } else {
          block.failOutsideFrames = 0;
        }

        if (block.failOutsideFrames >= this.failOutsideFramesRequired) {
          return true;
        }
      } else {
        block.failOutsideFrames = 0;
      }

      const collapseCandidate =
        pos.y < this.failY &&
        (linearSpeed > this.failMovingLinearThreshold ||
          angularSpeed > this.failMovingAngularThreshold);

      if (collapseCandidate) {
        block.failCollapseFrames = (block.failCollapseFrames ?? 0) + 1;
        hasActiveCollapseCandidate = true;

        if (block.failCollapseFrames >= this.failCollapseFramesRequired) {
          return true;
        }
      } else {
        block.failCollapseFrames = 0;
      }
    }

    if (hasActiveCollapseCandidate) {
      if (this.failCandidateSince == null) {
        this.failCandidateSince = performance.now();
      } else {
        const elapsed = (performance.now() - this.failCandidateSince) / 1000;
        if (elapsed >= this.failGraceTime) {
          return true;
        }
      }
    } else {
      this.failCandidateSince = null;
    }

    return false;
  }
}