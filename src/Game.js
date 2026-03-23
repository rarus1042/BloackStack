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

    this.appVersion = "v0.1.13-bgm-toggle";

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

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
    this.onBgmToggleClick = this.onBgmToggleClick.bind(this);
    this.unlockBgm = this.unlockBgm.bind(this);

    this.createBgmToggleButton();
    this.setupBgmUnlock();
  }

  async start() {
    await this.renderer.init();
    await this.physics.init();

    this.blockSystem = new BlockSystem(
      this.renderer.scene,
      this.physics,
      () => this.handleFail(),
      this.config
    );

    await this.blockSystem.createBlock();

    this.placementController = new PlacementController({
      scene: this.renderer.scene,
      camera: this.renderer.camera,
      domElement: this.renderer.renderer.domElement,
      controls: this.renderer.controls,
      blockSystem: this.blockSystem,
      blockSize: this.config.blockSize,
      stageSize: this.config.stageSize,
      previewClampPadding: this.config.previewClampPadding,
      longPressDuration: 380,
      moveThreshold: 8,
      rotateSpeed: 0.012,
    });

    this.updateNicknameUI();
    this.updateHeightUI();
    this.updateBestHeightUI();
    this.updateVersionUI();
    this.updateBgmButtonUI();

    window.addEventListener("resize", this.onResize);
    this.actionButton?.addEventListener("click", this.onActionButtonClick);

    this.updateControlButton();
    this.animate(0);
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