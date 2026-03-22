import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js";

export class Renderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(6, 6, 6);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

this.controls = new OrbitControls(this.camera, this.renderer.domElement);

this.controls.target.set(0, 0, 0);
this.controls.enableDamping = true;
this.controls.dampingFactor = 0.05;

// 🔥 핵심: 좌클릭 비활성화, 우클릭 회전
this.controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};

// 우클릭 메뉴 방지 (중요)
this.renderer.domElement.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

this.controls.enablePan = false;
this.controls.minDistance = 4;
this.controls.maxDistance = 18;
this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

this.controls.update();

    this.setupLights();
    this.setupGround();
  }

  setupLights() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
  }

  setupGround() {
    const groundGeometry = new THREE.BoxGeometry(5, 0.5, 5);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.position.set(0, -0.25, 0);
    this.scene.add(groundMesh);
  }

  update() {
    this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}