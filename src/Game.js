import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { Renderer } from "./Renderer.js";
import { Physics } from "./Physics.js";
import { BlockSystem } from "./BlockSystem.js";
import { PlacementController } from "./PlacementController.js";

export class Game {
  constructor() {
    this.config = {
      stageSize: 4,
      groundHeight: 0.01,
      stageThickness: 0.12,
      blockSize: 1,
      previewClampPadding: 0.25,

      fallSpeed: 1.6,

      spawnClearance: 1.9,
      minSpawnHeight: 2.8,

      heightStep: 0.5,

      cameraFollowLerp: 0.12,
      cameraHeightOffset: 0.25,
      cameraMinTargetY: 0.75,
    };

    this.appVersion = "v0.2.0-3d-polycube";

    this.renderer = new Renderer(this.config);
    this.physics = new Physics(this.config);

    this.blockSystem = null;
    this.placementController = null;

    this.nickname = "Player";
    this.bestHeight = 0;
    this.lastTime = 0;
    this.heightStep = this.config.heightStep ?? 0.5;
    this.isGameOver = false;
    this.isRestarting = false;

    this.nicknameLabel = document.getElementById("nicknameLabel");
    this.heightLabel = document.getElementById("heightLabel");
    this.actionButton = document.getElementById("actionButton");
    this.rotateButtonsPanel = null;
    this.rotateButtons = { x: null, y: null, z: null };
        this.hoverRotateAxis = null;
    this.rotationGhost = null;
    this.rotationGhostAxis = null;

    this.axisColorMap = {
      x: "#ff6b6b",
      y: "#6bff95",
      z: "#6ba8ff",
    };

    this.axisVectorMap = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };

      this.onRotateStepButtonClick = this.onRotateStepButtonClick.bind(this);
    this.bestHeightLabel = document.getElementById("bestHeightLabel");
    if (!this.bestHeightLabel && this.heightLabel?.parentElement) {
      this.bestHeightLabel = document.createElement("div");
      this.bestHeightLabel.id = "bestHeightLabel";
      this.bestHeightLabel.style.color = "white";
      this.bestHeightLabel.style.marginTop = "4px";
      this.heightLabel.parentElement.appendChild(this.bestHeightLabel);
    }

    this.versionLabel = document.getElementById("versionLabel");
    if (!this.versionLabel && this.heightLabel?.parentElement) {
      this.versionLabel = document.createElement("div");
      this.versionLabel.id = "versionLabel";
      this.versionLabel.style.color = "rgba(255,255,255,0.7)";
      this.versionLabel.style.marginTop = "4px";
      this.versionLabel.style.fontSize = "13px";
      this.versionLabel.style.letterSpacing = "0.3px";
      this.heightLabel.parentElement.appendChild(this.versionLabel);
    }

    this.nextPanel = null;
    this.nextNameLabel = null;
    this.nextCanvas = null;
    this.nextPreviewCanvasWrap = null;
    this.nextPreviewRenderer = null;
    this.nextPreviewScene = null;
    this.nextPreviewCamera = null;
    this.nextPreviewMesh = null;
    this.nextPreviewKey = "";

    this.bgmEnabled = true;
    this.bgmUnlocked = false;
    this.bgm = new Audio("./assets/bgm.mp3");
    this.bgm.loop = true;
    this.bgm.volume = 0.4;
    this.bgm.preload = "auto";

    this.bgmToggleButton = null;

    this.loadingOverlay = null;
    this.loadingStatusLabel = null;
    this.loadingProgressBar = null;
    this.loadingProgressFill = null;

    this.isLoading = false;
    this.loadingRafId = null;
    this.isAnimating = false;

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
    this.onBgmToggleClick = this.onBgmToggleClick.bind(this);
    this.unlockBgm = this.unlockBgm.bind(this);
    this.loadingLoop = this.loadingLoop.bind(this);

    this.createLoadingScreen();
    this.createBgmToggleButton();
    this.createRotateStepButtons();
    this.createNextPreviewUI();
    this.setupBgmUnlock();
  }

  getNextPreviewLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (w <= 420) {
      return {
        panelTop: 64,
        panelRight: 10,
        panelWidth: 108,
        panelPadding: 8,
        panelRadius: 12,
        canvasSize: 84,
        canvasPixelSize: 168,
        titleFont: 10,
        nameFont: 10,
        nameMinHeight: 20,
      };
    }

    if (w <= 768 || h <= 700) {
      return {
        panelTop: 70,
        panelRight: 12,
        panelWidth: 128,
        panelPadding: 10,
        panelRadius: 14,
        canvasSize: 98,
        canvasPixelSize: 196,
        titleFont: 11,
        nameFont: 11,
        nameMinHeight: 24,
      };
    }

    return {
      panelTop: 72,
      panelRight: 16,
      panelWidth: 170,
      panelPadding: 12,
      panelRadius: 16,
      canvasSize: 146,
      canvasPixelSize: 292,
      titleFont: 12,
      nameFont: 12,
      nameMinHeight: 32,
    };
  }

  applyNextPreviewLayout() {
    if (!this.nextPanel || !this.nextCanvas || !this.nextNameLabel || !this.nextPreviewCanvasWrap) {
      return;
    }

    const layout = this.getNextPreviewLayout();

    this.nextPanel.style.top = `${layout.panelTop}px`;
    this.nextPanel.style.right = `${layout.panelRight}px`;
    this.nextPanel.style.width = `${layout.panelWidth}px`;
    this.nextPanel.style.padding = `${layout.panelPadding}px`;
    this.nextPanel.style.borderRadius = `${layout.panelRadius}px`;

    this.nextPreviewCanvasWrap.style.width = `${layout.canvasSize}px`;
    this.nextPreviewCanvasWrap.style.height = `${layout.canvasSize}px`;

    this.nextCanvas.width = layout.canvasPixelSize;
    this.nextCanvas.height = layout.canvasPixelSize;
    this.nextCanvas.style.width = `${layout.canvasSize}px`;
    this.nextCanvas.style.height = `${layout.canvasSize}px`;

    this.nextNameLabel.style.fontSize = `${layout.nameFont}px`;
    this.nextNameLabel.style.minHeight = `${layout.nameMinHeight}px`;

    const title = this.nextPanel.querySelector(".next-preview-title");
    if (title) {
      title.style.fontSize = `${layout.titleFont}px`;
    }

    if (this.nextPreviewRenderer) {
      this.nextPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.nextPreviewRenderer.setSize(layout.canvasSize, layout.canvasSize, false);
    }
  }
   createRotateStepButtons() {
    let panel = document.getElementById("rotateStepButtonsPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "rotateStepButtonsPanel";
      panel.style.position = "fixed";
      panel.style.left = "16px";
      panel.style.bottom = "84px";
      panel.style.zIndex = "25";
      panel.style.display = "flex";
      panel.style.gap = "8px";
      panel.style.padding = "8px";
      panel.style.borderRadius = "14px";
      panel.style.background = "rgba(0,0,0,0.42)";
      panel.style.backdropFilter = "blur(8px)";
      panel.style.border = "1px solid rgba(255,255,255,0.10)";
      panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      panel.style.userSelect = "none";
      panel.style.webkitUserSelect = "none";

      const axisInfos = {
        x: {
          icon: "↺",
          title: "X +90°",
          hint: "앞뒤 회전",
        },
        y: {
          icon: "⟲",
          title: "Y +90°",
          hint: "방향 전환",
        },
        z: {
          icon: "↻",
          title: "Z +90°",
          hint: "좌우 회전",
        },
      };

      const makeButton = (axis) => {
        const info = axisInfos[axis];

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.axis = axis;
        button.style.minWidth = "76px";
        button.style.height = "52px";
        button.style.padding = "6px 10px";
        button.style.border = "0";
        button.style.borderRadius = "12px";
        button.style.background = "rgba(255,255,255,0.14)";
        button.style.color = "#fff";
        button.style.cursor = "pointer";
        button.style.transition =
          "opacity 0.15s ease, transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease";
        button.style.display = "flex";
        button.style.flexDirection = "column";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.gap = "2px";
        button.style.position = "relative";
        button.style.overflow = "hidden";

        const accent = document.createElement("div");
        accent.style.position = "absolute";
        accent.style.left = "0";
        accent.style.top = "0";
        accent.style.width = "100%";
        accent.style.height = "2px";
        accent.style.background = this.axisColorMap[axis];
        accent.style.opacity = "0.9";
        button.appendChild(accent);

        const icon = document.createElement("div");
        icon.textContent = `${info.icon} ${axis.toUpperCase()}`;
        icon.style.fontSize = "14px";
        icon.style.fontWeight = "800";
        icon.style.lineHeight = "1";
        icon.style.color = this.axisColorMap[axis];
        button.appendChild(icon);

        const title = document.createElement("div");
        title.textContent = info.title;
        title.style.fontSize = "11px";
        title.style.fontWeight = "700";
        title.style.lineHeight = "1.05";
        button.appendChild(title);

        const hint = document.createElement("div");
        hint.textContent = info.hint;
        hint.style.fontSize = "10px";
        hint.style.lineHeight = "1";
        hint.style.opacity = "0.72";
        button.appendChild(hint);

        button.addEventListener("click", this.onRotateStepButtonClick);

        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

        button.addEventListener("pointerup", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });

        button.addEventListener("mouseenter", () => {
          if (button.disabled) return;
          this.hoverRotateAxis = axis;
          this.updateRotateButtonsUI();
        });

        button.addEventListener("mouseleave", () => {
          if (this.hoverRotateAxis === axis) {
            this.hoverRotateAxis = null;
            this.updateRotateButtonsUI();
          }
        });

        return button;
      };

      const xButton = makeButton("x");
      const yButton = makeButton("y");
      const zButton = makeButton("z");

      panel.appendChild(xButton);
      panel.appendChild(yButton);
      panel.appendChild(zButton);
      document.body.appendChild(panel);

      this.rotateButtons.x = xButton;
      this.rotateButtons.y = yButton;
      this.rotateButtons.z = zButton;
    } else {
      this.rotateButtons.x = panel.querySelector('[data-axis="x"]');
      this.rotateButtons.y = panel.querySelector('[data-axis="y"]');
      this.rotateButtons.z = panel.querySelector('[data-axis="z"]');
    }

    this.rotateButtonsPanel = panel;
    this.updateRotateButtonsLayout();
    this.updateRotateButtonsUI();
  }
   updateRotateButtonsLayout() {
    if (!this.rotateButtonsPanel) return;

    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 700;

    this.rotateButtonsPanel.style.left = "16px";
    this.rotateButtonsPanel.style.bottom = isMobile ? "76px" : "88px";
    this.rotateButtonsPanel.style.gap = isMobile ? "6px" : "8px";
    this.rotateButtonsPanel.style.padding = isMobile ? "6px" : "8px";
    this.rotateButtonsPanel.style.borderRadius = isMobile ? "12px" : "14px";

    for (const button of Object.values(this.rotateButtons)) {
      if (!button) continue;

      button.style.minWidth = isMobile ? "64px" : "76px";
      button.style.height = isMobile ? "46px" : "52px";
      button.style.padding = isMobile ? "5px 8px" : "6px 10px";

      const children = button.children;
      if (children[1]) children[1].style.fontSize = isMobile ? "13px" : "14px";
      if (children[2]) children[2].style.fontSize = isMobile ? "10px" : "11px";
      if (children[3]) children[3].style.fontSize = isMobile ? "9px" : "10px";
    }
  }

  updateRotateButtonsUI() {
    const hasPreview = !!this.blockSystem?.getCurrentPreviewBlock();
    const canRotate =
      !!this.blockSystem &&
      (this.blockSystem.state === "EDIT" || this.blockSystem.state === "ROTATE") &&
      hasPreview &&
      !this.isGameOver &&
      !this.isRestarting;

    if (this.rotateButtonsPanel) {
      this.rotateButtonsPanel.style.opacity = canRotate ? "1" : "0.55";
    }

    for (const button of Object.values(this.rotateButtons)) {
      if (!button) continue;
      button.disabled = !canRotate;
      button.style.cursor = canRotate ? "pointer" : "default";
      button.style.opacity = canRotate ? "1" : "0.55";
      button.style.background = canRotate
        ? "rgba(255,255,255,0.14)"
        : "rgba(255,255,255,0.08)";
    }
  }
  getRotatedPreviewQuaternion(axis, turns = 1) {
    const block = this.blockSystem?.getCurrentPreviewBlock();
    if (!block) return null;

    const currentQuat = block.mesh.quaternion.clone();
    const axisVector = this.axisVectorMap[axis]?.clone();

    if (!axisVector) return null;

    axisVector.applyQuaternion(currentQuat).normalize();

    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(
      axisVector,
      (Math.PI / 2) * turns
    );

    return deltaQuat.multiply(currentQuat).normalize();
  }

  createRotationGhostFromBlock(block) {
    if (!block?.mesh) return null;

    const ghost = block.mesh.clone(true);

    ghost.traverse((child) => {
      if (!child.isMesh) return;

      if (child.material) {
        const sourceMaterial = child.material;
        const material = sourceMaterial.clone();

        material.transparent = true;
        material.opacity = 0.28;
        material.depthWrite = false;
        material.emissive =
          material.emissive instanceof THREE.Color
            ? material.emissive.clone()
            : new THREE.Color(0xffffff);
        material.emissiveIntensity = 0.45;

        child.material = material;
      }

      child.renderOrder = 998;
      child.raycast = () => {};
    });

    return ghost;
  }

  clearRotationGhost() {
    if (!this.rotationGhost) {
      this.rotationGhostAxis = null;
      return;
    }

    if (this.rotationGhost.parent) {
      this.rotationGhost.parent.remove(this.rotationGhost);
    }

    this.rotationGhost.traverse((child) => {
      if (!child.isMesh) return;
      if (child.material?.dispose) child.material.dispose();
    });

    this.rotationGhost = null;
    this.rotationGhostAxis = null;
  }

  updateRotationGhost() {
    const axis = this.hoverRotateAxis;
    const block = this.blockSystem?.getCurrentPreviewBlock();

    if (!axis || !block?.mesh) {
      this.clearRotationGhost();
      return;
    }

    if (!this.rotationGhost) {
      this.rotationGhost = this.createRotationGhostFromBlock(block);
      if (this.rotationGhost) {
        this.renderer.scene.add(this.rotationGhost);
      }
    }

    if (!this.rotationGhost) return;

    this.rotationGhost.position.copy(block.mesh.position);

    const q = this.getRotatedPreviewQuaternion(axis, 1);
    if (q) {
      this.rotationGhost.quaternion.copy(q);
      this.rotationGhostAxis = axis;
    }

    this.rotationGhost.scale.copy(block.mesh.scale);

    const accent = this.axisColorMap[axis] ?? "#ffffff";
    this.rotationGhost.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      if (child.material.emissive instanceof THREE.Color) {
        child.material.emissive.set(accent);
      }
    });
  }

  updateRotateAxisHoverGizmo() {
    const placement = this.placementController;
    const previewBlock = this.blockSystem?.getCurrentPreviewBlock();

    if (!placement || !previewBlock) return;

    // hover 때문에 gizmo를 띄우거나 active axis를 바꾸지 않는다.
    // 회전 모드일 때만 기존 선택 축 상태를 유지하면서 sync만 맞춘다.
    if (placement.selectionMode === "ROTATE") {
      placement.rotateGizmo.syncToBlock(previewBlock);
    }
  }
  updateRotationButtonHints() {
    this.updateRotationGhost();
    this.updateRotateAxisHoverGizmo();
  }

  onRotateStepButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const axis = event.currentTarget?.dataset?.axis;
    if (!axis || !this.blockSystem) return;
    if (this.isGameOver || this.isRestarting) return;

    const rotated = this.blockSystem.rotatePreview90(axis);
    if (!rotated) return;

    const previewBlock = this.blockSystem.getCurrentPreviewBlock();

    if (this.placementController?.selectionMode === "ROTATE" && previewBlock) {
      this.placementController.rotateGizmo.syncToBlock(previewBlock);
    }

    this.updateRotationGhost();
    this.updateRotateButtonsUI();
  }

  createLoadingScreen() {
    let overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      this.loadingOverlay = overlay;
      this.loadingStatusLabel = overlay.querySelector("#loadingStatusLabel");
      this.loadingProgressBar = overlay.querySelector("#loadingProgressBar");
      this.loadingProgressFill = overlay.querySelector("#loadingProgressFill");
      return;
    }

    overlay = document.createElement("div");
    overlay.id = "loadingOverlay";
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(6, 10, 18, 0.28)";
    overlay.style.backdropFilter = "blur(2px)";
    overlay.style.opacity = "1";
    overlay.style.transition = "opacity 0.35s ease";
    overlay.style.pointerEvents = "auto";
    overlay.style.userSelect = "none";
    overlay.style.webkitUserSelect = "none";

    const panel = document.createElement("div");
    panel.style.width = "min(320px, 78vw)";
    panel.style.padding = "20px 18px";
    panel.style.borderRadius = "16px";
    panel.style.background = "rgba(0,0,0,0.22)";
    panel.style.border = "1px solid rgba(255,255,255,0.10)";
    panel.style.boxShadow = "0 14px 34px rgba(0,0,0,0.18)";
    panel.style.textAlign = "center";
    panel.style.color = "#fff";

    const title = document.createElement("div");
    title.textContent = "3D BLOCK STACK";
    title.style.fontSize = "15px";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "1.2px";
    title.style.marginBottom = "12px";
    title.style.color = "rgba(255,255,255,0.96)";

    const status = document.createElement("div");
    status.id = "loadingStatusLabel";
    status.textContent = "로딩 중...";
    status.style.fontSize = "13px";
    status.style.fontWeight = "500";
    status.style.marginBottom = "10px";
    status.style.color = "rgba(255,255,255,0.84)";

    const progressBar = document.createElement("div");
    progressBar.id = "loadingProgressBar";
    progressBar.style.width = "100%";
    progressBar.style.height = "4px";
    progressBar.style.borderRadius = "999px";
    progressBar.style.overflow = "hidden";
    progressBar.style.background = "rgba(255,255,255,0.16)";

    const progressFill = document.createElement("div");
    progressFill.id = "loadingProgressFill";
    progressFill.style.width = "0%";
    progressFill.style.height = "100%";
    progressFill.style.borderRadius = "999px";
    progressFill.style.background = "rgba(255,255,255,0.92)";
    progressFill.style.boxShadow = "0 0 10px rgba(255,255,255,0.18)";
    progressFill.style.transition = "width 0.2s ease";

    progressBar.appendChild(progressFill);
    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(progressBar);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    this.loadingOverlay = overlay;
    this.loadingStatusLabel = status;
    this.loadingProgressBar = progressBar;
    this.loadingProgressFill = progressFill;
  }

  createNextPreviewUI() {
    let panel = document.getElementById("nextBlockPanel");
    const layout = this.getNextPreviewLayout();

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "nextBlockPanel";
      panel.style.position = "fixed";
      panel.style.zIndex = "20";
      panel.style.color = "white";
      panel.style.userSelect = "none";
      panel.style.webkitUserSelect = "none";
      panel.style.background = "rgba(0,0,0,0.48)";
      panel.style.backdropFilter = "blur(8px)";
      panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      panel.style.border = "1px solid rgba(255,255,255,0.10)";

      const title = document.createElement("div");
      title.className = "next-preview-title";
      title.textContent = "NEXT";
      title.style.fontWeight = "700";
      title.style.letterSpacing = "1.2px";
      title.style.opacity = "0.82";
      title.style.marginBottom = "8px";

      const canvasWrap = document.createElement("div");
      canvasWrap.id = "nextPreviewCanvasWrap";
      canvasWrap.style.borderRadius = "12px";
      canvasWrap.style.overflow = "hidden";
      canvasWrap.style.background =
        "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 52%, rgba(255,255,255,0.01) 100%)";
      canvasWrap.style.border = "1px solid rgba(255,255,255,0.08)";
      canvasWrap.style.marginBottom = "8px";

      const canvas = document.createElement("canvas");
      canvas.id = "nextBlockCanvas";
      canvas.style.display = "block";

      const name = document.createElement("div");
      name.id = "nextBlockNameLabel";
      name.textContent = "-";
      name.style.textAlign = "center";
      name.style.opacity = "0.92";
      name.style.wordBreak = "break-word";
      name.style.lineHeight = "1.35";

      canvasWrap.appendChild(canvas);
      panel.appendChild(title);
      panel.appendChild(canvasWrap);
      panel.appendChild(name);
      document.body.appendChild(panel);

      this.nextCanvas = canvas;
      this.nextNameLabel = name;
      this.nextPreviewCanvasWrap = canvasWrap;
    } else {
      this.nextCanvas = panel.querySelector("#nextBlockCanvas");
      this.nextNameLabel = panel.querySelector("#nextBlockNameLabel");
      this.nextPreviewCanvasWrap = panel.querySelector("#nextPreviewCanvasWrap");
    }

    this.nextPanel = panel;

    this.applyNextPreviewLayout();
    this.initNextPreviewScene();
  }

  initNextPreviewScene() {
    if (!this.nextCanvas || this.nextPreviewRenderer) return;

    this.nextPreviewRenderer = new THREE.WebGLRenderer({
      canvas: this.nextCanvas,
      antialias: true,
      alpha: true,
    });

    this.nextPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const layout = this.getNextPreviewLayout();
    this.nextPreviewRenderer.setSize(layout.canvasSize, layout.canvasSize, false);

    this.nextPreviewScene = new THREE.Scene();

    this.nextPreviewCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.nextPreviewCamera.position.set(0, 0.7, 4.2);
    this.nextPreviewCamera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    this.nextPreviewScene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 1.15);
    dir1.position.set(2.4, 2.8, 3.2);
    this.nextPreviewScene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xaac8ff, 0.55);
    dir2.position.set(-2.0, 1.2, -2.2);
    this.nextPreviewScene.add(dir2);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.02;
    this.nextPreviewScene.add(floor);
  }

  formatModelName(name = "") {
    return String(name || "")
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async updateNextPreviewUI() {
    if (!this.blockSystem) return;

    const nextInfo = await this.blockSystem.getNextBlockInfo();
    if (!nextInfo) return;

    const key = `${nextInfo.key}::${nextInfo.weight ?? 1}`;
    if (this.nextPreviewKey === key) return;

    this.nextPreviewKey = key;

    if (this.nextNameLabel) {
      this.nextNameLabel.textContent = this.formatModelName(
        nextInfo.name ?? nextInfo.key
      );
    }

    if (this.nextPreviewMesh) {
      this.nextPreviewScene.remove(this.nextPreviewMesh);
      this.nextPreviewMesh = null;
    }

    const previewGroup = await this.blockSystem.factory.createUiPreviewObject(nextInfo);
    if (!previewGroup) return;

    const box = new THREE.Box3().setFromObject(previewGroup);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    previewGroup.position.sub(center);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = 1.9 / maxAxis;
    previewGroup.scale.multiplyScalar(fitScale);
    previewGroup.position.y = -0.08;

    this.nextPreviewScene.add(previewGroup);
    this.nextPreviewMesh = previewGroup;
    this.renderNextPreview();
  }

  renderNextPreview() {
    if (!this.nextPreviewRenderer || !this.nextPreviewScene || !this.nextPreviewCamera) return;

    if (this.nextPreviewMesh) {
      this.nextPreviewMesh.rotation.y += 0.01;
      this.nextPreviewMesh.rotation.x = Math.sin(performance.now() * 0.0012) * 0.08;
    }

    this.nextPreviewRenderer.render(this.nextPreviewScene, this.nextPreviewCamera);
  }

  setLoadingProgress(progress = 0, text = "") {
    const safeProgress = Math.max(0, Math.min(1, progress));

    if (this.loadingProgressFill) {
      this.loadingProgressFill.style.width = `${(safeProgress * 100).toFixed(0)}%`;
    }

    if (this.loadingStatusLabel && text) {
      this.loadingStatusLabel.textContent = text;
    }
  }

  startLoadingRenderLoop() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.loadingLoop();
  }

  stopLoadingRenderLoop() {
    this.isLoading = false;

    if (this.loadingRafId !== null) {
      cancelAnimationFrame(this.loadingRafId);
      this.loadingRafId = null;
    }
  }

  loadingLoop() {
    if (!this.isLoading) return;

    if (this.renderer?.update) {
      this.renderer.update();
    }

    if (this.renderer?.render) {
      this.renderer.render();
    }

    this.renderNextPreview();
    this.loadingRafId = requestAnimationFrame(this.loadingLoop);
  }

  async waitForNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async waitForFirstVisibleFrame() {
    if (this.blockSystem) {
      this.blockSystem.update();
    }

    if (this.placementController) {
      this.placementController.update();
    }

    if (this.renderer?.update) {
      this.renderer.update();
    }

    if (this.renderer?.render) {
      this.renderer.render();
    }

    this.renderNextPreview();
    await this.waitForNextFrame();

    if (this.blockSystem) {
      this.blockSystem.update();
    }

    if (this.placementController) {
      this.placementController.update();
    }

    if (this.renderer?.update) {
      this.renderer.update();
    }

    if (this.renderer?.render) {
      this.renderer.render();
    }

    this.renderNextPreview();
    await this.waitForNextFrame();
  }

  async hideLoadingScreen() {
    if (!this.loadingOverlay) return;

    this.loadingOverlay.style.opacity = "0";
    this.loadingOverlay.style.pointerEvents = "none";

    await new Promise((resolve) => setTimeout(resolve, 360));

    if (this.loadingOverlay?.parentNode) {
      this.loadingOverlay.parentNode.removeChild(this.loadingOverlay);
    }

    this.loadingOverlay = null;
    this.loadingStatusLabel = null;
    this.loadingProgressBar = null;
    this.loadingProgressFill = null;
  }

  startMainLoop() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    requestAnimationFrame(this.animate);
  }

  async start() {
    try {
      this.startLoadingRenderLoop();

      this.setLoadingProgress(0.1, "렌더러 준비 중...");
      await this.renderer.init();
      this.renderer.render();

      this.setLoadingProgress(0.35, "물리 엔진 초기화 중...");
      await this.physics.init();

      this.setLoadingProgress(0.55, "블럭 시스템 생성 중...");
      this.blockSystem = new BlockSystem(
        this.renderer.scene,
        this.physics,
        () => this.handleFail(),
        this.config
      );

      this.setLoadingProgress(0.7, "다음 블럭 준비 중...");
      await this.blockSystem.getNextBlockInfo();

      this.setLoadingProgress(0.8, "첫 블럭 생성 중...");
      await this.blockSystem.createBlock();

      this.setLoadingProgress(0.9, "조작 시스템 연결 중...");
      this.placementController = new PlacementController({
        scene: this.renderer.scene,
        camera: this.renderer.camera,
        domElement: this.renderer.renderer.domElement,
        controls: this.renderer.controls,
        blockSystem: this.blockSystem,
        groundMesh: this.renderer.groundMesh,
        blockSize: this.config.blockSize,
        stageSize: this.config.stageSize,
        previewClampPadding: this.config.previewClampPadding,
        longPressDuration: 380,
        moveThreshold: 8,
        rotateSpeed: 0.012,
      });

      this.setLoadingProgress(0.96, "UI 정리 중...");
        this.updateNicknameUI();
      this.updateHeightUI();
      this.updateBestHeightUI();
      this.updateVersionUI();
      this.updateBgmButtonUI();
      this.updateRotateButtonsUI();
      await this.updateNextPreviewUI();

      window.addEventListener("resize", this.onResize);
      this.actionButton?.addEventListener("click", this.onActionButtonClick);

      this.updateControlButton();

      this.setLoadingProgress(1, "준비 완료");

      await this.waitForFirstVisibleFrame();

      this.stopLoadingRenderLoop();
      this.startMainLoop();

      await this.waitForFirstVisibleFrame();
      await this.hideLoadingScreen();
    } catch (error) {
      console.error("Game start failed:", error);
      this.stopLoadingRenderLoop();

      this.setLoadingProgress(1, "로딩 실패");

      if (this.loadingStatusLabel) {
        this.loadingStatusLabel.textContent =
          "로딩에 실패했습니다. 페이지를 새로고침 해주세요.";
      }

      throw error;
    }
  }

  createBgmToggleButton() {
    let button = document.getElementById("bgmToggleButton");

    if (!button) {
      button = document.createElement("button");
      button.id = "bgmToggleButton";
      button.type = "button";
      button.style.position = "fixed";
      button.style.top = "16px";
      button.style.right = "16px";
      button.style.zIndex = "20";
      button.style.padding = "10px 14px";
      button.style.border = "0";
      button.style.borderRadius = "12px";
      button.style.background = "rgba(0,0,0,0.55)";
      button.style.color = "#fff";
      button.style.fontSize = "14px";
      button.style.fontWeight = "600";
      button.style.cursor = "pointer";
      button.style.backdropFilter = "blur(6px)";
      button.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
      button.style.userSelect = "none";
      button.style.webkitUserSelect = "none";
      document.body.appendChild(button);
    }

    this.bgmToggleButton = button;
    this.bgmToggleButton.addEventListener("click", this.onBgmToggleClick);
    this.updateBgmButtonUI();
  }

  updateBgmButtonUI() {
    if (!this.bgmToggleButton) return;

    this.bgmToggleButton.textContent = this.bgmEnabled ? "BGM ON" : "BGM OFF";
    this.bgmToggleButton.style.opacity = this.bgmEnabled ? "1" : "0.7";
  }

  setupBgmUnlock() {
    window.addEventListener("pointerdown", this.unlockBgm, { passive: true });
    window.addEventListener("touchstart", this.unlockBgm, { passive: true });
    window.addEventListener("keydown", this.unlockBgm, { passive: true });
  }

  removeBgmUnlockListeners() {
    window.removeEventListener("pointerdown", this.unlockBgm);
    window.removeEventListener("touchstart", this.unlockBgm);
    window.removeEventListener("keydown", this.unlockBgm);
  }

  async unlockBgm() {
    if (this.bgmUnlocked) return;

    this.bgmUnlocked = true;
    this.removeBgmUnlockListeners();

    if (this.bgmEnabled) {
      await this.playBgm();
    }
  }

  async playBgm() {
    if (!this.bgm || !this.bgmEnabled) return;

    try {
      await this.bgm.play();
    } catch (error) {
      console.warn("BGM play blocked:", error);
    }
  }

  pauseBgm() {
    if (!this.bgm) return;
    this.bgm.pause();
  }

  async onBgmToggleClick() {
    this.bgmEnabled = !this.bgmEnabled;
    this.updateBgmButtonUI();

    if (this.bgmEnabled) {
      if (this.bgmUnlocked) {
        await this.playBgm();
      }
    } else {
      this.pauseBgm();
    }
  }

  updateNicknameUI() {
    if (this.nicknameLabel) {
      this.nicknameLabel.textContent = `닉네임: ${this.nickname}`;
    }
  }

  updateHeightUI() {
    if (!this.heightLabel || !this.blockSystem) return;
    const height = this.blockSystem.getStableHeight();
    this.heightLabel.textContent = `현재 높이: ${height.toFixed(2)}`;
  }

  updateBestHeightUI() {
    if (!this.bestHeightLabel) return;
    this.bestHeightLabel.textContent = `최고 기록: ${this.bestHeight.toFixed(2)}`;
  }

  updateVersionUI() {
    if (!this.versionLabel) return;
    this.versionLabel.textContent = `버전: ${this.appVersion}`;
  }

  updateControlButton() {
    if (!this.actionButton || !this.blockSystem) return;

    if (this.isGameOver || this.isRestarting) {
      this.actionButton.disabled = true;
      this.actionButton.textContent = "대기중";
      this.actionButton.style.opacity = "0.5";
      return;
    }

    const state = this.blockSystem.state;

    if (state === "EDIT" || state === "ROTATE") {
      this.actionButton.disabled = false;
      this.actionButton.textContent = "배치";
      this.actionButton.style.opacity = "1";
      return;
    }

    if (state === "WAITING") {
      this.actionButton.disabled = true;
      this.actionButton.textContent = "착지중";
      this.actionButton.style.opacity = "0.5";
      return;
    }

    this.actionButton.disabled = true;
    this.actionButton.textContent = "대기중";
    this.actionButton.style.opacity = "0.5";
  }

  async onActionButtonClick() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    if (this.blockSystem.state === "EDIT" || this.blockSystem.state === "ROTATE") {
      this.blockSystem.confirmCurrentBlock();
            this.clearRotationGhost();
      await this.updateNextPreviewUI();
    }

    this.updateControlButton();
    this.updateRotateButtonsUI();
  }

onResize() {
  if (this.renderer.resize) {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  this.applyNextPreviewLayout();
  this.updateRotateButtonsLayout();
}

  async handleFail() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    this.isGameOver = true;
    this.updateControlButton();

    setTimeout(async () => {
      const height = this.blockSystem.getStableHeight();

      if (height > this.bestHeight) {
        this.bestHeight = height;
      }

      this.updateBestHeightUI();

      let name = prompt(
        `실패!\n현재 기록: ${height.toFixed(2)}\n최고 기록: ${this.bestHeight.toFixed(2)}\n닉네임 입력:`,
        this.nickname || "Player"
      );

      if (!name || !name.trim()) {
        name = "Player";
      }

      this.nickname = name.trim();
      await this.restartGame();
    }, 100);
  }

  async restartGame() {
    if (this.isRestarting || !this.blockSystem) return;

    this.isRestarting = true;

    this.blockSystem.reset();
        this.clearRotationGhost();
    this.hoverRotateAxis = null;
    this.renderer.resetCamera();

    this.nextPreviewKey = "";

    this.updateNicknameUI();
    this.updateHeightUI();
    this.updateBestHeightUI();
    this.updateVersionUI();

    this.isGameOver = false;

    await this.blockSystem.getNextBlockInfo();
    await this.blockSystem.createBlock();
    await this.updateNextPreviewUI();

    this.isRestarting = false;
    this.updateControlButton();
    this.updateRotateButtonsUI();
  }

  async animate(time) {
    if (!this.isAnimating) return;

    requestAnimationFrame(this.animate);
    this.lastTime = time;

    if (!this.isGameOver && !this.isRestarting && this.blockSystem) {
      this.physics.step();
      this.blockSystem.update();

      const followHeight = this.blockSystem.getMaxHeight();
      this.renderer.updateCamera(followHeight);

      this.updateHeightUI();
      this.updateControlButton();
      this.updateRotateButtonsUI();
      await this.updateNextPreviewUI();
    }

     if (this.placementController) {
      this.placementController.update();
          this.updateRotationButtonHints();
    }

    this.updateRotationButtonHints();

    if (this.renderer.update) {
      this.renderer.update();
    }
    this.renderer.render();
    this.renderNextPreview();
  }
}