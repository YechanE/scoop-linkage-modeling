(function () {
  "use strict";
  const M = window.ScoopMechanism;
  const svg = document.getElementById("mechanismCanvas");
  const world = document.getElementById("world");
  const linkLayer = document.getElementById("mechanismLinks");
  const handleLayer = document.getElementById("jointHandles");
  const frameSlider = document.getElementById("frameSlider");
  const NS = "http://www.w3.org/2000/svg";

  let design = loadSavedDesign() || M.clone(M.DEFAULT_DESIGN);
  let baselineDesign = M.clone(design);
  let result = M.simulateStroke(design);
  let baselineResult = M.simulateStroke(baselineDesign);
  let frameIndex = 0;
  let dragState = null;
  let panState = null;
  let playing = false;
  let lastTick = 0;
  let view = { x: -36, y: -116, width: 150, height: 130 };

  function loadSavedDesign() {
    try {
      const raw = localStorage.getItem("scoop-linkage-design-v1");
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function saveDesign() {
    localStorage.setItem("scoop-linkage-design-v1", JSON.stringify(design));
  }

  function element(name, attrs = {}) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function pathData(points) {
    let drawing = false;
    return points.map(point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) { drawing = false; return ""; }
      const prefix = drawing ? "L" : "M";
      drawing = true;
      return `${prefix}${point.x.toFixed(4)},${point.z.toFixed(4)}`;
    }).join(" ");
  }

  function setView(next) {
    view = next;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  }

  function fitView() {
    const points = [];
    [result, baselineResult].forEach(item => item.poses.forEach(pose => {
      if (pose.valid) points.push(...Object.values(pose.joints));
    }));
    points.push(...M.targetPath(design.target));
    if (!points.length) return;
    const xs = points.map(p => p.x), zs = points.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(0, ...zs), maxZ = Math.max(...zs);
    const pad = Math.max(8, .08 * Math.max(maxX - minX, maxZ - minZ));
    const desired = { x: minX - pad, y: -(maxZ + pad), width: maxX - minX + 2 * pad, height: maxZ - minZ + 2 * pad };
    const aspect = svg.clientWidth / Math.max(svg.clientHeight, 1);
    if (desired.width / desired.height < aspect) {
      const newWidth = desired.height * aspect;
      desired.x -= (newWidth - desired.width) / 2; desired.width = newWidth;
    } else {
      const newHeight = desired.width / aspect;
      desired.y -= (newHeight - desired.height) / 2; desired.height = newHeight;
    }
    setView(desired);
  }

  function renderPaths() {
    document.getElementById("targetPath").setAttribute("d", pathData(M.targetPath(design.target)));
    document.getElementById("baselinePath").setAttribute("d", pathData(baselineResult.poses.map(p => p.valid ? p.tip : null)));
    document.getElementById("tipPath").setAttribute("d", pathData(result.poses.map(p => p.valid ? p.tip : null)));
  }

  function renderPose() {
    linkLayer.replaceChildren();
    handleLayer.replaceChildren();
    const pose = result.poses[Math.min(frameIndex, result.poses.length - 1)];
    if (!pose) return;
    const joints = pose.joints;

    M.BARS.forEach(([a, b, kind]) => {
      const line = element("line", { x1: joints[a].x, y1: joints[a].z, x2: joints[b].x, y2: joints[b].z, class: `link ${kind}` });
      linkLayer.appendChild(line);
    });

    M.JOINT_NAMES.forEach(name => {
      const point = joints[name];
      const group = element("g", { "data-joint": name });
      const type = ["O1", "O1b", "Q"].includes(name) ? "ground-joint" : name === "TIP" ? "output-joint" : "moving";
      const circle = element("circle", { cx: point.x, cy: point.z, r: name === "TIP" ? 2.45 : 2.05, class: `joint ${type}${dragState && dragState.name === name ? " selected" : ""}`, "data-joint": name });
      const label = element("text", { transform: `translate(${point.x + 2.6} ${point.z + 3.2}) scale(1 -1)`, class: "joint-label" });
      label.textContent = name;
      group.append(circle, label);
      handleLayer.appendChild(group);
    });
    frameSlider.max = String(result.poses.length - 1);
    frameSlider.value = String(frameIndex);
    document.getElementById("angleOutput").textContent = `${M.deg(pose.phi).toFixed(2)}°`;
  }

  function renderMetrics() {
    const percent = 100 * result.validFraction;
    document.getElementById("validMetric").textContent = `${percent.toFixed(1)}%`;
    document.getElementById("marginMetric").textContent = result.minMargin.toFixed(3);
    document.getElementById("widthMetric").textContent = `${result.width.toFixed(2)} mm`;
    document.getElementById("heightMetric").textContent = `${result.height.toFixed(2)} mm`;
    const bad = result.validFraction < 1 || result.minMargin < .03;
    document.getElementById("statusDot").classList.toggle("bad", bad);
    document.getElementById("statusText").textContent = result.validFraction < 1 ? "조립 불가 구간" : result.minMargin < .03 ? "사점 접근" : "전 구간 조립 가능";
    const warning = document.getElementById("warningText");
    warning.classList.toggle("bad", bad);
    warning.textContent = result.validFraction < 1
      ? `${result.poses.length - result.validCount}개 자세에서 Q–K 폐루프가 닫히지 않습니다. 붉은 고정축이나 K를 가까이 옮겨보세요.`
      : result.minMargin < .03
        ? "폐루프는 닫히지만 사점에 가깝습니다. K 또는 Q를 옮겨 여유를 키우세요."
        : "폐루프가 전 구간에서 닫힙니다. 청록 궤적과 점선 비교 기준의 차이를 확인하세요.";

    document.getElementById("lengthTable").innerHTML = M.linkLengths(design.params).map(([name, length]) =>
      `<div class="length-row"><span>${name}</span><strong>${length.toFixed(3)} mm</strong></div>`).join("");
  }

  function syncInputs() {
    document.getElementById("startAngleInput").value = design.stroke.startDeg.toFixed(2);
    document.getElementById("endAngleInput").value = design.stroke.endDeg.toFixed(2);
    document.getElementById("samplesInput").value = String(design.stroke.samples);
  }

  function recalculate(options = {}) {
    result = M.simulateStroke(design);
    frameIndex = Math.max(0, Math.min(frameIndex, result.poses.length - 1));
    renderPaths(); renderPose(); renderMetrics(); syncInputs(); saveDesign();
    if (options.fit) requestAnimationFrame(fitView);
  }

  function svgPoint(event) {
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    return { x: local.x, z: -local.y };
  }

  svg.addEventListener("pointerdown", event => {
    const joint = event.target.getAttribute("data-joint");
    if (joint) {
      event.preventDefault();
      dragState = { name: joint, original: M.clone(design), pointerId: event.pointerId };
      svg.setPointerCapture(event.pointerId);
      document.getElementById("selectedText").textContent = `${joint} 편집 중`;
      renderPose();
    } else {
      panState = { x: event.clientX, y: event.clientY, view: { ...view }, pointerId: event.pointerId };
      svg.setPointerCapture(event.pointerId); svg.classList.add("panning");
    }
  });

  svg.addEventListener("pointermove", event => {
    if (dragState && dragState.pointerId === event.pointerId) {
      design = M.updateDesignFromDrag(dragState.original, dragState.name, svgPoint(event), frameIndex);
      recalculate();
    } else if (panState && panState.pointerId === event.pointerId) {
      const scaleX = panState.view.width / svg.clientWidth;
      const scaleY = panState.view.height / svg.clientHeight;
      setView({ ...panState.view, x: panState.view.x - (event.clientX - panState.x) * scaleX, y: panState.view.y - (event.clientY - panState.y) * scaleY });
    }
  });

  function endPointer(event) {
    if (dragState && dragState.pointerId === event.pointerId) {
      dragState = null;
      document.getElementById("selectedText").textContent = "설계 변경이 브라우저에 자동 저장됨";
      renderPose();
    }
    if (panState && panState.pointerId === event.pointerId) { panState = null; svg.classList.remove("panning"); }
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : .89;
    const point = svgPoint(event);
    const svgY = -point.z;
    const rx = (point.x - view.x) / view.width, ry = (svgY - view.y) / view.height;
    const width = view.width * factor, height = view.height * factor;
    setView({ x: point.x - rx * width, y: svgY - ry * height, width, height });
  }, { passive: false });

  frameSlider.addEventListener("input", () => { frameIndex = Number(frameSlider.value); renderPose(); });
  document.getElementById("stepBackButton").addEventListener("click", () => { frameIndex = Math.max(0, frameIndex - 1); renderPose(); });
  document.getElementById("stepForwardButton").addEventListener("click", () => { frameIndex = Math.min(result.poses.length - 1, frameIndex + 1); renderPose(); });
  document.getElementById("fitButton").addEventListener("click", fitView);

  document.getElementById("playButton").addEventListener("click", () => {
    playing = !playing;
    document.getElementById("playButton").textContent = playing ? "Ⅱ 정지" : "▶ 재생";
    if (playing) { lastTick = 0; requestAnimationFrame(animate); }
  });
  function animate(time) {
    if (!playing) return;
    const fps = Math.max(1, Number(document.getElementById("fpsInput").value) || 24);
    if (!lastTick || time - lastTick >= 1000 / fps) { frameIndex = (frameIndex + 1) % result.poses.length; renderPose(); lastTick = time; }
    requestAnimationFrame(animate);
  }

  ["startAngleInput", "endAngleInput", "samplesInput"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      design.stroke.startDeg = Number(document.getElementById("startAngleInput").value);
      design.stroke.endDeg = Number(document.getElementById("endAngleInput").value);
      design.stroke.samples = Math.max(31, Math.min(721, Number(document.getElementById("samplesInput").value) || 241));
      frameIndex = 0; recalculate();
    });
  });

  document.getElementById("resetButton").addEventListener("click", () => {
    design = M.clone(M.DEFAULT_DESIGN); baselineDesign = M.clone(design); baselineResult = M.simulateStroke(baselineDesign); frameIndex = 0; recalculate({ fit: true }); toast("최적화된 초기 설계로 복원했습니다");
  });
  document.getElementById("baselineButton").addEventListener("click", () => {
    baselineDesign = M.clone(design); baselineResult = M.simulateStroke(baselineDesign); renderPaths(); toast("현재 궤적을 새 비교 기준으로 저장했습니다");
  });
  document.getElementById("exportButton").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "scoop-linkage-design.json"; link.click(); URL.revokeObjectURL(link.href); toast("설계 JSON을 저장했습니다");
  });
  document.getElementById("importInput").addEventListener("change", async event => {
    try {
      const loaded = JSON.parse(await event.target.files[0].text());
      if (!loaded.params || !loaded.stroke) throw new Error("invalid");
      design = loaded; baselineDesign = M.clone(loaded); baselineResult = M.simulateStroke(baselineDesign); frameIndex = 0; recalculate({ fit: true }); toast("설계를 불러왔습니다");
    } catch (_) { toast("올바른 설계 JSON이 아닙니다"); }
    event.target.value = "";
  });
  document.getElementById("copyButton").addEventListener("click", async () => {
    const text = M.linkLengths(design.params).map(([name, length]) => `${name}\t${length.toFixed(3)} mm`).join("\n");
    await navigator.clipboard.writeText(text); toast("링크 치수표를 복사했습니다");
  });

  let toastTimer;
  function toast(message) {
    const node = document.getElementById("toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  recalculate();
  requestAnimationFrame(fitView);
})();
