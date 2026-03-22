import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

export class Physics {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);

    this.setupGroundBody();
  }

  setupGroundBody() {
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(2.5, 0.25, 2.5)),
    });

    groundBody.position.set(0, -0.25, 0);
    this.world.addBody(groundBody);
  }

  step() {
    this.world.step(1 / 60);
  }
}