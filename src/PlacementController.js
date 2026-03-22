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

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hitPoint = new THREE.Vector3();
    this.dragOffset = new THREE.Vector3();

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

    // NONE | MOVE | ROTATE
    this.selectionMode = "NONE";

    this.touchPoints = new Map();
    this.isTouchCameraGesture = false;

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
    this.guide.show();

    if (this.selectionMode === "MOVE") {
      this.moveGizmo.show();
      this.moveGizmo.syncToBlock(block);
      this.moveGizmo.setActiveAxis(this.moveAxis);

      this.rotateGizmo.hide();
      this.selectedAxis = null;
    } else if (this.selectionMode === "ROTATE") {
      this.rotateGizmo.show();
      this.rotateGizmo.syncToBlock(block);
      this.rotateGizmo.setActiveAxis(this.selectedAxis);

      this.moveGizmo.hide();
      this.moveAxis = null;
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

  isTouchEvent(event) {
    return event.pointerType === "touch";
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
    this.selectionMode = "NONE";
    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.activePointerId = null;
    this.moveGizmo.setActiveAxis(null);
    this.rotateGizmo.setActiveAxis(null);
  }

  setMoveSelection() {
    this.selectionMode = "MOVE";
    this.isDragging = false;
    this.isRotating = false;
    this.selectedAxis = null;
    this.moveAxis = null;
    this.rotateGizmo.setActiveAxis(null);
  }

  setRotateSelection() {
    this.selectionMode = "ROTATE";
    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.moveGizmo.setActiveAxis(null);
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

  beginBlockLongPressCountdown() {
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      if (this.isDragging) return;
      if (this.selectionMode !== "NONE") return;

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

  onPointerDown(event) {
    const block = this.getPreviewBlock();
    if (!block) return;

    const blockHit = this.pickPreviewBlock(event);
    const inGuide = this.isPointerInsideGuide(event);

    this.activePointerId = event.pointerId;
    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.lastPointerScreen.set(event.clientX, event.clientY);

    // ROTATE selection
    if (this.selectionMode === "ROTATE") {
      const rotateHit = this.pickRotateGizmo(event);

      if (rotateHit?.axis) {
        this.selectedAxis = rotateHit.axis;
        this.isRotating = true;
        this.updateRotationTangentFromHit(block, rotateHit.axis, rotateHit.point);

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        this.lockControls();
        this.consumeEvent(event);
        return;
      }

      // 가이드 밖 터치 -> 회전 해제
      if (!inGuide) {
        this.clearSelection();
        this.unlockControls();
        this.consumeEvent(event);
        return;
      }

      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    // MOVE selection
    if (this.selectionMode === "MOVE") {
      const moveHit = this.pickMoveGizmo(event);

      if (moveHit?.axis) {
        this.moveAxis = moveHit.axis;
        this.isDragging = true;

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

      // 가이드 밖 터치 -> 무브 해제
      if (!inGuide) {
        this.clearSelection();
        this.unlockControls();
        this.consumeEvent(event);
        return;
      }

      // 가이드 안 빈 공간은 아무것도 안 함
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    // NONE state
    if (blockHit) {
      if (this.domElement.setPointerCapture) {
        this.domElement.setPointerCapture(event.pointerId);
      }

      this.beginBlockLongPressCountdown();
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    // 기본 상태에서 블럭도 아니고 가이드만 눌렀으면 카메라 허용
    this.activePointerId = null;
  }

  onPointerMove(event) {
    if (this.activePointerId !== event.pointerId) return;

    const block = this.getPreviewBlock();
    if (!block) return;

    const currentScreen = new THREE.Vector2(event.clientX, event.clientY);
    const dx = event.clientX - this.lastPointerScreen.x;
    const dy = event.clientY - this.lastPointerScreen.y;
    const downDistance = currentScreen.distanceTo(this.pointerDownScreen);

    // NONE 상태에서 블럭 롱프레스 대기 중
    if (this.selectionMode === "NONE") {
      if (downDistance > this.moveThreshold) {
        this.clearLongPressTimer();
      }

      this.lastPointerScreen.copy(currentScreen);
      return;
    }

    // ROTATE state
    if (this.selectionMode === "ROTATE" && this.isRotating && this.selectedAxis) {
      const delta = this.getRotationDeltaFromScreenMove(dx, dy);
      this.blockSystem.rotatePreviewByAxis(this.selectedAxis, delta);

      this.lastPointerScreen.copy(currentScreen);
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    // MOVE state
    if (this.selectionMode === "MOVE" && this.isDragging && this.moveAxis) {
      this.updatePointer(event);

      if (this.moveAxis === "plane") {
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
          const targetX = this.hitPoint.x + this.dragOffset.x;
          const targetZ = this.hitPoint.z + this.dragOffset.z;
          this.blockSystem.setPreviewPosition(targetX, targetZ);
        }
      } else {
        this.applyAxisMoveFromPointer(block, this.moveAxis, event);
      }

      this.lastPointerScreen.copy(currentScreen);
      this.lockControls();
      this.consumeEvent(event);
      return;
    }

    this.lastPointerScreen.copy(currentScreen);
  }

  onPointerUp(event) {
    const wasActivePointer = this.activePointerId === event.pointerId;

    this.clearLongPressTimer();

    if (!wasActivePointer) return;

    // NONE 상태에서 블럭 탭 후 떼기 -> MOVE selection
    if (this.selectionMode === "NONE" && !this.longPressTriggered) {
      const upDistance = new THREE.Vector2(event.clientX, event.clientY)
        .distanceTo(this.pointerDownScreen);

      const blockHit = this.pickPreviewBlock(event);

      if (blockHit && upDistance <= this.moveThreshold) {
        this.setMoveSelection();
        this.lockControls();
      } else {
        this.unlockControls();
      }
    }

    this.isDragging = false;
    this.isRotating = false;
    this.moveAxis = null;
    this.selectedAxis = null;
    this.moveGizmo.setActiveAxis(null);
    this.rotateGizmo.setActiveAxis(null);
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