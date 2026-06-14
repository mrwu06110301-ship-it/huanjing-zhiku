<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";

// ==================== 动态加载 Google Fonts ====================
function loadFonts() {
  if (document.getElementById('flue-fonts')) return;
  const link = document.createElement('link');
  link.id = 'flue-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap';
  document.head.appendChild(link);
}

// ==================== Constants ====================
const CIRC_COEFFS: Record<number, number[]> = {
  1: [0.146, 0.854],
  2: [0.067, 0.250, 0.750, 0.933],
  3: [0.044, 0.146, 0.296, 0.704, 0.854, 0.956],
  4: [0.033, 0.105, 0.194, 0.323, 0.677, 0.806, 0.895, 0.967],
  5: [0.026, 0.082, 0.146, 0.226, 0.342, 0.658, 0.774, 0.854, 0.918, 0.974]
};

const HOLE_COLORS = ['#00e8a0','#4a9eff','#fbbf24','#f87171','#c084fc','#fb923c'];

// ==================== State ====================
type CalcResult = {
  type: 'c' | 'r';
  D?: number; L?: number; holes?: number; rings?: number;
  area?: number; totalPts?: number; ptsPerHole?: number;
  points?: any[]; holeAngles?: number[]; ringBounds?: number[]; coeffs?: number[];
  A?: number; B?: number; nA?: number; nB?: number; equivalentD?: number;
};

const mode = ref<'c'|'r'>('c');
const result = ref<CalcResult | null>(null);
const stdOpen = ref(false);

function switchTab(m: 'c'|'r') {
  mode.value = m;
  result.value = null;
  clearCanvas();
}

let calcTimer: ReturnType<typeof setTimeout> | null = null;
function autoCalc() {
  if (calcTimer) clearTimeout(calcTimer);
  calcTimer = setTimeout(calculate, 300);
}

function calculate() {
  if (mode.value === 'c') calcCircular();
  else calcRectangular();
}

function calcCircular() {
  const D = parseFloat((document.getElementById('c-d') as HTMLInputElement)?.value) || 1.0;
  const L = parseFloat((document.getElementById('c-l') as HTMLInputElement)?.value) || 0;
  const holeSelect = parseInt((document.getElementById('c-h') as HTMLSelectElement)?.value) || 0;

  let holes: number;
  if (holeSelect === 0) {
    if (D <= 1.0) holes = 1;
    else if (D <= 4.0) holes = 2;
    else holes = 4;
  } else {
    holes = holeSelect;
  }

  let rings: number;
  if (D < 0.3) rings = 0;
  else if (D < 0.6) rings = 1;
  else if (D < 1.0) rings = 2;
  else if (D < 2.0) rings = 3;
  else if (D < 4.0) rings = 4;
  else rings = 5;

  const area = Math.PI * D * D / 4;
  const coeffs = rings === 0 ? [0.5] : CIRC_COEFFS[rings];
  const ptsPerHole = coeffs.length;
  const totalPts = holes * ptsPerHole;

  const points: any[] = [];
  const holeAngles: number[] = [];
  if (holes === 1) holeAngles.push(0);
  else if (holes === 2) { holeAngles.push(0); holeAngles.push(Math.PI / 2); }
  else if (holes === 4) { holeAngles.push(0); holeAngles.push(Math.PI / 4); holeAngles.push(Math.PI / 2); holeAngles.push(3 * Math.PI / 4); }

  let pid = 1;
  for (let h = 0; h < holeAngles.length; h++) {
    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i];
      points.push({
        id: pid++, hole: h + 1, coeff: c,
        distWall: c * D, distHole: c * D + L,
        angle: holeAngles[h],
      });
    }
  }

  const ringBounds: number[] = [];
  for (let k = 1; k < rings; k++) ringBounds.push(Math.sqrt(k / rings));

  result.value = { type: 'c', D, L, holes, rings, area, totalPts, ptsPerHole, points, holeAngles, ringBounds, coeffs };
  nextTick(() => { showResults(); drawCircular(); showTable(); });
}

function calcRectangular() {
  const A = parseFloat((document.getElementById('r-a') as HTMLInputElement)?.value) || 2.0;
  const B = parseFloat((document.getElementById('r-b') as HTMLInputElement)?.value) || 1.5;
  const L = parseFloat((document.getElementById('r-l') as HTMLInputElement)?.value) || 0;
  const area = A * B;

  let nA: number, nB: number;
  if (area <= 0.3) { nA = 1; nB = 1; }
  else if (area <= 0.5) { nA = 2; nB = 2; }
  else if (area <= 1.0) { nA = 2; nB = 3; }
  else if (area <= 4.0) { nA = 3; nB = 3; }
  else if (area <= 9.0) { nA = 3; nB = 4; }
  else if (area <= 16.0) { nA = 4; nB = 4; }
  else if (area <= 20.0) { nA = 4; nB = 5; }
  else { nA = Math.max(2, Math.ceil(A)); nB = Math.max(2, Math.ceil(B)); }

  const points: any[] = [];
  let pid = 1;
  for (let ja = 0; ja < nA; ja++) {
    for (let ib = 0; ib < nB; ib++) {
      const x = (ja + 0.5) * A / nA;
      const y = (ib + 0.5) * B / nB;
      points.push({ id: pid++, hole: ja + 1, x, y, distA: x, distB: y, distHole: y + L });
    }
  }

  result.value = { type: 'r', A, B, L, area, nA, nB, holes: nA, ptsPerHole: nB, totalPts: nA * nB, equivalentD: 2 * A * B / (A + B), points };
  nextTick(() => { showResults(); drawRectangular(); showTable(); });
}

function showResults() {
  const el = document.getElementById('flue-results');
  if (!el || !result.value) return;
  el.style.display = '';
  let html = '<h4>计算结果</h4><div class="flue-result-grid">';
  const r = result.value;
  if (r.type === 'c') {
    html += flueRCard('烟道直径', r.D!.toFixed(3), 'm');
    html += flueRCard('截面面积', r.area!.toFixed(4), 'm²');
    html += flueRCard('分环数', r.rings!, '', 'blue');
    html += flueRCard('采样孔数', r.holes!, '', 'blue');
    html += flueRCard('每孔测点', r.ptsPerHole!, '个');
    html += flueRCard('总测点数', r.totalPts!, '个', 'accent');
  } else {
    html += flueRCard('边长 A', r.A!.toFixed(3), 'm');
    html += flueRCard('边长 B', r.B!.toFixed(3), 'm');
    html += flueRCard('截面面积', r.area!.toFixed(4), 'm²');
    html += flueRCard('当量直径', r.equivalentD!.toFixed(3), 'm');
    html += flueRCard('网格', r.nA! + ' × ' + r.nB!, '', 'blue');
    html += flueRCard('采样孔数', r.holes!, '个', 'blue');
    html += flueRCard('每孔测点', r.ptsPerHole!, '个');
    html += flueRCard('总测点数', r.totalPts!, '个', 'accent');
  }
  html += '</div>';
  el.innerHTML = html;
}

function flueRCard(label: string, value: string | number, unit: string, cls?: string): string {
  const c = cls === 'accent' ? 'color:var(--accent)' : cls === 'blue' ? 'color:var(--blue)' : '';
  return `<div class="flue-r-card"><div class="flue-r-label">${label}</div><div class="flue-r-value" style="${c}">${value}<small style="font-size:12px;color:var(--text3);margin-left:4px">${unit}</small></div></div>`;
}

function clearCanvas() {
  const c = document.getElementById('flue-canvas') as HTMLCanvasElement | null;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#0d1525';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#2a3550';
  ctx.font = '14px "Noto Sans SC"';
  ctx.textAlign = 'center';
  ctx.fillText('等待计算...', c.width / 2, c.height / 2);
}

function drawCircular() {
  const canvas = document.getElementById('flue-canvas') as HTMLCanvasElement | null;
  if (!canvas || !result.value) return;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const pad = 50;
  const R = Math.min(W, H) / 2 - pad;
  const D = result.value.D!;

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 30);
  bg.addColorStop(0, '#0f1a2e'); bg.addColorStop(1, '#070b12');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  dg.addColorStop(0, '#1a2845'); dg.addColorStop(1, '#111b30');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = dg; ctx.fill();

  ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
  for (const rb of (result.value.ringBounds || [])) {
    ctx.beginPath(); ctx.arc(cx, cy, R * rb, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74,158,255,0.2)'; ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#3a5580'; ctx.lineWidth = 3; ctx.stroke();

  for (const angle of (result.value.holeAngles || [])) {
    ctx.beginPath();
    ctx.moveTo(cx + R * Math.cos(angle + Math.PI), cy + R * Math.sin(angle + Math.PI));
    ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
    ctx.strokeStyle = 'rgba(74,158,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();

    const lx = cx + (R + 22) * Math.cos(angle);
    const ly = cy + (R + 22) * Math.sin(angle);
    ctx.fillStyle = 'rgba(74,158,255,0.5)';
    ctx.font = '10px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('孔' + (result.value!.holeAngles!.indexOf(angle) + 1), lx, ly);
  }

  let pid = 1;
  for (const angle of (result.value.holeAngles || [])) {
    const hIdx = result.value!.holeAngles!.indexOf(angle);
    const color = HOLE_COLORS[hIdx % HOLE_COLORS.length];
    for (const c of (result.value.coeffs || [])) {
      const dist = (2 * c - 1) * R;
      const px = cx + dist * Math.cos(angle);
      const py = cy + dist * Math.sin(angle);

      const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
      glow.addColorStop(0, color + '30'); glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill();

      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#070b12'; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = '#070b12';
      ctx.font = 'bold 9px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(pid), px, py); pid++;
    }
  }

  ctx.strokeStyle = 'rgba(74,158,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();

  ctx.fillStyle = 'rgba(136,150,173,0.6)';
  ctx.font = '11px "Noto Sans SC"'; ctx.textAlign = 'left';
  ctx.fillText('D = ' + D.toFixed(3) + 'm', 12, H - 12);
  ctx.textAlign = 'right';
  ctx.fillText(result.value.rings + '环 / ' + result.value.holes + '孔 / ' + result.value.totalPts + '点', W - 12, H - 12);

  const hint = document.getElementById('flue-viz-hint');
  if (hint) hint.textContent = '同心虚线为等面积分环线 · 彩色圆点为采样测点 · 每个直径方向布设一组测点';
}

function drawRectangular() {
  const canvas = document.getElementById('flue-canvas') as HTMLCanvasElement | null;
  if (!canvas || !result.value) return;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const pad = 60;
  const A = result.value.A!, B = result.value.B!;
  const s = Math.min((W - 2 * pad) / A, (H - 2 * pad) / B);
  const rw = A * s, rh = B * s;
  const ox = (W - rw) / 2, oy = (H - rh) / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111b30'; ctx.fillRect(ox, oy, rw, rh);

  ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(74,158,255,0.15)';
  for (let i = 1; i < result.value.nA!; i++) {
    const x = ox + i * A / result.value.nA! * s;
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + rh); ctx.stroke();
  }
  for (let i = 1; i < result.value.nB!; i++) {
    const y = oy + i * B / result.value.nB! * s;
    ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + rw, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = '#3a5580'; ctx.lineWidth = 3; ctx.strokeRect(ox, oy, rw, rh);

  for (let ja = 0; ja < result.value.nA!; ja++) {
    const y_hole = oy + (ja + 0.5) * (rh / result.value.nA!);
    ctx.fillStyle = HOLE_COLORS[ja % HOLE_COLORS.length] + '80';
    ctx.beginPath();
    ctx.moveTo(ox - 18, y_hole); ctx.lineTo(ox - 6, y_hole - 5); ctx.lineTo(ox - 6, y_hole + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(136,150,173,0.5)';
    ctx.font = '10px "JetBrains Mono"'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('孔' + (ja + 1), ox - 22, y_hole);
  }

  for (const pt of (result.value.points || [])) {
    const px = ox + pt.x * s, py = oy + pt.y * s;
    const color = HOLE_COLORS[(pt.hole - 1) % HOLE_COLORS.length];
    const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
    glow.addColorStop(0, color + '25'); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#070b12'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#070b12';
    ctx.font = 'bold 9px "JetBrains Mono"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(pt.id), px, py);
  }

  ctx.fillStyle = 'rgba(136,150,173,0.7)';
  ctx.font = '12px "JetBrains Mono"'; ctx.textAlign = 'center';
  ctx.fillText('A = ' + A.toFixed(3) + 'm (' + result.value.nA + '等分)', ox + rw / 2, oy + rh + 28);
  ctx.save(); ctx.translate(ox - 28, oy + rh / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('B = ' + B.toFixed(3) + 'm (' + result.value.nB + '等分)', 0, 0); ctx.restore();

  ctx.fillStyle = 'rgba(136,150,173,0.5)';
  ctx.font = '11px "Noto Sans SC"'; ctx.textAlign = 'left';
  ctx.fillText('S = ' + result.value.area!.toFixed(4) + 'm²', 12, H - 12);
  ctx.textAlign = 'right';
  ctx.fillText(result.value.nA + '×' + result.value.nB + ' / ' + result.value.holes + '孔 / ' + result.value.totalPts + '点', W - 12, H - 12);

  const hint = document.getElementById('flue-viz-hint');
  if (hint) hint.textContent = '网格线为等面积分块线 · 彩色圆点为采样测点 · 箭头指示采样孔位置（探杆插入方向）';
}

function showTable() {
  const panel = document.getElementById('flue-table-panel');
  if (!panel || !result.value) return;
  panel.style.display = '';
  const wrap = document.getElementById('flue-table-wrap');
  if (!wrap) return;

  let html = '<table><thead><tr>';
  if (result.value.type === 'c') {
    html += '<th>测点编号</th><th>所属孔</th><th>环号</th><th>系数 (c)</th><th>距壁距离 (mm)</th><th>探杆插入深度 (mm)</th>';
  } else {
    html += '<th>测点编号</th><th>所属孔</th><th>沿A位置 (mm)</th><th>沿B深度 (mm)</th><th>探杆插入深度 (mm)</th>';
  }
  html += '</tr></thead><tbody>';

  if (result.value.type === 'c') {
    let pid = 1;
    for (const angle of (result.value.holeAngles || [])) {
      const hIdx = result.value!.holeAngles!.indexOf(angle);
      const halfLen = (result.value!.coeffs || []).length / 2;
      for (let i = 0; i < (result.value!.coeffs || []).length; i++) {
        const c = result.value!.coeffs![i];
        const ring = i < halfLen ? i + 1 : (result.value!.coeffs || []).length - i;
        const cls = 'flue-h' + ((hIdx % 4) + 1);
        html += `<tr><td><span class="flue-pt-dot" style="background:${HOLE_COLORS[hIdx]}"></span>${pid}</td><td><span class="flue-hole-tag ${cls}">孔 ${hIdx + 1}</span></td><td>${ring}</td><td>${c.toFixed(3)}</td><td>${((c as number) * result.value!.D! * 1000).toFixed(1)}</td><td>${(((c as number) * result.value!.D! + result.value!.L!) * 1000).toFixed(1)}</td></tr>`;
        pid++;
      }
    }
  } else {
    for (const pt of (result.value.points || [])) {
      const cls = 'flue-h' + (((pt.hole - 1) % 4) + 1);
      html += `<tr><td><span class="flue-pt-dot" style="background:${HOLE_COLORS[(pt.hole - 1)]}"></span>${pt.id}</td><td><span class="flue-hole-tag ${cls}">孔 ${pt.hole}</span></td><td>${(pt.distA * 1000).toFixed(1)}</td><td>${(pt.distB * 1000).toFixed(1)}</td><td>${(pt.distHole * 1000).toFixed(1)}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function toggleStd() { stdOpen.value = !stdOpen.value; }

onMounted(() => { loadFonts(); clearCanvas(); });
</script>

<template>
  <div class="flue-app">
    <header class="flue-header">
      <div class="flue-hdr">
        <div class="flue-logo">
          <div class="flue-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#060a10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <h1 class="flue-title">烟道采样布点计算器</h1>
            <div class="flue-sub">Flue Sampling Point Layout Calculator</div>
          </div>
        </div>
        <div class="flue-badges">
          <span class="flue-badge">GB/T 16157-1996</span>
          <span class="flue-badge">HJ/T 397-2007</span>
        </div>
      </div>
    </header>

    <div class="flue-tabs">
      <button :class="['flue-tab', { active: mode === 'c' }]" @click="switchTab('c')"><span class="flue-tab-icon">●</span>圆形烟道</button>
      <button :class="['flue-tab', { active: mode === 'r' }]" @click="switchTab('r')"><span class="flue-tab-icon">▭</span>矩形烟道</button>
    </div>

    <div class="flue-grid">
      <div class="flue-panel">
        <div v-if="mode === 'c'">
          <h3>圆形烟道参数</h3>
          <div class="flue-field"><label>烟道直径 D</label><div class="flue-input-group"><input type="number" id="c-d" value="1.0" step="0.1" min="0.1" max="10" @input="autoCalc()" /><span class="flue-unit">m</span></div></div>
          <div class="flue-field"><label>采样管伸出长度 L</label><div class="flue-input-group"><input type="number" id="c-l" value="0.30" step="0.05" min="0" max="2" @input="autoCalc()" /><span class="flue-unit">m</span></div></div>
          <div class="flue-field"><label>采样孔数量</label><div class="flue-input-group"><select id="c-h" @change="autoCalc()"><option value="0">自动（根据直径）</option><option value="1">1 个孔（直径≤1m）</option><option value="2">2 个孔（垂直，直径1~4m）</option><option value="4">4 个孔（直径＞4m）</option></select></div></div>
          <button class="flue-btn-calc" @click="calculate()">计算布点方案</button>
        </div>
        <div v-if="mode === 'r'">
          <h3>矩形烟道参数</h3>
          <div class="flue-field"><label>边长 A（采样孔侧）</label><div class="flue-input-group"><input type="number" id="r-a" value="2.0" step="0.1" min="0.1" max="20" @input="autoCalc()" /><span class="flue-unit">m</span></div></div>
          <div class="flue-field"><label>边长 B（深度方向）</label><div class="flue-input-group"><input type="number" id="r-b" value="1.5" step="0.1" min="0.1" max="20" @input="autoCalc()" /><span class="flue-unit">m</span></div></div>
          <div class="flue-field"><label>采样管伸出长度 L</label><div class="flue-input-group"><input type="number" id="r-l" value="0.30" step="0.05" min="0" max="2" @input="autoCalc()" /><span class="flue-unit">m</span></div></div>
          <button class="flue-btn-calc" @click="calculate()">计算布点方案</button>
        </div>
        <div id="flue-results" class="flue-results" style="display:none"></div>
      </div>

      <div class="flue-panel flue-viz-panel">
        <h3>截面布点示意图</h3>
        <canvas id="flue-canvas" width="520" height="520"></canvas>
        <div class="flue-viz-hint" id="flue-viz-hint">输入参数后点击"计算布点方案"</div>
      </div>
    </div>

    <div class="flue-panel flue-table-panel" id="flue-table-panel" style="display:none">
      <h3>测点详细数据表</h3>
      <div id="flue-table-wrap"></div>
    </div>

    <div class="flue-panel flue-std-panel">
      <div class="flue-std-toggle" @click="toggleStd()">
        <h3 style="margin-bottom:0">参考标准与布点规范</h3>
        <span class="flue-arrow" :class="{ open: stdOpen }">▼</span>
      </div>
      <div class="flue-std-body" :class="{ open: stdOpen }">
        <div class="flue-std-inner">
          <div class="flue-std-section">
            <h5>圆形烟道分环与测点数</h5>
            <p>将圆形烟道截面分成适当数量的等面积同心环，各测点选在各环等面积中心线与呈垂直相交的两条直径线的交点上。</p>
            <table class="flue-std-table"><thead><tr><th>烟道直径 D (m)</th><th>分环数</th><th>每孔测点数</th><th>建议孔数</th><th>总测点数</th></tr></thead><tbody>
              <tr><td>D ＜ 0.3</td><td>0（中心点）</td><td>1</td><td>1</td><td>1</td></tr>
              <tr><td>0.3 ≤ D ＜ 0.6</td><td>1</td><td>2</td><td>1</td><td>2</td></tr>
              <tr><td>0.6 ≤ D ＜ 1.0</td><td>2</td><td>4</td><td>1</td><td>4</td></tr>
              <tr><td>1.0 ≤ D ＜ 2.0</td><td>3</td><td>6</td><td>2</td><td>12</td></tr>
              <tr><td>2.0 ≤ D ＜ 4.0</td><td>4</td><td>8</td><td>2</td><td>16</td></tr>
              <tr><td>D ≥ 4.0</td><td>5</td><td>10</td><td>4</td><td>40</td></tr>
            </tbody></table>
            <div class="flue-note">当圆形烟道直径小于0.3m且流速均匀时，可在烟道中心设一个采样点。原则上测点不超过20个。测点距烟道内壁距离小于25mm时，取25mm。</div>
          </div>
          <div class="flue-std-section">
            <h5>矩形烟道分块与测点数</h5>
            <p>将矩形烟道断面分成适当数量的等面积小块，各块中心即为测点。</p>
            <table class="flue-std-table"><thead><tr><th>断面面积 S (m²)</th><th>等面积小块</th><th>采样点数</th><th>测孔数</th></tr></thead><tbody>
              <tr><td>S ≤ 0.5</td><td>2×2</td><td>4</td><td>2</td></tr>
              <tr><td>0.5 ＜ S ≤ 1</td><td>2×3</td><td>6</td><td>2~3</td></tr>
              <tr><td>1 ＜ S ≤ 4</td><td>3×3</td><td>9</td><td>3</td></tr>
              <tr><td>4 ＜ S ≤ 9</td><td>3×4</td><td>12</td><td>3~4</td></tr>
              <tr><td>9 ＜ S ≤ 16</td><td>4×4</td><td>16</td><td>4</td></tr>
              <tr><td>16 ＜ S ≤ 20</td><td>4×5</td><td>20</td><td>4~5</td></tr>
              <tr><td>S ＞ 20</td><td>按≤1m分块</td><td>按面积计算</td><td>按需</td></tr>
            </tbody></table>
            <div class="flue-note">当矩形烟道断面面积小于0.3m²，流速分布比较均匀、对称的，可取断面中心作为测点。</div>
          </div>
          <div class="flue-std-section">
            <h5>采样位置要求</h5>
            <ul>
              <li>采样位置应优先选择在<strong>垂直管段</strong>，避开烟道弯头和断面急剧变化的部位。</li>
              <li>采样位置应设置在距弯头、阀门、变径管<strong>下游方向不小于6倍直径</strong>，和距上述部件<strong>上游方向不小于3倍直径</strong>处。</li>
              <li>对矩形烟道，当量直径 D = 2AB/(A+B)，其中A、B为边长。</li>
              <li>空间有限时，采样断面与弯头等距离至少是烟道直径的<strong>1.5倍</strong>，并适当增加测点数量和采样频次。</li>
            </ul>
          </div>
          <div class="flue-std-section">
            <h5>采样孔要求</h5>
            <ul>
              <li>采样孔内径应不小于<strong>80mm</strong>（部分标准要求≥90mm），管长不大于50mm。</li>
              <li>圆形烟道直径≤1m设1个孔；1m~4m设2个垂直孔；＞4m设4个垂直孔。</li>
              <li>矩形烟道根据断面面积确定测孔数，孔设在侧面等面积小块中心线上。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ===== 非 scoped，用 flue- 前缀避免冲突 ===== */
.flue-app {
  --bg:#060a10;--surface:#0c1220;--s2:#111b30;--s3:#172040;
  --border:#1c2b4a;--accent:#00e8a0;--accent-dim:rgba(0,232,160,.12);
  --blue:#4a9eff;--blue-dim:rgba(74,158,255,.12);
  --text:#e0e6f0;--text2:#8896ad;--text3:#556178;
  --warn:#fbbf24;--err:#f87171;
  font-family:'Noto Sans SC',system-ui,sans-serif;
  background:var(--bg);color:var(--text);line-height:1.6;
  border-radius:16px;padding:32px;position:relative;overflow:hidden;
}
.flue-app::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 0%,rgba(0,232,160,.03) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(74,158,255,.03) 0%,transparent 50%);pointer-events:none;z-index:0}
.flue-app>*{position:relative;z-index:1}

/* Header */
.flue-header{margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.flue-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.flue-logo{display:flex;align-items:center;gap:14px}
.flue-logo-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--blue));display:flex;align-items:center;justify-content:center;flex-shrink:0}
.flue-logo-icon svg{width:28px;height:28px}
.flue-title{font-size:22px;font-weight:700;letter-spacing:-.02em;background:linear-gradient(135deg,var(--text),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0}
.flue-sub{font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-top:2px}
.flue-badges{display:flex;gap:8px;flex-wrap:wrap}
.flue-badge{font-size:11px;font-family:'JetBrains Mono',monospace;padding:4px 10px;border-radius:20px;background:var(--s2);color:var(--text2);border:1px solid var(--border)}

/* Tabs */
.flue-tabs{display:flex;gap:4px;margin-bottom:24px;background:var(--surface);border-radius:12px;padding:4px;border:1px solid var(--border);width:fit-content}
.flue-tab{padding:10px 24px;border:none;background:transparent;color:var(--text2);font-family:'Noto Sans SC',sans-serif;font-size:14px;font-weight:500;border-radius:9px;cursor:pointer;transition:all .25s;display:flex;align-items:center;gap:8px}
.flue-tab:hover{color:var(--text);background:var(--s2)}
.flue-tab.active{background:var(--accent-dim);color:var(--accent);font-weight:700;box-shadow:0 0 20px rgba(0,232,160,.08)}
.flue-tab-icon{font-size:16px}

/* Grid */
.flue-grid{display:grid;grid-template-columns:360px 1fr;gap:20px;margin-bottom:20px}
@media(max-width:900px){.flue-grid{grid-template-columns:1fr}}

/* Panels */
.flue-panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;animation:flueFadeUp .5s ease}
@keyframes flueFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.flue-panel h3{font-size:14px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;display:flex;align-items:center;gap:8px}
.flue-panel h3::before{content:'';width:3px;height:16px;border-radius:2px;background:var(--accent);display:inline-block}

/* Fields */
.flue-field{margin-bottom:16px}
.flue-field label{display:block;font-size:12px;color:var(--text3);margin-bottom:6px;font-weight:500;letter-spacing:.03em}
.flue-input-group{display:flex;align-items:center;background:var(--s2);border:1px solid var(--border);border-radius:9px;overflow:hidden;transition:border-color .2s}
.flue-input-group:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
.flue-input-group input,.flue-input-group select{flex:1;background:transparent;border:none;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:15px;padding:10px 14px;outline:none}
.flue-input-group select{cursor:pointer;font-family:'Noto Sans SC',sans-serif}
.flue-input-group select option{background:var(--s2);color:var(--text)}
.flue-unit{padding:10px 14px;color:var(--text3);font-size:13px;font-family:'JetBrains Mono',monospace;border-left:1px solid var(--border);background:var(--s3);min-width:40px;text-align:center}

.flue-btn-calc{width:100%;padding:12px;border:none;border-radius:9px;background:linear-gradient(135deg,var(--accent),#00c48c);color:#060a10;font-family:'Noto Sans SC',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .25s;margin-top:8px;letter-spacing:.02em}
.flue-btn-calc:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,232,160,.25)}
.flue-btn-calc:active{transform:translateY(0)}

/* Results */
.flue-results{margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}
.flue-results h4{font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px;font-weight:600}
.flue-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.flue-r-card{background:var(--s2);border-radius:9px;padding:12px 14px;border:1px solid var(--border)}
.flue-r-label{font-size:11px;color:var(--text3);margin-bottom:4px}
.flue-r-value{font-size:18px;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent)}

/* Canvas */
.flue-viz-panel{display:flex;flex-direction:column;align-items:center}
.flue-viz-panel canvas{border-radius:10px;background:var(--bg);border:1px solid var(--border);max-width:100%;height:auto}
.flue-viz-hint{font-size:11px;color:var(--text3);margin-top:10px;text-align:center}

/* Table */
.flue-table-panel{margin-bottom:20px;overflow-x:auto}
.flue-table-panel table{width:100%;border-collapse:collapse;font-size:13px}
.flue-table-panel th{background:var(--s3);color:var(--text2);font-weight:600;text-align:left;padding:10px 14px;border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.flue-table-panel td{padding:9px 14px;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-size:13px;white-space:nowrap}
.flue-table-panel tr:hover td{background:var(--s2)}
.flue-pt-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:middle}
.flue-hole-tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.flue-h1{background:rgba(0,232,160,.15);color:var(--accent)}
.flue-h2{background:rgba(74,158,255,.15);color:var(--blue)}
.flue-h3{background:rgba(251,191,36,.15);color:var(--warn)}
.flue-h4{background:rgba(248,113,113,.15);color:var(--err)}

/* Standards */
.flue-std-panel{margin-bottom:20px}
.flue-std-toggle{cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between}
.flue-arrow{transition:transform .3s;font-size:12px;color:var(--text3)}
.flue-arrow.open{transform:rotate(180deg)}
.flue-std-body{max-height:0;overflow:hidden;transition:max-height .4s ease}
.flue-std-body.open{max-height:3000px}
.flue-std-inner{padding-top:20px}
.flue-std-section{margin-bottom:20px}
.flue-std-section h5{font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px}
.flue-std-section h5::before{content:'§';font-family:'JetBrains Mono',monospace}
.flue-std-section p,.flue-std-section li{font-size:13px;color:var(--text2);line-height:1.7}
.flue-std-section ul{padding-left:20px}
.flue-std-section li{margin-bottom:4px}
.flue-note{background:var(--s2);border-left:3px solid var(--accent);padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0;font-size:12px;color:var(--text2)}
.flue-std-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
.flue-std-table th{background:var(--s3);padding:8px 12px;text-align:left;color:var(--text2);border-bottom:1px solid var(--border);font-weight:600}
.flue-std-table td{padding:7px 12px;border-bottom:1px solid var(--border);color:var(--text2)}
</style>
