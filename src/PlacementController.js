import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js";
import { GizmoController } from "./GizmoController.js";
import { MoveGizmoController } from "./MoveGizmoController.js";
import { PlacementGuide } from "./PlacementGuide.js";

export class PlacementController {
  constructor(options = {}) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.controls = options.controls;
    this.blockSystem = options.blockSystem;
    this.stageSize = options.stageSize ?? 5;
    this.previewClampPadding = options.previewClampPadding ?? 0.35;
    this.groundMesh = options.groundMesh ?? null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hitPoint = new THREE.Vector3();
    this.dragOffset = new THREE.Vector3();

    this.projectionStart = new THREE.Vector3();
    this.projectionEnd = new THREE.Vector3();
    this.predictedBlockPosition = new THREE.Vector3();

    this.activePointerId = null;
    this.isDragging = false;
    this.isRotating = false;

    this.selectedAxis = null;
    this.moveAxis = null;

    this.pointerDownScreen = new THREE.Vector2();
    this.lastPointerScreen = new THREE.Vector2();
    this.rotationTangentScreen = new THREE.Vector2(0, -1);

    this.moveAxisScreenDir = new THREE.Vector2(1, 0);
    this.moveStartPointerScreen = new THREE.Vector2();
    this.moveStartBlockPos = new THREE.Vector3();
    this.movePixelsToWorld = options.movePixelsToWorld ?? 0.01;

    this.tempVecA = new THREE.Vector3();
    this.tempVecB = new THREE.Vector3();
    this.tempVecC = new THREE.Vector3();
    this.tempCenter = new THREE.Vector3();
    this.tempQuat = new THREE.Quaternion();

    this.tempScreenA = new THREE.Vector2();
    this.tempScreenB = new THREE.Vector2();

    this.longPressTimer = null;
    this.longPressTriggered = false;
    this.longPressDuration = options.longPressDuration ?? 380;
    this.moveThreshold = options.moveThreshold ?? 8;
    this.rotateSpeed = options.rotateSpeed ?? 0.012;

    // NONE | MOVE | ROTATE
    this.selectionMode = "NONE";

    // BLOCK | MOVE_GIZMO | ROTATE_GIZMO | NONE
    this.pressTarget = "NONE";

    this.rotateGizmo = new GizmoController(this.scene, {
      blockSize: options.blockSize ?? 1,
    });

    this.moveGizmo = new MoveGizmoController(this.scene, {
      size: options.blockSize ?? 1,
    });

    this.guide = new PlacementGuide(this.scene, {
      stageSize: this.stageSize,
      padding: this.previewClampPadding,
    });

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerUp.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    if (!this.domElement) return;

    this.domElement.addEventListener("pointerdown", this.onPointerDown, {
      passive: false,
      capture: true,
    });
    this.domElement.addEventListener("pointermove", this.onPointerMove, {
      passive: false,
      capture: true,
    });
    this.domElement.addEventListener("pointerup", this.onPointerUp, {
      passive: false,
      capture: true,
    });
    this.domElement.addEventListener("pointercancel", this.onPointerUp, {
      passive: false,
      capture: true,
    });
    this.domElement.addEventListener("pointerleave", this.onPointerLeave, {
      passive: false,
      capture: true,
    });
  }

  dispose() {
    this.clearLongPressTimer();

    if (this.domElement) {
      this.domElement.removeEventListener("pointerdown", this.onPointerDown, true);
      this.domElement.removeEventListener("pointermove", this.onPointerMove, true);
      this.domElement.removeEventListener("pointerup", this.onPointerUp, true);
      this.domElement.removeEventListener("pointercancel", this.onPointerUp, true);
      this.domElement.removeEventListener("pointerleave", this.onPointerLeave, true);
    }

    this.rotateGizmo.dispose();
    this.moveGizmo.dispose();
    this.guide.dispose();
  }

  update() {
    const block = this.getPreviewBlock();

    if (!block) {
      this.guide.hide();
      this.moveGizmo.hide();
      this.rotateGizmo.hide();
      this.clearSelection();
      this.unlockControls();
      return;
    }

    this.guide.setHeight(block.mesh.position.y);
    this.updateProjectionRay(block);
    this.guide.show();

    if (this.selectionMode === "MOVE") {
      this.moveGizmo.show();
      this.moveGizmo.syncToBlock(block);
      this.moveGizmo.setActiveAxis(this.moveAxis);

      this.rotateGizmo.hide();
      if (!this.isRotating) {
        this.selectedAxis = null;
      }
    } else if (this.selectionMode === "ROTATE") {
      this.rotateGizmo.show();
      this.rotateGizmo.syncToBlock(block);
      this.rotateGizmo.setActiveAxis(this.selectedAxis);

      this.moveGizmo.hide();
      if (!this.isDragging) {
        this.moveAxis = null;
      }
    } else {
      this.moveGizmo.hide();
      this.rotateGizmo.hide();
      this.moveAxis = null;
      this.selectedAxis = null;
    }

    if (this.shouldCameraBeBlocked()) {
      this.lockControls();
    } else {
      this.unlockControls();
    }
  }

  getPreviewBlock() {
    return this.blockSystem?.getCurrentPreviewBlock() ?? null;
  }

  updateProjectionRay(block) {
    if (!block?.mesh || !this.blockSystem?.getPlacementPrediction) {
      this.guide.hideProjection();
      this.guide.hidePredictionGhost();
      return;
    }

    const prediction = this.blockSystem.getPlacementPrediction();

    if (!prediction?.position || !prediction?.quaternion) {
      this.guide.hideProjection();
      this.guide.hidePredictionGhost();
      return;
    }

    const currentBottomY = prediction.currentBottomY ?? block.mesh.position.y;
    const predictedBottomY = prediction.predictedBottomY ?? prediction.position.y;

    this.projectionStart.set(
      block.mesh.position.x,
      currentBottomY + 0.01,
      block.mesh.position.z
    );

    this.projectionEnd.set(
      prediction.position.x,
      predictedBottomY + 0.008,
      prediction.position.z
    );

    if (this.projectionEnd.y >= this.projectionStart.y - 0.002) {
      this.guide.hideProjection();
    } else {
      this.guide.updateProjection(this.projectionStart, this.projectionEnd);
    }

    this.predictedBlockPosition.copy(prediction.position);

    this.guide.updatePredictionGhost(
      block,
      this.predictedBlockPosition,
      prediction.quaternion
    );
  }

  consumeEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  lockControls() {
    if (this.controls) this.controls.enabled = false;
  }

  unlockControls() {
    if (this.controls) this.controls.enabled = true;
  }

  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTriggered = false;
  }

  clearSelection() {
    if (this.blockSystem?.state === "ROTATE") {
      this.blockSystem.exitRotateMode();
    }

    this.selectionMode = "NONE";
    this.pressTarget = "NONE";
    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.activePointerId = null;

    this.moveGizmo.endDirectDrag();
    this.rotateGizmo.unlockAxis();
    this.moveGizmo.setActiveAxis(null);
    this.rotateGizmo.setActiveAxis(null);
  }

  setMoveSelection() {
    if (this.blockSystem?.state === "ROTATE") {
      this.blockSystem.exitRotateMode();
    }

    this.selectionMode = "MOVE";
    this.pressTarget = "NONE";
    this.isDragging = false;
    this.isRotating = false;
    this.selectedAxis = null;
    this.moveAxis = null;

    this.rotateGizmo.unlockAxis();
    this.rotateGizmo.setActiveAxis(null);
  }

  setRotateSelection() {
    if (this.blockSystem?.state === "EDIT") {
      this.blockSystem.enterRotateMode();
    }

    this.selectionMode = "ROTATE";
    this.pressTarget = "NONE";
    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.moveGizmo.setActiveAxis(null);
    this.moveGizmo.endDirectDrag();
  }

  shouldCameraBeBlocked() {
    if (this.selectionMode !== "NONE") return true;
    if (this.activePointerId !== null) return true;
    if (this.isDragging) return true;
    if (this.isRotating) return true;
    return false;
  }

  updatePointer(event) {
    const rect = this.domElement.getBoundingClientRect();

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  pickPreviewBlock(event) {
    const block = this.getPreviewBlock();
    if (!block?.mesh) return null;

    this.updatePointer(event);
    const hits = this.raycaster.intersectObject(block.mesh, true);
    return hits.length > 0 ? hits[0] : null;
  }

  pickMoveGizmo(event) {
    const block = this.getPreviewBlock();
    if (!block || this.selectionMode !== "MOVE") return null;

    this.updatePointer(event);
    this.moveGizmo.syncToBlock(block);
    return this.moveGizmo.pickHandle(this.raycaster);
  }

  pickRotateGizmo(event) {
    const block = this.getPreviewBlock();
    if (!block || this.selectionMode !== "ROTATE") return null;

    this.updatePointer(event);
    this.rotateGizmo.syncToBlock(block);
    return this.rotateGizmo.pickAxis(this.raycaster);
  }

  isPointerInsideGuide(event) {
    const block = this.getPreviewBlock();
    if (!block) return false;

    this.updatePointer(event);

    const planeY = block.mesh.position.y;
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -planeY);

    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      return false;
    }

    const radius = Math.max(0, this.stageSize / 2 - this.previewClampPadding);
    const dist = Math.hypot(this.hitPoint.x, this.hitPoint.z);
    return dist <= radius;
  }

  beginLongPressToRotate() {
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      if (this.isDragging) return;
      if (this.isRotating) return;
      if (this.activePointerId == null) return;
      if (this.pressTarget !== "BLOCK") return;

      this.longPressTriggered = true;
      this.setRotateSelection();
      this.lockControls();
    }, this.longPressDuration);
  }

  getAxisWorld(block, axis) {
    if (axis === "x") this.tempVecA.set(1, 0, 0);
    else if (axis === "y") this.tempVecA.set(0, 1, 0);
    else this.tempVecA.set(0, 0, 1);

    this.tempQuat.copy(block.mesh.quaternion);
    this.tempVecA.applyQuaternion(this.tempQuat).normalize();
    return this.tempVecA.clone();
  }

  projectWorldToScreen(worldPos) {
    const rect = this.domElement.getBoundingClientRect();
    const projected = worldPos.clone().project(this.camera);

    return new THREE.Vector2(
      ((projected.x + 1) * 0.5) * rect.width,
      ((-projected.y + 1) * 0.5) * rect.height
    );
  }

  updateRotationTangentFromHit(block, axis, hitPoint) {
    block.mesh.getWorldPosition(this.tempCenter);

    const axisWorld = this.getAxisWorld(block, axis);

    this.tempVecB.copy(hitPoint).sub(this.tempCenter);

    const axisDot = this.tempVecB.dot(axisWorld);
    this.tempVecB.addScaledVector(axisWorld, -axisDot);

    if (this.tempVecB.lengthSq() < 1e-6) {
      this.rotationTangentScreen.set(0, -1);
      return;
    }

    this.tempVecB.normalize();
    this.tempVecC.crossVectors(axisWorld, this.tempVecB).normalize();

    const p0 = this.projectWorldToScreen(this.tempCenter);
    const p1 = this.projectWorldToScreen(
      this.tempCenter.clone().add(this.tempVecC.clone().multiplyScalar(0.6))
    );

    this.rotationTangentScreen.copy(p1.sub(p0));

    if (this.rotationTangentScreen.lengthSq() < 1e-6) {
      this.rotationTangentScreen.set(0, -1);
      return;
    }

    this.rotationTangentScreen.normalize();

    if (Math.abs(this.rotationTangentScreen.x) > Math.abs(this.rotationTangentScreen.y)) {
      this.rotationTangentScreen.set(Math.sign(this.rotationTangentScreen.x), 0);
    } else {
      this.rotationTangentScreen.set(0, Math.sign(this.rotationTangentScreen.y));
    }
  }

  getRotationDeltaFromScreenMove(dx, dy) {
    return (
      dx * this.rotationTangentScreen.x +
      dy * this.rotationTangentScreen.y
    ) * this.rotateSpeed;
  }

  beginAxisMove(block, axis, event) {
    block.mesh.getWorldPosition(this.moveStartBlockPos);
    this.moveStartPointerScreen.set(event.clientX, event.clientY);

    this.tempCenter.copy(this.moveStartBlockPos);

    if (axis === "x") {
      this.tempVecA.set(1, 0, 0);
    } else if (axis === "z") {
      this.tempVecA.set(0, 0, 1);
    } else {
      this.tempVecA.set(1, 0, 0);
    }

    const start = this.tempCenter.clone();
    const end = this.tempCenter.clone().add(this.tempVecA.clone().multiplyScalar(1.0));

    this.tempScreenA.copy(this.projectWorldToScreen(start));
    this.tempScreenB.copy(this.projectWorldToScreen(end));

    this.moveAxisScreenDir.copy(this.tempScreenB.sub(this.tempScreenA));

    if (this.moveAxisScreenDir.lengthSq() < 1e-6) {
      this.moveAxisScreenDir.set(axis === "x" ? 1 : 0, axis === "z" ? -1 : 0);
    } else {
      this.moveAxisScreenDir.normalize();
    }

    if (Math.abs(this.moveAxisScreenDir.x) > Math.abs(this.moveAxisScreenDir.y)) {
      this.moveAxisScreenDir.set(Math.sign(this.moveAxisScreenDir.x), 0);
    } else {
      this.moveAxisScreenDir.set(0, Math.sign(this.moveAxisScreenDir.y));
    }
  }

  applyAxisMoveFromPointer(block, axis, event) {
    const pointerNow = new THREE.Vector2(event.clientX, event.clientY);
    const pointerDelta = pointerNow.sub(this.moveStartPointerScreen);

    const projectedPixels =
      pointerDelta.x * this.moveAxisScreenDir.x +
      pointerDelta.y * this.moveAxisScreenDir.y;

    const worldDelta = projectedPixels * this.movePixelsToWorld;

    let nextX = this.moveStartBlockPos.x;
    let nextZ = this.moveStartBlockPos.z;

    if (axis === "x") nextX += worldDelta;
    else if (axis === "z") nextZ += worldDelta;

    this.blockSystem.setPreviewPosition(nextX, nextZ);
  }

  startDirectPlaneDrag(block, event) {
    if (!block) return false;

    this.updatePointer(event);

    const hit = this.moveGizmo.beginDirectDrag(
      this.raycaster,
      block.mesh.position.y
    );

    if (!hit) return false;

    if (this.selectionMode !== "MOVE") {
      this.setMoveSelection();
    }

    this.pressTarget = "BLOCK";
    this.moveAxis = "plane";
    this.isDragging = true;
    this.isRotating = false;

    this.blockSystem.setPreviewPositionFromWorldPoint(hit);

    const previewBlock = this.getPreviewBlock();
    if (previewBlock) {
      this.moveGizmo.syncToBlock(previewBlock);
    }

    return true;
  }

  continueDirectPlaneDrag(block, event) {
    if (!block) return false;

    this.updatePointer(event);

    const hit = this.moveGizmo.updateDirectDrag(
      this.raycaster,
      block.mesh.position.y
    );

    if (!hit) return false;

    this.blockSystem.setPreviewPositionFromWorldPoint(hit);

    const previewBlock = this.getPreviewBlock();
    if (previewBlock) {
      this.moveGizmo.syncToBlock(previewBlock);
    }

    return true;
  }

  onPointerDown(event) {
    const block = this.getPreviewBlock();
    if (!block) return;

    const blockHit = this.pickPreviewBlock(event);
    const moveHit = this.pickMoveGizmo(event);
    const rotateHit = this.pickRotateGizmo(event);
    const inGuide = this.isPointerInsideGuide(event);

    this.activePointerId = event.pointerId;
    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.lastPointerScreen.set(event.clientX, event.clientY);

    if (this.selectionMode === "ROTATE") {
      if (rotateHit?.axis) {
        this.pressTarget = "ROTATE_GIZMO";
        this.selectedAxis = rotateHit.axis;
        this.isRotating = true;

        this.rotateGizmo.lockToAxis(rotateHit.axis);
        this.updateRotationTangentFromHit(block, rotateHit.axis, rotateHit.point);
        this.rotateGizmo.syncToBlock(block);

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        this.lockControls();
        this.consumeEvent(event);
        return;
      }

      if (blockHit) {
        this.pressTarget = "BLOCK";

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        this.lockControls();
        this.consumeEvent(event);
        return;
      }

      if (!inGuide) {
        this.clearSelection();
        this.unlockControls();
        this.consumeEvent(event);
        return;
      }

      this.pressTarget = "NONE";
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    if (this.selectionMode === "MOVE") {
      if (moveHit?.axis) {
        this.pressTarget = "MOVE_GIZMO";
        this.moveAxis = moveHit.axis;
        this.isDragging = false;

        if (moveHit.axis === "x" || moveHit.axis === "z") {
          this.beginAxisMove(block, moveHit.axis, event);
        } else {
          const pos = block.body.translation();
          this.dragPlane.set(new THREE.Vector3(0, 1, 0), -pos.y);

          if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
            this.dragOffset.set(pos.x, pos.y, pos.z).sub(this.hitPoint);
          } else {
            this.dragOffset.set(0, 0, 0);
          }
        }

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        this.lockControls();
        this.consumeEvent(event);
        return;
      }

      if (blockHit) {
        this.pressTarget = "BLOCK";
        this.beginLongPressToRotate();

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        this.lockControls();
        this.consumeEvent(event);
        return;
      }

      if (!inGuide) {
        this.clearSelection();
        this.unlockControls();
        this.consumeEvent(event);
        return;
      }

      this.pressTarget = "NONE";
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    if (blockHit) {
      this.pressTarget = "BLOCK";
      this.beginLongPressToRotate();

      if (this.domElement.setPointerCapture) {
        this.domElement.setPointerCapture(event.pointerId);
      }

      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    this.activePointerId = null;
    this.pressTarget = "NONE";
  }

  onPointerMove(event) {
    if (this.activePointerId !== event.pointerId) return;

    const block = this.getPreviewBlock();
    if (!block) return;

    const currentScreen = new THREE.Vector2(event.clientX, event.clientY);
    const dx = event.clientX - this.lastPointerScreen.x;
    const dy = event.clientY - this.lastPointerScreen.y;
    const downDistance = currentScreen.distanceTo(this.pointerDownScreen);

    if (
      (this.pressTarget === "BLOCK" || this.pressTarget === "MOVE_GIZMO") &&
      downDistance > this.moveThreshold
    ) {
      this.clearLongPressTimer();
    }

    if (
      this.pressTarget === "BLOCK" &&
      !this.longPressTriggered &&
      !this.isRotating &&
      downDistance > this.moveThreshold
    ) {
      if (!this.isDragging || this.moveAxis !== "plane") {
        const started = this.startDirectPlaneDrag(block, event);
        if (started) {
          this.lastPointerScreen.copy(currentScreen);
          this.lockControls();
          this.consumeEvent(event);
          return;
        }
      } else {
        const moved = this.continueDirectPlaneDrag(block, event);
        if (moved) {
          this.lastPointerScreen.copy(currentScreen);
          this.lockControls();
          this.consumeEvent(event);
          return;
        }
      }
    }

    if (this.selectionMode === "NONE") {
      this.lastPointerScreen.copy(currentScreen);
      return;
    }

    if (
      this.selectionMode === "MOVE" &&
      this.pressTarget === "MOVE_GIZMO" &&
      !this.longPressTriggered &&
      downDistance > this.moveThreshold
    ) {
      this.isDragging = true;
    }

    if (this.selectionMode === "ROTATE" && this.isRotating && this.selectedAxis) {
      const delta = this.getRotationDeltaFromScreenMove(dx, dy);
      this.blockSystem.rotatePreviewByAxis(this.selectedAxis, delta);

      this.lastPointerScreen.copy(currentScreen);
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    if (this.selectionMode === "MOVE" && this.isDragging && this.moveAxis) {
      this.updatePointer(event);

      if (this.moveAxis === "plane") {
        const moved = this.continueDirectPlaneDrag(block, event);
        if (moved) {
          this.lastPointerScreen.copy(currentScreen);
          this.lockControls();
          this.consumeEvent(event);
          return;
        }
      } else if (this.moveAxis === "x" || this.moveAxis === "z") {
        this.applyAxisMoveFromPointer(block, this.moveAxis, event);

        this.lastPointerScreen.copy(currentScreen);
        this.lockControls();
        this.consumeEvent(event);
        return;
      } else if (this.moveAxis === "plane") {
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
          const targetX = this.hitPoint.x + this.dragOffset.x;
          const targetZ = this.hitPoint.z + this.dragOffset.z;
          this.blockSystem.setPreviewPosition(targetX, targetZ);
        }

        this.lastPointerScreen.copy(currentScreen);
        this.lockControls();
        this.consumeEvent(event);
        return;
      }
    }

    this.lastPointerScreen.copy(currentScreen);
  }

  onPointerUp(event) {
    const wasActivePointer = this.activePointerId === event.pointerId;
    if (!wasActivePointer) return;

    const upDistance = new THREE.Vector2(event.clientX, event.clientY)
      .distanceTo(this.pointerDownScreen);

    const blockHit = this.pickPreviewBlock(event);

    const pressTarget = this.pressTarget;
    const longPressTriggered = this.longPressTriggered;
    const wasDragging = this.isDragging;

    this.clearLongPressTimer();

    if (
      this.selectionMode === "NONE" &&
      pressTarget === "BLOCK" &&
      !longPressTriggered &&
      !wasDragging
    ) {
      if (blockHit && upDistance <= this.moveThreshold) {
        this.setMoveSelection();
        this.lockControls();
      } else {
        this.unlockControls();
      }
    } else if (
      this.selectionMode === "ROTATE" &&
      pressTarget === "BLOCK" &&
      !longPressTriggered &&
      blockHit &&
      upDistance <= this.moveThreshold
    ) {
      this.setMoveSelection();
      this.lockControls();
    }

    const previewBlock = this.getPreviewBlock();

    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.moveGizmo.setActiveAxis(null);
    this.moveGizmo.endDirectDrag();

    this.rotateGizmo.unlockAxis();
    this.rotateGizmo.setActiveAxis(null);

    if (previewBlock && this.selectionMode === "ROTATE") {
      this.rotateGizmo.syncToBlock(previewBlock);
    }

    this.pressTarget = "NONE";
    this.activePointerId = null;

    if (this.domElement.releasePointerCapture && event.pointerId !== undefined) {
      try {
        this.domElement.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    if (this.selectionMode === "NONE") {
      this.unlockControls();
    } else {
      this.lockControls();
    }
  }
}