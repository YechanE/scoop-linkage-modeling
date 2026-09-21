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
    conceptStep: 1,
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
    const psi = angle(sub(output.w, v2));
    const xSlide = point(output.w.x + GUIDE_OFFSET, GUIDE_Y);
    const ySlide = point(xSlide.x, output.w.y);
    const a = sub(v2, output.k);
    const b = sub(Q, output.k);
    const sine = Math.abs(cross(a, b)) / (length(a) * length(b));
    const transmission = deg(Math.asin(clamp(sine, 0, 1)));
    return { phiDeg, psiDeg: deg(psi), transmission, O_PRIME, Q, v2, k: output.k, w: output.w, tip: output.tip, xSlide, ySlide };
  }

  const TIP_PATH = Array.from({ length: 181 }, (_, index) => solveNew(START_DEG + (END_DEG - START_DEG) * index / 180).tip);
  const W_PATH = Array.from({ length: 181 }, (_, index) => solveNew(START_DEG + (END_DEG - START_DEG) * index / 180).w);

  const CONCEPT_STEPS = {
    1: {
      badge: "STEP 1 · TWO ROTATING VECTORS",
      title: "2단 평행사변형은 두 각 φ와 ψ를 가집니다",
      equation: "Pₜᵢₚ = C₀ + r₁e(φ) + r₂e(ψ)",
      description: "두 회전벡터를 더하면 원 하나보다 다양한 경로를 만들 수 있고, 두 평행사변형은 출력면의 방향을 유지합니다. 하지만 φ와 ψ가 아직 서로 독립이므로 이 상태는 2 DOF입니다."
    },
    2: {
      badge: "STEP 2 · φ FIRST DETERMINES V₂",
      title: "모터각 φ를 주면 V₂ 위치가 먼저 확정됩니다",
      equation: "V₂(φ) = O₁ + a + r₁e(φ)",
      description: "Q–K 링크를 보기 전에 순서를 분리해야 합니다. 1단의 평행사변형과 고정 offset a만으로 V₂가 파란 원 위의 한 점에 도착합니다. Q–K는 이 원을 만들거나 V₂를 끌고 가지 않습니다."
    },
    3: {
      badge: "STEP 3 · Q–K THEN DETERMINES ψ",
      title: "이미 정해진 V₂에서 두 원의 교점 K가 ψ를 고릅니다",
      equation: "K=V₂+ρe(ψ+β),  |K−Q|=L  ⇒  F(φ,ψ)=0",
      description: "V₂는 그대로 둡니다. K는 V₂ 중심 반지름 ρ의 원과 Q 중심 반지름 L의 원을 동시에 만족해야 하므로 교점으로 정해집니다. 선택한 branch의 K 방향이 곧 2단 각도 ψ를 강제합니다."
    },
    4: {
      badge: "STEP 4 · ψ DETERMINES W AND TIP",
      title: "정해진 ψ가 W를, W가 TIP을 차례로 정합니다",
      equation: "φ → V₂(φ) → ψ(φ) → W(φ) → TIP(φ)",
      description: "W=V₂+r₂e(ψ), TIP=W+c입니다. 따라서 독립 입력은 φ 하나뿐이고, 나머지 점은 폐루프 제약을 따라 순서대로 계산됩니다. Q–K가 2 DOF를 1 DOF로 줄이는 이유가 바로 이것입니다."
    },
    5: {
      badge: "STEP 5 · REPLACE THE FIRST PARALLELOGRAM",
      title: "O′–V₂ 크랭크가 기존과 같은 V₂ 원을 만듭니다",
      equation: "O′≡O₁+a  ⇒  V₂=O′+r₁e(φ)",
      description: "고정 offset a를 O₁ 쪽으로 옮겨 O′를 정의하면 첫 평행사변형을 단일 크랭크로 바꿀 수 있습니다. O′는 임의의 새 축이 아니라 기존 V₂ 원의 정확한 중심입니다."
    },
    6: {
      badge: "STEP 6 · THE SAME CLOSURE BECOMES A 4R",
      title: "O′–V₂–K–Q 4R이 같은 ψ와 W 경로를 만듭니다",
      equation: "O′–V₂–K–Q–O′,  |V₂K|=ρ,  |KQ|=L",
      description: "V₂의 운동과 Q–K의 길이 구속을 그대로 두었으므로 ψ(φ)도 같습니다. V₂–K–W는 하나의 강체 coupler이고, 그 위 고정점 W는 기존과 같은 초록색 경로를 그립니다."
    },
    7: {
      badge: "STEP 7 · SEPARATE POSITION FROM ORIENTATION",
      title: "직교 XY guide가 W의 x·y를 따라가며 회전만 막습니다",
      equation: "Y−W=[h,0]ᵀ  ⇒  θcarrier=0°",
      description: "수평 rail의 X carriage가 x를, 그 위 수직 rail의 Y block이 y를 따라갑니다. 두 이동은 4R이 만든 W에 수동으로 끌려가고, W–Y가 항상 수평이어서 carrier의 자세만 0°로 고정됩니다."
    },
    8: {
      badge: "STEP 8 · COMPLETE ONE-DOF MOTION",
      title: "모터 하나가 경로와 0° 자세를 동시에 만듭니다",
      equation: "φ → V₂ → ψ → W/TIP,  XY guide → θTIP=0°",
      description: "4R은 원하는 위치 경로를 만들고 XY guide는 output의 회전을 차단합니다. guide용 추가 모터는 없습니다. 모든 점과 carriage가 하나의 입력 φ에 종속되므로 전체 기구는 1 DOF입니다."
    }
  };

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

  function textAt(svg, p, value, className, dx = 0, dy = 0, anchor = "start") {
    const node = svgElement("text", { x: p.x + dx, y: sy(p.y) + dy, class: className, "text-anchor": anchor }, svg);
    node.textContent = value;
    return node;
  }

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

  function drawConceptBackground(svg, trace) {
    svg.replaceChildren();
    for (let x = -100; x <= 100; x += 20) line(svg, point(x, 0), point(x, 140), "kin-grid");
    for (let y = 0; y <= 140; y += 20) line(svg, point(-105, y), point(105, y), "kin-grid");
    line(svg, point(-108, 0), point(108, 0), "kin-axis");
    if (trace) svgElement("path", { d: pathData(trace), class: "concept-w-path" }, svg);
  }

  function drawFourBar(svg, pose, includeW = false) {
    line(svg, pose.O_PRIME, pose.Q, "kin-link platform");
    line(svg, pose.O_PRIME, pose.v2, "kin-link stage1");
    line(svg, pose.v2, pose.k, "kin-link driver");
    line(svg, pose.k, pose.Q, "kin-link coupling");
    if (includeW) {
      line(svg, pose.v2, pose.w, "kin-link driver");
      line(svg, pose.k, pose.w, "kin-link coupling");
    }
    [[pose.O_PRIME, "O′", "ground"], [pose.Q, "Q", "ground"], [pose.v2, "V2"], [pose.k, "K"]]
      .concat(includeW ? [[pose.w, "W"]] : [])
      .forEach(item => joint(svg, item[0], item[1], item[2]));
  }

  function drawTwoStage(svg, pose, includeClosure = false, includeTip = true) {
    line(svg, pose.O1, pose.p1, "kin-link stage1");
    line(svg, pose.O1B, pose.p1b, "kin-link stage1");
    line(svg, pose.p1, pose.p1b, "kin-link platform");
    line(svg, pose.p1, pose.v2, "kin-link platform");
    line(svg, pose.v2, pose.v2b, "kin-link platform");
    line(svg, pose.v2, pose.w, "kin-link driver");
    line(svg, pose.v2b, pose.wb, "kin-link driver");
    line(svg, pose.w, pose.wb, "kin-link output");
    if (includeClosure) {
      line(svg, pose.v2, pose.k, "kin-link coupling");
      line(svg, pose.k, pose.Q, "kin-link coupling");
    }
    if (includeTip) line(svg, pose.w, pose.tip, "kin-link output");
    [[pose.O1, "O1", "ground"], [pose.O1B, "O1b", "ground"], [pose.p1, "P1"], [pose.p1b, "P1b"],
      [pose.v2, "V2"], [pose.v2b, "V2b"], [pose.w, "W"], [pose.wb, "Wb"]]
      .concat(includeClosure ? [[pose.k, "K"], [pose.Q, "Q", "ground"]] : [])
      .concat(includeTip ? [[pose.tip, "TIP"]] : [])
      .forEach(item => joint(svg, item[0], item[1], item[2]));
  }

  function drawConcept(oldPose, pose) {
    const svg = document.getElementById("conceptMechanism");
    const step = state.conceptStep;
    drawConceptBackground(svg, [4, 6, 7, 8].includes(step) ? W_PATH : null);

    if (step === 1) {
      drawTwoStage(svg, oldPose, false, true);
      textAt(svg, scale(add(oldPose.O1, oldPose.p1), .5), "φ", "concept-big-label", -5, -6, "middle");
      textAt(svg, scale(add(oldPose.v2, oldPose.w), .5), "ψ", "concept-big-label", 4, -6, "middle");
      textAt(svg, point(3, 13), "φ와 ψ가 독립이면 2 DOF", "concept-big-label", 0, 0, "middle");
    } else if (step === 2) {
      svgElement("circle", { cx: pose.O_PRIME.x, cy: sy(pose.O_PRIME.y), r: R1, class: "concept-circle" }, svg);
      line(svg, oldPose.O1, oldPose.p1, "kin-link stage1");
      line(svg, oldPose.O1B, oldPose.p1b, "kin-link stage1");
      line(svg, oldPose.p1, oldPose.p1b, "kin-link platform");
      line(svg, oldPose.p1, oldPose.v2, "concept-offset");
      [[oldPose.O1, "O1", "ground"], [oldPose.O1B, "O1b", "ground"], [oldPose.p1, "P1"], [oldPose.p1b, "P1b"], [pose.v2, "V2"]]
        .forEach(item => joint(svg, item[0], item[1], item[2]));
      svgElement("circle", { cx: pose.v2.x, cy: sy(pose.v2.y), r: 4.7, class: "concept-fixed-ring" }, svg);
      textAt(svg, scale(add(oldPose.p1, oldPose.v2), .5), "고정 offset a", "concept-big-label", 4, -2);
      textAt(svg, pose.v2, "① φ가 먼저 V₂를 확정", "concept-big-label", 7, -10);
      textAt(svg, point(9, 18), "이 단계에는 아직 Q–K를 사용하지 않습니다", "concept-sub-label", 0, 0, "middle");
    } else if (step === 3) {
      svgElement("circle", { cx: pose.v2.x, cy: sy(pose.v2.y), r: RHO, class: "concept-circle" }, svg);
      svgElement("circle", { cx: pose.Q.x, cy: sy(pose.Q.y), r: ROCKER, class: "concept-circle" }, svg);
      line(svg, pose.O_PRIME, pose.v2, "concept-ghost");
      line(svg, pose.v2, pose.k, "kin-link driver");
      line(svg, pose.k, pose.Q, "kin-link coupling");
      line(svg, pose.v2, pose.w, "concept-offset");
      line(svg, pose.k, pose.w, "concept-offset");
      [[pose.O_PRIME, "O′", "ground"], [pose.v2, "V2"], [pose.k, "K"], [pose.Q, "Q", "ground"], [pose.w, "W"]]
        .forEach(item => joint(svg, item[0], item[1], item[2]));
      svgElement("circle", { cx: pose.v2.x, cy: sy(pose.v2.y), r: 4.7, class: "concept-fixed-ring" }, svg);
      textAt(svg, pose.v2, "V₂ 위치는 그대로", "concept-big-label", 7, -10);
      textAt(svg, pose.k, "교점 K → ψ", "concept-big-label", 10, 9);
      textAt(svg, scale(add(pose.v2, pose.k), .5), "ρ", "concept-big-label", 2, -3);
      textAt(svg, scale(add(pose.Q, pose.k), .5), "L", "concept-big-label", 3, -3);
    } else if (step === 4) {
      drawTwoStage(svg, oldPose, true, true);
      textAt(svg, pose.v2, "φ → V₂", "concept-big-label", 5, -10);
      textAt(svg, pose.k, "→ ψ", "concept-big-label", 5, -8);
      textAt(svg, pose.w, "→ W", "concept-big-label", 5, -8);
      textAt(svg, pose.tip, "→ TIP", "concept-big-label", 5, -8);
    } else if (step === 5) {
      svgElement("circle", { cx: pose.O_PRIME.x, cy: sy(pose.O_PRIME.y), r: R1, class: "concept-circle" }, svg);
      line(svg, oldPose.O1, oldPose.p1, "concept-ghost");
      line(svg, oldPose.O1B, oldPose.p1b, "concept-ghost");
      line(svg, oldPose.p1, oldPose.p1b, "concept-ghost");
      line(svg, oldPose.p1, oldPose.v2, "concept-offset");
      line(svg, oldPose.O1, pose.O_PRIME, "concept-offset");
      line(svg, pose.O_PRIME, pose.v2, "kin-link stage1");
      [[oldPose.O1, "O1", "ground"], [oldPose.p1, "P1"], [pose.O_PRIME, "O′", "ground"], [pose.v2, "V2"]]
        .forEach(item => joint(svg, item[0], item[1], item[2]));
      textAt(svg, scale(add(oldPose.p1, oldPose.v2), .5), "a", "concept-big-label", 3, -3);
      textAt(svg, scale(add(oldPose.O1, pose.O_PRIME), .5), "같은 a", "concept-big-label", 4, 0);
      textAt(svg, point(12, 126), "점선 평행사변형과 파란 단일 crank가 같은 V₂를 만듭니다", "concept-sub-label", 0, 0, "middle");
    } else if (step === 6) {
      drawFourBar(svg, pose, true);
      line(svg, pose.w, pose.tip, "kin-link output");
      joint(svg, pose.tip, "TIP");
      textAt(svg, pose.w, "같은 coupler point", "concept-big-label", 5, -9);
      textAt(svg, point(8, 14), "같은 V₂ + 같은 Q–K 구속 = 같은 W 경로", "concept-big-label", 0, 0, "middle");
    } else if (step === 7) {
      rectAt(svg, point(-62, GUIDE_Y), 72, 5.5, "kin-rail");
      rectAt(svg, pose.xSlide, 16, 11, "kin-block-x");
      rectAt(svg, point(pose.xSlide.x, 103), 5.5, 64, "kin-rail");
      rectAt(svg, pose.ySlide, 11, 16, "kin-block-y");
      drawFourBar(svg, pose, true);
      line(svg, pose.w, pose.ySlide, "kin-link output");
      [[pose.xSlide, "X", "guide"], [pose.ySlide, "Y", "guide"]]
        .forEach(item => joint(svg, item[0], item[1], item[2]));
      textAt(svg, pose.xSlide, "x를 추종", "concept-big-label", 0, -10, "middle");
      textAt(svg, pose.ySlide, "y를 추종", "concept-big-label", 7, 7);
      textAt(svg, scale(add(pose.w, pose.ySlide), .5), "항상 수평", "concept-big-label", 0, -5, "middle");
    } else {
      rectAt(svg, point(-62, GUIDE_Y), 72, 5.5, "kin-rail");
      rectAt(svg, pose.xSlide, 16, 11, "kin-block-x");
      rectAt(svg, point(pose.xSlide.x, 103), 5.5, 64, "kin-rail");
      rectAt(svg, pose.ySlide, 11, 16, "kin-block-y");
      drawFourBar(svg, pose, true);
      line(svg, pose.w, pose.ySlide, "kin-link output");
      line(svg, pose.w, pose.tip, "kin-link output");
      const faceA = add(pose.tip, point(-7, 0));
      const faceB = add(pose.tip, point(7, 0));
      line(svg, faceA, faceB, "kin-link output");
      [[pose.xSlide, "X", "guide"], [pose.ySlide, "Y", "guide"], [pose.tip, "TIP"]]
        .forEach(item => joint(svg, item[0], item[1], item[2]));
      textAt(svg, pose.tip, "θTIP = 0°", "concept-big-label", 0, -10, "middle");
    }

    document.getElementById("conceptPhi").textContent = `${pose.phiDeg.toFixed(2)}°`;
    document.getElementById("conceptV2").textContent = `(${pose.v2.x.toFixed(2)}, ${pose.v2.y.toFixed(2)})`;
    document.getElementById("conceptPsi").textContent = `${pose.psiDeg.toFixed(2)}°`;
    document.getElementById("conceptW").textContent = `(${pose.w.x.toFixed(2)}, ${pose.w.y.toFixed(2)})`;
    document.getElementById("conceptCarrierAngle").textContent = "0.000°";
  }

  function setConceptStep(step) {
    state.conceptStep = clamp(Number(step), 1, 8);
    const copy = CONCEPT_STEPS[state.conceptStep];
    document.getElementById("conceptBadge").textContent = copy.badge;
    document.getElementById("conceptTitle").textContent = copy.title;
    document.getElementById("conceptEquation").textContent = copy.equation;
    document.getElementById("conceptDescription").textContent = copy.description;
    document.querySelectorAll("[data-concept-step]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.conceptStep) === state.conceptStep);
    });
    draw();
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
    drawConcept(oldPose, newPose);

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

  function setPlaying(value) {
    state.playing = Boolean(value);
    ["playButton", "conceptPlay"].forEach(id => {
      const button = document.getElementById(id);
      button.textContent = state.playing ? "Ⅱ 정지" : "▶ 재생";
      button.setAttribute("aria-pressed", String(state.playing));
    });
    state.previousTime = 0;
  }

  document.getElementById("playButton").addEventListener("click", () => {
    setPlaying(!state.playing);
  });

  document.getElementById("conceptPlay").addEventListener("click", () => setPlaying(!state.playing));

  document.getElementById("conceptSteps").addEventListener("click", event => {
    const button = event.target.closest("button[data-concept-step]");
    if (!button) return;
    setConceptStep(button.dataset.conceptStep);
  });

  document.getElementById("poseSlider").addEventListener("input", event => {
    setPlaying(false);
    setProgress(Number(event.target.value) / 1000);
  });

  document.querySelector(".moment-buttons").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    setPlaying(false);
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

  setPlaying(state.playing);
  setConceptStep(1);
  requestAnimationFrame(animate);
})();
