export class BlockMeshSync {
  sync(blocks) {
    for (const block of blocks) {
      const pos = block.body.translation();
      const rot = block.body.rotation();

      block.mesh.position.set(pos.x, pos.y, pos.z);
      block.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }
  }
}