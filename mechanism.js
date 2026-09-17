(function (root) {
  "use strict";

  const JOINT_NAMES = ["O1", "O1b", "P1", "P1b", "V2", "V2b", "K", "Q", "W", "Wb", "TIP"];
  const BARS = [
    ["O1", "P1", "stage1"], ["O1b", "P1b", "stage1"],
    ["P1", "P1b", "platform"], ["P1", "V2", "platform"], ["V2", "V2b", "platform"],
    ["V2", "W", "stage2"], ["V2b", "Wb", "stage2"], ["W", "Wb", "stage2"],
    ["V2", "K", "coupling"], ["Q", "K", "coupling"], ["W", "TIP", "output"]
  ];

  const DEFAULT_DESIGN = Object.freeze({
    version: 1,
    name: "straight_ellipse_link_optimized",
    params: {
      o1x: 48.170745559798476, o1z: 87.75557397596923,
      r1: 13.283623201768886,
      mx: -6.736248687801125, mz: -15.914290801026077,
      r2: 55.45645964502007,
      rho: 21.355991132633264,
      beta: 8.360412123621057 * Math.PI / 180,
      qx: 23.36597692978468, qz: 51.13336219522266,
      link: 22.90213919628436,
      cx: 6.495728468379955, cz: -63.18184942357599,
      branch: 1,
      stage1Width: 20, stage2Width: 16
    },
    stroke: { startDeg: 139.25, endDeg: 17.75, samples: 241 },
    target: { straight: 15, radiusX: 5, radiusZ: 10, clearance: 0.3 }
  });

  const clone = value => JSON.parse(JSON.stringify(value));
  const rad = deg => deg * Math.PI / 180;
  const deg = radians => radians * 180 / Math.PI;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const angle = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
  const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));

  function solvePose(params, phi) {
    const O1 = { x: params.o1x, z: params.o1z };
    const O1b = { x: params.o1x + params.stage1Width, z: params.o1z };
    const P1 = { x: O1.x + params.r1 * Math.cos(phi), z: O1.z + params.r1 * Math.sin(phi) };
    const P1b = { x: P1.x + params.stage1Width, z: P1.z };
    const V2 = { x: P1.x + params.mx, z: P1.z + params.mz };
    const V2b = { x: V2.x + params.stage2Width, z: V2.z };
    const Q = { x: params.qx, z: params.qz };
    const sx = V2.x - Q.x;
    const sz = V2.z - Q.z;
    const sLength = Math.max(Math.hypot(sx, sz), 1e-9);
    const rawCos = (params.link ** 2 - params.rho ** 2 - sLength ** 2) / (2 * params.rho * sLength);
    const valid = Number.isFinite(rawCos) && Math.abs(rawCos) <= 1;
    const cosine = clamp(rawCos, -1, 1);
    const margin = 1 - Math.abs(cosine);
    const sigma = Math.atan2(sz, sx);
    const psi = sigma - params.beta + params.branch * Math.acos(cosine);
    const K = { x: V2.x + params.rho * Math.cos(psi + params.beta), z: V2.z + params.rho * Math.sin(psi + params.beta) };
    const W = { x: V2.x + params.r2 * Math.cos(psi), z: V2.z + params.r2 * Math.sin(psi) };
    const Wb = { x: W.x + params.stage2Width, z: W.z };
    const TIP = { x: W.x + params.cx, z: W.z + params.cz };
    const joints = { O1, O1b, P1, P1b, V2, V2b, K, Q, W, Wb, TIP };
    return { phi, psi, valid, rawCos, margin, joints, tip: TIP };
  }

  function simulateStroke(design, sampleOverride) {
    const count = Math.max(2, Math.round(sampleOverride || design.stroke.samples));
    const poses = [];
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      const phi = rad(design.stroke.startDeg + (design.stroke.endDeg - design.stroke.startDeg) * t);
      poses.push(solvePose(design.params, phi));
    }
    const validPoses = poses.filter(pose => pose.valid);
    const tips = validPoses.map(pose => pose.tip);
    const xs = tips.map(point => point.x);
    const zs = tips.map(point => point.z);
    return {
      poses,
      validCount: validPoses.length,
      validFraction: validPoses.length / poses.length,
      minMargin: validPoses.length ? Math.min(...validPoses.map(pose => pose.margin)) : 0,
      width: tips.length ? Math.max(...xs) - Math.min(...xs) : 0,
      height: tips.length ? Math.max(...zs) - Math.min(...zs) : 0
    };
  }

  function targetPath(target, samples = 121) {
    const points = [];
    const straightSamples = Math.round(samples * 0.6);
    for (let i = 0; i < straightSamples; i += 1) {
      const t = i / Math.max(1, straightSamples - 1);
      points.push({ x: -target.straight * (1 - t), z: target.clearance });
    }
    for (let i = 1; i <= samples - straightSamples; i += 1) {
      const t = i / (samples - straightSamples);
      const theta = t * Math.PI / 2;
      points.push({ x: target.radiusX * Math.sin(theta), z: target.clearance + target.radiusZ * (1 - Math.cos(theta)) });
    }
    return points;
  }

  function chooseBranch(V2, K, Q) {
    const alpha = angle(V2, K);
    const sigma = angle(Q, V2);
    return wrapAngle(alpha - sigma) >= 0 ? 1 : -1;
  }

  function updateDesignFromDrag(originalDesign, jointName, point, frameIndex) {
    const design = clone(originalDesign);
    const stroke = simulateStroke(originalDesign);
    const safeIndex = clamp(Math.round(frameIndex), 0, stroke.poses.length - 1);
    const pose = stroke.poses[safeIndex];
    const j = pose.joints;
    const p = design.params;

    if (jointName === "O1") {
      p.o1x = point.x; p.o1z = point.z;
    } else if (jointName === "Q") {
      p.qx = point.x; p.qz = point.z;
      p.link = Math.max(1, distance(point, j.K));
      p.branch = chooseBranch(j.V2, j.K, point);
    } else if (jointName === "P1") {
      p.r1 = Math.max(1, distance(j.O1, point));
      const newPhi = angle(j.O1, point);
      const shift = deg(wrapAngle(newPhi - pose.phi));
      design.stroke.startDeg += shift;
      design.stroke.endDeg += shift;
    } else if (jointName === "V2") {
      p.mx = point.x - j.P1.x; p.mz = point.z - j.P1.z;
    } else if (jointName === "K") {
      const psiRef = angle(j.V2, j.W);
      p.rho = Math.max(1, distance(j.V2, point));
      p.beta = wrapAngle(angle(j.V2, point) - psiRef);
      p.link = Math.max(1, distance(j.Q, point));
      p.branch = chooseBranch(j.V2, point, j.Q);
    } else if (jointName === "W") {
      const psiRef = angle(j.V2, point);
      p.r2 = Math.max(1, distance(j.V2, point));
      p.beta = wrapAngle(angle(j.V2, j.K) - psiRef);
      p.rho = Math.max(1, distance(j.V2, j.K));
      p.link = Math.max(1, distance(j.Q, j.K));
      p.branch = chooseBranch(j.V2, j.K, j.Q);
    } else if (jointName === "TIP") {
      p.cx = point.x - j.W.x; p.cz = point.z - j.W.z;
    } else if (jointName === "O1b") {
      p.stage1Width = Math.max(4, point.x - j.O1.x);
    } else if (jointName === "P1b") {
      p.stage1Width = Math.max(4, point.x - j.P1.x);
    } else if (jointName === "V2b") {
      p.stage2Width = Math.max(4, point.x - j.V2.x);
    } else if (jointName === "Wb") {
      p.stage2Width = Math.max(4, point.x - j.W.x);
    }
    return design;
  }

  function linkLengths(params) {
    return [
      ["O1–P1", params.r1],
      ["P1–V2", Math.hypot(params.mx, params.mz)],
      ["V2–W", params.r2],
      ["V2–K", params.rho],
      ["Q–K", params.link],
      ["W–TIP", Math.hypot(params.cx, params.cz)],
      ["1단 폭", params.stage1Width],
      ["2단 폭", params.stage2Width]
    ];
  }

  const API = { JOINT_NAMES, BARS, DEFAULT_DESIGN, clone, rad, deg, solvePose, simulateStroke, targetPath, updateDesignFromDrag, linkLengths };
  root.ScoopMechanism = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
