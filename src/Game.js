import { Renderer } from "./Renderer.js";
import { Physics } from "./Physics.js";
import { BlockManager } from "./BlockManager.js";

export class Game {
  constructor() {
    this.renderer = new Renderer("gameCanvas");
    this.physics = new Physics();

    this.blockManager = new BlockManager(
      this.renderer.scene,
      this.physics.world,
      () => this.handleFail()
    );

    this.nickname = "";
    this.lastTime = 0;
    this.isGameOver = false;

    this.nicknameLabel = document.getElementById("nicknameLabel");
    this.heightLabel = document.getElementById("heightLabel");
    this.actionButton = document.getElementById("actionButton");

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
  }

  start() {
    this.nickname = "Player";

    this.updateNicknameUI();
    this.updateHeightUI();

    this.blockManager.createBlock();

    window.addEventListener("resize", this.onResize);
    this.actionButton.addEventListener("click", this.onActionButtonClick);

    this.updateControlButton();
    this.animate(0);
  }

  requestNickname() {
    let name = prompt("닉네임을 입력하세요", this.nickname || "");
    if (!name || !name.trim()) {
      name = "Player";
    }
    this.nickname = name.trim();
  }

  updateNicknameUI() {
    this.nicknameLabel.textContent = `닉네임: ${this.nickname}`;
  }

  updateHeightUI() {
    const height = this.blockManager.getMaxHeight();
    this.heightLabel.textContent = `최대 높이: ${height.toFixed(2)}`;
  }

  updateControlButton() {
    const state = this.blockManager.state;

    if (state === "X") {
      this.actionButton.disabled = false;
      this.actionButton.textContent = "축 전환";
      this.actionButton.style.opacity = "1";
    } else if (state === "Z") {
      this.actionButton.disabled = false;
      this.actionButton.textContent = "착지";
      this.actionButton.style.opacity = "1";
    } else {
      this.actionButton.disabled = true;
      this.actionButton.textContent = "대기중";
      this.actionButton.style.opacity = "0.5";
    }
  }

  onActionButtonClick() {
    if (this.isGameOver) return;

    const state = this.blockManager.state;

    if (state === "X") {
      this.blockManager.switchAxis();
    } else if (state === "Z") {
      this.blockManager.dropBlock();
    }

    this.updateControlButton();
  }

  onResize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  handleFail() {
    if (this.isGameOver) return;

    this.isGameOver = true;

    setTimeout(() => {
      const height = this.blockManager.getMaxHeight().toFixed(2);

      let name = prompt(
        `실패!\n현재 기록: ${height}\n닉네임 입력:`,
        this.nickname
      );

      if (!name || !name.trim()) {
        name = "Player";
      }

      this.nickname = name.trim();
      this.restartGame();
    }, 100);
  }

  restartGame() {
    this.blockManager.reset();

    this.updateNicknameUI();
    this.updateHeightUI();

    this.isGameOver = false;
    this.blockManager.createBlock();
    this.updateControlButton();
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    const deltaTime = (time - this.lastTime) / 1000 || 0;
    this.lastTime = time;

    if (!this.isGameOver) {
      this.physics.step();
      this.blockManager.update(deltaTime);
      this.updateHeightUI();
      this.updateControlButton();
    }

    this.renderer.update();
    this.renderer.render();
  }
}