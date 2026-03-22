import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

export class Physics {
  constructor(options = {}) {
    this.RAPIER = RAPIER;
    this.world = null;
    this.groundBody = null;
    this.groundCollider = null;

    this.stageSize = options.stageSize ?? 5; // 지름
    this.stageRadius = this.stageSize / 2;
    this.groundHeight = options.groundHeight ?? 0.5;
  }

  async init() {
    await this.RAPIER.init();

    this.world = new this.RAPIER.World({ x: 0, y: 0, z: 0 });

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

    this.groundBody = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfGroundHeight, 0)
    );

    // 원형 내부에 충분히 들어가는 바닥 충돌 영역
    const halfExtent = this.stageRadius * 0.98;

    const colDesc = this.RAPIER.ColliderDesc.cuboid(
      halfExtent,
      halfGroundHeight,
      halfExtent
    )
      .setFriction(2.0)
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