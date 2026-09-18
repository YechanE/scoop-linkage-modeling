(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const START_DEG = 167.25;
  const END_DEG = -3.0;
  const O1 = point(-41.23465910656304, 126.07061579620128);
  const O1B = point(-21.234659106563043, 126.07061579620128);
  const P1_0 = point(-52.19234166037476, 128.55008621654073);
  const V2_0 = point(-52.19227195076317, 110.27570836102288);
  const K_0 = point(-69.43030096467234, 88.84028717237851);
  const W_0 = point(-85.41976217565082, 97.86575077514438);
  const Q = point(-47.68392952730315, 45.0);
  const O_PRIME = point(-41.234589396951456, 107.79623794068343);
  const MOTOR_TO_V2 = sub(V2_0, P1_0);
  const TIP_OFFSET = point(-8.828534859646254, -97.49876303508049);
  const R1 = length(sub(P1_0, O1));
  const RHO = length(sub(K_0, V2_0));
  const ROCKER = length(sub(K_0, Q));
  const TRIANGLE_W = sub(W_0, V2_0);
  const INITIAL_COUPLER_ANGLE = angle(sub(K_0, V2_0));
  const BRANCH = Math.sign(cross(sub(Q, V2_0), sub(K_0, V2_0)));
  const STAGE1_WIDTH = 20;
  const STAGE2_WIDTH = 16;
  const GUIDE_OFFSET = 25;
  const GUIDE_Y = 135;

  const OLD_DYNAMIC_ANGLE = [
    [0, 0], [.05, -.05658], [.10, -.77423], [.15, -1.88107], [.20, -2.30033],
    [.25, -1.76929], [.30, .80503], [.35, 1.63601], [.40, -.90316], [.45, -1.07185],
    [.50, 1.83772], [.55, .76313], [.60, -1.75854], [.65, -.73770], [.70, 1.69047],
    [.75, 3.48645], [.80, 5.08452], [.85, 6.84155], [.90, 8.54725], [.928006, 8.936002],
    [.95, 8.63775], [1, 6.17118]
  ];

  const state = {
    progress: 0,
    playing: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    direction: 1,
    previousTime: 0
  };

  function point(x, y) { return { x, y }; }
  function add(a, b) { return point(a.x + b.x, a.y + b.y); }
  function sub(a, b) { return point(a.x - b.x, a.y - b.y); }
  function scale(a, s) { return point(a.x * s, a.y * s); }
  function length(a) { return Math.hypot(a.x, a.y); }
  function angle(a) { return Math.atan2(a.y, a.x); }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  function rotate(a, theta) { return point(a.x * Math.cos(theta) - a.y * Math.sin(theta), a.x * Math.sin(theta) + a.y * Math.cos(theta)); }
  function deg(value) { return value * 180 / Math.PI; }
  function rad(value) { return value * Math.PI / 180; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  function circleClosure(v2) {
    const delta = sub(Q, v2);
    const d = length(delta);
    const u = scale(delta, 1 / d);
    const v = point(-u.y, u.x);
    const along = (RHO * RHO - ROCKER * ROCKER + d * d) / (2 * d);
    const height = Math.sqrt(Math.max(0, RHO * RHO - along * along));
    return add(add(v2, scale(u, along)), scale(v, BRANCH * height));
  }

  function sharedOutput(v2) {
    const k = circleClosure(v2);
    const theta = angle(sub(k, v2)) - INITIAL_COUPLER_ANGLE;
    const w = add(v2, rotate(TRIANGLE_W, theta));
    return { k, w, tip: add(w, TIP_OFFSET), theta };
  }

  function solveOld(phiDeg) {
    const phi = rad(phiDeg);
    const crank = point(R1 * Math.cos(phi), R1 * Math.sin(phi));
    const p1 = add(O1, crank);
    const p1b = add(O1B, crank);
    const v2 = add(p1, MOTOR_TO_V2);
    const v2b = add(v2, point(STAGE2_WIDTH, 0));
    const output = sharedOutput(v2);
    const wb = add(output.w, point(STAGE2_WIDTH, 0));
    const psi = angle(sub(output.w, v2));
    return { phiDeg, psiDeg: deg(psi), O1, O1B, p1, p1b, v2, v2b, Q, k: output.k, w: output.w, wb, tip: output.tip };
  }

  function solveNew(phiDeg) {
    const phi = rad(phiDeg);
    const v2 = add(O_PRIME, point(R1 * Math.cos(phi), R1 * Math.sin(phi)));
    const output = sharedOutput(v2);
    const xSlide = point(output.w.x + GUIDE_OFFSET, GUIDE_Y);
    const ySlide = point(xSlide.x, output.w.y);
    const a = sub(v2, output.k);
    const b = sub(Q, output.k);
    const sine = Math.abs(cross(a, b)) / (length(a) * length(b));
    const transmission = deg(Math.asin(clamp(sine, 0, 1)));
    return { phiDeg, transmission, O_PRIME, Q, v2, k: output.k, w: output.w, tip: output.tip, xSlide, ySlide };
  }

  const TIP_PATH = Array.from({ length: 181 }, (_, index) => solveNew(START_DEG + (END_DEG - START_DEG) * index / 180).tip);

  function svgElement(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (parent) parent.appendChild(node);
    return node;
  }

  function sy(value) { return -value; }
  function line(svg, a, b, className) {
    return svgElement("line", { x1: a.x, y1: sy(a.y), x2: b.x, y2: sy(b.y), class: className }, svg);
  }
  function joint(svg, p, label, kind) {
    svgElement("circle", { cx: p.x, cy: sy(p.y), r: label === "TIP" ? 2.4 : 1.9, class: `kin-joint ${kind || ""}` }, svg);
    const text = svgElement("text", { x: p.x + 2.6, y: sy(p.y) - 2.3, class: "kin-label" }, svg);
    text.textContent = label;
  }
  function pathData(points) { return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)},${sy(p.y).toFixed(3)}`).join(" "); }

  function drawBackground(svg) {
    svg.replaceChildren();
    for (let x = -100; x <= 100; x += 20) line(svg, point(x, 0), point(x, 140), "kin-grid");
    for (let y = 0; y <= 140; y += 20) line(svg, point(-105, y), point(105, y), "kin-grid");
    line(svg, point(-108, 0), point(108, 0), "kin-axis");
    svgElement("path", { d: pathData(TIP_PATH), class: "kin-path" }, svg);
  }

  function oldCritical(pose) {
    const d1 = Math.abs(pose.phiDeg);
    const d2 = Math.abs(pose.phiDeg + .889283);
    return { d1, d2, stage1: d1 < 4, stage2: d2 < 4, close: Math.min(d1, d2) < 15 };
  }

  function drawOld(pose, measuredAngle) {
    const svg = document.getElementById("oldMechanism");
    drawBackground(svg);
    const critical = oldCritical(pose);
    const stage1Class = `kin-link stage1${critical.stage1 ? " critical" : ""}`;
    const stage2Class = `kin-link driver${critical.stage2 ? " critical" : ""}`;
    line(svg, pose.O1, pose.p1, stage1Class);
    line(svg, pose.O1B, pose.p1b, stage1Class);
    line(svg, pose.p1, pose.p1b, "kin-link platform");
    line(svg, pose.p1, pose.v2, "kin-link platform");
    line(svg, pose.v2, pose.v2b, `kin-link platform${critical.stage2 ? " critical" : ""}`);
    line(svg, pose.v2, pose.w, stage2Class);
    line(svg, pose.v2b, pose.wb, stage2Class);
    line(svg, pose.w, pose.wb, `kin-link output${critical.stage2 ? " critical" : ""}`);
    line(svg, pose.v2, pose.k, "kin-link coupling");
    line(svg, pose.Q, pose.k, "kin-link coupling");
    line(svg, pose.w, pose.tip, "kin-link output");
    const measuredEnd = add(pose.w, rotate(point(34, 0), rad(measuredAngle)));
    line(svg, pose.w, measuredEnd, "kin-measured");

    [[pose.O1, "O1", "ground"], [pose.O1B, "O1b", "ground"], [pose.p1, "P1"], [pose.p1b, "P1b"],
      [pose.v2, "V2"], [pose.v2b, "V2b"], [pose.k, "K"], [pose.Q, "Q", "ground"],
      [pose.w, "W"], [pose.wb, "Wb"], [pose.tip, "TIP"]].forEach(item => joint(svg, item[0], item[1], item[2]));

    if (critical.close) {
      const target = critical.d1 < critical.d2 ? pose.p1 : pose.w;
      const text = svgElement("text", { x: target.x - 2, y: sy(target.y) - 10, class: "kin-annotation", "text-anchor": "middle" }, svg);
      text.textContent = critical.d1 < critical.d2 ? "1단 toggle: rank 21→20" : "2단 toggle: rank 21→20";
    }
  }

  function rectAt(svg, center, width, height, className) {
    svgElement("rect", { x: center.x - width / 2, y: sy(center.y) - height / 2, width, height, rx: 1.5, class: className }, svg);
  }

  function drawNew(pose) {
    const svg = document.getElementById("newMechanism");
    drawBackground(svg);
    rectAt(svg, point(-62, GUIDE_Y), 72, 5.5, "kin-rail");
    rectAt(svg, pose.xSlide, 16, 11, "kin-block-x");
    rectAt(svg, point(pose.xSlide.x, 103), 5.5, 64, "kin-rail");
    rectAt(svg, pose.ySlide, 11, 16, "kin-block-y");
    line(svg, pose.O_PRIME, pose.v2, "kin-link stage1");
    line(svg, pose.v2, pose.k, "kin-link driver");
    line(svg, pose.k, pose.Q, "kin-link coupling");
    line(svg, pose.v2, pose.w, "kin-link driver");
    line(svg, pose.w, pose.ySlide, "kin-link output");
    line(svg, pose.w, pose.tip, "kin-link output");
    const faceA = add(pose.tip, point(-7, 0));
    const faceB = add(pose.tip, point(7, 0));
    line(svg, faceA, faceB, "kin-link output");

    [[pose.O_PRIME, "O′", "ground"], [pose.Q, "Q", "ground"], [pose.v2, "V2"], [pose.k, "K"],
      [pose.w, "W"], [pose.xSlide, "X", "guide"], [pose.ySlide, "Y", "guide"], [pose.tip, "TIP"]]
      .forEach(item => joint(svg, item[0], item[1], item[2]));
    const text = svgElement("text", { x: pose.tip.x, y: sy(pose.tip.y) - 9, class: "kin-label", "text-anchor": "middle" }, svg);
    text.textContent = "tip face = 0°";
  }

  function interpolateHistory(progress) {
    for (let i = 1; i < OLD_DYNAMIC_ANGLE.length; i += 1) {
      const right = OLD_DYNAMIC_ANGLE[i];
      if (progress <= right[0]) {
        const left = OLD_DYNAMIC_ANGLE[i - 1];
        const t = (progress - left[0]) / Math.max(1e-9, right[0] - left[0]);
        return left[1] + (right[1] - left[1]) * t;
      }
    }
    return OLD_DYNAMIC_ANGLE[OLD_DYNAMIC_ANGLE.length - 1][1];
  }

  function formatDifference(value) {
    if (value < 1e-9) return "< 1×10⁻⁹ mm";
    return `${value.toFixed(6)} mm`;
  }

  function draw() {
    const phi = START_DEG + (END_DEG - START_DEG) * state.progress;
    const oldPose = solveOld(phi);
    const newPose = solveNew(phi);
    const measuredAngle = interpolateHistory(state.progress);
    drawOld(oldPose, measuredAngle);
    drawNew(newPose);

    const critical = oldCritical(oldPose);
    const oldPanel = document.querySelector(".old-panel");
    oldPanel.classList.toggle("is-critical", critical.close);
    const atStage1 = critical.d1 < 0.25;
    const atStage2 = critical.d2 < 0.25;
    document.getElementById("oldStatus").textContent = atStage1 ? "1단 toggle · rank 저하" : atStage2 ? "2단 toggle · rank 저하" : critical.close ? "toggle 접근" : "일반 자세";
    document.getElementById("newStatus").textContent = `전달각 ${newPose.transmission.toFixed(2)}°`;
    document.getElementById("motorAngle").textContent = `${phi.toFixed(3)}°`;
    document.getElementById("oldTipAngle").textContent = `${measuredAngle.toFixed(3)}°`;
    document.getElementById("transmissionAngle").textContent = `${newPose.transmission.toFixed(2)}°`;
    document.getElementById("tipDifference").textContent = formatDifference(length(sub(oldPose.tip, newPose.tip)));
    document.getElementById("strokePercent").textContent = `${Math.round(state.progress * 100)}%`;
    document.getElementById("poseSlider").value = String(Math.round(state.progress * 1000));
  }

  function setProgress(value) {
    state.progress = clamp(value, 0, 1);
    draw();
  }

  document.getElementById("playButton").addEventListener("click", () => {
    state.playing = !state.playing;
    const button = document.getElementById("playButton");
    button.textContent = state.playing ? "Ⅱ 정지" : "▶ 재생";
    button.setAttribute("aria-pressed", String(state.playing));
    state.previousTime = 0;
  });

  document.getElementById("poseSlider").addEventListener("input", event => {
    state.playing = false;
    document.getElementById("playButton").textContent = "▶ 재생";
    document.getElementById("playButton").setAttribute("aria-pressed", "false");
    setProgress(Number(event.target.value) / 1000);
  });

  document.querySelector(".moment-buttons").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    state.playing = false;
    document.getElementById("playButton").textContent = "▶ 재생";
    document.getElementById("playButton").setAttribute("aria-pressed", "false");
    const progress = button.dataset.angle === undefined
      ? Number(button.dataset.progress)
      : (START_DEG - Number(button.dataset.angle)) / (START_DEG - END_DEG);
    setProgress(progress);
  });

  function animate(time) {
    if (state.playing) {
      const elapsed = state.previousTime ? Math.min(50, time - state.previousTime) : 16;
      state.progress += state.direction * elapsed / 7200;
      if (state.progress >= 1) { state.progress = 1; state.direction = -1; }
      if (state.progress <= 0) { state.progress = 0; state.direction = 1; }
      draw();
    }
    state.previousTime = time;
    requestAnimationFrame(animate);
  }

  draw();
  requestAnimationFrame(animate);
})();
