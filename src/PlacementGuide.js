import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class PlacementGuide {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.stageSize = options.stageSize ?? 5; // 지름
    this.padding = options.padding ?? 0.35;
    this.radius = Math.max(0, this.stageSize / 2 - this.padding);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.predictionRoot = new THREE.Group();
    this.predictionRoot.visible = false;
    this.scene.add(this.predictionRoot);

    this.projectionRoot = new THREE.Group();
    this.projectionRoot.visible = false;
    this.scene.add(this.projectionRoot);

    this.predictionGhost = null;
    this.predictionGhostSourceId = null;

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

  createPredictionGhost(block) {
    if (!block?.mesh) return null;

    const ghost = block.mesh.clone(true);

    ghost.traverse((child) => {
      if (!child.isMesh) return;

      child.renderOrder = 993;
      child.raycast = () => {};

      if (child.material) {
        const source = child.material;
        const mat = source.clone();

        mat.transparent = true;
        mat.opacity = 0.22;
        mat.depthWrite = false;
        mat.depthTest = true;

        if (mat.color) {
          mat.color.offsetHSL(0, -0.05, 0.18);
        }

        if (mat.emissive instanceof THREE.Color) {
          mat.emissive = mat.emissive.clone();
          mat.emissive.set(0xffffff);
          mat.emissiveIntensity = 0.18;
        }

        child.material = mat;
      }
    });

    return ghost;
  }

  ensurePredictionGhost(block) {
    const sourceId = block?.mesh?.uuid ?? null;

    if (!sourceId) {
      this.hidePredictionGhost();
      return;
    }

    if (
      this.predictionGhost &&
      this.predictionGhostSourceId === sourceId
    ) {
      return;
    }

    this.clearPredictionGhost();

    this.predictionGhost = this.createPredictionGhost(block);
    this.predictionGhostSourceId = sourceId;

    if (this.predictionGhost) {
      this.predictionRoot.add(this.predictionGhost);
    }
  }

  updatePredictionGhost(block, position, quaternion) {
    if (!block?.mesh || !position || !quaternion) {
      this.hidePredictionGhost();
      return;
    }

    this.ensurePredictionGhost(block);

    if (!this.predictionGhost) {
      this.hidePredictionGhost();
      return;
    }

    this.predictionRoot.visible = true;
    this.predictionGhost.position.copy(position);
    this.predictionGhost.quaternion.copy(quaternion);
    this.predictionGhost.scale.copy(block.mesh.scale);
  }

  hideProjection() {
    this.projectionRoot.visible = false;
  }

  hidePredictionGhost() {
    this.predictionRoot.visible = false;
  }

  clearPredictionGhost() {
    if (!this.predictionGhost) {
      this.predictionGhostSourceId = null;
      return;
    }

    if (this.predictionGhost.parent) {
      this.predictionGhost.parent.remove(this.predictionGhost);
    }

    this.predictionGhost.traverse((child) => {
      if (!child.isMesh) return;
      if (child.material?.dispose) child.material.dispose();
    });

    this.predictionGhost = null;
    this.predictionGhostSourceId = null;
  }

  show() {
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.hideProjection();
    this.hidePredictionGhost();
  }

  dispose() {
    this.clearPredictionGhost();

    this.scene.remove(this.root);
    this.scene.remove(this.projectionRoot);
    this.scene.remove(this.predictionRoot);

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