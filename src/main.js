import { Game } from "./Game.js";

const game = new Game();

try {
  await game.start();
} catch (error) {
  console.error("Fatal startup error:", error);
}