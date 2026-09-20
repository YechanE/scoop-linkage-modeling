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
    const xSlide = point(output.w.x + GUIDE_OFFSET, GUIDE_Y);
    const ySlide = point(xSlide.x, output.w.y);
    const a = sub(v2, output.k);
    const b = sub(Q, output.k);
    const sine = Math.abs(cross(a, b)) / (length(a) * length(b));
    const transmission = deg(Math.asin(clamp(sine, 0, 1)));
    return { phiDeg, transmission, O_PRIME, Q, v2, k: output.k, w: output.w, tip: output.tip, xSlide, ySlide };
  }

  const TIP_PATH = Array.from({ length: 181 }, (_, index) => solveNew(START_DEG + (END_DEG - START_DEG) * index / 180).tip);
  const W_PATH = Array.from({ length: 181 }, (_, index) => solveNew(START_DEG + (END_DEG - START_DEG) * index / 180).w);

  const CONCEPT_STEPS = {
    1: {
      badge: "STEP 1 · EXTRACT THE PATH",
      title: "기존 평행사변형에서 V2의 운동식만 꺼냅니다",
      equation: "V₂ = O₁ + a + r₁e(φ) = O′ + r₁e(φ)",
      description: "기존 1단 평행사변형에서 P1→V2 오프셋 a는 지면좌표계에서 고정입니다. 따라서 O1을 같은 a만큼 옮긴 O′에 크랭크를 놓으면 V2는 이전과 완전히 같은 원을 그립니다."
    },
    2: {
      badge: "STEP 2 · CLOSE THE 4R LOOP",
      title: "V2와 Q에서 그린 두 원의 교점이 K입니다",
      equation: "|K−V₂|=ρ,  |K−Q|=ℓ",
      description: "입력 φ가 V2를 정하면 K는 두 고정길이 조건을 동시에 만족해야 합니다. 선택한 조립 분기에서 두 원의 교점 하나가 K가 되므로 O′–V2–K–Q 4R은 1 DOF로 움직입니다."
    },
    3: {
      badge: "STEP 3 · GENERATE THE W PATH",
      title: "강체 삼각형 V2–K–W가 W를 함께 운반합니다",
      equation: "W(φ)=V₂(φ)+R(θ(φ))(W₀−V₂₀)",
      description: "W는 새로운 자유도가 아니라 coupler에 고정된 점입니다. V2K 방향이 변할 때 강체 삼각형 전체가 회전하므로 W가 초록색 coupler curve를 그립니다. 여기까지가 경로 생성입니다."
    },
    4: {
      badge: "STEP 4 · FOLLOW X",
      title: "ground의 X guide가 W의 가로 이동을 따라갑니다",
      equation: "xX = xW + h",
      description: "노란 carriage는 ground에 고정된 수평 rail 위에서 x방향으로만 움직입니다. h는 W에서 vertical rail까지 유지해야 하는 carrier의 가로 길이입니다."
    },
    5: {
      badge: "STEP 5 · FOLLOW Y",
      title: "X carriage 위의 Y guide가 W의 높이를 따라갑니다",
      equation: "xY=xX,  yY=yW  ⇒  Y−W=[h,0]ᵀ",
      description: "세로 rail 자체는 X carriage와 함께 좌우로 움직이고, 초록 Y block은 그 rail을 따라 위아래로 움직입니다. 따라서 Y와 W를 잇는 output carrier는 항상 수평입니다."
    },
    6: {
      badge: "STEP 6 · ONE-DOF OUTPUT",
      title: "4R의 경로와 XY guide의 자세구속을 결합합니다",
      equation: "φ → W(φ) → TIP(φ),  θTIP=0°",
      description: "모터는 φ 하나만 입력합니다. 4R이 W 위치를 만들고 XY carriage는 그 위치에 수동으로 끌려가면서 carrier 회전을 막습니다. 그래서 추가 모터 없이 원하는 TIP 경로와 0° 자세가 동시에 나옵니다."
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

  function drawConcept(oldPose, pose) {
    const svg = document.getElementById("conceptMechanism");
    const step = state.conceptStep;
    drawConceptBackground(svg, step >= 3 ? W_PATH : null);

    if (step === 1) {
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
      textAt(svg, point(12, 126), "점선 평행사변형과 파란 단일 crank가 같은 V2를 만듭니다", "concept-sub-label", 0, 0, "middle");
    } else if (step === 2) {
      svgElement("circle", { cx: pose.v2.x, cy: sy(pose.v2.y), r: RHO, class: "concept-circle" }, svg);
      svgElement("circle", { cx: pose.Q.x, cy: sy(pose.Q.y), r: ROCKER, class: "concept-circle" }, svg);
      drawFourBar(svg, pose, false);
      textAt(svg, pose.k, "두 원의 교점", "concept-big-label", 5, -10);
      textAt(svg, scale(add(pose.v2, pose.k), .5), "ρ", "concept-big-label", 2, -3);
      textAt(svg, scale(add(pose.Q, pose.k), .5), "ℓ", "concept-big-label", 3, -3);
    } else if (step === 3) {
      drawFourBar(svg, pose, true);
      textAt(svg, pose.w, "coupler point", "concept-big-label", 5, -9);
      textAt(svg, point(8, 14), "4R이 만드는 W 경로", "concept-big-label", 0, 0, "middle");
    } else if (step === 4) {
      drawFourBar(svg, pose, true);
      rectAt(svg, point(-62, GUIDE_Y), 72, 5.5, "kin-rail");
      rectAt(svg, pose.xSlide, 16, 11, "kin-block-x");
      line(svg, pose.xSlide, pose.ySlide, "concept-guide-line");
      line(svg, pose.w, pose.ySlide, "concept-dimension");
      joint(svg, pose.xSlide, "X", "guide");
      textAt(svg, scale(add(pose.w, pose.ySlide), .5), "h", "concept-big-label", 0, -4, "middle");
      textAt(svg, pose.xSlide, "xX = xW + h", "concept-big-label", 0, -11, "middle");
    } else if (step === 5) {
      drawFourBar(svg, pose, true);
      rectAt(svg, point(-62, GUIDE_Y), 72, 5.5, "kin-rail");
      rectAt(svg, pose.xSlide, 16, 11, "kin-block-x");
      rectAt(svg, point(pose.xSlide.x, 103), 5.5, 64, "kin-rail");
      rectAt(svg, pose.ySlide, 11, 16, "kin-block-y");
      line(svg, pose.w, pose.ySlide, "kin-link output");
      joint(svg, pose.xSlide, "X", "guide");
      joint(svg, pose.ySlide, "Y", "guide");
      textAt(svg, pose.ySlide, "yY = yW", "concept-big-label", 7, 7);
      textAt(svg, scale(add(pose.w, pose.ySlide), .5), "Y−W=[h,0]", "concept-big-label", 0, -5, "middle");
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
    document.getElementById("conceptW").textContent = `(${pose.w.x.toFixed(2)}, ${pose.w.y.toFixed(2)})`;
    document.getElementById("conceptX").textContent = `x=${pose.xSlide.x.toFixed(2)}`;
    document.getElementById("conceptY").textContent = `y=${pose.ySlide.y.toFixed(2)}`;
    document.getElementById("conceptCarrierAngle").textContent = "0.000°";
  }

  function setConceptStep(step) {
    state.conceptStep = clamp(Number(step), 1, 6);
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
