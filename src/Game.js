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

      // 시작 스폰 높이 조금 더 높게
      spawnClearance: 1.6,
      minSpawnHeight: 2.3,

      // 0.5 단위 계단 반영
      heightStep: 0.5,

      // 카메라
      cameraFollowLerp: 0.12,
      cameraHeightOffset: 0.25,
      cameraMinTargetY: 0.75,
    };

    this.appVersion = "v0.1.14-loading-screen";

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

    // BGM
    this.bgmEnabled = true;
    this.bgmUnlocked = false;
    this.bgm = new Audio("./assets/bgm.mp3");
    this.bgm.loop = true;
    this.bgm.volume = 0.4;
    this.bgm.preload = "auto";

    this.bgmToggleButton = null;

    // Loading UI
    this.loadingOverlay = null;
    this.loadingStatusLabel = null;
    this.loadingProgressBar = null;
    this.loadingProgressFill = null;

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
    this.onBgmToggleClick = this.onBgmToggleClick.bind(this);
    this.unlockBgm = this.unlockBgm.bind(this);

    this.createLoadingScreen();
    this.createBgmToggleButton();
    this.setupBgmUnlock();
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
    overlay.style.background =
      "radial-gradient(circle at 50% 35%, rgba(58,88,128,0.95) 0%, rgba(15,20,31,0.98) 55%, rgba(5,8,14,1) 100%)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.opacity = "1";
    overlay.style.transition = "opacity 0.45s ease";
    overlay.style.pointerEvents = "auto";
    overlay.style.userSelect = "none";
    overlay.style.webkitUserSelect = "none";

    const panel = document.createElement("div");
    panel.style.width = "min(420px, 86vw)";
    panel.style.padding = "28px 24px";
    panel.style.borderRadius = "22px";
    panel.style.background = "rgba(255,255,255,0.08)";
    panel.style.border = "1px solid rgba(255,255,255,0.14)";
    panel.style.boxShadow = "0 20px 60px rgba(0,0,0,0.35)";
    panel.style.textAlign = "center";
    panel.style.color = "#fff";

    const title = document.createElement("div");
    title.textContent = "3D BLOCK STACK";
    title.style.fontSize = "clamp(24px, 5vw, 34px)";
    title.style.fontWeight = "800";
    title.style.letterSpacing = "2px";
    title.style.marginBottom = "10px";
    title.style.textShadow = "0 4px 18px rgba(0,0,0,0.3)";

    const subtitle = document.createElement("div");
    subtitle.textContent = "에셋과 월드를 준비하는 중...";
    subtitle.style.fontSize = "14px";
    subtitle.style.color = "rgba(255,255,255,0.78)";
    subtitle.style.marginBottom = "22px";
    subtitle.style.letterSpacing = "0.4px";

    const spinner = document.createElement("div");
    spinner.style.width = "58px";
    spinner.style.height = "58px";
    spinner.style.margin = "0 auto 18px auto";
    spinner.style.borderRadius = "50%";
    spinner.style.border = "4px solid rgba(255,255,255,0.18)";
    spinner.style.borderTopColor = "#ffffff";
    spinner.style.animation = "gameLoadingSpin 1s linear infinite";

    const status = document.createElement("div");
    status.id = "loadingStatusLabel";
    status.textContent = "초기화 중...";
    status.style.fontSize = "15px";
    status.style.fontWeight = "600";
    status.style.marginBottom = "14px";
    status.style.color = "#ffffff";

    const progressBar = document.createElement("div");
    progressBar.id = "loadingProgressBar";
    progressBar.style.width = "100%";
    progressBar.style.height = "10px";
    progressBar.style.borderRadius = "999px";
    progressBar.style.overflow = "hidden";
    progressBar.style.background = "rgba(255,255,255,0.14)";
    progressBar.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.25)";
    progressBar.style.marginBottom = "12px";

    const progressFill = document.createElement("div");
    progressFill.id = "loadingProgressFill";
    progressFill.style.width = "0%";
    progressFill.style.height = "100%";
    progressFill.style.borderRadius = "999px";
    progressFill.style.background =
      "linear-gradient(90deg, #7cc7ff 0%, #9bffb0 55%, #ffffff 100%)";
    progressFill.style.boxShadow = "0 0 18px rgba(124,199,255,0.45)";
    progressFill.style.transition = "width 0.25s ease";

    progressBar.appendChild(progressFill);

    const hint = document.createElement("div");
    hint.textContent = "잠시만 기다려주세요";
    hint.style.fontSize = "12px";
    hint.style.color = "rgba(255,255,255,0.62)";
    hint.style.letterSpacing = "0.3px";

    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(spinner);
    panel.appendChild(status);
    panel.appendChild(progressBar);
    panel.appendChild(hint);
    overlay.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes gameLoadingSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    this.loadingOverlay = overlay;
    this.loadingStatusLabel = status;
    this.loadingProgressBar = progressBar;
    this.loadingProgressFill = progressFill;
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

  async hideLoadingScreen() {
    if (!this.loadingOverlay) return;

    this.loadingOverlay.style.opacity = "0";
    this.loadingOverlay.style.pointerEvents = "none";

    await new Promise((resolve) => setTimeout(resolve, 460));

    if (this.loadingOverlay?.parentNode) {
      this.loadingOverlay.parentNode.removeChild(this.loadingOverlay);
    }

    this.loadingOverlay = null;
    this.loadingStatusLabel = null;
    this.loadingProgressBar = null;
    this.loadingProgressFill = null;
  }

  async start() {
    try {
      this.setLoadingProgress(0.08, "렌더러 준비 중...");
      await this.renderer.init();

      this.setLoadingProgress(0.35, "물리 엔진 초기화 중...");
      await this.physics.init();

      this.setLoadingProgress(0.55, "블럭 시스템 생성 중...");
      this.blockSystem = new BlockSystem(
        this.renderer.scene,
        this.physics,
        () => this.handleFail(),
        this.config
      );

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

      window.addEventListener("resize", this.onResize);
      this.actionButton?.addEventListener("click", this.onActionButtonClick);

      this.updateControlButton();

      this.setLoadingProgress(1, "준비 완료");
      await this.hideLoadingScreen();

      this.animate(0);
    } catch (error) {
      console.error("Game start failed:", error);
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
      const hasLanding = this.blockSystem.blocks.some((b) => b.state === "landing");
      this.actionButton.disabled = true;
      this.actionButton.textContent = hasLanding ? "착지중" : "안정화중";
      this.actionButton.style.opacity = "0.5";
      return;
    }

    this.actionButton.disabled = true;
    this.actionButton.textContent = "대기중";
    this.actionButton.style.opacity = "0.5";
  }

  onActionButtonClick() {
    if (this.isGameOver || this.isRestarting || !this.blockSystem) return;

    if (this.blockSystem.state === "EDIT" || this.blockSystem.state === "ROTATE") {
      this.blockSystem.confirmCurrentBlock();
    }

    this.updateControlButton();
  }

  onResize() {
    if (this.renderer.resize) {
      this.renderer.resize(window.innerWidth, window.innerHeight);
    }
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

    this.updateNicknameUI();
    this.updateHeightUI();
    this.updateBestHeightUI();
    this.updateVersionUI();

    this.isGameOver = false;

    await this.blockSystem.createBlock();

    this.isRestarting = false;
    this.updateControlButton();
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    this.lastTime = time;

    if (!this.isGameOver && !this.isRestarting && this.blockSystem) {
      this.physics.step();
      this.blockSystem.update();

      const followHeight = this.blockSystem.getMaxHeight();
      this.renderer.updateCamera(followHeight);

      this.updateHeightUI();
      this.updateControlButton();
    }

    if (this.placementController) {
      this.placementController.update();
    }

    if (this.renderer.update) {
      this.renderer.update();
    }

    this.renderer.render();
  }
}