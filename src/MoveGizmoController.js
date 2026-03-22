import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";

export class MoveGizmoController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.size = options.size ?? 1;

    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.renderOrder = 998;
    this.scene.add(this.root);

    this.handles = {};
    this.materials = {};
    this.hitMeshes = [];

    this.moveAxisScreenDir = new THREE.Vector2(1, 0);
    this.moveStartPointerScreen = new THREE.Vector2();
    this.moveStartBlockPos = new THREE.Vector3();
    this.movePixelsToWorld = options.movePixelsToWorld ?? 0.01;

    this.tempScreenA = new THREE.Vector2();
    this.tempScreenB = new THREE.Vector2();

    this.createHandles();
    this.setActiveAxis(null);
  }

  createArrow(axis, color) {
    const group = new THREE.Group();
    group.userData.axis = axis;

    const shaftGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 12);
    const headGeom = new THREE.ConeGeometry(0.08, 0.18, 16);

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });

    const shaft = new THREE.Mesh(shaftGeom, mat);
    const head = new THREE.Mesh(headGeom, mat);

    shaft.position.y = 0.35;
    head.position.y = 0.82;

    group.add(shaft);
    group.add(head);

    if (axis === "x") group.rotation.z = -Math.PI / 2;
    if (axis === "z") group.rotation.x = Math.PI / 2;

    group.traverse((obj) => {
      obj.userData.axis = axis;
    });

    // 터치용 히트영역 확대
    const hitGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.2, 12);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001,
      depthTest: false,
      depthWrite: false,
    });

    const hitMesh = new THREE.Mesh(hitGeom, hitMat);
    hitMesh.position.y = 0.5;
    hitMesh.userData.axis = axis;

    group.add(hitMesh);
    this.hitMeshes.push(hitMesh);

    this.root.add(group);
    this.handles[axis] = group;
    this.materials[axis] = mat;
  }

  createPlaneHandle() {
    const geom = new THREE.PlaneGeometry(0.45, 0.45);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0.22, 0.02, 0.22);
    mesh.userData.axis = "plane";

    // plane용 터치 확대
    const hitGeom = new THREE.PlaneGeometry(0.8, 0.8);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    const hitMesh = new THREE.Mesh(hitGeom, hitMat);
    hitMesh.rotation.x = -Math.PI / 2;
    hitMesh.position.set(0.22, 0.021, 0.22);
    hitMesh.userData.axis = "plane";

    this.root.add(mesh);
    this.root.add(hitMesh);

    this.handles.plane = mesh;
    this.materials.plane = mat;
    this.hitMeshes.push(hitMesh);
  }

  createHandles() {
    this.createArrow("x", 0xff4d4d);
    this.createArrow("z", 0x4d7dff);
    this.createPlaneHandle();
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
    this.root.quaternion.identity();
  }

  pickHandle(raycaster) {
    const objects = [...this.hitMeshes];

    const hits = raycaster.intersectObjects(objects, false);
    if (!hits.length) return null;

    const hit = hits[0];
    return {
      axis: hit.object.userData.axis ?? null,
      point: hit.point.clone(),
    };
  }

  setActiveAxis(axis) {
    Object.keys(this.materials).forEach((key) => {
      this.materials[key].opacity =
        key === axis ? 1.0 : key === "plane" ? 0.18 : 0.85;
    });
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}