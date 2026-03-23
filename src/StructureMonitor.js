export class StructureMonitor {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 5;
    this.stageRadius = this.stageSize / 2;
    this.failY = options.failY ?? -3;

    // falling -> landing 접촉 감지
    this.contactVerticalThreshold = options.contactVerticalThreshold ?? 0.28;
    this.contactHorizontalThreshold = options.contactHorizontalThreshold ?? 0.22;
    this.contactFramesRequired = options.contactFramesRequired ?? 2;

    // landing 안정화 판정
    this.landingMinFrames = options.landingMinFrames ?? 8;
    this.landingStableFramesRequired = options.landingStableFramesRequired ?? 12;
    this.maxLandingYDelta = options.maxLandingYDelta ?? 0.03;

    // 크게 다시 흔들리면 falling 복귀
    this.largeMoveLinearThreshold = options.largeMoveLinearThreshold ?? 0.5;
    this.largeMoveAngularThreshold = options.largeMoveAngularThreshold ?? 0.5;
  }

  updateDynamicBlocks(blocks) {
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

      const horizontalSpeed = Math.hypot(lv.x, lv.z);
      const verticalSpeed = Math.abs(lv.y);
      const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angularSpeed = Math.hypot(av.x, av.y, av.z);
      const currentY = block.body.translation().y;

      if (block.state === "falling") {
        const looksLikeContact =
          verticalSpeed < this.contactVerticalThreshold &&
          horizontalSpeed < this.contactHorizontalThreshold;

        block.contactFrames = looksLikeContact ? (block.contactFrames ?? 0) + 1 : 0;

        if (block.contactFrames >= this.contactFramesRequired) {
          block.state = "landing";
          block.landingFrames = 0;
          block.stableFrames = 0;
          block.landingStartY = currentY;

          block.body.setLinvel(
            {
              x: lv.x * 0.4,
              y: lv.y * 0.4,
              z: lv.z * 0.4,
            },
            true
          );

          block.body.setAngvel(
            {
              x: av.x * 0.5,
              y: av.y * 0.5,
              z: av.z * 0.5,
            },
            true
          );
        }

        continue;
      }

      if (block.state === "landing") {
        block.landingFrames = (block.landingFrames ?? 0) + 1;

        block.body.setLinvel(
          {
            x: lv.x * 0.88,
            y: lv.y * 0.88,
            z: lv.z * 0.88,
          },
          true
        );

        block.body.setAngvel(
          {
            x: av.x * 0.84,
            y: av.y * 0.84,
            z: av.z * 0.84,
          },
          true
        );

        const yDelta = Math.abs(currentY - (block.landingStartY ?? currentY));

        if (block.landingFrames >= this.landingMinFrames) {
          if (yDelta <= this.maxLandingYDelta) {
            block.stableFrames = (block.stableFrames ?? 0) + 1;
          } else {
            block.stableFrames = 0;
            block.landingStartY = currentY;
          }
        }

        const movedLarge =
          linearSpeed > this.largeMoveLinearThreshold ||
          angularSpeed > this.largeMoveAngularThreshold;

        if (movedLarge) {
          block.state = "falling";
          block.contactFrames = 0;
          block.landingFrames = 0;
          block.stableFrames = 0;
          block.landingStartY = null;
          continue;
        }

        if (block.stableFrames >= this.landingStableFramesRequired) {
          block.state = "settled";
          block.landingFrames = 0;
          block.landingStartY = null;
          block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        continue;
      }

      if (block.state === "settled") {
        block.body.setLinvel(
          {
            x: lv.x * 0.92,
            y: lv.y * 0.92,
            z: lv.z * 0.92,
          },
          true
        );

        block.body.setAngvel(
          {
            x: av.x * 0.9,
            y: av.y * 0.9,
            z: av.z * 0.9,
          },
          true
        );

        const movedLarge =
          linearSpeed > this.largeMoveLinearThreshold ||
          angularSpeed > this.largeMoveAngularThreshold;

        if (movedLarge) {
          block.state = "falling";
          block.contactFrames = 0;
          block.landingFrames = 0;
          block.stableFrames = 0;
          block.landingStartY = null;
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
    for (const block of blocks) {
      if (block.state === "preview") continue;

      const pos = block.body.translation();
      const radialDistance = Math.hypot(pos.x, pos.z);

      const outOfStage = radialDistance > this.stageRadius + 1;
      const belowStage = pos.y < this.failY;

      if (outOfStage || belowStage) {
        return true;
      }
    }

    return false;
  }
}