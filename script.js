const form = document.getElementById("circumcenter-form");
const centerNEl = document.getElementById("center-n");
const centerEEl = document.getElementById("center-e");
const centerHEl = document.getElementById("center-h");
const radiusEl = document.getElementById("radius");
const messageEl = document.getElementById("message");
const copyCenterBtn = document.getElementById("copy-center");
const planCanvas = document.getElementById("plan-view-canvas");
const planCtx = planCanvas.getContext("2d");
const toTopBtn = document.getElementById("to-top-btn");
const AXIS_KEYS = ["n", "e", "h"];
let lastCenterValues = null;
let lastPlotData = null;

// --- 基本向量運算 ---
function vec(x, y, z) {
  return { x, y, z };
}

function sub(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function mul(a, scalar) {
  return vec(a.x * scalar, a.y * scalar, a.z * scalar);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

function norm2(a) {
  return dot(a, a);
}

function norm(a) {
  return Math.sqrt(norm2(a));
}

function formatNum(n) {
  if (!Number.isFinite(n)) return "NaN";
  return Number(n.toFixed(6)).toString();
}

function formatLabelNum(n) {
  if (!Number.isFinite(n)) return "NaN";
  return Number(n.toFixed(3)).toString();
}

function readPoint(fd, prefix) {
  return vec(
    Number(fd.get(prefix + "n")),
    Number(fd.get(prefix + "e")),
    Number(fd.get(prefix + "h"))
  );
}

// 支援 Excel 三欄貼上（Tab/換行/空白/逗號等分隔），只取前 3 個數值。
function parseTripletFromPaste(text) {
  const tokens = text
    .replace(/\r/g, "\n")
    .trim()
    .split(/[\t\n,; ]+/)
    .filter(Boolean);

  if (tokens.length < 3) return null;
  const values = tokens.slice(0, 3).map(Number);
  if (values.some((v) => Number.isNaN(v))) return null;
  return values;
}

// 把同一點位的北/東/高一次回填到三個欄位。
function applyTripletToPoint(pointPrefix, values) {
  AXIS_KEYS.forEach((axis, index) => {
    const input = form.elements.namedItem(`${pointPrefix}${axis}`);
    if (input) input.value = values[index];
  });
}

function setCenterDisplay(values) {
  centerNEl.textContent = values ? formatNum(values[0]) : "-";
  centerEEl.textContent = values ? formatNum(values[1]) : "-";
  centerHEl.textContent = values ? formatNum(values[2]) : "-";
}

// 依實際顯示尺寸建立高 DPI 畫布，避免線條鋸齒。
function setupCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(planCanvas.clientWidth));
  const height = Math.max(1, Math.floor(planCanvas.clientHeight));
  planCanvas.width = Math.floor(width * dpr);
  planCanvas.height = Math.floor(height * dpr);
  planCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawPlaceholderPlot(text) {
  setupCanvasSize();
  const w = planCanvas.clientWidth;
  const h = planCanvas.clientHeight;
  planCtx.clearRect(0, 0, w, h);
  const bg = planCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#f8fbff");
  bg.addColorStop(1, "#eef4fa");
  planCtx.fillStyle = bg;
  planCtx.fillRect(0, 0, w, h);
  planCtx.strokeStyle = "#d6e2ee";
  planCtx.lineWidth = 1;
  planCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
  planCtx.fillStyle = "#64748b";
  planCtx.font = '15px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  planCtx.textAlign = "center";
  planCtx.textBaseline = "middle";
  planCtx.fillText(text, w / 2, h / 2);
}

// 將 A/B/C/中心點投影到 ABC 所在平面後繪圖，確保幾何關係正確。
function drawPlanView(data) {
  setupCanvasSize();
  const w = planCanvas.clientWidth;
  const h = planCanvas.clientHeight;
  const pad = 24;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const A3 = vec(data.A.x, data.A.y, data.A.z);
  const B3 = vec(data.B.x, data.B.y, data.B.z);
  const C3 = vec(data.C.x, data.C.y, data.C.z);
  const O3 = vec(data.O.x, data.O.y, data.O.z);

  const u = sub(B3, A3);
  const v = sub(C3, A3);
  const uLen = norm(u);
  const n = cross(u, v);
  const nLen = norm(n);
  if (uLen < 1e-12 || nLen < 1e-12) {
    drawPlaceholderPlot("點位幾何條件不足，無法繪圖");
    return;
  }

  // ex, ey 是 ABC 平面內正交基底，用於把 3D 點轉成平面 2D 座標。
  const ex = mul(u, 1 / uLen);
  const nUnit = mul(n, 1 / nLen);
  const ey = cross(nUnit, ex);

  const toPlane2D = (p) => {
    const ap = sub(p, A3);
    return {
      x: dot(ap, ex),
      y: dot(ap, ey),
    };
  };

  const A2 = toPlane2D(A3);
  const B2 = toPlane2D(B3);
  const C2 = toPlane2D(C3);
  const O2 = toPlane2D(O3);

  let minX = Math.min(A2.x, B2.x, C2.x, O2.x - data.radius);
  let maxX = Math.max(A2.x, B2.x, C2.x, O2.x + data.radius);
  let minY = Math.min(A2.y, B2.y, C2.y, O2.y - data.radius);
  let maxY = Math.max(A2.y, B2.y, C2.y, O2.y + data.radius);

  const rawRangeX = maxX - minX;
  const rawRangeY = maxY - minY;
  // 視窗範圍至少涵蓋完整外接圓，再留少量邊距避免貼邊。
  const baseRange = Math.max(rawRangeX, rawRangeY, data.radius * 2, 1);
  const margin = baseRange * 0.1;
  minX -= margin;
  maxX += margin;
  minY -= margin;
  maxY += margin;

  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const scale = Math.min(plotW / rangeX, plotH / rangeY);
  const offsetX = pad + (plotW - rangeX * scale) / 2;
  const offsetY = pad + (plotH - rangeY * scale) / 2;

  const toScreen = (p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (maxY - p.y) * scale,
  });

  const A = toScreen(A2);
  const B = toScreen(B2);
  const C = toScreen(C2);
  const O = toScreen(O2);
  const radiusPx = Math.max(data.radius * scale, 2);

  planCtx.clearRect(0, 0, w, h);
  const bg = planCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#f8fbff");
  bg.addColorStop(1, "#eef4fa");
  planCtx.fillStyle = bg;
  planCtx.fillRect(0, 0, w, h);

  planCtx.strokeStyle = "#e6edf5";
  planCtx.lineWidth = 1;
  const gridStep = 28;
  for (let gx = gridStep; gx < w; gx += gridStep) {
    planCtx.beginPath();
    planCtx.moveTo(gx + 0.5, 0);
    planCtx.lineTo(gx + 0.5, h);
    planCtx.stroke();
  }
  for (let gy = gridStep; gy < h; gy += gridStep) {
    planCtx.beginPath();
    planCtx.moveTo(0, gy + 0.5);
    planCtx.lineTo(w, gy + 0.5);
    planCtx.stroke();
  }

  planCtx.strokeStyle = "#d2deeb";
  planCtx.lineWidth = 1;
  planCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

  planCtx.strokeStyle = "#7b95af";
  planCtx.lineWidth = 2.2;
  planCtx.beginPath();
  planCtx.moveTo(A.x, A.y);
  planCtx.lineTo(B.x, B.y);
  planCtx.lineTo(C.x, C.y);
  planCtx.closePath();
  planCtx.stroke();

  planCtx.strokeStyle = "#0f766e";
  planCtx.lineWidth = 2.5;
  planCtx.beginPath();
  planCtx.arc(O.x, O.y, radiusPx, 0, Math.PI * 2);
  planCtx.stroke();

  // 點位樣式：陰影底 + 主色點 + 名稱 + 小座標標籤。
  const drawPoint = (p, src, color, label) => {
    planCtx.fillStyle = "rgba(15, 23, 42, 0.14)";
    planCtx.beginPath();
    planCtx.arc(p.x + 1.5, p.y + 1.5, 6, 0, Math.PI * 2);
    planCtx.fill();

    planCtx.fillStyle = color;
    planCtx.beginPath();
    planCtx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    planCtx.fill();

    planCtx.strokeStyle = "#ffffff";
    planCtx.lineWidth = 1.4;
    planCtx.stroke();

    planCtx.fillStyle = "#0f172a";
    planCtx.font = '13px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    planCtx.textAlign = "left";
    planCtx.textBaseline = "bottom";
    planCtx.fillText(label, p.x + 8, p.y - 6);

    const coordText = `N:${formatLabelNum(src.x)} E:${formatLabelNum(src.y)} H:${formatLabelNum(src.z)}`;
    planCtx.fillStyle = "#475569";
    planCtx.font = '11px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    planCtx.textAlign = "left";
    planCtx.textBaseline = "top";
    planCtx.fillText(coordText, p.x + 8, p.y + 2);
  };

  drawPoint(A, data.A, "#1d4ed8", "A");
  drawPoint(B, data.B, "#1d4ed8", "B");
  drawPoint(C, data.C, "#1d4ed8", "C");
  drawPoint(O, data.O, "#b91c1c", "中心");
}

// 3D 三點外心公式（同時回傳半徑）。
function circumcenter3D(A, B, C) {
  const u = sub(B, A);
  const v = sub(C, A);
  const w = cross(u, v);

  const w2 = norm2(w);
  const EPS = 1e-12;
  if (w2 < EPS) {
    throw new Error("這三個點幾乎在同一直線上，無法穩定算出孔蓋中心，請確認量測點位。");
  }

  const u2 = norm2(u);
  const v2 = norm2(v);

  // O = A + (|u|^2 * (v x w) + |v|^2 * (w x u)) / (2|w|^2)
  const term1 = mul(cross(v, w), u2);
  const term2 = mul(cross(w, u), v2);
  const offset = mul(add(term1, term2), 1 / (2 * w2));
  const center = add(A, offset);

  return {
    center,
    radius: norm(sub(center, A)),
  };
}

// 主要流程：讀取輸入 -> 計算外心 -> 更新結果與示意圖。
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const fd = new FormData(form);
  const A = readPoint(fd, "a");
  const B = readPoint(fd, "b");
  const C = readPoint(fd, "c");

  try {
    const { center, radius } = circumcenter3D(A, B, C);
    lastCenterValues = [center.x, center.y, center.z];
    setCenterDisplay(lastCenterValues);
    radiusEl.textContent = formatNum(radius);
    lastPlotData = {
      A: { x: A.x, y: A.y, z: A.z },
      B: { x: B.x, y: B.y, z: B.z },
      C: { x: C.x, y: C.y, z: C.z },
      O: { x: center.x, y: center.y, z: center.z },
      radius,
    };
    drawPlanView(lastPlotData);
    messageEl.textContent = "計算完成，已取得孔蓋中心座標。";
    messageEl.classList.remove("error");
    copyCenterBtn.disabled = false;
    // 成功後自動捲到結果區，減少使用者手動捲動。
    document.getElementById("result")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (err) {
    lastCenterValues = null;
    lastPlotData = null;
    setCenterDisplay(null);
    radiusEl.textContent = "-";
    drawPlaceholderPlot("請輸入三個有效點後計算，即可顯示示意圖");
    messageEl.textContent = err.message || "計算失敗，請檢查輸入座標。";
    messageEl.classList.add("error");
    copyCenterBtn.disabled = true;
  }
});

// 只在「北座標」欄攔截貼上，若是三欄資料就分配到北/東/高。
form.querySelectorAll('input[data-axis="n"]').forEach((northInput) => {
  northInput.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    const values = parseTripletFromPaste(text);
    if (!values) return;

    const pointPrefix = northInput.dataset.point;
    if (!pointPrefix) return;

    e.preventDefault();
    applyTripletToPoint(pointPrefix, values);
  });
});

// 一鍵複製中心座標（Tab 分隔），可直接貼到 Excel 三欄。
copyCenterBtn.addEventListener("click", async () => {
  if (!lastCenterValues) return;

  const payload = lastCenterValues.map((value) => formatNum(value)).join("\t");
  try {
    await navigator.clipboard.writeText(payload);
    messageEl.textContent = "已複製孔蓋中心座標，可直接貼到 Excel。";
    messageEl.classList.remove("error");
  } catch (err) {
    messageEl.textContent = "複製失敗，請確認瀏覽器允許剪貼簿權限。";
    messageEl.classList.add("error");
  }
});

function updateToTopBtnVisibility() {
  if (!toTopBtn) return;
  const shouldShow = window.scrollY > 180;
  toTopBtn.classList.toggle("show", shouldShow);
}

// 回到頂端浮動按鈕。
toTopBtn?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("resize", () => {
  if (lastPlotData) {
    drawPlanView(lastPlotData);
    return;
  }
  drawPlaceholderPlot("請輸入三個有效點後計算，即可顯示示意圖");
});

window.addEventListener("scroll", updateToTopBtnVisibility, { passive: true });

drawPlaceholderPlot("請輸入三個有效點後計算，即可顯示示意圖");
updateToTopBtnVisibility();
