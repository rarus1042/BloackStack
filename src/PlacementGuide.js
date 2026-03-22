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

  setHeight(y) {
    this.root.position.y = y + 0.02;
  }

  show() {
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}