import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js";

export class Renderer {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 3;
    this.stageRadius = this.stageSize / 2;

    // 스테이지 윗면 높이
    this.groundHeight = options.groundHeight ?? 0.12;

    // 스테이지 두께
    this.stageThickness = options.stageThickness ?? 0.16;

    this.scene = new THREE.Scene();

    // background 로딩 전 보험용 하늘색
    this.scene.background = new THREE.Color(0x87b8d8);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(8, 7, 8);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x87b8d8, 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;

    // 캔버스가 화면 전체를 정확히 덮도록 강제
    const canvas = this.renderer.domElement;
    canvas.style.position = "fixed";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    canvas.style.display = "block";
    canvas.style.zIndex = "0";

    document.documentElement.style.margin = "0";
    document.documentElement.style.width = "100%";
    document.documentElement.style.height = "100%";

    document.body.style.margin = "0";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.overflow = "hidden";

    document.body.appendChild(canvas);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, this.groundHeight + 1.0, 0);

    this.groundMesh = null;
    this.rimMesh = null;
    this.backgroundTexture = null;

    this.setupLights();
    this.setupFog();
    this.setupStage();
  }

  async init() {
    await this.loadSkyBackground("./assets/sky_36_2k.png");
    this.onResize();
  }

  async loadSkyBackground(path) {
    const loader = new THREE.TextureLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        path,
        (texture) => {
          texture.encoding = THREE.sRGBEncoding;
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.needsUpdate = true;

          this.backgroundTexture = texture;
          this.scene.background = texture;

          resolve(texture);
        },
        undefined,
        (error) => {
          console.warn("Sky background load failed:", error);
          reject(error);
        }
      );
    });
  }

  setupFog() {
    this.scene.fog = new THREE.Fog(0x9fc6e3, 45, 120);
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.05);
    this.directionalLight.position.set(8, 14, 10);
    this.directionalLight.castShadow = true;

    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 60;
    this.directionalLight.shadow.camera.left = -15;
    this.directionalLight.shadow.camera.right = 15;
    this.directionalLight.shadow.camera.top = 15;
    this.directionalLight.shadow.camera.bottom = -15;

    this.scene.add(this.directionalLight);
  }

  setupStage() {
    const radius = this.stageRadius;
    const thickness = this.stageThickness;
    const topY = this.groundHeight;
    const centerY = topY - thickness / 2;

    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      this.groundMesh.material.dispose();
      this.groundMesh = null;
    }

    if (this.rimMesh) {
      this.scene.remove(this.rimMesh);
      this.rimMesh.geometry.dispose();
      this.rimMesh.material.dispose();
      this.rimMesh = null;
    }

    const groundGeometry = new THREE.CylinderGeometry(radius, radius, thickness, 64);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2f4f7,
      roughness: 0.94,
      metalness: 0.02,
    });

    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.position.set(0, centerY, 0);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.castShadow = false;
    this.scene.add(this.groundMesh);

    const rimGeometry = new THREE.TorusGeometry(radius, 0.025, 16, 100);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.85,
      metalness: 0.04,
    });

    this.rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    this.rimMesh.rotation.x = Math.PI / 2;
    this.rimMesh.position.y = topY + 0.002;
    this.scene.add(this.rimMesh);
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  render() {
    this.controls.update();

    // 혹시 다른 코드에서 scissor/viewport 건드렸어도 매 프레임 복구
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);

    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(height = 0) {
    const targetY = Math.max(this.groundHeight + 1.0, height * 0.35 + this.groundHeight + 1.0);
    this.controls.target.y += (targetY - this.controls.target.y) * 0.08;
  }

  updateCameraTarget(height = 0) {
    this.updateCamera(height);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
  }
}