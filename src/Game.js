import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { Renderer } from "./Renderer.js";
import { Physics } from "./Physics.js";
import { BlockSystem } from "./BlockSystem.js";
import { SupabaseRankingService } from "./SupabaseRankingService.js";
import { PlacementGuide } from "./PlacementGuide.js";
import { GizmoController } from "./GizmoController.js";

export class Game {
  constructor() {
    this.config = {
      stageSize: 7,
      groundHeight: 0.01,
      stageThickness: 0.16,
      blockSize: 1,
      gridStep: 1,
      previewClampPadding: 0.55,

     slowFallSpeed: 1.25,
      fastFallSpeed: 4.0,

      spawnClearance: 10.4,
      minSpawnHeight: 8.0,

      heightStep: 0.5,

      cameraFollowLerp: 0.12,
      cameraHeightOffset: 0.35,
      cameraMinTargetY: 0.85,
    };

    this.appVersion = "v0.2.0-tetris-grid-drop";

    this.renderer = new Renderer(this.config);
    this.physics = new Physics(this.config);
    this.rotateGizmo = new GizmoController(this.renderer.scene, {
      blockSize: this.config.blockSize ?? 1,
    });
    this.rotateGizmo.hide();
    this.blockSystem = null;
    this.placementGuide = new PlacementGuide(this.renderer.scene, {
      stageSize: this.config.stageSize,
      padding: this.config.previewClampPadding ?? 0.35,
    });

    this.nickname = "Player";
    this.bestHeight = 0;
    this.lastRank = null;
    this.lastTime = 0;
    this.isGameOver = false;
    this.isRestarting = false;
    this.isSessionStarted = false;
    this.isStartOverlayReady = false;

    this.isActionHolding = false;
    this.actionHoldTimeoutId = null;
    this.actionHoldTriggeredInstant = false;
    this.rankingService = new SupabaseRankingService({
      url: "https://lrnrdkgnngayetdkrmoo.supabase.co",
      key: "sb_publishable_kF_jTxBiSpZHh4j59N4AZA_nA6rPkOn",
      table: "leaderboard_scores",
    });

    this.nicknameLabel = document.getElementById("nicknameLabel");
    this.heightLabel = document.getElementById("heightLabel");
    this.actionButton = document.getElementById("actionButton");

    this.bestHeightLabel = null;
    this.versionLabel = null;

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
    this.rotationModeActive = false;
    this.selectedRotateAxis = null;
    
    this.movePadPanel = null;
    this.moveButtons = { up: null, left: null, down: null, right: null };

    this.startOverlay = null;
    this.startButton = null;

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

    this.axisColorMap = {
      x: "#ff6b6b",
      y: "#6bff95",
      z: "#6ba8ff",
    };

    this.bgmEnabled = false;
    this.bgmUnlocked = false;
    this.bgm = new Audio("./assets/bgm.mp3");
    this.bgm.loop = true;
    this.bgm.volume = 0.4;
    this.bgm.preload = "auto";

    this.loadingOverlay = null;
    this.loadingStatusLabel = null;
    this.loadingProgressBar = null;
    this.loadingProgressFill = null;

    this.isLoading = false;
    this.loadingRafId = null;
    this.isAnimating = false;

this.animate = this.animate.bind(this);
this.onResize = this.onResize.bind(this);
this.onBgmToggleClick = this.onBgmToggleClick.bind(this);
this.onRotateStepButtonClick = this.onRotateStepButtonClick.bind(this);
this.onMoveButtonClick = this.onMoveButtonClick.bind(this);
this.onKeyDown = this.onKeyDown.bind(this);
this.onKeyUp = this.onKeyUp.bind(this);
this.unlockBgm = this.unlockBgm.bind(this);
this.loadingLoop = this.loadingLoop.bind(this);
this.onStartButtonClick = this.onStartButtonClick.bind(this);

this.onActionButtonPointerDown = this.onActionButtonPointerDown.bind(this);
this.onActionButtonPointerUp = this.onActionButtonPointerUp.bind(this);
this.onActionButtonPointerCancel = this.onActionButtonPointerCancel.bind(this);

this.createBasicLabels();
this.createLoadingScreen();
this.createSettingsButton();
this.createSettingsModal();
this.createRotateStepButtons();
this.createMovePad();
this.createNextPreviewUI();
this.createStartOverlay();
this.applyGlobalUiLayout();
this.setupBgmUnlock();
  }

  createBasicLabels() {
    if (!this.bestHeightLabel && this.heightLabel?.parentElement) {
      this.bestHeightLabel = document.createElement("div");
      this.bestHeightLabel.id = "bestHeightLabel";
      this.heightLabel.parentElement.appendChild(this.bestHeightLabel);
    }

    if (!this.versionLabel && this.heightLabel?.parentElement) {
      this.versionLabel = document.createElement("div");
      this.versionLabel.id = "versionLabel";
      this.heightLabel.parentElement.appendChild(this.versionLabel);
    }
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
      ? Math.round(Math.min(190, Math.max(130, metrics.w * 0.34)))
      : 208;

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
      label.style.color = "#fff";
    }

    if (this.nicknameLabel) {
      this.nicknameLabel.style.fontSize = primaryFont;
      this.nicknameLabel.style.fontWeight = "700";
      this.nicknameLabel.style.margin = "0";
    }

    if (this.heightLabel) {
      this.heightLabel.style.fontSize = primaryFont;
      this.heightLabel.style.fontWeight = "700";
      this.heightLabel.style.marginTop = "4px";
    }

    if (this.bestHeightLabel) {
      this.bestHeightLabel.style.fontSize = secondaryFont;
      this.bestHeightLabel.style.marginTop = "4px";
      this.bestHeightLabel.style.opacity = "0.95";
    }

    if (this.versionLabel) {
      this.versionLabel.style.fontSize = `${Math.max(9, Math.round((metrics.isMobile ? 9 : 11) * fontScale))}px`;
      this.versionLabel.style.marginTop = "4px";
      this.versionLabel.style.opacity = "0.72";
    }
  }

  applySettingsButtonLayout() {
    if (!this.settingsButton) return;

    const metrics = this.getResponsiveUiMetrics();
    const size = metrics.isMobile
      ? Math.round(34 + 10 * metrics.controlScale)
      : 46;

    this.settingsButton.style.top = metrics.isMobile ? "10px" : "16px";
    this.settingsButton.style.right = metrics.isMobile ? "10px" : "18px";
    this.settingsButton.style.width = `${size}px`;
    this.settingsButton.style.height = `${size}px`;
    this.settingsButton.style.borderRadius = `${Math.round(size * 0.3)}px`;
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
    this.updateMovePadLayout();
    this.updateActionButtonLayout();
    this.updateStartOverlayLayout();
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

    this.nextCanvas.width = layout.canvasPixelSize;
    this.nextCanvas.height = layout.canvasPixelSize;
    this.nextCanvas.style.width = `${layout.canvasSize}px`;
    this.nextCanvas.style.height = `${layout.canvasSize}px`;

    this.nextNameLabel.style.fontSize = `${layout.nameFont}px`;
    this.nextNameLabel.style.minHeight = `${layout.nameMinHeight}px`;
    this.nextNameLabel.style.marginTop = `${layout.isMobile ? 10 : 16}px`;

    const title = this.nextPanel.querySelector(".next-preview-title");
    if (title) {
      title.style.fontSize = `${layout.titleFont}px`;
      title.style.textAlign = "center";
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

    const status = document.createElement("div");
    status.id = "loadingStatusLabel";
    status.textContent = "로딩 중...";
    status.style.fontSize = "13px";
    status.style.marginBottom = "10px";

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

  createStartOverlay() {
    let overlay = document.getElementById("startOverlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "startOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "120";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.background = "rgba(0,0,0,0.34)";
      overlay.style.backdropFilter = "blur(6px)";

      const panel = document.createElement("div");
      panel.style.width = "min(420px, 86vw)";
      panel.style.padding = "28px 22px";
      panel.style.borderRadius = "20px";
      panel.style.background = "rgba(18,20,28,0.92)";
      panel.style.border = "1px solid rgba(255,255,255,0.10)";
      panel.style.boxShadow = "0 18px 46px rgba(0,0,0,0.30)";
      panel.style.textAlign = "center";
      panel.style.color = "#fff";

      const title = document.createElement("div");
      title.textContent = "3D BLOCK STACK";
      title.style.fontSize = "24px";
      title.style.fontWeight = "900";
      title.style.letterSpacing = "1px";

      const sub = document.createElement("div");
      sub.textContent =
        "방향키 / 화면 화살표로 이동 · Q/W/E 또는 XYZ 버튼으로 회전 · 배치 버튼으로 빠른 낙하";
      sub.style.marginTop = "12px";
      sub.style.fontSize = "13px";
      sub.style.lineHeight = "1.55";
      sub.style.opacity = "0.84";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "게임 시작";
      button.style.marginTop = "20px";
      button.style.width = "100%";
      button.style.height = "52px";
      button.style.border = "0";
      button.style.borderRadius = "14px";
      button.style.background = "linear-gradient(180deg, #5ea0ff 0%, #3d7df0 100%)";
      button.style.color = "#fff";
      button.style.fontSize = "16px";
      button.style.fontWeight = "800";
      button.style.cursor = "pointer";
      button.addEventListener("click", this.onStartButtonClick);

      panel.appendChild(title);
      panel.appendChild(sub);
      panel.appendChild(button);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      this.startButton = button;
    }

    this.startOverlay = overlay;
  }

updateStartOverlayLayout() {
  if (!this.startOverlay) return;

  const metrics = this.getResponsiveUiMetrics();
  this.startOverlay.style.display =
    this.isStartOverlayReady && !this.isSessionStarted ? "flex" : "none";

  const button = this.startButton;
  if (button) {
    button.style.height = metrics.isMobile ? "48px" : "52px";
    button.style.fontSize = metrics.isMobile ? "15px" : "16px";
  }
}


enterRotationMode(axis) {
  if (!this.blockSystem) return false;
  if (!this.isSessionStarted || this.isGameOver || this.isRestarting) return false;

  const block = this.blockSystem.getCurrentPreviewBlock?.();
  if (!block || this.blockSystem.state !== "EDIT") return false;

  this.rotationModeActive = true;
  this.selectedRotateAxis = axis;

  if (this.rotateGizmo) {
    this.rotateGizmo.syncToBlock(block);
    this.rotateGizmo.show();
    this.rotateGizmo.unlockAxis();
    this.rotateGizmo.lockToAxis(axis);
    this.rotateGizmo.setActiveAxis(axis);
  }

  this.updateRotateButtonsUI();
  return true;
}

exitRotationMode() {
  this.rotationModeActive = false;
  this.selectedRotateAxis = null;

  if (this.rotateGizmo) {
    this.rotateGizmo.hide();
  }

  this.updateRotateButtonsUI();
}

applyRotationInput(axis) {
  if (!axis || !this.blockSystem) return false;
  if (!this.isSessionStarted || this.isGameOver || this.isRestarting) return false;

  const block = this.blockSystem.getCurrentPreviewBlock?.();
  if (!block || this.blockSystem.state !== "EDIT") return false;

  if (!this.rotationModeActive || this.selectedRotateAxis !== axis) {
    return this.enterRotationMode(axis);
  }

  const rotated = this.blockSystem.rotatePreview90(axis);
  if (!rotated) return false;

  if (this.rotateGizmo) {
    const updatedBlock = this.blockSystem.getCurrentPreviewBlock?.();
    if (updatedBlock) {
      this.rotateGizmo.syncToBlock(updatedBlock);
      this.rotateGizmo.lockToAxis(axis);
      this.rotateGizmo.setActiveAxis(axis);
    }
  }

  return true;
}

applyRotationConfirm() {
  if (!this.rotationModeActive || !this.selectedRotateAxis) return false;
  return this.applyRotationInput(this.selectedRotateAxis);
}

syncRotationGizmo() {
  if (!this.rotationModeActive || !this.rotateGizmo || !this.blockSystem) return;

  const block = this.blockSystem.getCurrentPreviewBlock?.();
  if (!block || this.blockSystem.state !== "EDIT") {
    this.exitRotationMode();
    return;
  }

  this.rotateGizmo.syncToBlock(block);
  this.rotateGizmo.lockToAxis(this.selectedRotateAxis);
  this.rotateGizmo.setActiveAxis(this.selectedRotateAxis);
}

  createNextPreviewUI() {
    let panel = document.getElementById("nextBlockPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "nextBlockPanel";
      panel.style.position = "fixed";
      panel.style.zIndex = "20";
      panel.style.color = "white";
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
      title.style.fontWeight = "900";
      title.style.letterSpacing = "1px";
      title.style.color = "rgba(255,255,255,0.98)";
      panel.appendChild(title);

      const canvasWrap = document.createElement("div");
      canvasWrap.id = "nextPreviewCanvasWrap";
      canvasWrap.style.position = "relative";
      canvasWrap.style.overflow = "hidden";
      canvasWrap.style.borderRadius = "14px";
      canvasWrap.style.background =
        "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 46%, rgba(255,255,255,0.015) 100%)";
      canvasWrap.style.border = "1px solid rgba(255,255,255,0.08)";

      const canvas = document.createElement("canvas");
      canvas.id = "nextBlockCanvas";
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvasWrap.appendChild(canvas);

      const name = document.createElement("div");
      name.id = "nextBlockNameLabel";
      name.textContent = "-";
      name.style.textAlign = "center";
      name.style.fontWeight = "700";
      name.style.opacity = "0.96";
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
  }

  createRotateStepButtons() {
    let panel = document.getElementById("rotateStepButtonsPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "rotateStepButtonsPanel";
      panel.style.position = "fixed";
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

      const axisInfos = {
        x: { icon: "↺", title: "X+90", hint: "Q" },
        y: { icon: "⟲", title: "Y+90", hint: "W" },
        z: { icon: "↻", title: "Z+90", hint: "E" },
      };

      const makeButton = (axis) => {
        const info = axisInfos[axis];
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.axis = axis;
        button.style.border = "0";
        button.style.borderRadius = "12px";
        button.style.background = "rgba(255,255,255,0.14)";
        button.style.color = "#fff";
        button.style.cursor = "pointer";
        button.style.display = "flex";
        button.style.flexDirection = "column";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.gap = "2px";
        button.addEventListener("click", this.onRotateStepButtonClick);

        const icon = document.createElement("div");
        icon.textContent = `${info.icon} ${axis.toUpperCase()}`;
        icon.style.fontWeight = "800";
        icon.style.color = this.axisColorMap[axis];

        const title = document.createElement("div");
        title.textContent = info.title;
        title.style.fontWeight = "700";

        const hint = document.createElement("div");
        hint.textContent = info.hint;
        hint.style.opacity = "0.72";

        button.appendChild(icon);
        button.appendChild(title);
        button.appendChild(hint);
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
    const bottom = isLandscapeCompact ? 70 : isCompact ? 92 : 112;
    const panelGap = isLandscapeCompact ? 4 : isCompact ? 6 : 8;
    const panelPadding = isLandscapeCompact ? 4 : isCompact ? 6 : 8;
    const panelRadius = isLandscapeCompact ? 10 : isCompact ? 12 : 14;
    const buttonWidth = isLandscapeCompact ? 46 : isCompact ? 56 : 68;
    const buttonHeight = isLandscapeCompact ? 34 : isCompact ? 42 : 50;

    this.rotateButtonsPanel.style.left = `${panelLeft}px`;
    this.rotateButtonsPanel.style.bottom = `${bottom}px`;
    this.rotateButtonsPanel.style.gap = `${panelGap}px`;
    this.rotateButtonsPanel.style.padding = `${panelPadding}px`;
    this.rotateButtonsPanel.style.borderRadius = `${panelRadius}px`;

    for (const button of Object.values(this.rotateButtons)) {
      if (!button) continue;
      button.style.width = `${buttonWidth}px`;
      button.style.height = `${buttonHeight}px`;

      const children = button.children;
      if (children[0]) children[0].style.fontSize = isLandscapeCompact ? "10px" : isCompact ? "12px" : "13px";
      if (children[1]) children[1].style.fontSize = isLandscapeCompact ? "8px" : isCompact ? "9px" : "10px";
      if (children[2]) children[2].style.fontSize = isLandscapeCompact ? "7px" : isCompact ? "8px" : "9px";
    }
  }

  createMovePad() {
    let panel = document.getElementById("movePadPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "movePadPanel";
      panel.style.position = "fixed";
      panel.style.zIndex = "26";
      panel.style.display = "grid";
      panel.style.gridTemplateColumns = "repeat(3, 1fr)";
      panel.style.gridTemplateRows = "repeat(3, 1fr)";
      panel.style.gap = "6px";
      panel.style.padding = "8px";
      panel.style.borderRadius = "16px";
      panel.style.background = "rgba(0,0,0,0.42)";
      panel.style.backdropFilter = "blur(8px)";
      panel.style.border = "1px solid rgba(255,255,255,0.10)";
      panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";

      const makeBtn = (dir, text, col, row) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.dir = dir;
        btn.textContent = text;
        btn.style.gridColumn = String(col);
        btn.style.gridRow = String(row);
        btn.style.border = "0";
        btn.style.borderRadius = "12px";
        btn.style.background = "rgba(255,255,255,0.14)";
        btn.style.color = "#fff";
        btn.style.fontWeight = "800";
        btn.style.cursor = "pointer";
        btn.addEventListener("click", this.onMoveButtonClick);
        return btn;
      };

      this.moveButtons.up = makeBtn("up", "▲", 2, 1);
      this.moveButtons.left = makeBtn("left", "◀", 1, 2);
      this.moveButtons.down = makeBtn("down", "▼", 2, 3);
      this.moveButtons.right = makeBtn("right", "▶", 3, 2);

      panel.appendChild(this.moveButtons.up);
      panel.appendChild(this.moveButtons.left);
      panel.appendChild(this.moveButtons.down);
      panel.appendChild(this.moveButtons.right);

      document.body.appendChild(panel);
    } else {
      this.moveButtons.up = panel.querySelector('[data-dir="up"]');
      this.moveButtons.left = panel.querySelector('[data-dir="left"]');
      this.moveButtons.down = panel.querySelector('[data-dir="down"]');
      this.moveButtons.right = panel.querySelector('[data-dir="right"]');
    }

    this.movePadPanel = panel;
    this.updateMovePadLayout();
    this.updateMovePadUI();
  }

 updateMovePadLayout() {
  if (!this.movePadPanel) return;

  const metrics = this.getResponsiveUiMetrics();
  const isCompact = metrics.isMobile;
  const isLandscapeCompact = metrics.isMobile && metrics.isLandscape;

  const shortSide = Math.max(1, metrics.shortSide);

  // 캔버스 비율 기준으로 크기 계산
  const panelSize = isLandscapeCompact
    ? THREE.MathUtils.clamp(shortSide * 0.20, 86, 112)
    : isCompact
    ? THREE.MathUtils.clamp(shortSide * 0.24, 96, 132)
    : THREE.MathUtils.clamp(shortSide * 0.19, 132, 172);

  const cellSize = isLandscapeCompact
    ? THREE.MathUtils.clamp(panelSize * 0.28, 24, 32)
    : isCompact
    ? THREE.MathUtils.clamp(panelSize * 0.30, 28, 38)
    : THREE.MathUtils.clamp(panelSize * 0.29, 36, 48);

  const gap = isLandscapeCompact ? 4 : isCompact ? 5 : 6;
  const padding = isLandscapeCompact ? 5 : isCompact ? 6 : 8;
  const radius = isLandscapeCompact ? 12 : isCompact ? 14 : 16;

  // 우측 하단 배치
  const right = isLandscapeCompact ? 12 : isCompact ? 14 : 18;
  const bottom = isLandscapeCompact ? 64 : isCompact ? 74 : 22;

  this.movePadPanel.style.left = "auto";
  this.movePadPanel.style.right = `${right}px`;
  this.movePadPanel.style.bottom = `${bottom}px`;
  this.movePadPanel.style.width = `${Math.round(panelSize)}px`;
  this.movePadPanel.style.height = `${Math.round(panelSize)}px`;
  this.movePadPanel.style.gap = `${gap}px`;
  this.movePadPanel.style.padding = `${padding}px`;
  this.movePadPanel.style.borderRadius = `${radius}px`;

  for (const btn of Object.values(this.moveButtons)) {
    if (!btn) continue;
    btn.style.width = `${Math.round(cellSize)}px`;
    btn.style.height = `${Math.round(cellSize)}px`;
    btn.style.fontSize = isLandscapeCompact
      ? `${Math.round(cellSize * 0.42)}px`
      : isCompact
      ? `${Math.round(cellSize * 0.44)}px`
      : `${Math.round(cellSize * 0.40)}px`;
    btn.style.borderRadius = `${Math.max(10, Math.round(cellSize * 0.28))}px`;
    btn.style.justifySelf = "center";
    btn.style.alignSelf = "center";
  }
}
  createSettingsButton() {
    let button = document.getElementById("settingsButton");

    if (!button) {
      button = document.createElement("button");
      button.id = "settingsButton";
      button.type = "button";
      button.innerHTML = "⚙";
      button.style.position = "fixed";
      button.style.zIndex = "30";
      button.style.border = "0";
      button.style.background = "rgba(0,0,0,0.55)";
      button.style.color = "#fff";
      button.style.cursor = "pointer";
      button.style.backdropFilter = "blur(6px)";
      button.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
      document.body.appendChild(button);
    }

    button.addEventListener("click", () => {
      if (this.isSettingsOpen) this.closeSettingsModal();
      else this.openSettingsModal();
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
        if (event.target === backdrop) this.closeSettingsModal();
      });

      modal = document.createElement("div");
      modal.id = "settingsModal";
      modal.style.display = "flex";
      modal.style.flexDirection = "column";
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
    this.updateSettingsBgmUI();

    if (this.bgmEnabled) {
      if (this.bgmUnlocked) await this.playBgm();
    } else {
      this.pauseBgm();
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

    this.nextPreviewScene.add(previewGroup);
    this.nextPreviewMesh = previewGroup;
    this.renderNextPreview();
  }

  updatePlacementGhost() {
  if (!this.placementGuide || !this.blockSystem) return;

  const block = this.blockSystem.getCurrentPreviewBlock?.();
  if (!block?.mesh || !this.blockSystem.getPlacementPrediction) {
    this.placementGuide.hideProjection();
    this.placementGuide.hidePredictionGhost();
    return;
  }

  const prediction = this.blockSystem.getPlacementPrediction();
  if (!prediction?.position || !prediction?.quaternion) {
    this.placementGuide.hideProjection();
    this.placementGuide.hidePredictionGhost();
    return;
  }

  const currentBottomY = prediction.currentBottomY ?? block.mesh.position.y;
  const predictedBottomY = prediction.predictedBottomY ?? prediction.position.y;

  const projectionStart = new THREE.Vector3(
    block.mesh.position.x,
    currentBottomY + 0.01,
    block.mesh.position.z
  );

  const projectionEnd = new THREE.Vector3(
    prediction.position.x,
    predictedBottomY + 0.008,
    prediction.position.z
  );

  this.placementGuide.setHeight(block.mesh.position.y);
  this.placementGuide.show();

  if (projectionEnd.y >= projectionStart.y - 0.002) {
    this.placementGuide.hideProjection();
  } else {
    this.placementGuide.updateProjection(projectionStart, projectionEnd);
  }

  this.placementGuide.updatePredictionGhost(
    block,
    prediction.position,
    prediction.quaternion
  );
}


  renderNextPreview() {
    if (!this.nextPreviewRenderer || !this.nextPreviewScene || !this.nextPreviewCamera) return;

    if (this.nextPreviewMesh) {
      this.nextPreviewMesh.rotation.y += 0.01;
      this.nextPreviewMesh.rotation.x = Math.sin(performance.now() * 0.0012) * 0.08;
    }

    this.nextPreviewRenderer.render(this.nextPreviewScene, this.nextPreviewCamera);
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

  if (!this.isSessionStarted) {
    this.actionButton.disabled = true;
    this.actionButton.textContent = "시작 대기";
    this.actionButton.style.opacity = "0.5";
    return;
  }

  if (this.isGameOver || this.isRestarting) {
    this.actionButton.disabled = true;
    this.actionButton.textContent = "대기중";
    this.actionButton.style.opacity = "0.5";
    return;
  }

  const hasPreview = !!this.blockSystem.getCurrentPreviewBlock();

  if (hasPreview && this.blockSystem.state === "EDIT") {
    this.actionButton.disabled = false;
    this.actionButton.textContent = this.isActionHolding ? "가속 중" : "가속 낙하";
    this.actionButton.style.opacity = "1";
    return;
  }

  if (this.blockSystem.state === "WAITING") {
    this.actionButton.disabled = true;
    this.actionButton.textContent = "착지중";
    this.actionButton.style.opacity = "0.5";
    return;
  }

  this.actionButton.disabled = true;
  this.actionButton.textContent = "대기중";
  this.actionButton.style.opacity = "0.5";
}

  updateRotateButtonsUI() {
  const canRotate =
    !!this.blockSystem &&
    !!this.blockSystem.getCurrentPreviewBlock() &&
    this.blockSystem.state === "EDIT" &&
    !this.isGameOver &&
    !this.isRestarting &&
    this.isSessionStarted;

  if (!canRotate && this.rotationModeActive) {
    this.exitRotationMode();
    return;
  }

  if (this.rotateButtonsPanel) {
    this.rotateButtonsPanel.style.opacity = canRotate ? "1" : "0.55";
  }

  for (const [axis, button] of Object.entries(this.rotateButtons)) {
    if (!button) continue;

    const isSelected =
      canRotate &&
      this.rotationModeActive &&
      this.selectedRotateAxis === axis;

    button.disabled = !canRotate;
    button.style.cursor = canRotate ? "pointer" : "default";
    button.style.opacity = canRotate ? "1" : "0.5";
    button.style.background = isSelected
      ? "rgba(255,255,255,0.24)"
      : "rgba(255,255,255,0.14)";
    button.style.boxShadow = isSelected
      ? `0 0 0 1px ${this.axisColorMap[axis]} inset`
      : "none";
    button.style.transform = isSelected ? "translateY(-1px)" : "translateY(0)";
  }
}

  updateMovePadUI() {
    const canMove =
      !!this.blockSystem &&
      !!this.blockSystem.getCurrentPreviewBlock() &&
      this.blockSystem.state === "EDIT" &&
      !this.isGameOver &&
      !this.isRestarting &&
      this.isSessionStarted;

    if (this.movePadPanel) {
      this.movePadPanel.style.opacity = canMove ? "1" : "0.55";
      this.movePadPanel.style.pointerEvents = canMove ? "auto" : "none";
    }

    for (const button of Object.values(this.moveButtons)) {
      if (!button) continue;
      button.disabled = !canMove;
      button.style.opacity = canMove ? "1" : "0.5";
      button.style.cursor = canMove ? "pointer" : "default";
    }
  }

  updateActionButtonLayout() {
    if (!this.actionButton) return;

    const metrics = this.getResponsiveUiMetrics();
    const isCompact = metrics.isMobile;
    const isLandscapeCompact = metrics.isMobile && metrics.isLandscape;

    const width = isLandscapeCompact ? 110 : isCompact ? 124 : 144;
    const height = isLandscapeCompact ? 38 : isCompact ? 44 : 50;
    const bottom = isLandscapeCompact ? 12 : isCompact ? 18 : 22;

    this.actionButton.style.position = "fixed";
    this.actionButton.style.left = "50%";
    this.actionButton.style.transform = "translateX(-50%)";
    this.actionButton.style.bottom = `${bottom}px`;
    this.actionButton.style.width = `${width}px`;
    this.actionButton.style.height = `${height}px`;
    this.actionButton.style.fontSize = isLandscapeCompact ? "13px" : isCompact ? "14px" : "16px";
    this.actionButton.style.borderRadius = isLandscapeCompact ? "11px" : isCompact ? "12px" : "14px";
    this.actionButton.style.zIndex = "28";
  }

startActionHold() {
  if (this.isActionHolding) return;
  if (this.isGameOver || this.isRestarting || !this.blockSystem) return;
  if (!this.isSessionStarted) return;
  if (!this.blockSystem.getCurrentPreviewBlock()) return;
  if (this.blockSystem.state !== "EDIT") return;

  if (this.rotationModeActive) {
    this.exitRotationMode();
  }

  this.isActionHolding = true;
  this.blockSystem.beginFastDropHold();

  if (this.actionHoldTimeoutId) {
    clearTimeout(this.actionHoldTimeoutId);
    this.actionHoldTimeoutId = null;
  }

  this.updateControlButton();
}

endActionHold(skipBlockReset = false) {
  if (this.actionHoldTimeoutId) {
    clearTimeout(this.actionHoldTimeoutId);
    this.actionHoldTimeoutId = null;
  }

  if (!skipBlockReset && this.blockSystem) {
    this.blockSystem.endFastDropHold();
  }

  this.isActionHolding = false;
  this.actionHoldTriggeredInstant = false;

  this.updateControlButton();
  this.updateRotateButtonsUI();
  this.updateMovePadUI();
}

onActionButtonPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  this.startActionHold();
}

onActionButtonPointerUp(event) {
  event.preventDefault();
  event.stopPropagation();
  this.endActionHold();
}

onActionButtonPointerCancel(event) {
  event.preventDefault();
  event.stopPropagation();
  this.endActionHold();
}

onRotateStepButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const axis = event.currentTarget?.dataset?.axis;
  if (!axis) return;

  this.applyRotationInput(axis);
}

  getCameraPlanarDirections() {
    const forward = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(forward);
    forward.y = 0;

    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }

    const step = this.blockSystem?.getGridStep?.() ?? 1;

    const snapAxis = (vec) => {
      if (Math.abs(vec.x) >= Math.abs(vec.z)) {
        return new THREE.Vector3(Math.sign(vec.x || 1), 0, 0).multiplyScalar(step);
      }
      return new THREE.Vector3(0, 0, Math.sign(vec.z || 1)).multiplyScalar(step);
    };

    return {
      forward: snapAxis(forward),
      right: snapAxis(right),
    };
  }

 movePreviewByDirection(dir) {
  if (!this.blockSystem || !this.isSessionStarted) return false;
  if (this.isGameOver || this.isRestarting) return false;
  if (!this.blockSystem.getCurrentPreviewBlock()) return false;
  if (this.blockSystem.state !== "EDIT") return false;

  if (this.rotationModeActive) {
    this.exitRotationMode();
  }

  const { forward, right } = this.getCameraPlanarDirections();

  let dx = 0;
  let dz = 0;

  if (dir === "up") {
    dx = forward.x;
    dz = forward.z;
  } else if (dir === "down") {
    dx = -forward.x;
    dz = -forward.z;
  } else if (dir === "left") {
    dx = -right.x;
    dz = -right.z;
  } else if (dir === "right") {
    dx = right.x;
    dz = right.z;
  } else {
    return false;
  }

  return this.blockSystem.movePreviewByGrid(dx, dz);
}

  onMoveButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const dir = event.currentTarget?.dataset?.dir;
    if (!dir) return;
    this.movePreviewByDirection(dir);
  }

 onKeyDown(event) {
  if (event.repeat) return;
  if (!this.blockSystem) return;

  const key = event.key.toLowerCase();

  if (!this.isSessionStarted) {
    if (key === "enter" || key === " ") {
      event.preventDefault();
      this.onStartButtonClick();
    }
    return;
  }

  if (this.isGameOver || this.isRestarting) return;

  if (key === "q") {
    event.preventDefault();
    this.applyRotationInput("x");
    return;
  }

  if (key === "w") {
    event.preventDefault();
    this.applyRotationInput("y");
    return;
  }

  if (key === "e") {
    event.preventDefault();
    this.applyRotationInput("z");
    return;
  }

  if (key === "r") {
    event.preventDefault();
    this.applyRotationConfirm();
    return;
  }

  if (key === "arrowup") {
    event.preventDefault();
    this.movePreviewByDirection("up");
    return;
  }

  if (key === "arrowdown") {
    event.preventDefault();
    this.movePreviewByDirection("down");
    return;
  }

  if (key === "arrowleft") {
    event.preventDefault();
    this.movePreviewByDirection("left");
    return;
  }

  if (key === "arrowright") {
    event.preventDefault();
    this.movePreviewByDirection("right");
    return;
  }

  if (key === " " || key === "enter") {
    event.preventDefault();
    this.startActionHold();
  }
}
  onResize() {
    if (this.renderer.resize) {
      this.renderer.resize(window.innerWidth, window.innerHeight);
    }

    this.applyGlobalUiLayout();
  }

  onKeyUp(event) {
  const key = event.key.toLowerCase();

  if (key === " " || key === "enter") {
    event.preventDefault();
    this.endActionHold();
  }
}

async onStartButtonClick() {
  if (!this.isStartOverlayReady) return;
  if (this.isSessionStarted) return;
  if (!this.blockSystem) return;

  this.isSessionStarted = true;
  this.blockSystem.setGameStarted(true);
  this.updateStartOverlayLayout();

  await this.blockSystem.getNextBlockInfo();
  await this.blockSystem.createBlock();
  await this.updateNextPreviewUI();

  this.updateControlButton();
  this.updateRotateButtonsUI();
  this.updateMovePadUI();
}

  async handleFail() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    this.isGameOver = true;
    this.updateControlButton();
    this.updateRotateButtonsUI();
    this.updateMovePadUI();

    setTimeout(async () => {
      try {
        const currentHeight = this.blockSystem.getStableHeight();
        const finalScore = this.blockSystem.getPeakStableHeight();

        if (finalScore > this.bestHeight) {
          this.bestHeight = finalScore;
        }

        this.updateBestHeightUI();

        let name = prompt(
          `실패!\n현재 높이: ${currentHeight.toFixed(2)}\n최종 점수: ${finalScore.toFixed(2)}\n최고 기록: ${this.bestHeight.toFixed(2)}\n닉네임 입력:`,
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
    this.endActionHold();
    this.blockSystem.reset();
        this.exitRotationMode();
        this.placementGuide?.hide();
    this.blockSystem.setGameStarted(false);

    this.renderer.resetCamera();
    this.nextPreviewKey = "";

    this.isSessionStarted = false;
    this.isGameOver = false;

    this.updateNicknameUI();
    this.updateHeightUI();
    this.updateBestHeightUI();
    this.updateVersionUI();
    this.updateStartOverlayLayout();

    await this.blockSystem.getNextBlockInfo();
    await this.updateNextPreviewUI();

    this.isRestarting = false;
    this.updateControlButton();
    this.updateRotateButtonsUI();
    this.updateMovePadUI();

    await this.refreshLeaderboardUI(true);
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

    if (this.renderer?.update) this.renderer.update();
    if (this.renderer?.render) this.renderer.render();
    this.renderNextPreview();

    this.loadingRafId = requestAnimationFrame(this.loadingLoop);
  }

  async waitForNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async waitForFirstVisibleFrame() {
    if (this.blockSystem) this.blockSystem.update(0.016);
    if (this.renderer?.update) this.renderer.update();
    if (this.renderer?.render) this.renderer.render();
    this.renderNextPreview();
    await this.waitForNextFrame();

    if (this.blockSystem) this.blockSystem.update(0.016);
    if (this.renderer?.update) this.renderer.update();
    if (this.renderer?.render) this.renderer.render();
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
      this.blockSystem.setGameStarted(false);

      this.setLoadingProgress(0.75, "다음 블럭 준비 중...");
      await this.blockSystem.getNextBlockInfo();

      this.setLoadingProgress(0.9, "UI 정리 중...");
      this.updateNicknameUI();
      this.updateHeightUI();
      this.updateBestHeightUI();
      this.updateVersionUI();
      this.updateSettingsBgmUI();
      this.updateRotateButtonsUI();
      this.updateMovePadUI();
      this.updateControlButton();
      await this.updateNextPreviewUI();
      await this.refreshLeaderboardUI(true);

    window.addEventListener("resize", this.onResize);
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);

      this.actionButton?.addEventListener("pointerdown", this.onActionButtonPointerDown);
      this.actionButton?.addEventListener("pointerup", this.onActionButtonPointerUp);
      this.actionButton?.addEventListener("pointercancel", this.onActionButtonPointerCancel);
      this.actionButton?.addEventListener("pointerleave", this.onActionButtonPointerCancel);

      this.setLoadingProgress(1, "준비 완료");

      await this.waitForFirstVisibleFrame();

      this.stopLoadingRenderLoop();
      this.startMainLoop();

      await this.waitForFirstVisibleFrame();
      await this.hideLoadingScreen();

      this.isStartOverlayReady = true;
      this.updateStartOverlayLayout();
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
      this.blockSystem.update(dt);

      this.triggerLandingEffects();
            this.syncRotationGizmo();
      this.updatePlacementGhost();

      const followHeight = this.blockSystem.getMaxHeight();
      this.renderer.updateCamera(followHeight);

      this.updateHeightUI();
      this.updateControlButton();
      this.updateRotateButtonsUI();
      this.updateMovePadUI();
      await this.updateNextPreviewUI();
    }
    
    if (this.renderer.update) {
      this.renderer.update(dt);
    }

    this.renderer.render();
    this.renderNextPreview();
  }
}