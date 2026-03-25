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

    // 모바일 터치 입력 안정화
    canvas.style.touchAction = "none";
    canvas.style.webkitTouchCallout = "none";
    canvas.style.webkitTapHighlightColor = "transparent";
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";

    document.documentElement.style.margin = "0";
    document.documentElement.style.width = "100%";
    document.documentElement.style.height = "100%";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";

    document.body.style.margin = "0";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

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
    this.grassNormal = null;
   this.landingEffects = [];
    this.setupLights();
    this.setupFog();
    this.setupStage();

    window.addEventListener("resize", () => this.onResize());
  }

  async init() {
    await Promise.allSettled([
      this.loadSkyBackground("./assets/sky_36_2k.png"),
      this.loadGrassTexture("./assets/grass.png", "./assets/grass_normal.png"),
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

          // 모바일 터치/프레임 안정성을 위해 environment는 일단 비활성
          // 필요하면 나중에 옵션으로 다시 켜도 됨
          this.scene.environment = null;

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

  async loadGrassTexture(colorPath, normalPath) {
    const loader = new THREE.TextureLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        colorPath,
        (colorTex) => {
          colorTex.encoding = THREE.sRGBEncoding;
          colorTex.wrapS = THREE.RepeatWrapping;
          colorTex.wrapT = THREE.RepeatWrapping;

          const repeat = Math.max(10, Math.round(this.stageSize * 4));
          colorTex.repeat.set(repeat, repeat);

          const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy
            ? this.renderer.capabilities.getMaxAnisotropy()
            : 1;

          colorTex.anisotropy = Math.min(16, maxAnisotropy);
          colorTex.needsUpdate = true;

          loader.load(
            normalPath,
            (normalTex) => {
              normalTex.wrapS = THREE.RepeatWrapping;
              normalTex.wrapT = THREE.RepeatWrapping;
              normalTex.repeat.copy(colorTex.repeat);
              normalTex.anisotropy = colorTex.anisotropy;
              normalTex.needsUpdate = true;

              this.grassTexture = colorTex;
              this.grassNormal = normalTex;
              resolve();
            },
            undefined,
            (error) => {
              console.warn("Grass normal load failed:", error);
              this.grassTexture = colorTex;
              this.grassNormal = null;
              resolve();
            }
          );
        },
        undefined,
        (error) => {
          console.warn("Grass color load failed:", error);
          reject(error);
        }
      );
    });
  }

  setupFog() {
    this.scene.fog = new THREE.Fog(0x9fc6e3, 45, 120);
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xdff3ff, 0x7ca05a, 0.68);
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.45);
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
    this.directionalLight.shadow.bias = -0.00015;

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

    const groundGeometry = new THREE.CylinderGeometry(radius, radius, thickness, 96);

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x6c8f45,
      roughness: 0.96,
      metalness: 0.0,
    });

const topMaterial = this.grassTexture
  ? new THREE.MeshPhysicalMaterial({
      map: this.grassTexture,
      normalMap: this.grassNormal || null,
      ...(this.grassNormal ? { normalScale: new THREE.Vector2(2.6, 2.6) } : {}),
      roughness: 0.92,
      metalness: 0.0,
      clearcoat: 0.06,
      clearcoatRoughness: 1.0,
      reflectivity: 0.15,
      envMapIntensity: 0.0,
    })
  : new THREE.MeshPhysicalMaterial({
      color: 0x63a84a,
      roughness: 0.95,
      metalness: 0.0,
      clearcoat: 0.04,
      clearcoatRoughness: 1.0,
      reflectivity: 0.1,
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

    const rimGeometry = new THREE.TorusGeometry(radius, 0.025, 20, 120);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2f5ea,
      roughness: 0.72,
      metalness: 0.02,
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

    spawnLandingEffect(position, options = {}) {
    const radius = options.radius ?? 0.48;
    const color = options.color ?? 0xffd07a;

    const root = new THREE.Group();
    root.position.copy(position);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.55, radius * 0.78, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.7, 36),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.005;
    root.add(glow);

    const particles = [];
    const particleMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        particleMat.clone()
      );

      const angle = (i / 8) * Math.PI * 2;
      const speed = radius * (1.1 + Math.random() * 0.45);

      p.position.set(Math.cos(angle) * radius * 0.18, 0.04, Math.sin(angle) * radius * 0.18);
      p.userData.vx = Math.cos(angle) * speed;
      p.userData.vz = Math.sin(angle) * speed;
      p.userData.vy = 0.85 + Math.random() * 0.35;

      root.add(p);
      particles.push(p);
    }

    this.scene.add(root);

    this.landingEffects.push({
      root,
      ring,
      glow,
      particles,
      elapsed: 0,
      duration: 0.42,
      baseRadius: radius,
    });
  }

  updateLandingEffects(dt) {
    if (!this.landingEffects.length) return;

    for (let i = this.landingEffects.length - 1; i >= 0; i--) {
      const fx = this.landingEffects[i];
      fx.elapsed += dt;

      const t = Math.min(1, fx.elapsed / fx.duration);
      const inv = 1 - t;

      fx.ring.scale.setScalar(1 + t * 1.35);
      fx.glow.scale.setScalar(1 + t * 1.8);

      fx.ring.material.opacity = 0.72 * inv;
      fx.glow.material.opacity = 0.16 * inv;

      for (const p of fx.particles) {
        p.position.x += p.userData.vx * dt;
        p.position.z += p.userData.vz * dt;
        p.position.y += p.userData.vy * dt;
        p.userData.vy -= 2.8 * dt;
        p.material.opacity = 0.85 * inv;
        p.scale.setScalar(0.75 + inv * 0.75);
      }

      if (t >= 1) {
        this.scene.remove(fx.root);
        fx.root.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.landingEffects.splice(i, 1);
      }
    }
  }
  
  update(dt = 0.016) {
    this.controls.update();
    this.updateLandingEffects(dt);
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