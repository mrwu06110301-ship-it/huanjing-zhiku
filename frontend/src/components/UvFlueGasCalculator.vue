<script setup lang="ts">
/**
 * UvFlueGasCalculator.vue — 紫外烟气模型
 * 依据 HJ 75/1045 附录 A 公式链（干湿基换算 / NOx / 基准含氧量折算）
 * SO2/NO/NO2 输入 + NOx 自动计算（以 NO2 计），μmol/mol ↔ mg/m³ 单位全表联动
 * 布局：现场参数卡 + 仪器示值→换算→折算合并比对表；公式见底部"公式依据"折叠卡
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import O2sPicker from "@/components/O2sPicker.vue";
import {
  MOL,
  UV_DEMO,
  type GasKey,
} from "@/utils/uv-flue-gas";

// ==================== 现场参数（过程输入） ====================
const env = reactive({
  Xsw: null as number | null,     // 含湿量 %
  O2dry: null as number | null,   // 氧量干基 %
  o2s: 6 as number | null,        // 基准含氧量 %（下拉/自定义）
});

// ==================== 基准含氧量（O2sPicker 数值+行业组合） ====================
const o2sInput = ref<number | null>(6);

// ==================== 仪器直读浓度（单位可切换 μmol/mol ↔ mg/m³） ====================
type ConcUnit = "ppm" | "mg";
const concUnit = ref<ConcUnit>("ppm");
const gases = reactive({
  SO2: null as number | null,
  NO: null as number | null,
  NO2: null as number | null,
});

/** 输入值 → 统一转为体积浓度 μmol/mol 参与计算 */
function toPpm(key: GasKey, v: number | null): number | null {
  if (v === null) return null;
  if (concUnit.value === "ppm") return v;
  const M = key === "SO2" ? MOL.SO2 : key === "NO" ? MOL.NO : MOL.NO2;
  return (v * 22.4) / M; // mg/m³ → μmol/mol
}
/** μmol/mol → 当前单位显示 */
function fromPpm(key: GasKey, ppm: number | null): number | null {
  if (ppm === null) return null;
  if (concUnit.value === "ppm") return ppm;
  const M = key === "SO2" ? MOL.SO2 : key === "NO" ? MOL.NO : MOL.NO2;
  return (M / 22.4) * ppm;
}
/** NOₓ 自动计算：NO + NO₂ 之和（以 NO₂ 计），无需输入 */
const noxPpm = computed<number | null>(() => {
  const a = toPpm("NO", gases.NO);
  const b = toPpm("NO2", gases.NO2);
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
});

const unitLabel = computed(() => (concUnit.value === "ppm" ? "μmol/mol" : "mg/m³"));

// ==================== 采样方法：冷干法（读数=干基）/ 热湿法（读数=湿基） ====================
type SampleMethod = "cold-dry" | "hot-wet";
const sampleMethod = ref<SampleMethod>("cold-dry");
const isHotWet = computed(() => sampleMethod.value === "hot-wet");
/** 热湿法读数为湿基，必须填含湿量才能换算干基 */
const dryReady = computed(() => {
  if (!isHotWet.value) return true;
  return env.Xsw !== null && env.Xsw < 100;
});

// ==================== 换算链（统一体积浓度参与，显示时按当前单位转换） ====================
interface Row {
  key: GasKey | "NOx";
  label: string;
  ppm: number | null;     // 仪器示值（冷干=干基读数 / 热湿=湿基读数）
  ppmDry: number | null;  // 干基体积浓度
  ppmWet: number | null;  // 湿基体积浓度（热湿法=示值；冷干法不适用）
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  const calc = (key: GasKey | "NOx", label: string, ppm: number | null) => {
    if (ppm === null) return;
    if (isHotWet.value) {
      // 热湿法：示值=湿基 → 换算干基（方向：湿基→干基，不反算）
      if (env.Xsw === null || env.Xsw >= 100) return; // 缺含湿量不计算
      list.push({
        key, label, ppm,
        ppmDry: ppm / (1 - env.Xsw / 100),
        ppmWet: ppm,
      });
    } else {
      // 冷干法：示值即干基，湿基不适用
      list.push({ key, label, ppm, ppmDry: ppm, ppmWet: null });
    }
  };
  calc("SO2", "SO₂", toPpm("SO2", gases.SO2));
  calc("NO", "NO", toPpm("NO", gases.NO));
  calc("NO2", "NO₂", toPpm("NO2", gases.NO2));
  // NOx 放最后（以 NO2 计）
  calc("NOx", "NOₓ（以 NO₂ 计）", noxPpm.value);
  return list;
});

/** 按当前显示单位格式化（NOₓ 以 NO₂ 计） */
function dispPpm(key: GasKey | "NOx", ppm: number | null): number | null {
  return fromPpm(key === "NOx" ? "NO2" : key, ppm);
}
function disp(key: GasKey | "NOx", ppm: number | null): string {
  return fmt(dispPpm(key, ppm));
}

/** 表格折算列：干基 × 折算比例（体积/质量浓度通用），按当前单位显示 */
function fmtAdj(r: Row): string {
  if (r.ppmDry === null) return "—";
  if (adjustRatio.value === null) return "—";
  return disp(r.key, r.ppmDry * adjustRatio.value);
}

/** 基准含氧量折算比例：C折 = C干 × (21−O₂s)/(21−O₂干)，体积/质量浓度通用 */
const adjustRatio = computed(() => {
  if (env.O2dry === null || env.O2dry >= 21 || o2sInput.value === null || o2sInput.value >= 21) return null;
  return (21 - o2sInput.value) / (21 - env.O2dry);
});

function loadDemo() {
  Object.assign(env, { Xsw: UV_DEMO.Xsw, O2dry: UV_DEMO.O2dry, o2s: UV_DEMO.o2s });
  o2sInput.value = UV_DEMO.o2s;
  Object.assign(gases, { SO2: UV_DEMO.so2_ppm, NO: UV_DEMO.no_ppm, NO2: UV_DEMO.no2_ppm });
  concUnit.value = "ppm";
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
        依据 HJ 75 / HJ 1045 附录 A 公式链：仪器示值 → 干湿基换算 → 基准含氧量折算。支持<b>冷干法（示值即干基）</b>与<b>热湿法（示值为湿基，需含湿量换算干基）</b>；NOₓ 由 NO+NO₂ 自动计算（以 NO₂ 计）。结果单位跟随示值单位自动切换，公式见底部"公式依据"。
      </el-alert>

      <div class="grp-title">
        采样方法
        <el-radio-group v-model="sampleMethod" size="small" class="unit-switch">
          <el-radio-button value="cold-dry">冷干法</el-radio-button>
          <el-radio-button value="hot-wet">热湿法</el-radio-button>
        </el-radio-group>
      </div>
      <div v-if="isHotWet" class="method-banner">热湿法：仪器示值为<b>湿基浓度</b>，需填写含湿量 Xsw 换算为干基后计算。</div>

      <div class="grp-title">现场过程参数</div>
      <div class="env-grid">
        <div class="field" :class="{ 'field-warn': isHotWet && (env.Xsw === null || env.Xsw >= 100) }">
          <label>
            含湿量 Xsw（%）<span v-if="isHotWet" class="req">*</span>
          </label>
          <el-input-number v-model="env.Xsw" :min="0" :max="100" :precision="2" :controls="false" :placeholder="isHotWet ? '热湿法必填' : '7.8'" style="width:100%" />
          <div v-if="isHotWet && (env.Xsw === null || env.Xsw >= 100)" class="field-err">热湿法需填写含湿量（&lt;100%）以换算干基</div>
        </div>
        <div class="field">
          <label>氧量干基 O₂（%）<span class="req">*</span></label>
          <el-input-number v-model="env.O2dry" :min="0" :max="21" :precision="2" :controls="false" placeholder="13.5" style="width:100%" />
        </div>
        <div class="field">
          <label>基准含氧量 O₂s（%）<span class="req">*</span></label>
          <O2sPicker v-model="o2sInput" />
          <div v-if="o2sInput !== null && o2sInput >= 21" class="field-err">基准含氧量需小于 21%</div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：仪器示值 → 浓度换算 → 折算（一张比对表） ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="layers" :size="17" /> 浓度换算与折算</h3>
        <div class="head-actions">
          <span v-if="isHotWet" class="method-chip" :class="{ ok: dryReady }">
            {{ dryReady ? "热湿法 · 已按 Xsw 换算干基" : "热湿法 · 待填含湿量 Xsw" }}
          </span>
          <span v-else class="method-chip ok">冷干法 · 示值即干基</span>
          <el-radio-group v-model="concUnit" size="small" class="unit-switch">
            <el-radio-button value="ppm">μmol/mol</el-radio-button>
            <el-radio-button value="mg">mg/m³</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="gas-th">气体</th>
              <th :class="{ 'hot-col': isHotWet }">
                湿基<small>（{{ isHotWet ? "仪器示值" : "不适用" }}，{{ unitLabel }}）</small>
              </th>
              <th :class="{ 'hot-col': !isHotWet }">
                干基<small>（{{ isHotWet ? "换算值" : "仪器示值" }}，{{ unitLabel }}）</small>
              </th>
              <th>
                折算浓度 <small>{{ unitLabel }}（O₂s={{ o2sInput ?? "—" }}%）</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td class="gas-name">{{ r.label }}</td>
              <!-- 湿基：热湿法=仪器示值（输入/NOₓ自动）；冷干法显示 — -->
              <td v-if="isHotWet" class="input-cell">
                <el-input-number
                  v-if="r.key !== 'NOx'"
                  v-model="gases[r.key]"
                  :min="0" :precision="1" :controls="false"
                  :placeholder="r.key === 'SO2' ? '86' : r.key === 'NO' ? '92' : '6'"
                  class="cell-input"
                />
                <span v-else class="nox-val">{{ noxPpm !== null ? disp("NOx", noxPpm) : "—" }}</span>
              </td>
              <td v-else class="dim">—</td>
              <!-- 干基：冷干法=仪器示值（输入/NOₓ自动）；热湿法=换算结果 -->
              <td v-if="!isHotWet" class="input-cell">
                <el-input-number
                  v-if="r.key !== 'NOx'"
                  v-model="gases[r.key]"
                  :min="0" :precision="1" :controls="false"
                  :placeholder="r.key === 'SO2' ? '86' : r.key === 'NO' ? '92' : '6'"
                  class="cell-input"
                />
                <span v-else class="nox-val">{{ noxPpm !== null ? disp("NOx", noxPpm) : "—" }}</span>
              </td>
              <td v-else class="hot-col"><b>{{ disp(r.key, r.ppmDry) }}</b></td>
              <!-- 折算 -->
              <td><b class="adj-val">{{ fmtAdj(r) }}</b></td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty-row">
                {{ isHotWet ? "填写湿基示值与含湿量 Xsw 后自动计算" : "填写干基示值后自动计算" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="matrix-note">
        {{ isHotWet
          ? "热湿法：湿基列 = 仪器示值；干基 = 湿基示值 /(1−Xsw/100)；折算 = 干基 × (21−O₂s)/(21−O₂干)"
          : "冷干法：干基列 = 仪器示值（无需含湿量换算）；折算 = 干基 × (21−O₂s)/(21−O₂干)" }}；NOₓ 由 NO+NO₂ 自动计算（以 NO₂ 计）。
      </p>
    </div>

    <!-- ===== 卡片三：公式说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 公式依据（HJ 75 / HJ 1045 附录 A）</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>采样方法（冷干法 / 热湿法）</h4>
        <div class="formula">冷干法：仪器示值即干基，直接计算；热湿法：C干 = C湿 / (1 − Xsw/100) 后再计算</div>
        <h4>干基 ← 湿基（计算方向：湿基 → 干基）</h4>
        <div class="formula">C干 = C湿 / (1 − Xsw/100)　（体积浓度与质量浓度算法相同）</div>
        <h4>体积浓度 ↔ 标态质量浓度</h4>
        <div class="formula">C = M/22.4 × Cv　（M：SO₂=64.06、NO=30.006、NO₂=46.005 g/mol）</div>
        <h4>NOx（以 NO₂ 计，自动计算）</h4>
        <div class="formula">质量：CNOx = CNO × M(NO₂)/M(NO) + CNO₂</div>
        <div class="formula">体积：CNOx = CNOv + CNO₂v</div>
        <h4>过剩空气系数 / 基准含氧量折算</h4>
        <div class="formula">α = 21%/(21% − O₂干)</div>
        <div class="formula">C折 = C干 × (21 − O₂s)/(21 − O₂干)　（若标准给 αs：C折 = C干 × α/αs）</div>
        <ul>
          <li>仪器示值单位可切换 μmol/mol ↔ mg/m³，全表结果随单位自动切换</li>
          <li>基准含氧量按行业排放标准下拉选择，也支持自定义输入</li>
          <li>本工具为浓度换算与折算计算，不含工况/标况体积换算（Ba/Ps/Ts 不参与）</li>
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
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
}
.grp-title:first-of-type { margin-top: 0; }
.unit-switch { flex-shrink: 0; }

.method-banner {
  display: flex; align-items: center; gap: 6px;
  background: rgba(6, 182, 212, 0.08); border: 1px dashed rgba(6, 182, 212, 0.4);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;
  font-size: 12.5px; color: #0e7490; line-height: 1.6;
}
.field-warn label { color: #d97706; }
.method-chip {
  font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 20px;
  background: rgba(217, 119, 6, 0.1); color: #b45309;
}
.method-chip.ok { background: rgba(37, 99, 235, 0.08); color: var(--primary); }

.env-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 16px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }
.head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* 比对表内嵌输入框 */
.input-cell { text-align: center !important; }
.cell-input { width: 100%; max-width: 180px; }
.cell-input :deep(.el-input__inner) { text-align: center; font-family: Consolas, Monaco, monospace; }
/* NOₓ 数值（自动计算只读） */
.nox-val {
  color: var(--primary); font-weight: 700; font-size: 14.5px;
  font-family: Consolas, Monaco, monospace;
}
.adj-val { color: var(--primary); font-size: 14.5px; }
.dim { color: var(--text-light); opacity: 0.55; }
.empty-row { text-align: center; color: var(--text-light); font-size: 12.5px; padding: 18px 10px !important; }

.matrix-wrap { overflow-x: auto; }
.matrix { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
.matrix th {
  background: rgba(37, 99, 235, 0.07); color: var(--text); font-weight: 600;
  padding: 10px 12px; text-align: center; white-space: nowrap;
  border-bottom: 2px solid rgba(37, 99, 235, 0.25);
  position: relative;
}
.matrix th:first-child { border-top-left-radius: 10px; }
.matrix th:last-child { border-top-right-radius: 10px; }
.matrix td { padding: 10px 12px; text-align: center; border-bottom: 1px solid var(--border-light); color: var(--text); font-family: Consolas, Monaco, monospace; }
.matrix td.gas-name { font-family: inherit; font-weight: 700; }
.matrix th small { font-weight: 400; color: var(--text-light); }
.matrix .hot-col { background: rgba(37, 99, 235, 0.05); }
.matrix .hot-col b { color: var(--primary); font-size: 15px; }
.matrix-note { margin: 10px 0 0; font-size: 12px; color: var(--text-light); }

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
  .env-grid { grid-template-columns: 1fr 1fr; }
  .cell-input { max-width: none; }
}
</style>
