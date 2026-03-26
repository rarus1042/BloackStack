import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class GizmoController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.blockSize = options.blockSize ?? 1;

    this.axisColors = {
      x: 0xff5555,
      y: 0x55ff88,
      z: 0x5599ff,
    };

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.axisMeshes = {};
    this.activeAxis = null;

    this.tmpBox = new THREE.Box3();
    this.tmpSize = new THREE.Vector3();
    this.tmpCenter = new THREE.Vector3();

    this.defaultRadius = this.blockSize * 1.75;
    this.currentRadius = this.defaultRadius;
    this.depth = Math.max(0.08, this.blockSize * 0.16);

    this.createGizmos();
    this.hide();
  }

 createArrowArcShape(radius) {
  const startAngle = Math.PI * 0.30;
  const endAngle = Math.PI * 1.78;

  const bandWidth = Math.max(radius * 0.22, 0.26);
  const outerR = radius + bandWidth * 0.5;
  const innerR = Math.max(0.001, radius - bandWidth * 0.5);

  const shape = new THREE.Shape();

  // 바깥 호
  shape.absarc(0, 0, outerR, startAngle, endAngle, false);

  // 끝을 둥글게 이어서 안쪽 호로 복귀
  const endOuterX = Math.cos(endAngle) * outerR;
  const endOuterY = Math.sin(endAngle) * outerR;
  const endInnerX = Math.cos(endAngle) * innerR;
  const endInnerY = Math.sin(endAngle) * innerR;

  const startInnerX = Math.cos(startAngle) * innerR;
  const startInnerY = Math.sin(startAngle) * innerR;

  shape.lineTo(endInnerX, endInnerY);

  // 안쪽 호
  shape.absarc(0, 0, innerR, endAngle, startAngle, true);

  // 시작점 닫기
  shape.lineTo(Math.cos(startAngle) * outerR, Math.sin(startAngle) * outerR);
  shape.closePath();

  return shape;
}

 createArrowArcMesh(color, radius) {
  const shape = this.createArrowArcShape(radius);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: this.depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: this.depth * 0.18,
    bevelThickness: this.depth * 0.22,
    curveSegments: 96,
  });

  geometry.center();

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.42,
    roughness: 0.24,
    transparent: true,
    opacity: 0.96,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

  orientAxisGroup(group, axis) {
    group.rotation.set(0, 0, 0);

    if (axis === "x") {
      group.rotation.y = Math.PI / 2;
      group.rotation.z = Math.PI / 2;
    } else if (axis === "y") {
      group.rotation.x = -Math.PI / 2;
    } else if (axis === "z") {
      group.rotation.z = 0;
    }
  }

  createAxisGizmo(axis, color, radius) {
    const group = new THREE.Group();
    group.userData.axis = axis;

    const arrowArc = this.createArrowArcMesh(color, radius);
    group.add(arrowArc);

    this.orientAxisGroup(group, axis);
    return group;
  }

  createGizmos() {
    for (const axis of ["x", "y", "z"]) {
      const gizmo = this.createAxisGizmo(axis, this.axisColors[axis], this.defaultRadius);
      this.root.add(gizmo);
      this.axisMeshes[axis] = gizmo;
    }
  }

  disposeAxisGroup(group) {
    if (!group) return;

    group.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  rebuildForRadius(radius) {
    this.currentRadius = Math.max(this.blockSize * 0.9, radius);

    for (const axis of ["x", "y", "z"]) {
      const oldGroup = this.axisMeshes[axis];
      const wasVisible = oldGroup?.visible ?? true;

      if (oldGroup) {
        this.root.remove(oldGroup);
        this.disposeAxisGroup(oldGroup);
      }

      const newGroup = this.createAxisGizmo(
        axis,
        this.axisColors[axis],
        this.currentRadius
      );
      newGroup.visible = wasVisible;
      this.root.add(newGroup);
      this.axisMeshes[axis] = newGroup;
    }

    if (this.activeAxis) {
      this.setActiveAxis(this.activeAxis);
    }
  }

  computeBlockVisualCenter(block) {
    if (!block?.mesh) return null;

    this.tmpBox.setFromObject(block.mesh);

    if (this.tmpBox.isEmpty()) {
      return block.mesh.position.clone();
    }

    this.tmpBox.getCenter(this.tmpCenter);
    return this.tmpCenter.clone();
  }

  computeBlockVisualRadius(block) {
    if (!block?.mesh) return this.defaultRadius;

    this.tmpBox.setFromObject(block.mesh);
    if (this.tmpBox.isEmpty()) {
      return this.defaultRadius;
    }

    this.tmpBox.getSize(this.tmpSize);

    const halfX = this.tmpSize.x * 0.5;
    const halfY = this.tmpSize.y * 0.5;
    const halfZ = this.tmpSize.z * 0.5;

    const enclosingRadius = Math.max(
      Math.hypot(halfY, halfZ),
      Math.hypot(halfX, halfZ),
      Math.hypot(halfX, halfY)
    );

    return Math.max(this.blockSize * 1.2, enclosingRadius + this.blockSize * 0.55);
  }

  syncToBlock(block) {
    if (!block?.mesh) return;

    const visualCenter = this.computeBlockVisualCenter(block);
    if (!visualCenter) return;

    const desiredRadius = this.computeBlockVisualRadius(block);
    if (Math.abs(desiredRadius - this.currentRadius) > 0.08) {
      this.rebuildForRadius(desiredRadius);
    }

    // 블럭 실제 중심점 기준
    this.root.position.copy(visualCenter);

    // 블럭 회전에 같이 따라감
    this.root.quaternion.copy(block.mesh.quaternion);
  }

  show() {
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.activeAxis = null;
  }

  setActiveAxis(axis) {
    this.activeAxis = axis;

    for (const [key, mesh] of Object.entries(this.axisMeshes)) {
      const isActive = key === axis;

      mesh.scale.setScalar(isActive ? 1.14 : 1.0);

      mesh.traverse((child) => {
        if (!child.material) return;

        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.opacity = isActive ? 1.0 : 0.22;
            mat.transparent = true;
          });
        } else {
          child.material.opacity = isActive ? 1.0 : 0.22;
          child.material.transparent = true;
        }
      });
    }
  }

  lockToAxis(axis) {
    for (const [key, mesh] of Object.entries(this.axisMeshes)) {
      mesh.visible = key === axis;
    }
  }

  unlockAxis() {
    for (const mesh of Object.values(this.axisMeshes)) {
      mesh.visible = true;
    }
  }
}