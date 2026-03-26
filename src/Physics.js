import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

export class Physics {
  constructor(options = {}) {
    this.RAPIER = RAPIER;
    this.world = null;
    this.groundBody = null;
    this.groundCollider = null;

    this.stageSize = options.stageSize ?? 6;
    this.groundHeight = options.groundHeight ?? 0.12;
  }

  async init() {
    await this.RAPIER.init({});

    this.world = new this.RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.world.integrationParameters.dt = 1 / 60;
    this.world.integrationParameters.maxVelocityIterations = 12;
    this.world.integrationParameters.maxVelocityFrictionIterations = 8;
    this.world.integrationParameters.maxStabilizationIterations = 4;

    if ("numSolverIterations" in this.world.integrationParameters) {
      this.world.integrationParameters.numSolverIterations = 16;
    }

    this.setupGround();
  }

  setupGround() {
    const halfGroundHeight = this.groundHeight / 2;
    const halfExtent = this.stageSize / 2;

    this.groundBody = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfGroundHeight, 0)
    );

    const colDesc = this.RAPIER.ColliderDesc.cuboid(
      halfExtent,
      halfGroundHeight,
      halfExtent
    )
      .setFriction(2.25)
      .setRestitution(0.0)
      .setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Max)
      .setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);

    this.groundCollider = this.world.createCollider(colDesc, this.groundBody);
  }

  step() {
    if (!this.world) return;
    this.world.step();
  }
}