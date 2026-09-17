const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../mechanism.js");

test("optimized default mechanism closes over the full stroke", () => {
  const result = M.simulateStroke(M.clone(M.DEFAULT_DESIGN));
  assert.equal(result.poses.length, 241);
  assert.equal(result.validFraction, 1);
  assert.ok(result.minMargin > 0.08);
});

test("default trajectory matches the optimized endpoints", () => {
  const result = M.simulateStroke(M.clone(M.DEFAULT_DESIGN));
  const first = result.poses[0].tip;
  const last = result.poses.at(-1).tip;
  assert.ok(Math.abs(first.x - (-14.9582392089)) < 1e-6);
  assert.ok(Math.abs(first.z - 0.4511365667) < 1e-6);
  assert.ok(Math.abs(last.x - 5.1789605043) < 1e-6);
  assert.ok(Math.abs(last.z - 10.2640617910) < 1e-6);
});

test("dragging TIP changes only its local output offset", () => {
  const original = M.clone(M.DEFAULT_DESIGN);
  const pose = M.simulateStroke(original).poses[80];
  const point = { x: pose.joints.TIP.x + 3, z: pose.joints.TIP.z - 2 };
  const changed = M.updateDesignFromDrag(original, "TIP", point, 80);
  assert.ok(Math.abs(changed.params.cx - (original.params.cx + 3)) < 1e-9);
  assert.ok(Math.abs(changed.params.cz - (original.params.cz - 2)) < 1e-9);
  assert.equal(changed.params.r1, original.params.r1);
});

test("dragging K preserves closure at the edited frame", () => {
  const original = M.clone(M.DEFAULT_DESIGN);
  const frame = 100;
  const pose = M.simulateStroke(original).poses[frame];
  const point = { x: pose.joints.K.x + 2, z: pose.joints.K.z + 1 };
  const changed = M.updateDesignFromDrag(original, "K", point, frame);
  const editedPose = M.simulateStroke(changed).poses[frame];
  assert.equal(editedPose.valid, true);
  assert.ok(Math.hypot(editedPose.joints.K.x - point.x, editedPose.joints.K.z - point.z) < 1e-7);
});
