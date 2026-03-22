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

    // 모바일/터치 입력 관리
    this.activeTouchIds = new Set();
    this.isTouchCameraGesture = false;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerUp.bind(this);

    this.bindEvents();
  }

  bindEvents() {
    if (!this.domElement) return;

    this.domElement.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.domElement.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.domElement.addEventListener("pointerup", this.onPointerUp, { passive: false });
    this.domElement.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    this.domElement.addEventListener("pointerleave", this.onPointerLeave, { passive: false });
  }

  dispose() {
    this.clearLongPressTimer();

    if (this.domElement) {
      this.domElement.removeEventListener("pointerdown", this.onPointerDown);
      this.domElement.removeEventListener("pointermove", this.onPointerMove);
      this.domElement.removeEventListener("pointerup", this.onPointerUp);
      this.domElement.removeEventListener("pointercancel", this.onPointerUp);
      this.domElement.removeEventListener("pointerleave", this.onPointerLeave);
    }

    this.rotateGizmo.dispose();
    this.moveGizmo.dispose();
    this.guide.dispose();
  }

  update() {
    const block = this.getPreviewBlock();

    if (!block) {
      this.rotateGizmo.hide();
      this.moveGizmo.hide();
      this.guide.hide();
      return;
    }

    const y = block.mesh.position.y;
    this.guide.setHeight(y);
    this.guide.show();

    if (this.blockSystem?.state === "ROTATE") {
      this.rotateGizmo.show();
      this.rotateGizmo.syncToBlock(block);
      this.rotateGizmo.setActiveAxis(this.selectedAxis);

      this.moveGizmo.hide();
    } else {
      this.moveGizmo.show();
      this.moveGizmo.syncToBlock(block);
      this.moveGizmo.setActiveAxis(this.moveAxis);

      this.rotateGizmo.hide();
      this.selectedAxis = null;
      this.isRotating = false;
    }
  }

  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  getPreviewBlock() {
    return this.blockSystem?.getCurrentPreviewBlock() ?? null;
  }

  isTouchEvent(event) {
    return event.pointerType === "touch";
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

  beginLongPressCountdown() {
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      const block = this.getPreviewBlock();
      if (!block) return;
      if (this.isDragging) return;
      if (this.isTouchCameraGesture) return;
      if (this.blockSystem.state !== "EDIT") return;

      this.blockSystem.enterRotateMode();
      this.selectedAxis = null;
      this.isRotating = false;
      this.rotateGizmo.show();
      this.rotateGizmo.syncToBlock(block);
    }, this.longPressDuration);
  }

  lockControls() {
    if (this.controls) this.controls.enabled = false;
  }

  unlockControls() {
    if (this.controls) this.controls.enabled = true;
  }

  resetInteractionState() {
    this.clearLongPressTimer();
    this.isDragging = false;
    this.isRotating = false;
    this.activePointerId = null;
    this.selectedAxis = null;
    this.moveAxis = null;

    this.rotateGizmo.setActiveAxis(null);
    this.moveGizmo.setActiveAxis(null);
  }

  enterTouchCameraGesture() {
    this.isTouchCameraGesture = true;
    this.resetInteractionState();
    this.unlockControls();
  }

  leaveTouchCameraGestureIfPossible() {
    if (this.activeTouchIds.size < 2) {
      this.isTouchCameraGesture = false;
      if (this.activeTouchIds.size === 0) {
        this.unlockControls();
      }
    }
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

    if (axis === "x") {
      nextX += worldDelta;
    } else if (axis === "z") {
      nextZ += worldDelta;
    }

    this.blockSystem.setPreviewPosition(nextX, nextZ);
  }

  onPointerDown(event) {
    const block = this.getPreviewBlock();
    if (!block) return;

    const isTouch = this.isTouchEvent(event);

    if (isTouch) {
      this.activeTouchIds.add(event.pointerId);

      if (this.activeTouchIds.size >= 2) {
        this.enterTouchCameraGesture();
        return;
      }
    }

    if (this.isTouchCameraGesture) {
      return;
    }

    this.updatePointer(event);

    if (this.blockSystem.state === "ROTATE") {
      this.rotateGizmo.syncToBlock(block);

      const hit = this.rotateGizmo.pickAxis(this.raycaster);

      if (hit?.axis) {
        this.activePointerId = event.pointerId;
        this.selectedAxis = hit.axis;
        this.isRotating = true;
        this.isDragging = false;
        this.moveAxis = null;

        this.pointerDownScreen.set(event.clientX, event.clientY);
        this.lastPointerScreen.set(event.clientX, event.clientY);

        this.updateRotationTangentFromHit(block, hit.axis, hit.point);

        this.rotateGizmo.setActiveAxis(hit.axis);
        this.lockControls();

        if (this.domElement.setPointerCapture) {
          this.domElement.setPointerCapture(event.pointerId);
        }

        event.preventDefault();
        return;
      }

      this.selectedAxis = null;
      this.isRotating = false;
      this.rotateGizmo.setActiveAxis(null);

      const blockHit = this.pickPreviewBlock(event);
      if (blockHit) {
        this.blockSystem.exitRotateMode();
      } else if (!isTouch) {
        this.unlockControls();
      }

      return;
    }

    if (this.blockSystem.state !== "EDIT") return;

    this.moveGizmo.syncToBlock(block);
    const moveHit = this.moveGizmo.pickHandle(this.raycaster);

    if (moveHit?.axis) {
      this.activePointerId = event.pointerId;
      this.isDragging = true;
      this.isRotating = false;
      this.selectedAxis = null;
      this.moveAxis = moveHit.axis;

      this.pointerDownScreen.set(event.clientX, event.clientY);
      this.lastPointerScreen.set(event.clientX, event.clientY);

      this.lockControls();

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

      event.preventDefault();
      return;
    }

    const hit = this.pickPreviewBlock(event);

    // PC에서는 블럭이 아닌 빈 공간 클릭 시 카메라 허용
    if (!hit) {
      if (!isTouch) {
        this.unlockControls();
      }
      return;
    }

    this.activePointerId = event.pointerId;
    this.isDragging = false;
    this.isRotating = false;
    this.selectedAxis = null;
    this.moveAxis = null;

    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.lastPointerScreen.set(event.clientX, event.clientY);

    this.lockControls();

    if (this.domElement.setPointerCapture) {
      this.domElement.setPointerCapture(event.pointerId);
    }

    const pos = block.body.translation();
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -pos.y);

    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      this.dragOffset.set(pos.x, pos.y, pos.z).sub(this.hitPoint);
    } else {
      this.dragOffset.set(0, 0, 0);
    }

    this.beginLongPressCountdown();
    event.preventDefault();
  }

  onPointerMove(event) {
    const isTouch = this.isTouchEvent(event);

    if (isTouch && this.activeTouchIds.size >= 2) {
      this.enterTouchCameraGesture();
      return;
    }

    if (this.isTouchCameraGesture) {
      return;
    }

    if (this.activePointerId !== event.pointerId) return;

    const block = this.getPreviewBlock();
    if (!block) return;

    const currentScreen = new THREE.Vector2(event.clientX, event.clientY);
    const dx = event.clientX - this.lastPointerScreen.x;
    const dy = event.clientY - this.lastPointerScreen.y;

    if (this.blockSystem.state === "ROTATE" && this.isRotating && this.selectedAxis) {
      const delta = this.getRotationDeltaFromScreenMove(dx, dy);
      this.blockSystem.rotatePreviewByAxis(this.selectedAxis, delta);

      this.lastPointerScreen.copy(currentScreen);
      event.preventDefault();
      return;
    }

    if (this.isDragging && this.moveAxis) {
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
      event.preventDefault();
      return;
    }

    const downDistance = currentScreen.distanceTo(this.pointerDownScreen);

    if (downDistance > this.moveThreshold) {
      this.clearLongPressTimer();
      this.isDragging = true;
    }

    if (!this.isDragging) {
      this.lastPointerScreen.copy(currentScreen);
      return;
    }

    this.updatePointer(event);

    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
      this.lastPointerScreen.copy(currentScreen);
      return;
    }

    const targetX = this.hitPoint.x + this.dragOffset.x;
    const targetZ = this.hitPoint.z + this.dragOffset.z;

    this.blockSystem.setPreviewPosition(targetX, targetZ);

    this.lastPointerScreen.copy(currentScreen);
    event.preventDefault();
  }

  onPointerUp(event) {
    const isTouch = this.isTouchEvent(event);

    if (isTouch) {
      this.activeTouchIds.delete(event.pointerId);
      this.leaveTouchCameraGestureIfPossible();

      if (this.isTouchCameraGesture) {
        return;
      }
    }

    if (this.activePointerId !== null && this.activePointerId !== event.pointerId) {
      return;
    }

    this.clearLongPressTimer();

    this.isDragging = false;
    this.isRotating = false;
    this.activePointerId = null;
    this.selectedAxis = null;
    this.moveAxis = null;

    this.rotateGizmo.setActiveAxis(null);
    this.moveGizmo.setActiveAxis(null);

    if (!isTouch || this.activeTouchIds.size === 0) {
      this.unlockControls();
    }

    if (this.domElement.releasePointerCapture && event.pointerId !== undefined) {
      try {
        this.domElement.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
  }
}