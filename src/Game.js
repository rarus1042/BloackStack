import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { Renderer } from "./Renderer.js";
import { Physics } from "./Physics.js";
import { BlockSystem } from "./BlockSystem.js";
import { PlacementController } from "./PlacementController.js";
import { SupabaseRankingService } from "./SupabaseRankingService.js";

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

    this.appVersion = "v0.1.21-mobile-ui-responsive";

    this.renderer = new Renderer(this.config);
    this.physics = new Physics(this.config);

    this.blockSystem = null;
    this.placementController = null;

    this.nickname = "Player";
    this.bestHeight = 0;
    this.lastRank = null;
    this.lastTime = 0;
    this.isGameOver = false;
    this.isRestarting = false;

    this.rankingService = new SupabaseRankingService({
      url: "https://lrnrdkgnngayetdkrmoo.supabase.co",
      key: "sb_publishable_kF_jTxBiSpZHh4j59N4AZA_nA6rPkOn",
      table: "leaderboard_scores",
    });
    this.settingsButton = null;
    this.settingsModal = null;
    this.settingsBackdrop = null;
    this.settingsCloseButton = null;
    this.settingsLeaderboardList = null;
    this.settingsLeaderboardStatus = null;
    this.settingsBgmToggleButton = null;
    this.settingsRefreshButton = null;
    this.isSettingsOpen = false;
    this.cachedLeaderboard = [];

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
    this.createSettingsButton();
    this.createSettingsModal();
    this.createRotateStepButtons();
    this.createMoveJoystick();
    this.createNextPreviewUI();
    this.applyGlobalUiLayout();
    this.setupBgmUnlock();
  }

  getResponsiveUiMetrics() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const shortSide = Math.max(1, Math.min(w, h));
    const longSide = Math.max(w, h);
    const aspect = longSide / shortSide;
    const isMobile = w <= 768 || h <= 700;
    const isLandscape = w > h;

    const baseScale = THREE.MathUtils.clamp(
      Math.min(w / 430, h / 860),
      0.68,
      1.08
    );

    const landscapePenalty =
      isLandscape && isMobile ? THREE.MathUtils.clamp(aspect - 1, 0, 1.6) * 0.12 : 0;

    const compactScale = THREE.MathUtils.clamp(
      baseScale - landscapePenalty,
      isMobile ? 0.64 : 0.88,
      1.05
    );

    const hudScale = THREE.MathUtils.clamp(
      compactScale * (isLandscape && isMobile ? 0.9 : 0.98),
      0.62,
      1.02
    );

    const previewScale = THREE.MathUtils.clamp(
      compactScale * (isLandscape && isMobile ? 0.82 : 0.92),
      0.58,
      1
    );

    const controlScale = THREE.MathUtils.clamp(
      compactScale * (isLandscape && isMobile ? 0.78 : 0.9),
      0.54,
      1
    );

    return {
      w,
      h,
      shortSide,
      longSide,
      aspect,
      isMobile,
      isLandscape,
      compactScale,
      hudScale,
      previewScale,
      controlScale,
    };
  }

  applyHudLayout() {
    const panel = this.heightLabel?.parentElement;
    if (!panel) return;

    const metrics = this.getResponsiveUiMetrics();
    const fontScale = metrics.hudScale;
    const panelWidth = metrics.isMobile
      ? Math.round(Math.min(172, Math.max(124, metrics.w * 0.32)))
      : 188;

    panel.style.position = "fixed";
    panel.style.left = metrics.isMobile ? "10px" : "16px";
    panel.style.top = metrics.isMobile ? "10px" : "16px";
    panel.style.width = `${panelWidth}px`;
    panel.style.maxWidth = `${panelWidth}px`;
    panel.style.padding = `${Math.round(10 * fontScale)}px ${Math.round(12 * fontScale)}px`;
    panel.style.borderRadius = `${Math.round(14 * fontScale)}px`;
    panel.style.background = "rgba(0,0,0,0.42)";
    panel.style.backdropFilter = "blur(8px)";
    panel.style.border = "1px solid rgba(255,255,255,0.10)";
    panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
    panel.style.color = "#fff";
    panel.style.boxSizing = "border-box";
    panel.style.zIndex = "24";
    panel.style.pointerEvents = "none";
    panel.style.userSelect = "none";
    panel.style.webkitUserSelect = "none";

    const primaryFont = `${Math.max(11, Math.round((metrics.isMobile ? 11 : 13) * fontScale))}px`;
    const secondaryFont = `${Math.max(10, Math.round((metrics.isMobile ? 10 : 12) * fontScale))}px`;

    for (const label of [
      this.nicknameLabel,
      this.heightLabel,
      this.bestHeightLabel,
      this.versionLabel,
    ]) {
      if (!label) continue;
      label.style.lineHeight = "1.25";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
    }

    if (this.nicknameLabel) {
      this.nicknameLabel.style.fontSize = primaryFont;
      this.nicknameLabel.style.fontWeight = "700";
      this.nicknameLabel.style.margin = "0";
    }

    if (this.heightLabel) {
      this.heightLabel.style.fontSize = primaryFont;
      this.heightLabel.style.fontWeight = "700";
      this.heightLabel.style.marginTop = `${Math.max(4, Math.round(4 * fontScale))}px`;
    }

    if (this.bestHeightLabel) {
      this.bestHeightLabel.style.fontSize = secondaryFont;
      this.bestHeightLabel.style.marginTop = `${Math.max(3, Math.round(4 * fontScale))}px`;
      this.bestHeightLabel.style.opacity = "0.95";
    }

    if (this.versionLabel) {
      this.versionLabel.style.fontSize = `${Math.max(9, Math.round((metrics.isMobile ? 9 : 11) * fontScale))}px`;
      this.versionLabel.style.marginTop = `${Math.max(3, Math.round(4 * fontScale))}px`;
      this.versionLabel.style.opacity = "0.72";
    }
  }

  applySettingsButtonLayout() {
    if (!this.settingsButton) return;

    const metrics = this.getResponsiveUiMetrics();
    const size = metrics.isMobile
      ? Math.round(34 + 10 * metrics.controlScale)
      : 46;
    const radius = Math.round(size * 0.3);

    this.settingsButton.style.top = metrics.isMobile ? "10px" : "16px";
    this.settingsButton.style.right = metrics.isMobile ? "10px" : "18px";
    this.settingsButton.style.width = `${size}px`;
    this.settingsButton.style.height = `${size}px`;
    this.settingsButton.style.borderRadius = `${radius}px`;
    this.settingsButton.style.fontSize = `${Math.max(18, Math.round(size * 0.5))}px`;
  }

  applySettingsModalLayout() {
    if (!this.settingsModal) return;

    const metrics = this.getResponsiveUiMetrics();
    this.settingsModal.style.width = metrics.isMobile ? "min(420px, 92vw)" : "min(520px, 92vw)";
    this.settingsModal.style.maxHeight = metrics.isMobile ? "82vh" : "78vh";
    this.settingsModal.style.borderRadius = metrics.isMobile ? "16px" : "18px";
  }

  applyGlobalUiLayout() {
    this.applyHudLayout();
    this.applySettingsButtonLayout();
    this.applySettingsModalLayout();
    this.applyNextPreviewLayout();
    this.updateRotateButtonsLayout();
    this.updateJoystickLayout();
    this.updateActionButtonLayout();
  }

  getNextPreviewLayout() {
    const metrics = this.getResponsiveUiMetrics();

    if (metrics.isMobile && metrics.isLandscape) {
      return {
        isMobile: true,
        panelTop: 58,
        panelRight: 8,
        panelWidth: Math.round(132 + 20 * metrics.previewScale),
        panelPadding: 8,
        panelRadius: 14,
        titleFont: 9,
        canvasSize: Math.round(78 + 20 * metrics.previewScale),
        canvasPixelSize: Math.round((78 + 20 * metrics.previewScale) * 2),
        canvasRadius: 10,
        nameFont: 9,
        nameMinHeight: 16,
      };
    }

    if (metrics.isMobile) {
      return {
        isMobile: true,
        panelTop: 58,
        panelRight: 10,
        panelWidth: Math.round(148 + 18 * metrics.previewScale),
        panelPadding: 9,
        panelRadius: 16,
        titleFont: 10,
        canvasSize: Math.round(94 + 24 * metrics.previewScale),
        canvasPixelSize: Math.round((94 + 24 * metrics.previewScale) * 2),
        canvasRadius: 12,
        nameFont: 10,
        nameMinHeight: 18,
      };
    }

    return {
      isMobile: false,
      panelTop: 84,
      panelRight: 18,
      panelWidth: 208,
      panelPadding: 12,
      panelRadius: 20,
      titleFont: 12,
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
    this.nextPreviewCanvasWrap.style.margin = `${layout.isMobile ? 8 : 10}px auto 0`;
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
    this.nextNameLabel.style.marginTop = `${layout.isMobile ? 10 : 16}px`;
    this.nextNameLabel.style.paddingBottom = layout.isMobile ? "2px" : "4px";

    const title = this.nextPanel.querySelector(".next-preview-title");
    if (title) {
      title.style.fontSize = `${layout.titleFont}px`;
      title.style.textAlign = "center";
      title.style.marginBottom = layout.isMobile ? "0" : "0";
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

    const metrics = this.getResponsiveUiMetrics();
    const isCompact = metrics.isMobile;
    const isLandscapeCompact = metrics.isMobile && metrics.isLandscape;

    const panelLeft = isLandscapeCompact ? 8 : 12;
    const bottom = isLandscapeCompact ? 68 : isCompact ? 84 : 108;
    const panelGap = isLandscapeCompact ? 4 : isCompact ? 6 : 8;
    const panelPadding = isLandscapeCompact ? 4 : isCompact ? 6 : 8;
    const panelRadius = isLandscapeCompact ? 10 : isCompact ? 12 : 14;
    const buttonWidth = isLandscapeCompact ? 46 : isCompact ? 56 : 68;
    const buttonHeight = isLandscapeCompact ? 34 : isCompact ? 42 : 50;

    this.rotateButtonsPanel.style.left = `${panelLeft}px`;
    this.rotateButtonsPanel.style.right = "auto";
    this.rotateButtonsPanel.style.bottom = `${bottom}px`;
    this.rotateButtonsPanel.style.flexDirection = "column";
    this.rotateButtonsPanel.style.gap = `${panelGap}px`;
    this.rotateButtonsPanel.style.padding = `${panelPadding}px`;
    this.rotateButtonsPanel.style.borderRadius = `${panelRadius}px`;
    this.rotateButtonsPanel.style.alignItems = "stretch";

    for (const button of Object.values(this.rotateButtons)) {
      if (!button) continue;

      button.style.width = `${buttonWidth}px`;
      button.style.minWidth = `${buttonWidth}px`;
      button.style.height = `${buttonHeight}px`;
      button.style.padding = isLandscapeCompact ? "3px 4px" : isCompact ? "4px 6px" : "6px 8px";

      const children = button.children;
      if (children[1]) children[1].style.fontSize = isLandscapeCompact ? "10px" : isCompact ? "12px" : "13px";
      if (children[2]) children[2].style.fontSize = isLandscapeCompact ? "8px" : isCompact ? "9px" : "10px";
      if (children[3]) children[3].style.fontSize = isLandscapeCompact ? "7px" : isCompact ? "8px" : "9px";
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
    ring.id = "moveJoystickRing";
    ring.style.position = "absolute";
    ring.style.borderRadius = "999px";
    ring.style.border = "1px solid rgba(255,255,255,0.08)";
    ring.style.background = "rgba(255,255,255,0.02)";
    ring.style.pointerEvents = "none";
    ring.style.boxSizing = "border-box";

    const knob = document.createElement("div");
    knob.id = "moveJoystickKnob";
    knob.style.position = "absolute";
    knob.style.borderRadius = "999px";
    knob.style.background = "rgba(255,255,255,0.22)";
    knob.style.border = "1px solid rgba(255,255,255,0.16)";
    knob.style.boxShadow = "0 6px 18px rgba(0,0,0,0.16)";
    knob.style.transition = "left 0.08s linear, top 0.08s linear, background 0.12s ease";
    knob.style.pointerEvents = "none";
    knob.style.boxSizing = "border-box";

    const hint = document.createElement("div");
    hint.id = "moveJoystickHint";
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
  if (!this.joystickRoot || !this.joystickBase) return;

  const metrics = this.getResponsiveUiMetrics();
  const isCompact = metrics.isMobile;
  const isLandscapeCompact = metrics.isMobile && metrics.isLandscape;

  const size = isLandscapeCompact ? 76 : isCompact ? 92 : 108;
  const knobSize = isLandscapeCompact ? 34 : isCompact ? 44 : 52;
  const ringSize = isLandscapeCompact ? 54 : isCompact ? 68 : 72;

  this.joystickSize = size;
  this.joystickKnobSize = knobSize;
  this.joystickRingSize = ringSize;

  this.joystickRoot.style.right = isLandscapeCompact ? "10px" : "16px";
  this.joystickRoot.style.left = "auto";
  this.joystickRoot.style.bottom = isLandscapeCompact ? "12px" : isCompact ? "84px" : "96px";
  this.joystickRoot.style.width = `${size}px`;
  this.joystickRoot.style.height = `${size}px`;

  const ring = this.joystickBase.querySelector("#moveJoystickRing");
  if (ring) {
    const ringLeft = (size - ringSize) * 0.5;
    const ringTop = (size - ringSize) * 0.5;
    ring.style.width = `${ringSize}px`;
    ring.style.height = `${ringSize}px`;
    ring.style.left = `${ringLeft}px`;
    ring.style.top = `${ringTop}px`;
  }

  const hint = this.joystickRoot.querySelector("#moveJoystickHint");
  if (hint) {
    hint.style.top = isLandscapeCompact ? "-16px" : "-20px";
    hint.style.fontSize = isLandscapeCompact ? "9px" : isCompact ? "10px" : "11px";
  }

  if (this.joystickKnob) {
    this.joystickKnob.style.width = `${knobSize}px`;
    this.joystickKnob.style.height = `${knobSize}px`;
  }

  this.joystickMaxRadius = isLandscapeCompact ? 22 : isCompact ? 27 : 34;

  this.resetJoystickVisual();
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

  const knobSize = this.joystickKnobSize ?? 52;
  const baseSize = this.joystickSize ?? 108;

  const left = (baseSize - knobSize) * 0.5;
  const top = (baseSize - knobSize) * 0.5;

  this.joystickKnob.style.left = `${left}px`;
  this.joystickKnob.style.top = `${top}px`;
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

  const knobSize = this.joystickKnobSize ?? 52;
  const baseSize = this.joystickSize ?? rect.width;

  const left = (baseSize - knobSize) * 0.5 + dx;
  const top = (baseSize - knobSize) * 0.5 + dy;

  this.joystickKnob.style.left = `${left}px`;
  this.joystickKnob.style.top = `${top}px`;
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

    const metrics = this.getResponsiveUiMetrics();
    const isCompact = metrics.isMobile;
    const isLandscapeCompact = metrics.isMobile && metrics.isLandscape;

    const width = isLandscapeCompact ? 86 : isCompact ? 94 : 112;
    const height = isLandscapeCompact ? 38 : isCompact ? 42 : 48;
    const bottom = isLandscapeCompact ? 12 : isCompact ? 18 : 22;

    this.actionButton.style.position = "fixed";
    this.actionButton.style.left = "50%";
    this.actionButton.style.right = "auto";
    this.actionButton.style.transform = "translateX(-50%)";
    this.actionButton.style.bottom = `${bottom}px`;
    this.actionButton.style.minWidth = `${width}px`;
    this.actionButton.style.width = `${width}px`;
    this.actionButton.style.maxWidth = `${width}px`;
    this.actionButton.style.height = `${height}px`;
    this.actionButton.style.padding = isLandscapeCompact ? "0 8px" : isCompact ? "0 10px" : "0 16px";
    this.actionButton.style.fontSize = isLandscapeCompact ? "13px" : isCompact ? "14px" : "16px";
    this.actionButton.style.borderRadius = isLandscapeCompact ? "11px" : isCompact ? "12px" : "14px";
    this.actionButton.style.whiteSpace = "nowrap";
    this.actionButton.style.zIndex = "28";
    this.actionButton.style.boxSizing = "border-box";
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

  createSettingsButton() {
    let button = document.getElementById("settingsButton");

    if (!button) {
      button = document.createElement("button");
      button.id = "settingsButton";
      button.type = "button";
      button.innerHTML = "⚙";
      button.style.position = "fixed";
      button.style.top = "16px";
      button.style.right = "18px";
      button.style.zIndex = "30";
      button.style.width = "46px";
      button.style.height = "46px";
      button.style.border = "0";
      button.style.borderRadius = "14px";
      button.style.background = "rgba(0,0,0,0.55)";
      button.style.color = "#fff";
      button.style.fontSize = "24px";
      button.style.fontWeight = "700";
      button.style.cursor = "pointer";
      button.style.backdropFilter = "blur(6px)";
      button.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
      button.style.userSelect = "none";
      button.style.webkitUserSelect = "none";
      document.body.appendChild(button);
    }

    button.addEventListener("click", () => {
      if (this.isSettingsOpen) {
        this.closeSettingsModal();
      } else {
        this.openSettingsModal();
      }
    });

    this.settingsButton = button;
  }

  createSettingsModal() {
    let backdrop = document.getElementById("settingsModalBackdrop");
    let modal = document.getElementById("settingsModal");

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "settingsModalBackdrop";
      backdrop.style.position = "fixed";
      backdrop.style.inset = "0";
      backdrop.style.zIndex = "60";
      backdrop.style.background = "rgba(0,0,0,0.42)";
      backdrop.style.backdropFilter = "blur(6px)";
      backdrop.style.display = "none";
      backdrop.style.alignItems = "center";
      backdrop.style.justifyContent = "center";

      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
          this.closeSettingsModal();
        }
      });

      modal = document.createElement("div");
      modal.id = "settingsModal";
      modal.style.width = "min(520px, 92vw)";
      modal.style.maxHeight = "78vh";
      modal.style.display = "flex";
      modal.style.flexDirection = "column";
      modal.style.borderRadius = "18px";
      modal.style.background = "rgba(16,20,28,0.94)";
      modal.style.border = "1px solid rgba(255,255,255,0.10)";
      modal.style.boxShadow = "0 18px 46px rgba(0,0,0,0.30)";
      modal.style.overflow = "hidden";
      modal.style.color = "#fff";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.padding = "16px 18px";
      header.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

      const title = document.createElement("div");
      title.textContent = "설정";
      title.style.fontSize = "18px";
      title.style.fontWeight = "800";

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "✕";
      closeBtn.style.width = "36px";
      closeBtn.style.height = "36px";
      closeBtn.style.border = "0";
      closeBtn.style.borderRadius = "10px";
      closeBtn.style.background = "rgba(255,255,255,0.10)";
      closeBtn.style.color = "#fff";
      closeBtn.style.cursor = "pointer";
      closeBtn.addEventListener("click", () => this.closeSettingsModal());

      header.appendChild(title);
      header.appendChild(closeBtn);

      const body = document.createElement("div");
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.gap = "14px";
      body.style.padding = "16px 18px";
      body.style.minHeight = "0";

      const bgmRow = document.createElement("div");
      bgmRow.style.display = "flex";
      bgmRow.style.alignItems = "center";
      bgmRow.style.justifyContent = "space-between";
      bgmRow.style.padding = "12px 14px";
      bgmRow.style.borderRadius = "14px";
      bgmRow.style.background = "rgba(255,255,255,0.05)";

      const bgmLabel = document.createElement("div");
      bgmLabel.textContent = "BGM";

      const bgmToggle = document.createElement("button");
      bgmToggle.type = "button";
      bgmToggle.style.minWidth = "88px";
      bgmToggle.style.height = "38px";
      bgmToggle.style.border = "0";
      bgmToggle.style.borderRadius = "10px";
      bgmToggle.style.background = "rgba(255,255,255,0.14)";
      bgmToggle.style.color = "#fff";
      bgmToggle.style.fontWeight = "700";
      bgmToggle.style.cursor = "pointer";
      bgmToggle.addEventListener("click", this.onBgmToggleClick);

      bgmRow.appendChild(bgmLabel);
      bgmRow.appendChild(bgmToggle);

      const rankHeader = document.createElement("div");
      rankHeader.style.display = "flex";
      rankHeader.style.alignItems = "center";
      rankHeader.style.justifyContent = "space-between";
      rankHeader.style.gap = "12px";

      const rankTitle = document.createElement("div");
      rankTitle.textContent = "글로벌 랭킹 TOP 100";
      rankTitle.style.fontSize = "16px";
      rankTitle.style.fontWeight = "800";

      const refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.textContent = "새로고침";
      refreshBtn.style.height = "34px";
      refreshBtn.style.padding = "0 12px";
      refreshBtn.style.border = "0";
      refreshBtn.style.borderRadius = "10px";
      refreshBtn.style.background = "rgba(255,255,255,0.12)";
      refreshBtn.style.color = "#fff";
      refreshBtn.style.cursor = "pointer";
      refreshBtn.addEventListener("click", async () => {
        await this.refreshLeaderboardUI(true);
      });

      rankHeader.appendChild(rankTitle);
      rankHeader.appendChild(refreshBtn);

      const rankStatus = document.createElement("div");
      rankStatus.style.fontSize = "12px";
      rankStatus.style.opacity = "0.72";

      const rankList = document.createElement("div");
      rankList.style.display = "flex";
      rankList.style.flexDirection = "column";
      rankList.style.gap = "8px";
      rankList.style.overflowY = "auto";
      rankList.style.maxHeight = "48vh";
      rankList.style.paddingRight = "4px";

      body.appendChild(bgmRow);
      body.appendChild(rankHeader);
      body.appendChild(rankStatus);
      body.appendChild(rankList);

      modal.appendChild(header);
      modal.appendChild(body);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      this.settingsCloseButton = closeBtn;
      this.settingsBgmToggleButton = bgmToggle;
      this.settingsRefreshButton = refreshBtn;
      this.settingsLeaderboardStatus = rankStatus;
      this.settingsLeaderboardList = rankList;
    }

    this.settingsBackdrop = backdrop;
    this.settingsModal = modal;
    this.updateSettingsBgmUI();
  }

  openSettingsModal() {
    if (!this.settingsBackdrop) return;
    this.isSettingsOpen = true;
    this.settingsBackdrop.style.display = "flex";
    this.refreshLeaderboardUI(false);
    this.updateSettingsBgmUI();
  }

  closeSettingsModal() {
    if (!this.settingsBackdrop) return;
    this.isSettingsOpen = false;
    this.settingsBackdrop.style.display = "none";
  }

  updateSettingsBgmUI() {
    if (!this.settingsBgmToggleButton) return;
    this.settingsBgmToggleButton.textContent = this.bgmEnabled ? "ON" : "OFF";
    this.settingsBgmToggleButton.style.opacity = this.bgmEnabled ? "1" : "0.72";
  }

  renderLeaderboardRows(entries = []) {
    if (!this.settingsLeaderboardList) return;

    this.settingsLeaderboardList.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.textContent = "랭킹 데이터가 없습니다.";
      empty.style.padding = "12px 14px";
      empty.style.borderRadius = "12px";
      empty.style.background = "rgba(255,255,255,0.05)";
      empty.style.fontSize = "13px";
      empty.style.opacity = "0.78";
      this.settingsLeaderboardList.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "46px 1fr 82px";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "10px 12px";
      row.style.borderRadius = "12px";
      row.style.background = "rgba(255,255,255,0.05)";

      const rank = document.createElement("div");
      rank.textContent = `${index + 1}위`;
      rank.style.fontWeight = "800";

      const nameWrap = document.createElement("div");
      nameWrap.style.display = "flex";
      nameWrap.style.flexDirection = "column";
      nameWrap.style.minWidth = "0";

      const name = document.createElement("div");
      name.textContent = entry.nickname || "Player";
      name.style.fontWeight = "700";
      name.style.whiteSpace = "nowrap";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";

      const meta = document.createElement("div");
      meta.textContent = `블럭 ${entry.blocks_used ?? 0}개`;
      meta.style.fontSize = "11px";
      meta.style.opacity = "0.68";

      const score = document.createElement("div");
      score.textContent = Number(entry.score ?? 0).toFixed(2);
      score.style.textAlign = "right";
      score.style.fontWeight = "800";

      nameWrap.appendChild(name);
      nameWrap.appendChild(meta);

      row.appendChild(rank);
      row.appendChild(nameWrap);
      row.appendChild(score);

      this.settingsLeaderboardList.appendChild(row);
    });
  }

  async refreshLeaderboardUI(force = false) {
    if (!this.settingsLeaderboardList || !this.rankingService?.isReady?.()) {
      if (this.settingsLeaderboardStatus) {
        this.settingsLeaderboardStatus.textContent = "Supabase 설정이 필요합니다.";
      }
      return;
    }

    if (this.settingsLeaderboardStatus) {
      this.settingsLeaderboardStatus.textContent = "랭킹 불러오는 중...";
    }

    try {
      if (force || !this.cachedLeaderboard.length) {
        this.cachedLeaderboard = await this.rankingService.fetchTop(100);
      }

      this.renderLeaderboardRows(this.cachedLeaderboard);

      if (this.settingsLeaderboardStatus) {
        this.settingsLeaderboardStatus.textContent = `총 ${this.cachedLeaderboard.length}개 표시 중`;
      }
    } catch (error) {
      console.error("Leaderboard fetch failed:", error);
      if (this.settingsLeaderboardStatus) {
        this.settingsLeaderboardStatus.textContent = "랭킹을 불러오지 못했습니다.";
      }
    }
  }

  updateBgmButtonUI() {
    this.updateSettingsBgmUI();
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

    const roundPeak = this.blockSystem?.getPeakStableHeight?.() ?? 0;
    const displayBest = Math.max(this.bestHeight, roundPeak);

    this.bestHeightLabel.textContent = `최고 기록: ${displayBest.toFixed(2)}`;
  }

  updateVersionUI() {
    if (!this.versionLabel) return;
    this.versionLabel.textContent = `버전: ${this.appVersion}`;
  }

  async submitRankingScore() {
    if (!this.blockSystem || !this.rankingService?.isReady?.()) return null;

    const score = this.blockSystem.getPeakStableHeight
      ? this.blockSystem.getPeakStableHeight()
      : this.blockSystem.getStableHeight();

    const blocksUsed = this.blockSystem.getCommittedBlockCount
      ? this.blockSystem.getCommittedBlockCount()
      : this.blockSystem.getBlockCount
      ? this.blockSystem.getBlockCount()
      : 0;

    const result = await this.rankingService.submitScore({
      nickname: this.nickname,
      score,
      blocksUsed,
      version: this.appVersion,
    });

    this.lastRank = result?.rank ?? null;
    return result;
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

    this.applyGlobalUiLayout();
  }

  async handleFail() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    this.isGameOver = true;
    this.updateControlButton();
    this.updateRotateButtonsUI();
    this.updateJoystickUI();

    setTimeout(async () => {
      try {
        const currentHeight = this.blockSystem.getStableHeight();
        const finalScore = this.blockSystem.getPeakStableHeight();

        if (finalScore > this.bestHeight) {
          this.bestHeight = finalScore;
        }

        this.updateBestHeightUI();

        let name = prompt(
          `실패!\n현재 높이: ${currentHeight.toFixed(2)}\n최종 점수(최고 안정 높이): ${finalScore.toFixed(2)}\n최고 기록: ${this.bestHeight.toFixed(2)}\n닉네임 입력:`,
          this.nickname || "Player"
        );

        if (!name || !name.trim()) {
          name = "Player";
        }

        this.nickname = name.trim();
        this.updateNicknameUI();

        try {
          const rankingResult = await this.submitRankingScore();
          if (rankingResult?.rank) {
            alert(
              `랭킹 등록 완료!\n닉네임: ${this.nickname}\n점수: ${finalScore.toFixed(2)}\n현재 순위: ${rankingResult.rank}위`
            );
          }
        } catch (rankingError) {
          console.warn("Ranking submit failed:", rankingError);
        }
      } finally {
        await this.restartGame();
      }
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

    await this.refreshLeaderboardUI(true);
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
        moveThreshold: 10,
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

      await this.refreshLeaderboardUI(true);

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