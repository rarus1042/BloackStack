import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class GizmoController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.blockSize = options.blockSize ?? 1;

    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.renderOrder = 999;
    this.scene.add(this.root);

    this.handles = {};
    this.materials = {};

    this.ringRadius = this.blockSize * 0.95;
    this.ringTube = Math.max(0.08, this.blockSize * 0.08);

    this.createHandles();
    this.setActiveAxis(null);
  }

  createRing(axis, color, rotation) {
    const geometry = new THREE.TorusGeometry(
      this.ringRadius,
      this.ringTube,
      16,
      64
    );

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.userData.axis = axis;
    mesh.renderOrder = 999;

    this.root.add(mesh);
    this.handles[axis] = mesh;
    this.materials[axis] = material;
  }

  createAxisLine(axis, color, dir) {
    const points = [
      dir.clone().multiplyScalar(0.15),
      dir.clone().multiplyScalar(this.ringRadius + 0.18),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;
    this.root.add(line);
  }

  createHandles() {
    this.createRing("x", 0xff4d4d, new THREE.Euler(0, Math.PI / 2, 0));
    this.createRing("y", 0x55ff55, new THREE.Euler(Math.PI / 2, 0, 0));
    this.createRing("z", 0x4d7dff, new THREE.Euler(0, 0, 0));

    this.createAxisLine("x", 0xff4d4d, new THREE.Vector3(1, 0, 0));
    this.createAxisLine("y", 0x55ff55, new THREE.Vector3(0, 1, 0));
    this.createAxisLine("z", 0x4d7dff, new THREE.Vector3(0, 0, 1));
  }

  show() {
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.setActiveAxis(null);
  }

  syncToBlock(block) {
    if (!block?.mesh) return;
    this.root.position.copy(block.mesh.position);
    this.root.quaternion.copy(block.mesh.quaternion);
  }

  pickAxis(raycaster) {
    const objects = Object.values(this.handles);
    const hits = raycaster.intersectObjects(objects, false);
    if (!hits.length) return null;

    const hit = hits[0];
    return {
      axis: hit.object.userData.axis ?? null,
      point: hit.point.clone(),
      object: hit.object,
      distance: hit.distance,
    };
  }

  setActiveAxis(axis) {
    for (const key of Object.keys(this.materials)) {
      const mat = this.materials[key];
      mat.opacity = key === axis ? 1.0 : 0.65;
    }
  }

  dispose() {
    this.scene.remove(this.root);

    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}