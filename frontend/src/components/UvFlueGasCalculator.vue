<script setup lang="ts">
/**
 * UvFlueGasCalculator.vue — 紫外烟气模型（v2 重写）
 * 依据 HJ 75/1045 附录 A 公式链（A1 工况标况 / A2 干湿基 / A3 体积质量 / A4A5 NOx / A7A8A9 折算）
 * 四种气体 SO2/NO/NO2/NOx（NOx 计算得出），μmol/mol ↔ mg/m³ 双向换算
 * 输入即自动计算；公式说明默认折叠
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  MOL, volumeToMass, massToVolume, workingToStandard, wetToDryBase,
  noxMass, noxVolume, excessAir, adjustByO2, O2S_PRESETS, UV_DEMO,
  type GasKey,
} from "@/utils/uv-flue-gas";

// ==================== 现场参数（过程输入） ====================
const env = reactive({
  ba: 101325 as number | null,   // 环境大气压 Pa
  ps: 0 as number | null,        // 烟气静压 Pa（表压）
  ts: null as number | null,     // 烟温 ℃
  Xsw: null as number | null,    // 含湿量 %
  O2dry: null as number | null,  // 氧量干基 %
  o2s: 6 as number | null,       // 基准含氧量 %
});

const envValid = computed(
  () => env.ba !== null && env.ba > 0 && env.ps !== null && env.ts !== null && env.Xsw !== null && env.Xsw < 100
);

// ==================== 仪器直读浓度（体积 μmol/mol） ====================
const gases = reactive({
  SO2: null as number | null,
  NO: null as number | null,
  NO2: null as number | null,
});
const noxPpm = computed(() =>
  gases.NO === null && gases.NO2 === null ? null : (gases.NO ?? 0) + (gases.NO2 ?? 0)
);

// ==================== 换算链：ppm → mg/m³(标干) → 各状态 ====================
interface Row {
  key: GasKey | "NOx";
  label: string;
  ppm: number | null;      // 体积浓度 μmol/mol（直读或计算）
  massStdDry: number | null; // 标态干基 mg/m³（A3）
  massWetStd: number | null; // 标态湿基 mg/m³（A2 逆）
  massWorkDry: number | null; // 工况干基 mg/m³（A1 逆）
  massWorkWet: number | null; // 工况湿基 mg/m³
}

const rows = computed<Row[]>(() => {
  if (!envValid.value) return [];
  const list: Row[] = [];
  const entries: { key: GasKey; label: string; ppm: number | null; M: number }[] = [
    { key: "SO2", label: "SO₂", ppm: gases.SO2, M: MOL.SO2 },
    { key: "NO", label: "NO", ppm: gases.NO, M: MOL.NO },
    { key: "NO2", label: "NO₂", ppm: gases.NO2, M: MOL.NO2 },
  ];

  // NOx 由 NO+NO2 计算得出（A5 体积合并 → A3 质量）
  if (noxPpm.value !== null) {
    const mStdDry = volumeToMass(noxPpm.value, MOL.NO2); // 以 NO2 计
    list.push({
      key: "NOx", label: "NOₓ（以 NO₂ 计）", ppm: noxPpm.value,
      massStdDry: mStdDry,
      massWetStd: mStdDry * (1 - env.Xsw! / 100),
      massWorkDry: mStdDry / workingToStandard(1, env.ba!, env.ps!, env.ts!).factor,
      massWorkWet: (mStdDry * (1 - env.Xsw! / 100)) / workingToStandard(1, env.ba!, env.ps!, env.ts!).factor,
    });
  }

  for (const e of entries) {
    if (e.ppm === null) continue;
    const mStdDry = volumeToMass(e.ppm, e.M);
    list.push({
      key: e.key, label: e.label, ppm: e.ppm,
      massStdDry: mStdDry,
      massWetStd: mStdDry * (1 - env.Xsw! / 100),
      massWorkDry: mStdDry / workingToStandard(1, env.ba!, env.ps!, env.ts!).factor,
      massWorkWet: (mStdDry * (1 - env.Xsw! / 100)) / workingToStandard(1, env.ba!, env.ps!, env.ts!).factor,
    });
  }
  return list;
});

// ==================== 折算（A8 + A9） ====================
const alphaResult = computed(() => {
  if (env.O2dry === null || env.O2dry >= 21) return null;
  return excessAir(env.O2dry);
});

interface AdjustRow { label: string; csnDry: number; adjusted: number }
const adjustRows = computed<AdjustRow[]>(() => {
  if (env.O2dry === null || env.O2dry >= 21 || env.o2s === null) return [];
  return rows.value
    .filter((r) => r.massStdDry !== null)
    .map((r) => ({
      label: r.label,
      csnDry: r.massStdDry!,
      adjusted: adjustByO2(r.massStdDry!, env.O2dry!, env.o2s!).adjusted,
    }));
});

function loadDemo() {
  Object.assign(env, { ba: UV_DEMO.ba, ps: UV_DEMO.ps, ts: UV_DEMO.ts, Xsw: UV_DEMO.Xsw, O2dry: UV_DEMO.O2dry, o2s: UV_DEMO.o2s });
  Object.assign(gases, { SO2: UV_DEMO.so2_ppm, NO: UV_DEMO.no_ppm, NO2: UV_DEMO.no2_ppm });
  ElMessage.success("已填入示例数据");
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  return String(Number(v.toFixed(2)));
}

const showExplain = ref(false);
</script>

<template>
  <div class="uv-tool">
    <!-- ===== 卡片一：过程输入参数 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="flask" :size="17" /> 紫外烟气模型（SO₂ / NO / NO₂ / NOₓ 浓度换算与折算）</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo">填入示例</el-button>
        </div>
      </div>

      <el-alert type="info" :closable="false" show-icon class="rule-tip">
        依据 HJ 75 / HJ 1045 附录 A 公式链：仪器直读体积浓度（μmol/mol）→ <b>A3</b> 标态质量浓度 → <b>A2</b> 干湿基 → <b>A1</b> 工况标况 → <b>A8+A9</b> 基准含氧量折算。NOₓ 由 NO+NO₂ 自动计算（以 NO₂ 计）。
      </el-alert>

      <div class="grp-title">现场过程参数</div>
      <div class="env-grid">
        <div class="field">
          <label>环境大气压 Ba（Pa）<span class="req">*</span></label>
          <el-input-number v-model="env.ba" :min="30000" :max="120000" :precision="0" :controls="false" placeholder="101325" style="width:100%" />
        </div>
        <div class="field">
          <label>烟气静压 Ps（Pa）<span class="req">*</span></label>
          <el-input-number v-model="env.ps" :min="-50000" :max="50000" :precision="0" :controls="false" placeholder="0（正压）/ −800" style="width:100%" />
        </div>
        <div class="field">
          <label>烟气温度 ts（℃）<span class="req">*</span></label>
          <el-input-number v-model="env.ts" :min="0" :max="600" :precision="1" :controls="false" placeholder="93.4" style="width:100%" />
        </div>
        <div class="field">
          <label>含湿量 Xsw（%）<span class="req">*</span></label>
          <el-input-number v-model="env.Xsw" :min="0" :max="100" :precision="2" :controls="false" placeholder="7.8" style="width:100%" />
        </div>
        <div class="field">
          <label>氧量干基 O2（%）<span class="req">*</span></label>
          <el-input-number v-model="env.O2dry" :min="0" :max="21" :precision="2" :controls="false" placeholder="13.5" style="width:100%" />
        </div>
        <div class="field">
          <label>基准含氧量 O2s（%）</label>
          <el-input-number v-model="env.o2s" :min="0" :max="21" :precision="1" :controls="false" placeholder="6" style="width:100%" />
          <div class="preset-row">
            <el-tag v-for="p in O2S_PRESETS" :key="p.label" size="small" effect="plain" class="preset-tag" @click="env.o2s = p.o2s">{{ p.label }} {{ p.o2s }}</el-tag>
          </div>
        </div>
      </div>

      <div class="grp-title">仪器直读体积浓度（μmol/mol）</div>
      <div class="gas-grid">
        <div class="field">
          <label>SO₂（μmol/mol）</label>
          <el-input-number v-model="gases.SO2" :min="0" :precision="1" :controls="false" placeholder="86" style="width:100%" />
        </div>
        <div class="field">
          <label>NO（μmol/mol）</label>
          <el-input-number v-model="gases.NO" :min="0" :precision="1" :controls="false" placeholder="92" style="width:100%" />
        </div>
        <div class="field">
          <label>NO₂（μmol/mol）</label>
          <el-input-number v-model="gases.NO2" :min="0" :precision="1" :controls="false" placeholder="6" style="width:100%" />
        </div>
        <div class="field nox-show">
          <label>NOₓ（自动计算，以 NO₂ 计）</label>
          <div class="nox-val">{{ noxPpm !== null ? noxPpm.toFixed(1) : "—" }} μmol/mol</div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：浓度换算矩阵 ===== -->
    <div class="card" v-if="rows.length">
      <div class="card-head">
        <h3><Icon name="layers" :size="17" /> 浓度换算结果</h3>
      </div>
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th>污染物</th>
              <th>体积浓度<br><small>μmol/mol</small></th>
              <th class="hot-col">标态干基<br><small>mg/m³（A3）</small></th>
              <th>标态湿基<br><small>mg/m³（A2）</small></th>
              <th>工况干基<br><small>mg/m³（A1）</small></th>
              <th>工况湿基<br><small>mg/m³</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td class="gas-name">{{ r.label }}</td>
              <td>{{ fmt(r.ppm) }}</td>
              <td class="hot-col"><b>{{ fmt(r.massStdDry) }}</b></td>
              <td>{{ fmt(r.massWetStd) }}</td>
              <td>{{ fmt(r.massWorkDry) }}</td>
              <td>{{ fmt(r.massWorkWet) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="matrix-note">标态：0℃、101.325 kPa；工况：实际烟温 ts、绝对压 Ba+Ps；NOₓ 质量浓度均以 NO₂ 计（M=46.005）。</p>
    </div>

    <!-- ===== 卡片三：折算浓度 ===== -->
    <div class="card" v-if="adjustRows.length">
      <div class="card-head">
        <h3><Icon name="trendUp" :size="17" /> 折算浓度（基准氧含量折算，A8+A9）</h3>
        <div class="alpha-badge" v-if="alphaResult">α = {{ alphaResult.alpha.toFixed(4) }}</div>
      </div>
      <div class="adj-grid">
        <div v-for="r in adjustRows" :key="r.label" class="vr-card">
          <span class="vr-label">{{ r.label }} 折算浓度</span>
          <div class="vr-val">
            <span class="vr-base">{{ fmt(r.csnDry) }} →</span>
            <b>{{ fmt(r.adjusted) }}</b> mg/m³
          </div>
        </div>
      </div>
      <div class="steps" v-if="alphaResult">
        <div class="steps-title">折算公式（A9）</div>
        <div class="step-line">{{ alphaResult.steps[0] }}</div>
        <div class="step-line">C折 = Csn干 × (21−O2s)/(21−O2干)，O2s = {{ env.o2s }}%</div>
      </div>
    </div>

    <!-- ===== 卡片四：公式说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 公式依据（HJ 75 / HJ 1045 附录 A）</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>A1 工况浓度 ↔ 标况浓度（干湿基状态相同）</h4>
        <div class="formula">Csn = Cs × 101325/(Ba+Ps) × (273+ts)/273</div>
        <h4>A2 干基 ↔ 湿基</h4>
        <div class="formula">C干 = C湿 / (1 − Xsw/100)　（体积浓度与质量浓度算法相同）</div>
        <h4>A3 体积浓度 ↔ 标态质量浓度</h4>
        <div class="formula">CQ = M/22.4 × Cv　（M：SO₂=64.06、NO=30.006、NO₂=46.005 g/mol）</div>
        <h4>A4/A5 NOx（以 NO₂ 计）</h4>
        <div class="formula">质量：CNOx = CNO × M(NO₂)/M(NO) + CNO₂</div>
        <div class="formula">体积：CNOx = (CNOv + CNO₂v) × M(NO₂)/22.4</div>
        <h4>A8 过剩空气系数 / A9 折算（基准含氧量）</h4>
        <div class="formula">α = 21%/(21% − CO2干)</div>
        <div class="formula">C折 = Csn干 × (21 − O2s)/(21 − O2干)　（若标准给 αs：C折 = Csn干 × α/αs）</div>
        <ul>
          <li>仪器直读一般为标态干基体积浓度（μmol/mol）；本工具从直读值出发一次算出四种状态质量浓度</li>
          <li>基准含氧量按行业排放标准：燃煤锅炉 6%、燃气锅炉 3.5%、燃油 3%、垃圾焚烧 11%、钢铁烧结 16%</li>
          <li>A1 中 Ba 为环境大气压（Pa）、Ps 为烟气静压（Pa，表压可负）；Ba+Ps = 烟道绝对压</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uv-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

.grp-title {
  font-size: 12.5px; font-weight: 700; color: var(--primary);
  padding: 6px 10px; background: rgba(37, 99, 235, 0.06); border-radius: 8px;
  margin: 14px 0 10px;
}
.grp-title:first-of-type { margin-top: 0; }

.env-grid, .gas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 16px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.preset-row { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.preset-tag { cursor: pointer; }
.nox-show .nox-val {
  font-size: 20px; font-weight: 800; color: var(--primary);
  background: rgba(37, 99, 235, 0.07); border: 1px dashed rgba(37, 99, 235, 0.4);
  border-radius: 12px; padding: 5px 14px; line-height: 1.5; white-space: nowrap;
}

.matrix-wrap { overflow-x: auto; }
.matrix { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
.matrix th {
  background: rgba(37, 99, 235, 0.07); color: var(--text); font-weight: 600;
  padding: 10px 12px; text-align: right; white-space: nowrap;
  border-bottom: 2px solid rgba(37, 99, 235, 0.25);
}
.matrix th:first-child { text-align: left; border-top-left-radius: 10px; }
.matrix th:last-child { border-top-right-radius: 10px; }
.matrix td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--border-light); color: var(--text); font-family: Consolas, Monaco, monospace; }
.matrix td.gas-name { text-align: left; font-family: inherit; font-weight: 700; }
.matrix th small { font-weight: 400; color: var(--text-light); }
.matrix .hot-col { background: rgba(37, 99, 235, 0.05); }
.matrix .hot-col b { color: var(--primary); font-size: 15px; }
.matrix-note { margin: 10px 0 0; font-size: 12px; color: var(--text-light); }

.alpha-badge {
  font-size: 14px; font-weight: 800; color: var(--primary);
  background: rgba(37, 99, 235, 0.08); border-radius: 10px; padding: 6px 14px;
}
.adj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.vr-card {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 13px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.vr-label { font-size: 12px; color: var(--text-light); }
.vr-val { white-space: nowrap; font-size: 13px; color: var(--text-light); }
.vr-base { margin-right: 6px; opacity: 0.75; }
.vr-card b { font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1.25; }

.steps { margin-top: 14px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 12px 16px; }
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 6px; }
.step-line { font-size: 12.5px; color: var(--text-light); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

.explain-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.explain-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.explain-head:hover h3 { color: var(--primary); }
.toggle { font-size: 12px; color: var(--text-light); }
.explain-body h4 { font-size: 14px; color: var(--text); margin: 18px 0 8px; }
.formula {
  font-family: Consolas, Monaco, monospace; font-size: 13.5px;
  background: var(--bg-soft, #f6f8fa); border-left: 3px solid var(--primary);
  border-radius: 8px; padding: 10px 14px; margin: 8px 0; color: var(--text);
  overflow-x: auto; white-space: nowrap;
}
.explain-body ul { margin: 8px 0 0; padding-left: 20px; }
.explain-body li { font-size: 13px; color: var(--text-light); line-height: 1.9; }

.uv-tool :deep(.el-input__wrapper),
.uv-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.uv-tool :deep(.el-input__wrapper.is-focus),
.uv-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.uv-tool :deep(.el-button:not(.is-text):not(.is-link)) { border-radius: 12px; }
.uv-tool :deep(.el-radio-button:first-child .el-radio-button__inner) { border-radius: 12px 0 0 12px; }
.uv-tool :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: 0 12px 12px 0; }

@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .env-grid, .gas-grid { grid-template-columns: 1fr 1fr; }
  .adj-grid { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 18px; }
}
</style>
