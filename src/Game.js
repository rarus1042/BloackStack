import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { Renderer } from "./Renderer.js";
import { Physics } from "./Physics.js";
import { BlockSystem } from "./BlockSystem.js";
import { PlacementController } from "./PlacementController.js";

export class Game {
  constructor() {
    this.config = {
      stageSize: 3,
      groundHeight: 0.01,
      stageThickness: 0.12,
      blockSize: 1,
      previewClampPadding: 0.35,

      fallSpeed: 2,

      spawnClearance: 1.6,
      minSpawnHeight: 2.3,

      heightStep: 0.5,

      cameraFollowLerp: 0.12,
      cameraHeightOffset: 0.25,
      cameraMinTargetY: 0.75,
    };

    this.appVersion = "v0.1.20-mobile-ui-joystick";

    this.renderer = new Renderer(this.config);
    this.physics = new Physics(this.config);

    this.blockSystem = null;
    this.placementController = null;

    this.nickname = "Player";
    this.bestHeight = 0;
    this.lastTime = 0;
    this.isGameOver = false;
    this.isRestarting = false;

    this.nicknameLabel = document.getElementById("nicknameLabel");
    this.heightLabel = document.getElementById("heightLabel");
    this.actionButton = document.getElementById("actionButton");

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

    this.joystickRoot = null;
    this.joystickBase = null;
    this.joystickKnob = null;
    this.joystickPointerId = null;
    this.joystickActive = false;

    this.joystickInput = new THREE.Vector2();
    this.joystickForward = new THREE.Vector3();
    this.joystickRight = new THREE.Vector3();
    this.joystickMove = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);

    this.joystickMoveSpeed = 2.35;
    this.joystickMaxRadius = 34;

    this.bgmEnabled = false;
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
    this.onRotateStepButtonClick = this.onRotateStepButtonClick.bind(this);
    this.unlockBgm = this.unlockBgm.bind(this);
    this.loadingLoop = this.loadingLoop.bind(this);

    this.onJoystickPointerDown = this.onJoystickPointerDown.bind(this);
    this.onJoystickPointerMove = this.onJoystickPointerMove.bind(this);
    this.onJoystickPointerUp = this.onJoystickPointerUp.bind(this);

    this.createLoadingScreen();
    this.createBgmToggleButton();
    this.createRotateStepButtons();
    this.createMoveJoystick();
    this.createNextPreviewUI();
    this.setupBgmUnlock();
  }

  getNextPreviewLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (w <= 420) {
    return {
      isMobile: true,
      panelTop: 74,
      panelRight: 10,
      panelWidth: 160,
      panelPadding: 10,
      panelRadius: 16,

      titleBackFont: 22,
      titleBackTop: -18,
      titleBackLeft: 42,

      titleFont: 10,
      titleMarginBottom: 8,

      canvasSize: 110,
      canvasPixelSize: 220,
      canvasRadius: 12,

      nameFont: 10,
      nameMinHeight: 20,
    };
  }

  if (w <= 768 || h <= 700) {
    return {
      isMobile: true,
      panelTop: 82,
      panelRight: 12,
      panelWidth: 182,
      panelPadding: 11,
      panelRadius: 18,

      titleBackFont: 28,
      titleBackTop: -22,
      titleBackLeft: 46,

      titleFont: 11,
      titleMarginBottom: 9,

      canvasSize: 126,
      canvasPixelSize: 252,
      canvasRadius: 13,

      nameFont: 11,
      nameMinHeight: 24,
    };
  }

  return {
    isMobile: false,
    panelTop: 90,
    panelRight: 18,
    panelWidth: 208,
    panelPadding: 12,
    panelRadius: 20,

    titleBackFont: 34,
    titleBackTop: -26,
    titleBackLeft: 52,

    titleFont: 12,
    titleMarginBottom: 10,

    canvasSize: 146,
    canvasPixelSize: 292,
    canvasRadius: 14,

    nameFont: 12,
    nameMinHeight: 28,
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
  this.nextPreviewCanvasWrap.style.margin = "10px auto 0";
  this.nextPreviewCanvasWrap.style.display = "flex";
  this.nextPreviewCanvasWrap.style.alignItems = "center";
  this.nextPreviewCanvasWrap.style.justifyContent = "center";

  this.nextCanvas.width = layout.canvasPixelSize;
  this.nextCanvas.height = layout.canvasPixelSize;
  this.nextCanvas.style.width = `${layout.canvasSize}px`;
  this.nextCanvas.style.height = `${layout.canvasSize}px`;
  this.nextCanvas.style.display = "block";
  this.nextCanvas.style.margin = "0 auto";

  this.nextNameLabel.style.fontSize = `${layout.nameFont}px`;
  this.nextNameLabel.style.minHeight = `${layout.nameMinHeight}px`;
  this.nextNameLabel.style.marginTop = "16px";
  this.nextNameLabel.style.paddingBottom = "4px";

  const title = this.nextPanel.querySelector(".next-preview-title");
  if (title) {
    title.style.fontSize = `${layout.titleFont}px`;
    title.style.textAlign = "center";
    title.style.marginBottom = "0";
  }

  if (this.nextPreviewRenderer) {
    this.nextPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.nextPreviewRenderer.setSize(layout.canvasSize, layout.canvasSize, false);
  }
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

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "nextBlockPanel";
    panel.style.position = "fixed";
    panel.style.zIndex = "20";
    panel.style.color = "white";
    panel.style.userSelect = "none";
    panel.style.webkitUserSelect = "none";
    panel.style.boxSizing = "border-box";
    panel.style.background =
      "linear-gradient(180deg, rgba(18,40,60,0.88) 0%, rgba(25,52,76,0.92) 100%)";
    panel.style.backdropFilter = "blur(10px)";
    panel.style.border = "1px solid rgba(255,255,255,0.10)";
    panel.style.boxShadow = "0 14px 30px rgba(0,0,0,0.22)";
    panel.style.overflow = "hidden";

    const title = document.createElement("div");
    title.className = "next-preview-title";
    title.textContent = "NEXT";
    title.style.position = "relative";
    title.style.fontWeight = "900";
    title.style.letterSpacing = "1px";
    title.style.lineHeight = "1.1";
    title.style.color = "rgba(255,255,255,0.98)";
    title.style.textAlign = "center";
    title.style.zIndex = "1";
    panel.appendChild(title);

    const canvasWrap = document.createElement("div");
    canvasWrap.id = "nextPreviewCanvasWrap";
    canvasWrap.style.position = "relative";
    canvasWrap.style.overflow = "hidden";
    canvasWrap.style.borderRadius = "14px";
    canvasWrap.style.background =
      "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 46%, rgba(255,255,255,0.015) 100%)";
    canvasWrap.style.border = "1px solid rgba(255,255,255,0.08)";
    canvasWrap.style.boxShadow =
      "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -18px 30px rgba(0,0,0,0.08)";

    const floorGlow = document.createElement("div");
    floorGlow.style.position = "absolute";
    floorGlow.style.left = "50%";
    floorGlow.style.bottom = "0";
    floorGlow.style.width = "112%";
    floorGlow.style.height = "34%";
    floorGlow.style.transform = "translateX(-50%)";
    floorGlow.style.borderRadius = "50% 50% 0 0 / 90% 90% 0 0";
    floorGlow.style.background =
      "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.00) 75%)";
    floorGlow.style.pointerEvents = "none";
    canvasWrap.appendChild(floorGlow);

    const canvas = document.createElement("canvas");
    canvas.id = "nextBlockCanvas";
    canvas.style.position = "relative";
    canvas.style.zIndex = "1";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    canvasWrap.appendChild(canvas);

    const name = document.createElement("div");
    name.id = "nextBlockNameLabel";
    name.textContent = "-";
    name.style.textAlign = "center";
    name.style.fontWeight = "700";
    name.style.letterSpacing = "0.2px";
    name.style.opacity = "0.96";
    name.style.wordBreak = "break-word";
    name.style.lineHeight = "1.3";

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
    this.nextPreviewCamera.position.set(0, 0.7, 6);
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

  createRotateStepButtons() {
    let panel = document.getElementById("rotateStepButtonsPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "rotateStepButtonsPanel";
      panel.style.position = "fixed";
      panel.style.left = "12px";
      panel.style.right = "auto";
      panel.style.bottom = "92px";
      panel.style.zIndex = "25";
      panel.style.display = "flex";
      panel.style.flexDirection = "column";
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
        x: { icon: "↺", title: "X+90", hint: "앞뒤" },
        y: { icon: "⟲", title: "Y+90", hint: "방향" },
        z: { icon: "↻", title: "Z+90", hint: "좌우" },
      };

      const makeButton = (axis) => {
        const info = axisInfos[axis];

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.axis = axis;
        button.style.minWidth = "68px";
        button.style.width = "68px";
        button.style.height = "50px";
        button.style.padding = "6px 8px";
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
        icon.style.fontSize = "13px";
        icon.style.fontWeight = "800";
        icon.style.lineHeight = "1";
        icon.style.color = this.axisColorMap[axis];
        button.appendChild(icon);

        const title = document.createElement("div");
        title.textContent = info.title;
        title.style.fontSize = "10px";
        title.style.fontWeight = "700";
        title.style.lineHeight = "1.05";
        button.appendChild(title);

        const hint = document.createElement("div");
        hint.textContent = info.hint;
        hint.style.fontSize = "9px";
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

      this.rotateButtons.x = makeButton("x");
      this.rotateButtons.y = makeButton("y");
      this.rotateButtons.z = makeButton("z");

      panel.appendChild(this.rotateButtons.x);
      panel.appendChild(this.rotateButtons.y);
      panel.appendChild(this.rotateButtons.z);
      document.body.appendChild(panel);
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

    this.rotateButtonsPanel.style.left = "12px";
    this.rotateButtonsPanel.style.right = "auto";
    this.rotateButtonsPanel.style.bottom = isMobile ? "92px" : "108px";
    this.rotateButtonsPanel.style.flexDirection = "column";
    this.rotateButtonsPanel.style.gap = isMobile ? "6px" : "8px";
    this.rotateButtonsPanel.style.padding = isMobile ? "6px" : "8px";
    this.rotateButtonsPanel.style.borderRadius = isMobile ? "12px" : "14px";
    this.rotateButtonsPanel.style.alignItems = "stretch";

    for (const button of Object.values(this.rotateButtons)) {
      if (!button) continue;

      button.style.width = isMobile ? "58px" : "68px";
      button.style.minWidth = isMobile ? "58px" : "68px";
      button.style.height = isMobile ? "44px" : "50px";
      button.style.padding = isMobile ? "4px 6px" : "6px 8px";

      const children = button.children;
      if (children[1]) children[1].style.fontSize = isMobile ? "12px" : "13px";
      if (children[2]) children[2].style.fontSize = isMobile ? "9px" : "10px";
      if (children[3]) children[3].style.fontSize = isMobile ? "8px" : "9px";
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

    if (!canRotate) {
      this.hoverRotateAxis = null;
      this.clearRotationGhost();
    }

    if (this.rotateButtonsPanel) {
      this.rotateButtonsPanel.style.opacity = canRotate ? "1" : "0.55";
    }

    for (const [axis, button] of Object.entries(this.rotateButtons)) {
      if (!button) continue;

      const isHovered = canRotate && this.hoverRotateAxis === axis;

      button.disabled = !canRotate;
      button.style.cursor = canRotate ? "pointer" : "default";
      button.style.opacity = canRotate ? "1" : "0.5";
      button.style.background = isHovered
        ? "rgba(255,255,255,0.22)"
        : canRotate
        ? "rgba(255,255,255,0.14)"
        : "rgba(255,255,255,0.08)";
      button.style.transform = isHovered ? "translateY(-1px)" : "translateY(0)";
      button.style.boxShadow = isHovered
        ? `0 0 0 1px ${this.axisColorMap[axis]} inset, 0 8px 20px rgba(0,0,0,0.18)`
        : "none";
    }
  }

  createMoveJoystick() {
    let root = document.getElementById("moveJoystickRoot");

    if (!root) {
      root = document.createElement("div");
      root.id = "moveJoystickRoot";
      root.style.position = "fixed";
      root.style.right = "16px";
      root.style.left = "auto";
      root.style.bottom = "16px";
      root.style.zIndex = "26";
      root.style.width = "108px";
      root.style.height = "108px";
      root.style.userSelect = "none";
      root.style.webkitUserSelect = "none";
      root.style.touchAction = "none";
      root.style.pointerEvents = "auto";

      const base = document.createElement("div");
      base.id = "moveJoystickBase";
      base.style.position = "absolute";
      base.style.left = "0";
      base.style.top = "0";
      base.style.width = "100%";
      base.style.height = "100%";
      base.style.borderRadius = "999px";
      base.style.background = "rgba(0,0,0,0.30)";
      base.style.backdropFilter = "blur(8px)";
      base.style.border = "1px solid rgba(255,255,255,0.12)";
      base.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      base.style.overflow = "hidden";
      base.style.touchAction = "none";

      const ring = document.createElement("div");
      ring.style.position = "absolute";
      ring.style.left = "50%";
      ring.style.top = "50%";
      ring.style.width = "72px";
      ring.style.height = "72px";
      ring.style.marginLeft = "-36px";
      ring.style.marginTop = "-36px";
      ring.style.borderRadius = "999px";
      ring.style.border = "1px solid rgba(255,255,255,0.08)";
      ring.style.background = "rgba(255,255,255,0.02)";
      ring.style.pointerEvents = "none";

      const knob = document.createElement("div");
      knob.id = "moveJoystickKnob";
      knob.style.position = "absolute";
      knob.style.left = "50%";
      knob.style.top = "50%";
      knob.style.width = "52px";
      knob.style.height = "52px";
      knob.style.marginLeft = "-26px";
      knob.style.marginTop = "-26px";
      knob.style.borderRadius = "999px";
      knob.style.background = "rgba(255,255,255,0.22)";
      knob.style.border = "1px solid rgba(255,255,255,0.16)";
      knob.style.boxShadow = "0 6px 18px rgba(0,0,0,0.16)";
      knob.style.transform = "translate(0px, 0px)";
      knob.style.transition = "transform 0.08s linear, background 0.12s ease";
      knob.style.pointerEvents = "none";

      const hint = document.createElement("div");
      hint.textContent = "MOVE";
      hint.style.position = "absolute";
      hint.style.left = "50%";
      hint.style.top = "-20px";
      hint.style.transform = "translateX(-50%)";
      hint.style.fontSize = "11px";
      hint.style.fontWeight = "700";
      hint.style.letterSpacing = "1px";
      hint.style.color = "rgba(255,255,255,0.72)";
      hint.style.pointerEvents = "none";

      base.appendChild(ring);
      base.appendChild(knob);
      root.appendChild(base);
      root.appendChild(hint);
      document.body.appendChild(root);

      base.addEventListener("pointerdown", this.onJoystickPointerDown, {
        passive: false,
      });

      window.addEventListener("pointermove", this.onJoystickPointerMove, {
        passive: false,
      });

      window.addEventListener("pointerup", this.onJoystickPointerUp, {
        passive: false,
      });

      window.addEventListener("pointercancel", this.onJoystickPointerUp, {
        passive: false,
      });

      this.joystickBase = base;
      this.joystickKnob = knob;
    } else {
      this.joystickBase = root.querySelector("#moveJoystickBase");
      this.joystickKnob = root.querySelector("#moveJoystickKnob");
    }

    this.joystickRoot = root;
    this.updateJoystickLayout();
    this.updateJoystickUI();
    this.resetJoystickVisual();
  }

  updateJoystickLayout() {
    if (!this.joystickRoot) return;

    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 700;

    this.joystickRoot.style.right = "16px";
    this.joystickRoot.style.left = "auto";
    this.joystickRoot.style.bottom = isMobile ? "84px" : "96px";
    this.joystickRoot.style.width = isMobile ? "96px" : "108px";
    this.joystickRoot.style.height = isMobile ? "96px" : "108px";

    if (this.joystickKnob) {
      this.joystickKnob.style.width = isMobile ? "46px" : "52px";
      this.joystickKnob.style.height = isMobile ? "46px" : "52px";
      this.joystickKnob.style.marginLeft = isMobile ? "-23px" : "-26px";
      this.joystickKnob.style.marginTop = isMobile ? "-23px" : "-26px";
    }

    this.joystickMaxRadius = isMobile ? 28 : 34;
  }

  canUseJoystick() {
    if (!this.blockSystem) return false;
    if (this.isGameOver || this.isRestarting) return false;
    if (!this.blockSystem.getCurrentPreviewBlock()) return false;

    return (
      this.blockSystem.state === "EDIT" ||
      this.blockSystem.state === "ROTATE"
    );
  }

  updateJoystickUI() {
    if (!this.joystickRoot || !this.joystickBase) return;

    const enabled = this.canUseJoystick();

    this.joystickRoot.style.opacity = enabled ? "1" : "0.45";
    this.joystickRoot.style.pointerEvents = enabled ? "auto" : "none";
    this.joystickBase.style.background = enabled
      ? "rgba(0,0,0,0.30)"
      : "rgba(0,0,0,0.18)";

    if (!enabled) {
      this.releaseJoystick();
    }
  }

  resetJoystickVisual() {
    if (!this.joystickKnob) return;
    this.joystickKnob.style.transform = "translate(0px, 0px)";
    this.joystickKnob.style.background = this.joystickActive
      ? "rgba(255,255,255,0.30)"
      : "rgba(255,255,255,0.22)";
  }

  releaseJoystick() {
    this.joystickPointerId = null;
    this.joystickActive = false;
    this.joystickInput.set(0, 0);
    this.resetJoystickVisual();
  }

  updateJoystickFromEvent(event) {
    if (!this.joystickBase || !this.joystickKnob) return;

    const rect = this.joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;

    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;

    const distance = Math.hypot(dx, dy);
    const maxRadius = this.joystickMaxRadius;

    if (distance > maxRadius && distance > 0.0001) {
      const scale = maxRadius / distance;
      dx *= scale;
      dy *= scale;
    }

    this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joystickKnob.style.background = "rgba(255,255,255,0.30)";

    this.joystickInput.set(dx / maxRadius, -dy / maxRadius);
  }

  onJoystickPointerDown(event) {
    if (!this.canUseJoystick()) return;

    event.preventDefault();
    event.stopPropagation();

    this.joystickPointerId = event.pointerId;
    this.joystickActive = true;

    if (this.joystickBase?.setPointerCapture) {
      try {
        this.joystickBase.setPointerCapture(event.pointerId);
      } catch (_) {}
    }

    this.updateJoystickFromEvent(event);
  }

  onJoystickPointerMove(event) {
    if (!this.joystickActive) return;
    if (this.joystickPointerId !== event.pointerId) return;

    event.preventDefault();
    this.updateJoystickFromEvent(event);
  }

  onJoystickPointerUp(event) {
    if (!this.joystickActive) return;
    if (this.joystickPointerId !== event.pointerId) return;

    event.preventDefault();

    if (this.joystickBase?.releasePointerCapture) {
      try {
        this.joystickBase.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    this.releaseJoystick();
  }

  applyJoystickMovement(dt) {
    if (!this.canUseJoystick()) return;
    if (!this.joystickActive) return;

    const block = this.blockSystem.getCurrentPreviewBlock();
    if (!block?.mesh) return;

    const inputLength = Math.min(1, this.joystickInput.length());
    if (inputLength <= 0.001) return;

    this.renderer.camera.getWorldDirection(this.joystickForward);
    this.joystickForward.y = 0;

    if (this.joystickForward.lengthSq() < 1e-6) {
      this.joystickForward.set(0, 0, -1);
    } else {
      this.joystickForward.normalize();
    }

    this.joystickRight.crossVectors(this.joystickForward, this.worldUp);

    if (this.joystickRight.lengthSq() < 1e-6) {
      this.joystickRight.set(1, 0, 0);
    } else {
      this.joystickRight.normalize();
    }

    this.joystickMove
      .copy(this.joystickRight)
      .multiplyScalar(this.joystickInput.x)
      .addScaledVector(this.joystickForward, this.joystickInput.y);

    if (this.joystickMove.lengthSq() < 1e-6) return;

    this.joystickMove.normalize();

    const speed = this.joystickMoveSpeed * inputLength;
    const moveDistance = speed * dt;

    const nextX = block.mesh.position.x + this.joystickMove.x * moveDistance;
    const nextZ = block.mesh.position.z + this.joystickMove.z * moveDistance;

    this.blockSystem.setPreviewPosition(nextX, nextZ);
  }

  updateActionButtonLayout() {
    if (!this.actionButton) return;

    const isMobile = window.innerWidth <= 768 || window.innerHeight <= 700;

    if (isMobile) {
      this.actionButton.style.minWidth = "84px";
      this.actionButton.style.width = "84px";
      this.actionButton.style.height = "42px";
      this.actionButton.style.padding = "0 10px";
      this.actionButton.style.fontSize = "14px";
      this.actionButton.style.borderRadius = "12px";
    } else {
      this.actionButton.style.minWidth = "112px";
      this.actionButton.style.width = "112px";
      this.actionButton.style.height = "48px";
      this.actionButton.style.padding = "0 16px";
      this.actionButton.style.fontSize = "16px";
      this.actionButton.style.borderRadius = "14px";
    }
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

    const key = String(nextInfo.path ?? nextInfo.key ?? nextInfo.file ?? nextInfo.name ?? "");
    if (this.nextPreviewKey === key) return;

    this.nextPreviewKey = key;

    if (this.nextNameLabel) {
      this.nextNameLabel.textContent = this.formatModelName(
        nextInfo.file ?? nextInfo.name ?? nextInfo.path ?? nextInfo.key ?? "-"
      );
    }

    if (this.nextPreviewMesh) {
      this.nextPreviewScene.remove(this.nextPreviewMesh);
      this.nextPreviewMesh = null;
    }

    if (!this.blockSystem.factory?.createUiPreviewObject) return;

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
      const material = child.material.clone();
      material.transparent = true;
      material.opacity = 0.28;
      material.depthWrite = false;

      if ("emissive" in material && material.emissive instanceof THREE.Color) {
        material.emissive = material.emissive.clone();
        material.emissiveIntensity = 0.45;
      }

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

    this.updateRotationButtonHints();

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

    this.updateRotationButtonHints();

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

  createBgmToggleButton() {
    let button = document.getElementById("bgmToggleButton");

    if (!button) {
      button = document.createElement("button");
      button.id = "bgmToggleButton";
      button.type = "button";
      button.style.position = "fixed";
      button.style.top = "16px";
      button.style.right = "18px";
      button.style.zIndex = "20";
      button.style.padding = "8px 14px";
      button.style.border = "0";
      button.style.borderRadius = "12px";
      button.style.background = "rgba(0,0,0,0.55)";
      button.style.color = "#fff";
      button.style.fontSize = "13px";
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
    this.updateJoystickUI();
  }

  onResize() {
    if (this.renderer.resize) {
      this.renderer.resize(window.innerWidth, window.innerHeight);
    }

    this.applyNextPreviewLayout();
    this.updateRotateButtonsLayout();
    this.updateJoystickLayout();
    this.updateActionButtonLayout();
  }

  async handleFail() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    this.isGameOver = true;
    this.updateControlButton();
    this.updateRotateButtonsUI();
    this.updateJoystickUI();

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

    this.releaseJoystick();

    this.isRestarting = false;
    this.updateControlButton();
    this.updateRotateButtonsUI();
    this.updateJoystickUI();
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
      this.updateJoystickUI();
      this.updateActionButtonLayout();
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
  triggerLandingEffects() {
    if (!this.blockSystem?.blocks || !this.renderer) return;

    for (const block of this.blockSystem.blocks) {
      if (block.state === "preview") continue;

      if (block.state === "settled" && !block.__landingFxPlayed) {
        block.__landingFxPlayed = true;

        const pos = block.body.translation();
        const radius = Math.max(
          0.34,
          Math.min(0.72, (block.halfHeight ?? 0.5) * 0.9)
        );

        this.renderer.spawnLandingEffect(
          new THREE.Vector3(
            pos.x,
            pos.y - (block.halfHeight ?? 0.5) + 0.03,
            pos.z
          ),
          {
            radius,
            color: block.primaryColor ?? 0xffd07a,
          }
        );
      }

      if (block.state === "falling" || block.state === "landing") {
        block.__landingFxPlayed = false;
      }
    }
  }
    async animate(time) {
    if (!this.isAnimating) return;

    requestAnimationFrame(this.animate);

    const dt =
      this.lastTime > 0
        ? Math.min(0.033, (time - this.lastTime) / 1000)
        : 0.016;

    this.lastTime = time;

    if (!this.isGameOver && !this.isRestarting && this.blockSystem) {
      this.physics.step();
      this.blockSystem.update();

      this.applyJoystickMovement?.(dt);
      this.triggerLandingEffects();

      const followHeight = this.blockSystem.getMaxHeight();
      this.renderer.updateCamera(followHeight);

      this.updateHeightUI();
      this.updateControlButton?.();
      this.updateRotateButtonsUI?.();
      this.updateJoystickUI?.();
      await this.updateNextPreviewUI?.();
    }

    if (this.placementController) {
      this.placementController.update();
    }

    this.updateRotationButtonHints?.();

    if (this.renderer.update) {
      this.renderer.update(dt);
    }

    this.renderer.render();
    this.renderNextPreview?.();
  }
}