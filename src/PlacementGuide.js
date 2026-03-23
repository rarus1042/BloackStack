import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class PlacementGuide {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.stageSize = options.stageSize ?? 5; // 지름
    this.padding = options.padding ?? 0.35;
    this.radius = Math.max(0, this.stageSize / 2 - this.padding);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.createGuide();
    this.createProjectionRay();
  }

  createGuide() {
    const segments = 96;
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(t) * this.radius,
          0,
          Math.sin(t) * this.radius
        )
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffff66,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false,
    });

    this.border = new THREE.Line(geometry, material);
    this.border.renderOrder = 997;
    this.root.add(this.border);

    const fillGeom = new THREE.CircleGeometry(this.radius, 96);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xffff66,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.fill = new THREE.Mesh(fillGeom, fillMat);
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.renderOrder = 996;
    this.root.add(this.fill);

    this.setHeight(0);
  }

  createProjectionRay() {
    this.projectionRoot = new THREE.Group();
    this.projectionRoot.visible = false;
    this.scene.add(this.projectionRoot);

    // 세로 레이 본체
    const beamGeom = new THREE.CylinderGeometry(0.018, 0.032, 1, 14, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffa347,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.projectionBeam = new THREE.Mesh(beamGeom, beamMat);
    this.projectionBeam.renderOrder = 995;
    this.projectionRoot.add(this.projectionBeam);

    // 중심 밝은 라인
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, 0.5, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });

    this.projectionLine = new THREE.Line(lineGeom, lineMat);
    this.projectionLine.renderOrder = 996;
    this.projectionRoot.add(this.projectionLine);

    // 바닥 접점 링
    const ringGeom = new THREE.RingGeometry(0.12, 0.18, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb15a,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.hitRing = new THREE.Mesh(ringGeom, ringMat);
    this.hitRing.rotation.x = -Math.PI / 2;
    this.hitRing.renderOrder = 996;
    this.projectionRoot.add(this.hitRing);

    // 은은한 바닥 글로우
    const glowGeom = new THREE.CircleGeometry(0.22, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff8c2f,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.hitGlow = new THREE.Mesh(glowGeom, glowMat);
    this.hitGlow.rotation.x = -Math.PI / 2;
    this.hitGlow.renderOrder = 994;
    this.projectionRoot.add(this.hitGlow);
  }

  setHeight(y) {
    this.root.position.y = y + 0.02;
  }

  updateProjection(from, to) {
    if (!from || !to) {
      this.hideProjection();
      return;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance <= 1e-4) {
      this.hideProjection();
      return;
    }

    const midX = (from.x + to.x) * 0.5;
    const midY = (from.y + to.y) * 0.5;
    const midZ = (from.z + to.z) * 0.5;

    this.projectionRoot.visible = true;

    this.projectionBeam.position.set(midX, midY, midZ);
    this.projectionBeam.scale.set(1, distance, 1);

    this.projectionLine.position.set(midX, midY, midZ);
    this.projectionLine.scale.set(1, distance, 1);

    this.hitRing.position.set(to.x, to.y + 0.012, to.z);
    this.hitGlow.position.set(to.x, to.y + 0.01, to.z);
  }

  hideProjection() {
    this.projectionRoot.visible = false;
  }

  show() {
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.hideProjection();
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.projectionRoot);

    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    this.projectionRoot.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}