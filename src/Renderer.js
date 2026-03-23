import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js";

export class Renderer {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 3;
    this.stageRadius = this.stageSize / 2;
    this.groundHeight = options.groundHeight ?? 0.12;
    this.stageThickness = options.stageThickness ?? 0.16;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8d8);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(6.6, 5.1, 6.6);

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

    this.cameraFollowLerp = options.cameraFollowLerp ?? 0.12;
    this.cameraHeightOffset = options.cameraHeightOffset ?? 0.18;
    this.cameraMinTargetY = options.cameraMinTargetY ?? 0.75;
    this.heightStep = options.heightStep ?? 0.5;

    this.defaultCameraPosition = new THREE.Vector3(6.6, 5.1, 6.6);
    this.defaultTarget = new THREE.Vector3(0, this.cameraMinTargetY, 0);
    this.controls.target.copy(this.defaultTarget);

    this.trackedHeightStep = 0;

    this.groundMesh = null;
    this.rimMesh = null;
    this.backgroundTexture = null;
    this.grassTexture = null;

    this.setupLights();
    this.setupFog();
    this.setupStage();
  }

  async init() {
await Promise.allSettled([
  this.loadSkyBackground("./assets/sky_36_2k.png"),
  this.loadGrassTexture(
    "./assets/grass.png",
    "./assets/grass_normal.png"
  ),
]);

    this.setupStage();
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
async loadGrassTexture(path, normalPath) {
  const loader = new THREE.TextureLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (colorTex) => {
        colorTex.encoding = THREE.sRGBEncoding;
        colorTex.wrapS = THREE.RepeatWrapping;
        colorTex.wrapT = THREE.RepeatWrapping;

        const repeat = Math.max(2, Math.round(this.stageSize * 1.5));
        colorTex.repeat.set(repeat, repeat);

        loader.load(
          normalPath,
          (normalTex) => {
            normalTex.wrapS = THREE.RepeatWrapping;
            normalTex.wrapT = THREE.RepeatWrapping;
            normalTex.repeat.copy(colorTex.repeat);

            this.grassTexture = colorTex;
            this.grassNormal = normalTex;

            resolve();
          },
          undefined,
          () => {
            console.warn("Normal map load failed");
            this.grassTexture = colorTex;
            resolve();
          }
        );
      },
      undefined,
      reject
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

      if (Array.isArray(this.groundMesh.material)) {
        this.groundMesh.material.forEach((mat) => mat.dispose());
      } else {
        this.groundMesh.material.dispose();
      }

      this.groundMesh.geometry.dispose();
      this.groundMesh = null;
    }

    if (this.rimMesh) {
      this.scene.remove(this.rimMesh);
      this.rimMesh.geometry.dispose();
      this.rimMesh.material.dispose();
      this.rimMesh = null;
    }

    const groundGeometry = new THREE.CylinderGeometry(radius, radius, thickness, 64);

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x6c8f45,
      roughness: 0.96,
      metalness: 0.0,
    });

const topMaterial = this.grassTexture
  ? new THREE.MeshStandardMaterial({
      map: this.grassTexture,
      normalMap: this.grassNormal,   // ⭐ 핵심
      normalScale: new THREE.Vector2(0.8, 0.8), // 강도 조절
      roughness: 1.0,
      metalness: 0.0,
    })
  : new THREE.MeshStandardMaterial({
      color: 0x63a84a,
      roughness: 1.0,
      metalness: 0.0,
    });
    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: 0x5b6a4a,
      roughness: 0.98,
      metalness: 0.0,
    });

    this.groundMesh = new THREE.Mesh(groundGeometry, [
      sideMaterial,
      topMaterial,
      bottomMaterial,
    ]);

    this.groundMesh.position.set(0, centerY, 0);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.castShadow = false;
    this.scene.add(this.groundMesh);

    const rimGeometry = new THREE.TorusGeometry(radius, 0.025, 16, 100);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8e0d2,
      roughness: 0.82,
      metalness: 0.03,
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

  quantizeHeightStep(height) {
    const step = this.heightStep ?? 0.5;
    if (step <= 0) return height;
    return Math.floor(height / step) * step;
  }

  updateCamera(height = 0) {
    const steppedHeight = this.quantizeHeightStep(height);

    if (steppedHeight > this.trackedHeightStep) {
      this.trackedHeightStep = steppedHeight;
    }

    const targetY = Math.max(
      this.cameraMinTargetY,
      this.trackedHeightStep + this.cameraHeightOffset
    );

    this.controls.target.y = THREE.MathUtils.lerp(
      this.controls.target.y,
      targetY,
      this.cameraFollowLerp
    );
  }

  resetCamera() {
    this.trackedHeightStep = 0;
    this.camera.position.copy(this.defaultCameraPosition);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
  }

  update() {
    this.controls.update();
  }

  render() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.camera);
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

  resize() {
    this.onResize();
  }
}