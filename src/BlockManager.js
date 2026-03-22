import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

export class BlockManager {
  constructor(scene, world, onFail) {
    this.scene = scene;
    this.world = world;
    this.onFail = onFail;

    this.blocks = [];
    this.currentBlock = null;

    this.state = "IDLE";
    this.stageSize = 5;
    this.moveRange = 2.0;
    this.moveSpeed = 2.0;
    this.moveTime = 0;
    this.blockSize = 1;
    this.failY = -3;

    this.maxHeight = 0;
  }

  createBlock() {
    const size = this.blockSize;

    const geometry = new THREE.BoxGeometry(size, size, size);

    // 랜덤 색상
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        Math.random() * 0.8 + 0.2,
        Math.random() * 0.8 + 0.2,
        Math.random() * 0.8 + 0.2
      ),
    });

    const mesh = new THREE.Mesh(geometry, material);

    const spawnY = this.getSpawnHeight();
    mesh.position.set(0, spawnY, 0);
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
      position: new CANNON.Vec3(0, spawnY, 0),
    });

    this.world.addBody(body);

    this.currentBlock = {
      mesh,
      body,
      size,
      isLanded: false,
    };

    this.blocks.push(this.currentBlock);

    this.state = "X";
    this.moveTime = 0;
  }

  getSpawnHeight() {
    return Math.max(this.maxHeight + 4, 5);
  }

switchAxis() {
  if (!this.currentBlock) return;
  if (this.state !== "X") return;

  this.state = "Z";
  this.moveTime = 0;
}

dropBlock() {
  if (!this.currentBlock) return;
  if (this.state !== "Z") return;

  this.dropCurrentBlock();
}

  dropCurrentBlock() {
    const block = this.currentBlock;
    if (!block) return;

    this.state = "DROP";

    block.body.mass = 1;
    block.body.type = CANNON.Body.DYNAMIC;
    block.body.updateMassProperties();
    block.body.velocity.set(0, 0, 0);
    block.body.angularVelocity.set(0, 0, 0);
    block.body.wakeUp();

    this.currentBlock = null;

    setTimeout(() => {
      this.createBlock();
    }, 500);
  }

  update(deltaTime) {
    if (this.currentBlock) {
      this.moveTime += deltaTime;

      if (this.state === "X") {
        const x = Math.sin(this.moveTime * this.moveSpeed) * this.moveRange;
        this.currentBlock.mesh.position.x = x;
        this.currentBlock.body.position.x = x;
      } else if (this.state === "Z") {
        const z = Math.sin(this.moveTime * this.moveSpeed) * this.moveRange;
        this.currentBlock.mesh.position.z = z;
        this.currentBlock.body.position.z = z;
      }
    }

    for (const block of this.blocks) {
      block.mesh.position.copy(block.body.position);
      block.mesh.quaternion.copy(block.body.quaternion);
    }

    this.updateLandedState();
    this.updateMaxHeight();
    this.checkFail();
  }

  updateLandedState() {
    for (const block of this.blocks) {
      if (block.isLanded) continue;
      if (block === this.currentBlock) continue;
      if (block.body.mass === 0) continue;

      const speed = block.body.velocity.length();
      const angularSpeed = block.body.angularVelocity.length();

      // 거의 멈춘 상태면 착지 완료로 판정
      if (speed < 0.1 && angularSpeed < 0.1 && block.body.position.y > this.failY) {
        block.isLanded = true;
      }
    }
  }

  updateMaxHeight() {
    let highest = 0;

    for (const block of this.blocks) {
      if (!block.isLanded) continue;

      const topY = block.body.position.y + block.size / 2;
      if (topY > highest) {
        highest = topY;
      }
    }

    this.maxHeight = highest;
  }

  checkFail() {
    for (const block of this.blocks) {
      const x = block.body.position.x;
      const y = block.body.position.y;
      const z = block.body.position.z;

      const outOfStage =
        Math.abs(x) > this.stageSize / 2 + 1 ||
        Math.abs(z) > this.stageSize / 2 + 1;

      const belowStage = y < this.failY;

      if (outOfStage || belowStage) {
        if (this.onFail) {
          this.onFail();
        }
        return;
      }
    }
  }

  reset() {
    for (const block of this.blocks) {
      this.scene.remove(block.mesh);
      this.world.removeBody(block.body);
    }

    this.blocks = [];
    this.currentBlock = null;
    this.state = "IDLE";
    this.moveTime = 0;
    this.maxHeight = 0;
  }

  getMaxHeight() {
    return this.maxHeight;
  }
}