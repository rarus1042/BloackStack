import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js";

export class Renderer {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 5;
    this.stageRadius = this.stageSize / 2;
    this.groundHeight = options.groundHeight ?? 0.5;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      300
    );
    this.camera.position.set(6, 6, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(this.renderer.domElement);

    // 모바일 브라우저 기본 터치 제스처 간섭 방지
    this.renderer.domElement.style.touchAction = "none";

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);

    const stageGeometry = new THREE.CylinderGeometry(
      this.stageRadius,
      this.stageRadius,
      this.groundHeight,
      64
    );
    const stageMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });

    this.stageMesh = new THREE.Mesh(stageGeometry, stageMaterial);
    this.stageMesh.position.set(0, -this.groundHeight / 2, 0);
    this.scene.add(this.stageMesh);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);

    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.0;

    this.controls.enableRotate = true;
    this.controls.rotateSpeed = 0.8;

    this.controls.enablePan = false;

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.autoTargetY = 0;

    window.addEventListener("resize", () => {
      this.resize(window.innerWidth, window.innerHeight);
    });

    this.renderer.domElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  updateCamera(height) {
    this.autoTargetY = Math.max(0, height * 0.4);
  }

  resetCamera() {
    this.camera.position.set(6, 6, 6);
    this.controls.target.set(0, 0, 0);
    this.autoTargetY = 0;
    this.controls.update();
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  update() {
    this.controls.target.y += (this.autoTargetY - this.controls.target.y) * 0.06;
    this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

console.log("Renderer module loaded");