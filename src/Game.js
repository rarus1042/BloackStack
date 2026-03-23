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

    this.appVersion = "v0.1.12-spawn-camera-baseline-fix";

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

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
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

    window.addEventListener("resize", this.onResize);
    this.actionButton?.addEventListener("click", this.onActionButtonClick);

    this.updateControlButton();
    this.animate(0);
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