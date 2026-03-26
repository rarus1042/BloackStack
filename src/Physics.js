import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

export class Physics {
  constructor(options = {}) {
    this.RAPIER = RAPIER;
    this.world = null;
    this.groundBody = null;
    this.groundCollider = null;

    this.stageSize = options.stageSize ?? 10;
    this.groundHeight = options.groundHeight ?? 0.12;

    this.groundColliderScale = options.groundColliderScale ?? 0.985;
  }

  async init() {
    await this.RAPIER.init({});

    this.world = new this.RAPIER.World({ x: 0, y: -9.81, z: 0 });

    const params = this.world.integrationParameters;
    params.dt = 1 / 60;

    // 고층 적층 안정화용 상향
    params.maxVelocityIterations = 20;
    params.maxVelocityFrictionIterations = 12;
    params.maxStabilizationIterations = 8;

    if ("numSolverIterations" in params) {
      params.numSolverIterations = 28;
    }

    if ("minIslandSize" in params) {
      params.minIslandSize = 128;
    }

    if ("maxCcdSubsteps" in params) {
      params.maxCcdSubsteps = 4;
    }

    this.setupGround();
  }

  setupGround() {
    const halfGroundHeight = this.groundHeight / 2;
    const halfExtent = this.stageSize / 2;
    const groundHalfX = halfExtent * this.groundColliderScale;
    const groundHalfZ = halfExtent * this.groundColliderScale;

    this.groundBody = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfGroundHeight, 0)
    );

    const colDesc = this.RAPIER.ColliderDesc.cuboid(
      groundHalfX,
      halfGroundHeight,
      groundHalfZ
    )
      .setFriction(2.6)
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