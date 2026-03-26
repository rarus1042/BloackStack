import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class PlacementGuide {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.stageSize = options.stageSize ?? 5;
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
    this.predictionGhostOutline = null;
    this.predictionGhostSourceId = null;

    this.createProjectionRay();
    this.setHeight(0);
  }

  createProjectionRay() {
    const beamGeom = new THREE.CylinderGeometry(0.02, 0.035, 1, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffa347,
      transparent: true,
      opacity: 0.62,
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
      color: 0xffebaf,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });

    this.projectionLine = new THREE.Line(lineGeom, lineMat);
    this.projectionLine.renderOrder = 996;
    this.projectionRoot.add(this.projectionLine);
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
  }

  createPredictionGhost(block) {
    if (!block?.mesh) return null;

    const ghost = block.mesh.clone(true);

    ghost.traverse((child) => {
      if (!child.isMesh) return;

      child.renderOrder = 993;
      child.raycast = () => {};

      if (child.material) {
        const mat = child.material.clone();
        mat.transparent = true;
        mat.opacity = 0.42;
        mat.depthWrite = false;

        if ("emissive" in mat && mat.emissive instanceof THREE.Color) {
          mat.emissive = mat.emissive.clone();
          mat.emissive.set(0xffffff);
          mat.emissiveIntensity = 0.48;
        }

        child.material = mat;
      }
    });

    return ghost;
  }

  createPredictionOutline(block) {
    if (!block?.mesh) return null;

    const outline = block.mesh.clone(true);

    outline.traverse((child) => {
      if (!child.isMesh) return;

      child.renderOrder = 992;
      child.raycast = () => {};
      child.scale.multiplyScalar(1.04);
      child.material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        depthWrite: false,
      });
    });

    return outline;
  }

  ensurePredictionGhost(block) {
    const sourceId = block?.mesh?.uuid ?? null;

    if (!sourceId) {
      this.hidePredictionGhost();
      return;
    }

    if (this.predictionGhost && this.predictionGhostSourceId === sourceId) {
      return;
    }

    this.clearPredictionGhost();

    this.predictionGhost = this.createPredictionGhost(block);
    this.predictionGhostOutline = this.createPredictionOutline(block);
    this.predictionGhostSourceId = sourceId;

    if (this.predictionGhost) {
      this.predictionRoot.add(this.predictionGhost);
    }

    if (this.predictionGhostOutline) {
      this.predictionRoot.add(this.predictionGhostOutline);
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

    if (this.predictionGhostOutline) {
      this.predictionGhostOutline.position.copy(position);
      this.predictionGhostOutline.quaternion.copy(quaternion);
      this.predictionGhostOutline.scale.copy(block.mesh.scale);
    }
  }

  hideProjection() {
    this.projectionRoot.visible = false;
  }

  hidePredictionGhost() {
    this.predictionRoot.visible = false;
  }

  clearPredictionGhost() {
    const disposeNode = (node) => {
      if (!node) return;
      if (node.parent) node.parent.remove(node);
      node.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material?.dispose) child.material.dispose();
      });
    };

    disposeNode(this.predictionGhost);
    disposeNode(this.predictionGhostOutline);

    this.predictionGhost = null;
    this.predictionGhostOutline = null;
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