import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js";

export class Renderer {
  constructor(options = {}) {
    this.stageSize = options.stageSize ?? 10;
    this.stageHalf = this.stageSize / 2;
    this.groundHeight = options.groundHeight ?? 0.12;
    this.stageThickness = options.stageThickness ?? 0.16;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8d8);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      3000
    );

    this.camera.position.set(8, 16, 20);

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
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.screenSpacePanning = false;

    this.cameraZoomLerp = options.cameraZoomLerp ?? 0.22;
    this.cameraZoomWheelStep = options.cameraZoomWheelStep ?? 1.2;
    this.cameraMinDistance = options.cameraMinDistance ?? 4.5;
    this.cameraMaxDistance = options.cameraMaxDistance ?? 150;

    this.cameraFollowLerp = options.cameraFollowLerp ?? 0.12;
    this.cameraHeightOffset = options.cameraHeightOffset ?? 0.25;
    this.cameraMinTargetY = options.cameraMinTargetY ?? 0.85;
    this.heightStep = options.heightStep ?? 0.5;

    this.defaultCameraPosition = new THREE.Vector3(8.4, 6.4, 8.4);
    this.defaultTarget = new THREE.Vector3(0, this.cameraMinTargetY, 0);
    this.controls.target.copy(this.defaultTarget);

    this.cameraBaseOffset = this.defaultCameraPosition.clone().sub(this.defaultTarget);

    this.trackedHeightStep = 0;
    this.cameraTrackedHeight = 0;
    this.cameraHeightDeadZone = options.cameraHeightDeadZone ?? 0.18;

    this.cameraPositionFollowLerp = options.cameraPositionFollowLerp ?? 0.085;
    this.cameraPositionHeightDeadZone = options.cameraPositionHeightDeadZone ?? 0.75;
    this.cameraMinPositionY = this.defaultCameraPosition.y;
    this.cameraPositionYOffset = options.cameraPositionYOffset ?? 5.6;

    this.cameraCurrentMode = "follow";
    this.cameraFailLerp = options.cameraFailLerp ?? 0.06;
    this.cameraFollowMinDistance = options.cameraFollowMinDistance ?? 8.4;
    this.cameraFailDistanceMultiplier = options.cameraFailDistanceMultiplier ?? 2.5;
    this.cameraFailHeightPadding = options.cameraFailHeightPadding ?? 7.5;

    this.targetZoomDistance = this.camera.position.distanceTo(this.controls.target);
    this.currentZoomDistance = this.targetZoomDistance;
    this.lastCameraDistance = this.targetZoomDistance;

    this.cameraAutoFollowSuspendMs = options.cameraAutoFollowSuspendMs ?? 280;
    this.lastManualCameraInputTime = -Infinity;
    this.isUserOrbiting = false;
    this.isUserZooming = false;

    this.onManualWheelZoom = (event) => {
      event.preventDefault();

      const direction = Math.sign(event.deltaY);
      if (direction === 0) return;

      const zoomStep = this.cameraZoomWheelStep;
      const nextDistance =
        this.targetZoomDistance + (direction > 0 ? zoomStep : -zoomStep);

      this.targetZoomDistance = THREE.MathUtils.clamp(
        nextDistance,
        this.cameraMinDistance,
        this.cameraMaxDistance
      );

      this.isUserZooming = true;
      this.lastManualCameraInputTime = performance.now();
    };

    this.renderer.domElement.addEventListener("wheel", this.onManualWheelZoom, {
      passive: false,
    });

    this.onControlsStart = () => {
      this.isUserOrbiting = true;
      this.lastManualCameraInputTime = performance.now();
    };

    this.onControlsEnd = () => {
      this.isUserOrbiting = false;
      this.lastManualCameraInputTime = performance.now();
    };

    this.onControlsChange = () => {
      const now = performance.now();
      const currentDistance = this.camera.position.distanceTo(this.controls.target);

      if (Math.abs(currentDistance - this.lastCameraDistance) > 1e-4) {
        this.isUserZooming = true;
      }

      this.lastCameraDistance = currentDistance;
      this.lastManualCameraInputTime = now;
    };

    this.controls.addEventListener("start", this.onControlsStart);
    this.controls.addEventListener("end", this.onControlsEnd);
    this.controls.addEventListener("change", this.onControlsChange);

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

          const repeat = Math.max(10, Math.round(this.stageSize * 3));
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
            () => {
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
    this.directionalLight.shadow.camera.left = -18;
    this.directionalLight.shadow.camera.right = 18;
    this.directionalLight.shadow.camera.top = 18;
    this.directionalLight.shadow.camera.bottom = -18;
    this.directionalLight.shadow.bias = -0.00015;

    this.scene.add(this.directionalLight);
  }

  setupStage() {
    const size = this.stageSize;
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

    const groundGeometry = new THREE.BoxGeometry(size, thickness, size);

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
      bottomMaterial,
      topMaterial,
      topMaterial,
      topMaterial,
      topMaterial,
    ]);

    this.groundMesh.position.set(0, centerY, 0);
    this.groundMesh.receiveShadow = true;
    this.groundMesh.castShadow = false;
    this.scene.add(this.groundMesh);

    const edgeGeom = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(size, thickness + 0.01, size)
    );
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xf2f5ea,
      transparent: true,
      opacity: 0.9,
    });

    this.rimMesh = new THREE.LineSegments(edgeGeom, edgeMat);
    this.rimMesh.position.set(0, centerY, 0);
    this.scene.add(this.rimMesh);
  }

  quantizeHeightStep(height) {
    const step = this.heightStep ?? 0.5;
    if (step <= 0) return height;
    return Math.floor(height / step) * step;
  }

  updateCamera(height = 0) {
    const desiredHeight = Math.max(0, height);

    if (desiredHeight > this.cameraTrackedHeight + this.cameraHeightDeadZone) {
      this.cameraTrackedHeight = desiredHeight;
    }

    const targetY = Math.max(
      this.cameraMinTargetY,
      this.cameraTrackedHeight + this.cameraHeightOffset
    );

    this.controls.target.y = THREE.MathUtils.lerp(
      this.controls.target.y,
      targetY,
      this.cameraFollowLerp
    );

    const desiredCameraY = Math.max(
      this.cameraMinPositionY,
      this.cameraTrackedHeight + this.cameraPositionYOffset
    );

    if (desiredCameraY > this.camera.position.y + this.cameraPositionHeightDeadZone) {
      this.camera.position.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        desiredCameraY,
        this.cameraPositionFollowLerp
      );
    }
  }

  resetCamera() {
    this.trackedHeightStep = 0;
    this.cameraTrackedHeight = 0;
    this.isUserOrbiting = false;
    this.isUserZooming = false;
    this.lastManualCameraInputTime = -Infinity;

    this.camera.position.copy(this.defaultCameraPosition);
    this.controls.target.copy(this.defaultTarget);

    this.currentZoomDistance = this.camera.position.distanceTo(this.controls.target);
    this.targetZoomDistance = this.currentZoomDistance;
    this.lastCameraDistance = this.currentZoomDistance;

    this.controls.update();
  }

  updateFailureCamera(bounds, dt = 0.016) {
    if (!bounds) return;

    const min = bounds.min;
    const max = bounds.max;
    const center = bounds.center;

    const sizeX = Math.max(1, max.x - min.x);
    const sizeY = Math.max(1, max.y - min.y);
    const sizeZ = Math.max(1, max.z - min.z);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(0.35, this.camera.aspect || 1);

    const fitHeightDistance = (sizeY * 0.5) / Math.tan(fovRad * 0.5);
    const fitWidthDistance = ((sizeX * 0.5) / Math.tan(fovRad * 0.5)) / aspect;

    const footprint = Math.max(sizeX, sizeZ);
    const diagonal = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);

    const baseDistance = Math.max(
      14,
      fitHeightDistance,
      fitWidthDistance,
      sizeZ * 1.2,
      footprint * 1.0,
      diagonal * 0.72
    );

    const heightBackoff = sizeY * 1.35;
    const footprintBackoff = footprint * 0.45;

    const desiredDistance =
      baseDistance + heightBackoff + footprintBackoff + this.cameraFailHeightPadding;

    const desiredTarget = new THREE.Vector3(
      center.x,
      min.y + sizeY * 0.5,
      center.z
    );

    const desiredCameraY =
      min.y + sizeY * 0.82 + Math.max(3.2, sizeY * 0.28);

    const desiredCamera = new THREE.Vector3(
      center.x,
      desiredCameraY,
      center.z + desiredDistance
    );

    const t =
      1 - Math.pow(1 - (this.cameraFailLerp ?? 0.06), Math.max(1, dt * 60));

    this.controls.target.lerp(desiredTarget, t);
    this.camera.position.lerp(desiredCamera, t);
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

    this.scene.add(root);

    this.landingEffects.push({
      root,
      ring,
      glow,
      elapsed: 0,
      duration: 0.42,
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

      if (t >= 1) {
        this.scene.remove(fx.root);
        fx.root.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) obj.material.dispose?.();
        });
        this.landingEffects.splice(i, 1);
      }
    }
  }

  update(dt = 0.016) {
    this.controls.update();

    const offset = this.camera.position.clone().sub(this.controls.target);
    const offsetLengthSq = offset.lengthSq();

    if (offsetLengthSq > 1e-8) {
      const lookDir = offset.normalize();

      this.currentZoomDistance = THREE.MathUtils.lerp(
        this.currentZoomDistance,
        this.targetZoomDistance,
        this.cameraZoomLerp ?? 0.22
      );

      this.camera.position.copy(
        this.controls.target.clone().add(lookDir.multiplyScalar(this.currentZoomDistance))
      );

      this.lastCameraDistance = this.currentZoomDistance;
    }

    if (
      !this.isUserOrbiting &&
      performance.now() - this.lastManualCameraInputTime >= this.cameraAutoFollowSuspendMs
    ) {
      if (Math.abs(this.currentZoomDistance - this.targetZoomDistance) < 0.01) {
        this.isUserZooming = false;
      }
    }

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