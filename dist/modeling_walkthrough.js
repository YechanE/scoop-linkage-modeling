(function () {
  "use strict";

  const M = window.ScoopMechanism;
  if (!M) throw new Error("mechanism.js must be loaded first");

  const DESIGN = M.clone(M.DEFAULT_DESIGN);
  const P = DESIGN.params;
  const TARGET = M.targetPath(DESIGN.target, 121);
  const STROKE = M.simulateStroke(DESIGN);
  const NS = "http://www.w3.org/2000/svg";
  const TAU = Math.PI * 2;

  const state = {
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    heroPlaying: true,
    targetPlaying: true,
    vectorPlaying: true,
    framePlaying: false,
    targetIndex: 0,
    frameIndex: 0,
    closureIndex: 0,
    ikIndex: 0,
    ikBranch: -1,
    closureBranch: 1,
    chainStep: 1,
    vectorK: -1,
    phase: 0,
    lastTime: 0
  };

  const $ = id => document.getElementById(id);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const deg = radians => radians * 180 / Math.PI;
  const rad = degrees => degrees * Math.PI / 180;
  const normDeg = degrees => (degrees % 360 + 360) % 360;
  const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits).replace("-0.00", "0.00") : "—";
  const pointText = point => `(${fmt(point.x, 3)}, ${fmt(point.z, 3)})`;

  function S(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    if (parent) parent.appendChild(node);
    return node;
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function group(parent, attrs = {}) { return S("g", attrs, parent); }
  function line(parent, a, b, className, attrs = {}) {
    return S("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: className, ...attrs }, parent);
  }
  function circle(parent, point, radius, className, attrs = {}) {
    return S("circle", { cx: point.x, cy: point.y, r: radius, class: className, ...attrs }, parent);
  }
  function label(parent, point, value, className = "label", dx = 8, dy = -8, anchor = "start") {
    return S("text", { x: point.x + dx, y: point.y + dy, class: className, "text-anchor": anchor, text: value }, parent);
  }
  function path(parent, points, className, attrs = {}) {
    const valid = points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
    const d = valid.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    return S("path", { d, class: className, ...attrs }, parent);
  }
  function polygon(parent, points, attrs = {}) {
    return S("polygon", { points: points.map(point => `${point.x},${point.y}`).join(" "), ...attrs }, parent);
  }

  function makeTransform(points, width, height, pad = 40, extra = {}) {
    const xs = points.map(point => point.x).filter(Number.isFinite);
    const zs = points.map(point => point.z).filter(Number.isFinite);
    let minX = extra.minX ?? Math.min(...xs);
    let maxX = extra.maxX ?? Math.max(...xs);
    let minZ = extra.minZ ?? Math.min(...zs);
    let maxZ = extra.maxZ ?? Math.max(...zs);
    if (maxX - minX < 1) { minX -= .5; maxX += .5; }
    if (maxZ - minZ < 1) { minZ -= .5; maxZ += .5; }
    const sx = (width - pad * 2) / (maxX - minX);
    const sy = (height - pad * 2) / (maxZ - minZ);
    const scale = Math.min(sx, sy);
    const usedW = (maxX - minX) * scale;
    const usedH = (maxZ - minZ) * scale;
    const offsetX = (width - usedW) / 2;
    const offsetY = (height - usedH) / 2;
    return point => ({
      x: offsetX + (point.x - minX) * scale,
      y: height - offsetY - (point.z - minZ) * scale
    });
  }

  function addGrid(svg, width, height, columns = 8, rows = 6) {
    const grid = group(svg, { opacity: ".8" });
    for (let i = 1; i < columns; i += 1) line(grid, { x: i * width / columns, y: 0 }, { x: i * width / columns, y: height }, "grid-line");
    for (let i = 1; i < rows; i += 1) line(grid, { x: 0, y: i * height / rows }, { x: width, y: i * height / rows }, "grid-line");
  }

  function addArrowDefs(svg) {
    const defs = S("defs", {}, svg);
    [
      ["arrow-blue", "#246bfd"],
      ["arrow-orange", "#f59e0b"],
      ["arrow-slate", "#64748b"],
      ["arrow-red", "#ef4444"]
    ].forEach(([id, color]) => {
      const marker = S("marker", { id, viewBox: "0 0 10 10", refX: "8.5", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
      S("path", { d: "M0 0 L10 5 L0 10 z", fill: color }, marker);
    });
  }

  function drawFixed(parent, point, colorClass = "") {
    S("rect", { x: point.x - 6, y: point.y - 6, width: 12, height: 12, rx: 2, class: `fixed ${colorClass}` }, parent);
    polygon(parent, [
      { x: point.x - 13, y: point.y + 11 },
      { x: point.x + 13, y: point.y + 11 },
      { x: point.x, y: point.y + 2 }
    ], { fill: "none", stroke: "currentColor", "stroke-width": 1.5, opacity: .45 });
  }

  function barClass(type) {
    if (type === "stage1") return "stage1-link";
    if (type === "stage2") return "stage2-link";
    if (type === "coupling") return "coupling-link";
    if (type === "output") return "tip-link";
    return "platform-link";
  }

  function drawMechanism(svg, pose, options = {}) {
    const width = options.width || 680;
    const height = options.height || 500;
    const allPoints = STROKE.poses.filter(item => item.valid).flatMap(item => Object.values(item.joints));
    const target = TARGET;
    const transform = options.transform || makeTransform([...allPoints, ...target], width, height, options.pad || 42, { minZ: options.minZ ?? -7 });

    clear(svg);
    addGrid(svg, width, height);
    const groundY = transform({ x: 0, z: 0 }).y;
    S("rect", { x: 0, y: groundY, width, height: Math.max(0, height - groundY), class: "ground-fill" }, svg);
    line(svg, { x: 0, y: groundY }, { x: width, y: groundY }, "axis");
    path(svg, TARGET.map(transform), "target-path");
    path(svg, STROKE.poses.filter(item => item.valid).map(item => transform(item.tip)), "actual-path");

    const joints = Object.fromEntries(Object.entries(pose.joints).map(([name, point]) => [name, transform(point)]));
    const links = group(svg);
    M.BARS.forEach(([aName, bName, type]) => line(links, joints[aName], joints[bName], barClass(type)));
    const pins = group(svg);
    ["O1", "O1b", "Q"].forEach(name => drawFixed(pins, joints[name]));
    Object.entries(joints).forEach(([name, point]) => {
      if (["O1", "O1b", "Q"].includes(name)) return;
      const color = name === "TIP" ? "green" : name === "K" ? "violet" : name.startsWith("P1") ? "blue" : name.startsWith("W") ? "orange" : "";
      circle(pins, point, name === "TIP" ? 6 : 4.7, `joint ${color}`);
    });
    ["O1", "P1", "V2", "K", "Q", "W", "TIP"].forEach(name => {
      const offsets = name === "TIP" ? [9, 17] : name === "Q" ? [9, 18] : [8, -8];
      label(svg, joints[name], name === "TIP" ? "TIP" : name.replace("1", "₁").replace("2", "₂"), "label", offsets[0], offsets[1]);
    });
    return transform;
  }

  function drawHero(index) {
    const pose = STROKE.poses[index];
    drawMechanism($("heroMechanism"), pose, { width: 680, height: 500, pad: 40, minZ: -8 });
    $("heroPhi").textContent = `${fmt(deg(pose.phi), 2)}°`;
    $("heroPsi").textContent = `${fmt(normDeg(deg(pose.psi)), 2)}°`;
    $("heroTip").textContent = `${fmt(pose.tip.x, 2)}, ${fmt(pose.tip.z, 2)} mm`;
  }

  function drawChain() {
    const svg = $("chainDiagram");
    const pose = STROKE.poses[0];
    const world = [pose.joints.O1, pose.joints.P1, pose.joints.V2, pose.joints.W, pose.joints.TIP];
    const transform = makeTransform(world, 680, 440, 72);
    const points = Object.fromEntries(Object.entries({ O1: pose.joints.O1, P1: pose.joints.P1, V2: pose.joints.V2, W: pose.joints.W, TIP: pose.joints.TIP }).map(([name, point]) => [name, transform(point)]));

    clear(svg);
    addGrid(svg, 680, 440);
    addArrowDefs(svg);
    const links = [
      ["O1", "P1", "vector-1", "arrow-blue", "r₁e(φ)"],
      ["P1", "V2", "vector-offset", "arrow-slate", "m"],
      ["V2", "W", "vector-2", "arrow-orange", "r₂e(ψ)"],
      ["W", "TIP", "tip-link", "arrow-slate", "c"]
    ];
    links.forEach(([a, b, className, marker, value], index) => {
      const visible = index < state.chainStep;
      line(svg, points[a], points[b], className, { "marker-end": `url(#${marker})`, opacity: visible ? 1 : .12 });
      const mid = { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2 };
      label(svg, mid, value, visible ? "label" : "small-label", 7, -8);
    });
    Object.entries(points).forEach(([name, point], index) => {
      const visible = index <= state.chainStep;
      circle(svg, point, name === "TIP" ? 7 : 5.5, `joint ${name === "TIP" ? "green" : ""}`, { opacity: visible ? 1 : .15 });
      label(svg, point, name.replace("1", "₁").replace("2", "₂"), "label", 8, name === "TIP" ? 18 : -9);
    });
    const equation = S("text", { x: 340, y: 408, "text-anchor": "middle", class: "small-label", text: "TIP = O₁ + r₁e(φ) + m + r₂e(ψ) + c" }, svg);
    equation.setAttribute("style", "font-family:var(--mono);font-weight:700;font-size:14px");

    $("chainStatus").textContent = `${state.chainStep} / 4`;
    document.querySelectorAll("[data-chain-step]").forEach(item => item.classList.toggle("active", Number(item.dataset.chainStep) === state.chainStep));
    $("chainControls").querySelectorAll("button").forEach(button => button.classList.toggle("active", Number(button.dataset.step) === state.chainStep));
  }

  function targetTangent(index) {
    const before = TARGET[Math.max(0, index - 1)];
    const after = TARGET[Math.min(TARGET.length - 1, index + 1)];
    return Math.atan2(after.z - before.z, after.x - before.x);
  }

  function drawTarget() {
    const svg = $("targetDiagram");
    const index = state.targetIndex;
    const point = TARGET[index];
    const angle = targetTangent(index);
    const transform = makeTransform([...TARGET, { x: -16, z: -1 }, { x: 7, z: 12 }], 680, 390, 56);
    clear(svg);
    addGrid(svg, 680, 390);
    const groundY = transform({ x: 0, z: 0 }).y;
    S("rect", { x: 0, y: groundY, width: 680, height: 390 - groundY, class: "ground-fill" }, svg);
    line(svg, { x: 0, y: groundY }, { x: 680, y: groundY }, "axis");
    path(svg, TARGET.map(transform), "target-path");

    const joinIndex = Math.round(121 * .6) - 1;
    const marks = [0, joinIndex, TARGET.length - 1];
    marks.forEach((markIndex, i) => {
      const mapped = transform(TARGET[markIndex]);
      circle(svg, mapped, 4.5, "joint red");
      label(svg, mapped, i === 0 ? "시작" : i === 1 ? "접합" : "끝", "small-label", i === 2 ? -8 : 8, i === 2 ? -10 : -9, i === 2 ? "end" : "start");
    });

    const q = transform(point);
    const tangentScale = 34;
    const tangent = { x: q.x + Math.cos(angle) * tangentScale, y: q.y - Math.sin(angle) * tangentScale };
    line(svg, q, tangent, "tangent", { "marker-end": "url(#arrow-red)" });
    if (!svg.querySelector("#arrow-red")) addArrowDefs(svg);
    circle(svg, q, 8, "joint red");
    S("rect", { x: q.x - 3, y: q.y - 23, width: 6, height: 46, rx: 3, class: "tip-body", transform: `rotate(0 ${q.x} ${q.y})` }, svg);
    label(svg, q, "TIP", "label", 13, -15);

    const discTop = transform({ x: 0, z: .8 }).y;
    const discBottom = transform({ x: 0, z: 0 }).y;
    S("rect", { x: 0, y: discTop, width: transform({ x: 0, z: 0 }).x, height: Math.max(2, discBottom - discTop), fill: "#c9d1da", opacity: .7 }, svg);
    label(svg, { x: 20, y: discTop }, "0.8 mm 원판", "small-label", 0, -7);

    $("targetReadout").textContent = `${Math.round(index / (TARGET.length - 1) * 100)}%`;
    $("targetPoint").textContent = `${fmt(point.x, 2)}, ${fmt(point.z, 2)}`;
    $("targetTangent").textContent = `${fmt(deg(angle), 1)}°`;
    $("targetSlider").value = index;
  }

  function vectorCurve(k) {
    const result = [];
    for (let i = 0; i <= 360; i += 2) {
      const phi = rad(i);
      const psi = k * phi;
      result.push({ x: 20 * Math.cos(phi) + 12 * Math.cos(psi), z: 20 * Math.sin(phi) + 12 * Math.sin(psi) });
    }
    return result;
  }

  function drawVector() {
    const svg = $("vectorDiagram");
    const curve = vectorCurve(state.vectorK);
    const phi = state.phase % TAU;
    const psi = state.vectorK * phi;
    const c0 = { x: 0, z: 0 };
    const p1 = { x: 20 * Math.cos(phi), z: 20 * Math.sin(phi) };
    const tip = { x: p1.x + 12 * Math.cos(psi), z: p1.z + 12 * Math.sin(psi) };
    const transform = makeTransform([...curve, { x: -35, z: -35 }, { x: 35, z: 35 }], 680, 440, 48);
    clear(svg);
    addGrid(svg, 680, 440);
    addArrowDefs(svg);
    const origin = transform(c0);
    line(svg, { x: 0, y: origin.y }, { x: 680, y: origin.y }, "axis");
    line(svg, { x: origin.x, y: 0 }, { x: origin.x, y: 440 }, "axis");
    path(svg, curve.map(transform), "actual-path", { opacity: .85 });
    const a = transform(p1);
    const b = transform(tip);
    line(svg, origin, a, "vector-1", { "marker-end": "url(#arrow-blue)" });
    line(svg, a, b, "vector-2", { "marker-end": "url(#arrow-orange)" });
    circle(svg, origin, 5, "joint");
    circle(svg, a, 5, "joint blue");
    circle(svg, b, 7, "joint green");
    label(svg, origin, "C₀", "label", 8, -9);
    label(svg, a, "r₁e(φ)", "label", 8, -9);
    label(svg, b, "TIP", "label", 8, -9);
    $("vectorKOut").textContent = `${state.vectorK < 0 ? "−" : "+"}${Math.abs(state.vectorK).toFixed(2)}`;
    $("vectorK").value = Math.round(state.vectorK * 100);
  }

  function ikSolve(point, branch = -1) {
    const C0 = { x: P.o1x + P.mx + P.cx, z: P.o1z + P.mz + P.cz };
    const vx = point.x - C0.x;
    const vz = point.z - C0.z;
    const d = Math.hypot(vx, vz);
    const raw = (d * d + P.r1 * P.r1 - P.r2 * P.r2) / (2 * d * P.r1);
    const reachable = Math.abs(raw) <= 1;
    const alpha = Math.acos(clamp(raw, -1, 1));
    const gamma = Math.atan2(vz, vx);
    const phi = gamma + branch * alpha;
    const elbow = { x: C0.x + P.r1 * Math.cos(phi), z: C0.z + P.r1 * Math.sin(phi) };
    const psi = Math.atan2(point.z - elbow.z, point.x - elbow.x);
    return { C0, point, d, raw, reachable, alpha, gamma, phi, psi, elbow };
  }

  function drawIK() {
    const svg = $("ikDiagram");
    const solution = ikSolve(TARGET[state.ikIndex], state.ikBranch);
    const opposite = ikSolve(TARGET[state.ikIndex], -state.ikBranch);
    const { C0, point, elbow } = solution;
    const bounds = [
      { x: C0.x - P.r1, z: C0.z - P.r1 }, { x: C0.x + P.r1, z: C0.z + P.r1 },
      { x: point.x - P.r2, z: point.z - P.r2 }, { x: point.x + P.r2, z: point.z + P.r2 }
    ];
    const transform = makeTransform(bounds, 680, 410, 38);
    clear(svg);
    addGrid(svg, 680, 410);
    const c = transform(C0);
    const p = transform(point);
    const e = transform(elbow);
    const eo = transform(opposite.elbow);
    const scale = Math.hypot(transform({ x: C0.x + 1, z: C0.z }).x - c.x, transform({ x: C0.x + 1, z: C0.z }).y - c.y);
    circle(svg, c, P.r1 * scale, "construction-circle");
    circle(svg, p, P.r2 * scale, "construction-circle");
    line(svg, c, p, "ghost-link");
    line(svg, c, e, "stage1-link");
    line(svg, e, p, "stage2-link");
    line(svg, c, eo, "ghost-link");
    line(svg, eo, p, "ghost-link");
    circle(svg, c, 6, "joint blue");
    circle(svg, p, 7, "joint red");
    circle(svg, e, 6, "joint violet");
    circle(svg, eo, 5, "joint", { opacity: .45 });
    label(svg, c, "C₀", "label", 9, -10);
    label(svg, p, "P", "label", 9, -10);
    label(svg, e, "교점", "label", 9, -10);
    label(svg, { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 }, `d = ${fmt(solution.d, 2)}`, "small-label", 4, -8);
    label(svg, { x: (c.x + e.x) / 2, y: (c.y + e.y) / 2 }, `r₁ = ${fmt(P.r1, 2)}`, "small-label", 4, -8);
    label(svg, { x: (e.x + p.x) / 2, y: (e.y + p.y) / 2 }, `r₂ = ${fmt(P.r2, 2)}`, "small-label", 4, -8);

    $("ikD").textContent = `${fmt(solution.d, 3)} mm`;
    $("ikAlpha").textContent = `${fmt(deg(solution.alpha), 2)}°`;
    $("ikPhi").textContent = `${fmt(normDeg(deg(solution.phi)), 2)}°`;
    $("ikPsi").textContent = `${fmt(normDeg(deg(solution.psi)), 2)}°`;
    $("ikProgress").textContent = `${Math.round(state.ikIndex / 120 * 100)}%`;
    $("ikSlider").value = state.ikIndex;
  }

  function requiredData(branch = -1) {
    return TARGET.map(point => ikSolve(point, branch)).filter(item => item.reachable).map(item => ({
      x: normDeg(deg(item.phi)),
      y: normDeg(deg(item.psi)),
      raw: item
    }));
  }

  function plotTransform(dataSets, width, height, pad = { left: 52, right: 20, top: 20, bottom: 40 }, limits = {}) {
    const all = dataSets.flat();
    const xs = all.map(point => point.x);
    const ys = all.map(point => point.y);
    const minX = limits.minX ?? Math.min(...xs);
    const maxX = limits.maxX ?? Math.max(...xs);
    const minY = limits.minY ?? Math.min(...ys);
    const maxY = limits.maxY ?? Math.max(...ys);
    return {
      minX, maxX, minY, maxY,
      map: point => ({
        x: pad.left + (point.x - minX) / Math.max(1e-9, maxX - minX) * (width - pad.left - pad.right),
        y: height - pad.bottom - (point.y - minY) / Math.max(1e-9, maxY - minY) * (height - pad.top - pad.bottom)
      }),
      pad
    };
  }

  function drawPlotBase(svg, width, height, transform, xLabel, yLabel) {
    const { pad, minX, maxX, minY, maxY } = transform;
    for (let i = 0; i <= 4; i += 1) {
      const x = pad.left + i / 4 * (width - pad.left - pad.right);
      const y = pad.top + i / 4 * (height - pad.top - pad.bottom);
      line(svg, { x, y: pad.top }, { x, y: height - pad.bottom }, "plot-grid");
      line(svg, { x: pad.left, y }, { x: width - pad.right, y }, "plot-grid");
      S("text", { x, y: height - pad.bottom + 18, "text-anchor": "middle", class: "plot-text", text: fmt(minX + i / 4 * (maxX - minX), 0) }, svg);
      S("text", { x: pad.left - 9, y: height - pad.bottom - i / 4 * (height - pad.top - pad.bottom) + 4, "text-anchor": "end", class: "plot-text", text: fmt(minY + i / 4 * (maxY - minY), 0) }, svg);
    }
    line(svg, { x: pad.left, y: height - pad.bottom }, { x: width - pad.right, y: height - pad.bottom }, "plot-axis");
    line(svg, { x: pad.left, y: pad.top }, { x: pad.left, y: height - pad.bottom }, "plot-axis");
    S("text", { x: (pad.left + width - pad.right) / 2, y: height - 7, "text-anchor": "middle", class: "plot-text", text: xLabel }, svg);
    S("text", { x: 13, y: (pad.top + height - pad.bottom) / 2, transform: `rotate(-90 13 ${(pad.top + height - pad.bottom) / 2})`, "text-anchor": "middle", class: "plot-text", text: yLabel }, svg);
  }

  function drawRequiredPlot() {
    const svg = $("requiredPlot");
    const data = requiredData(-1);
    const transform = plotTransform([data], 680, 230, undefined, { minX: 15, maxX: 145, minY: 175, maxY: 207 });
    clear(svg);
    drawPlotBase(svg, 680, 230, transform, "φ [deg]", "ψ [deg]");
    path(svg, data.map(transform.map), "plot-required");
    const current = requiredData(state.ikBranch)[state.ikIndex];
    if (current) circle(svg, transform.map(current), 6, "plot-dot");
  }

  function poseWithBranch(index, branch) {
    const params = { ...P, branch };
    const t = index / (DESIGN.stroke.samples - 1);
    const phi = rad(DESIGN.stroke.startDeg + (DESIGN.stroke.endDeg - DESIGN.stroke.startDeg) * t);
    return M.solvePose(params, phi);
  }

  function drawClosure() {
    const svg = $("closureDiagram");
    const pose = poseWithBranch(state.closureIndex, state.closureBranch);
    const other = poseWithBranch(state.closureIndex, -state.closureBranch);
    const Q = pose.joints.Q;
    const V2 = pose.joints.V2;
    const K = pose.joints.K;
    const K2 = other.joints.K;
    const bounds = [
      { x: Math.min(Q.x - P.link, V2.x - P.rho), z: Math.min(Q.z - P.link, V2.z - P.rho) },
      { x: Math.max(Q.x + P.link, V2.x + P.rho), z: Math.max(Q.z + P.link, V2.z + P.rho) }
    ];
    const transform = makeTransform(bounds, 680, 430, 42);
    clear(svg);
    addGrid(svg, 680, 430);
    const q = transform(Q);
    const v = transform(V2);
    const k = transform(K);
    const k2 = transform(K2);
    const unit = Math.abs(transform({ x: Q.x + 1, z: Q.z }).x - q.x);
    circle(svg, q, P.link * unit, "construction-circle");
    circle(svg, v, P.rho * unit, "construction-circle");
    line(svg, q, v, "ghost-link");
    line(svg, q, k, "coupling-link");
    line(svg, v, k, "stage2-link");
    line(svg, q, k2, "ghost-link");
    line(svg, v, k2, "ghost-link");
    drawFixed(svg, q);
    circle(svg, v, 7, "joint blue");
    circle(svg, k, 7, "joint violet");
    circle(svg, k2, 5, "joint", { opacity: .35 });
    label(svg, q, "Q", "label", 10, 19);
    label(svg, v, "V₂(φ)", "label", 10, -11);
    label(svg, k, "K", "label", 10, -11);
    label(svg, k2, "반대 분기", "small-label", 10, 16);
    label(svg, { x: (q.x + v.x) / 2, y: (q.y + v.y) / 2 }, `s = ${fmt(Math.hypot(V2.x - Q.x, V2.z - Q.z), 2)}`, "small-label", 5, -8);
    label(svg, { x: (q.x + k.x) / 2, y: (q.y + k.y) / 2 }, `L = ${fmt(P.link, 2)}`, "small-label", 5, -8);
    label(svg, { x: (v.x + k.x) / 2, y: (v.y + k.y) / 2 }, `ρ = ${fmt(P.rho, 2)}`, "small-label", 5, -8);

    const sx = V2.x - Q.x;
    const sz = V2.z - Q.z;
    const s = Math.hypot(sx, sz);
    const sigma = Math.atan2(sz, sx);
    $("closurePhi").textContent = `${fmt(deg(pose.phi), 2)}°`;
    $("closureS").textContent = `${fmt(s, 2)} mm`;
    $("closureSigma").textContent = `${fmt(normDeg(deg(sigma)), 2)}°`;
    $("closurePsi").textContent = `${fmt(normDeg(deg(pose.psi)), 2)}°`;
    $("closureMargin").textContent = fmt(pose.margin, 3);
    $("closureSlider").value = state.closureIndex;
  }

  function actualFunctionData() {
    return STROKE.poses.filter(pose => pose.valid).map(pose => ({ x: normDeg(deg(pose.phi)), y: normDeg(deg(pose.psi)) }));
  }

  function drawFunctionPlot() {
    const svg = $("functionPlot");
    const required = requiredData(-1);
    const actual = actualFunctionData();
    const transform = plotTransform([required, actual], 680, 240, undefined, { minX: 15, maxX: 145, minY: 175, maxY: 207 });
    clear(svg);
    drawPlotBase(svg, 680, 240, transform, "φ [deg]", "ψ [deg]");
    path(svg, required.map(transform.map), "plot-required");
    path(svg, actual.map(transform.map), "plot-actual");
    const current = actual[state.closureIndex];
    if (current) circle(svg, transform.map(current), 5.5, "plot-dot");
  }

  function drawFrame() {
    const pose = STROKE.poses[state.frameIndex];
    drawMechanism($("frameDiagram"), pose, { width: 720, height: 560, pad: 48, minZ: -8 });
    $("frameSlider").value = state.frameIndex;
    $("framePercent").textContent = `${Math.round(state.frameIndex / (STROKE.poses.length - 1) * 100)}%`;
    $("calcPhi").textContent = `${fmt(deg(pose.phi), 3)}°`;
    $("calcP1").textContent = pointText(pose.joints.P1);
    $("calcV2").textContent = pointText(pose.joints.V2);
    $("calcPsi").textContent = `${fmt(normDeg(deg(pose.psi)), 3)}° · margin ${fmt(pose.margin, 3)}`;
    $("calcW").textContent = pointText(pose.joints.W);
    $("calcTip").textContent = `${pointText(pose.joints.TIP)} mm`;
  }

  function bindControls() {
    $("heroPlay").addEventListener("click", () => {
      state.heroPlaying = !state.heroPlaying;
      $("heroPlay").textContent = state.heroPlaying ? "❚❚" : "▶";
    });
    $("targetPlay").addEventListener("click", () => {
      state.targetPlaying = !state.targetPlaying;
      $("targetPlay").textContent = state.targetPlaying ? "❚❚" : "▶";
    });
    $("vectorPlay").addEventListener("click", () => {
      state.vectorPlaying = !state.vectorPlaying;
      $("vectorPlay").textContent = state.vectorPlaying ? "❚❚" : "▶";
    });
    $("framePlay").addEventListener("click", () => {
      state.framePlaying = !state.framePlaying;
      $("framePlay").textContent = state.framePlaying ? "❚❚ 정지" : "▶ 재생";
    });
    $("motionToggle").addEventListener("click", () => {
      state.reduceMotion = !state.reduceMotion;
      document.body.classList.toggle("reduce-motion", state.reduceMotion);
      $("motionToggle").setAttribute("aria-pressed", String(state.reduceMotion));
      $("motionToggle").textContent = state.reduceMotion ? "운동 켜기" : "운동 줄이기";
    });

    $("chainControls").addEventListener("click", event => {
      const button = event.target.closest("button[data-step]");
      if (!button) return;
      state.chainStep = Number(button.dataset.step);
      drawChain();
    });
    document.querySelectorAll("[data-chain-step]").forEach(item => item.addEventListener("mouseenter", () => {
      state.chainStep = Number(item.dataset.chainStep);
      drawChain();
    }));

    $("targetSlider").addEventListener("input", event => {
      state.targetPlaying = false;
      $("targetPlay").textContent = "▶";
      state.targetIndex = Number(event.target.value);
      drawTarget();
    });

    $("vectorK").addEventListener("input", event => {
      state.vectorK = Number(event.target.value) / 100;
      $("vectorPresets").querySelectorAll("button").forEach(button => button.classList.remove("active"));
      drawVector();
    });
    $("vectorPresets").addEventListener("click", event => {
      const button = event.target.closest("button[data-k]");
      if (!button) return;
      state.vectorK = Number(button.dataset.k);
      $("vectorPresets").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
      drawVector();
    });

    $("ikSlider").addEventListener("input", event => {
      state.ikIndex = Number(event.target.value);
      drawIK();
      drawRequiredPlot();
    });
    $("ikBranch").addEventListener("click", event => {
      const button = event.target.closest("button[data-branch]");
      if (!button) return;
      state.ikBranch = Number(button.dataset.branch);
      $("ikBranch").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
      drawIK();
      drawRequiredPlot();
    });

    $("closureSlider").addEventListener("input", event => {
      state.closureIndex = Number(event.target.value);
      drawClosure();
      drawFunctionPlot();
    });
    $("closureBranch").addEventListener("click", event => {
      const button = event.target.closest("button[data-branch]");
      if (!button) return;
      state.closureBranch = Number(button.dataset.branch);
      $("closureBranch").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
      drawClosure();
    });

    $("frameSlider").addEventListener("input", event => {
      state.framePlaying = false;
      $("framePlay").textContent = "▶ 재생";
      state.frameIndex = Number(event.target.value);
      drawFrame();
    });
  }

  function bindNavigation() {
    const navLinks = [...$("chapterNav").querySelectorAll("a")];
    const sections = [...document.querySelectorAll(".chapter[data-chapter]")];
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
    }, { rootMargin: "-20% 0px -55%", threshold: [0, .2, .5] });
    sections.forEach(section => observer.observe(section));

    window.addEventListener("scroll", () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      $("readingProgress").style.width = `${clamp(progress, 0, 1) * 100}%`;
    }, { passive: true });
  }

  function animate(time) {
    const elapsed = Math.min(50, time - state.lastTime || 16);
    state.lastTime = time;
    if (!state.reduceMotion) {
      if (state.heroPlaying) {
        const next = Math.floor(time / 45) % STROKE.poses.length;
        if (next !== state.frameIndex || time < 100) drawHero(next);
      }
      if (state.targetPlaying) {
        const next = Math.floor(time / 55) % TARGET.length;
        if (next !== state.targetIndex) { state.targetIndex = next; drawTarget(); }
      }
      if (state.vectorPlaying) {
        state.phase = (state.phase + elapsed * .00055) % TAU;
        drawVector();
      }
      if (state.framePlaying) {
        const next = Math.floor(time / 55) % STROKE.poses.length;
        if (next !== state.frameIndex) { state.frameIndex = next; drawFrame(); }
      }
    }
    requestAnimationFrame(animate);
  }

  function init() {
    drawHero(0);
    drawChain();
    drawTarget();
    drawVector();
    drawIK();
    drawRequiredPlot();
    drawClosure();
    drawFunctionPlot();
    drawFrame();
    bindControls();
    bindNavigation();
    if (state.reduceMotion) {
      document.body.classList.add("reduce-motion");
      $("motionToggle").setAttribute("aria-pressed", "true");
      $("motionToggle").textContent = "운동 켜기";
      state.heroPlaying = false;
      state.targetPlaying = false;
      state.vectorPlaying = false;
    }
    requestAnimationFrame(animate);
  }

  init();
})();
