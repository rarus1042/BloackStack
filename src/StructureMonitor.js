export class StructureMonitor {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 5; // 지름
    this.stageRadius = this.stageSize / 2;
    this.failY = options.failY ?? -3;
    this.fallSpeed = options.fallSpeed ?? 0.9;

    this.contactVerticalThreshold = options.contactVerticalThreshold ?? 0.2;
    this.contactHorizontalThreshold = options.contactHorizontalThreshold ?? 0.15;
    this.contactFramesRequired = options.contactFramesRequired ?? 3;

    this.stableLinearThreshold = options.stableLinearThreshold ?? 0.05;
    this.stableAngularThreshold = options.stableAngularThreshold ?? 0.05;
    this.stableFramesRequired = options.stableFramesRequired ?? 24;
  }

  updateDynamicBlocks(blocks) {
    for (const block of blocks) {
      if (block.state !== "falling" && block.state !== "settled") continue;

      const lv = block.body.linvel();
      const av = block.body.angvel();

      const horizontalSpeed = Math.hypot(lv.x, lv.z);
      const verticalSpeed = Math.abs(lv.y);

      if (block.state === "falling") {
        const looksLikeContact =
          verticalSpeed < this.contactVerticalThreshold &&
          horizontalSpeed < this.contactHorizontalThreshold;

        block.contactFrames = looksLikeContact ? block.contactFrames + 1 : 0;

        if (block.contactFrames >= this.contactFramesRequired) {
          block.state = "settled";
          block.stableFrames = 0;
        } else {
          block.body.setLinvel(
            {
              x: lv.x * 0.2,
              y: -this.fallSpeed,
              z: lv.z * 0.2,
            },
            true
          );

          block.body.setAngvel(
            {
              x: av.x * 0.75,
              y: av.y * 0.75,
              z: av.z * 0.75,
            },
            true
          );
        }
      } else if (block.state === "settled") {
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

        const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
        const angularSpeed = Math.hypot(av.x, av.y, av.z);

        const isStableNow =
          linearSpeed < this.stableLinearThreshold &&
          angularSpeed < this.stableAngularThreshold;

        block.stableFrames = isStableNow ? block.stableFrames + 1 : 0;

        if (
          Math.abs(lv.y) > this.contactVerticalThreshold * 2.0 ||
          Math.hypot(lv.x, lv.z) > this.contactHorizontalThreshold * 2.0
        ) {
          block.state = "falling";
          block.contactFrames = 0;
          block.stableFrames = 0;
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

  areAllPlacedBlocksStable(blocks) {
    const activeBlocks = this.getPlacedBlocks(blocks);
    if (activeBlocks.length === 0) return false;

    for (const block of activeBlocks) {
      const lv = block.body.linvel();
      const av = block.body.angvel();

      const linearSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angularSpeed = Math.hypot(av.x, av.y, av.z);

      if (
        linearSpeed >= this.stableLinearThreshold ||
        angularSpeed >= this.stableAngularThreshold
      ) {
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