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

    this.appVersion = "v0.1.19-next-preview-ui";

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
    this.nextPreviewRenderer = null;
    this.nextPreviewScene = null;
    this.nextPreviewCamera = null;
    this.nextPreviewMesh = null;
    this.nextPreviewKey = "";
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
    this.loadingUiStyleTag = null;

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
    this.createNextPreviewUI();
    this.setupBgmUnlock();
  }

  getNextPreviewLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMobile = w <= 768 || h <= 700;

  if (w <= 420) {
    return {
      isMobile: true,
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
      isMobile: true,
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
    isMobile: false,
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
    progressBar.style.marginBottom = "0";

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

  formatModelName(fileName = "") {
    return fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async updateNextPreviewUI() {
    if (!this.blockSystem) return;

    const nextInfo = await this.blockSystem.getNextBlockInfo();
    if (!nextInfo) return;

    const key = `${nextInfo.path}::${nextInfo.scaleFactor ?? 1}`;
    if (this.nextPreviewKey === key) return;

    this.nextPreviewKey = key;

    if (this.nextNameLabel) {
      this.nextNameLabel.textContent = this.formatModelName(
        nextInfo.file ?? nextInfo.path
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

      this.setLoadingProgress(0.08, "렌더러 준비 중...");
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

      this.setLoadingProgress(0.68, "다음 블럭 준비 중...");
      await this.blockSystem.getNextBlockInfo();

      this.setLoadingProgress(0.75, "첫 블럭 로딩 중...");
      await this.blockSystem.createBlock();

      this.setLoadingProgress(0.88, "조작 시스템 연결 중...");
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
      await this.updateNextPreviewUI();
    }

    this.updateControlButton();
  }

onResize() {
  if (this.renderer.resize) {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  this.applyNextPreviewLayout();
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
      await this.updateNextPreviewUI();
    }

    if (this.placementController) {
      this.placementController.update();
    }

    if (this.renderer.update) {
      this.renderer.update();
    }

    this.renderer.render();
    this.renderNextPreview();
  }
}