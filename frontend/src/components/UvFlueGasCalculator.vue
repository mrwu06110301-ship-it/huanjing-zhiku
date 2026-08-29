<script setup lang="ts">
/**
 * UvFlueGasCalculator.vue — 紫外烟气模型
 * 依据 HJ 75/1045 附录 A 公式链（工况标况 / 干湿基 / 体积质量 / NOx / 折算）
 * SO2/NO/NO2/NOx（NOx 计算得出），μmol/mol ↔ mg/m³ 双向换算
 * 输入即自动计算；公式编号以 ? 图标提示，点击查看公式
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import O2sPicker from "@/components/O2sPicker.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin());
import {
  MOL, volumeToMass, workingToStandard,
  noxMass, excessAir, adjustByO2, UV_DEMO,
  type GasKey,
} from "@/utils/uv-flue-gas";

// ==================== 现场参数（过程输入） ====================
const env = reactive({
  ba: 101325 as number | null,   // 环境大气压 Pa
  ps: 0 as number | null,        // 烟气静压 Pa（表压）
  ts: null as number | null,     // 烟温 ℃
  Xsw: null as number | null,    // 含湿量 %
  O2dry: null as number | null,  // 氧量干基 %
  o2s: 6 as number | null,       // 基准含氧量 %（下拉/自定义）
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
/** NOx 输入（用户可手动填 NOx，若填了则覆盖 NO+NO2 之和） */
const noxInput = ref<number | null>(null);

const noxPpm = computed<number | null>(() => {
  // 用户优先手填 NOx
  const manual = toPpm("NO2", noxInput.value); // NOx 以 NO2 计，M 用 NO2
  if (manual !== null) return manual;
  const a = toPpm("NO", gases.NO);
  const b = toPpm("NO2", gases.NO2);
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
});
const noxHasInput = computed(() => noxInput.value !== null);

const unitLabel = computed(() => (concUnit.value === "ppm" ? "μmol/mol" : "mg/m³"));

/** NOₓ ?气泡公式：按当前输入单位显示对应算法 */
const a4Formula = computed(() =>
  concUnit.value === "ppm"
    ? "C(NOₓ) = C(NO) + C(NO₂)"
    : "C(NOₓ) = C(NO) × 46.005/30.006 + C(NO₂)"
);

/** NOₓ ?气泡数值代入过程（有输入时显示） */
const a4Steps = computed(() => {
  const noV = toPpm("NO", gases.NO);
  const no2V = toPpm("NO2", gases.NO2);
  if (noxHasInput.value) {
    return `已手动填写 NOₓ = ${fromPpm("NO2", noxPpm.value)?.toFixed(2)} ${unitLabel.value}，覆盖自动求和。`;
  }
  if (noV === null && no2V === null) return "";
  const a = noV ?? 0, b = no2V ?? 0;
  if (concUnit.value === "ppm") {
    return `代入：C(NOₓ) = ${a.toFixed(2)} + ${b.toFixed(2)} = ${noxPpm.value!.toFixed(2)} μmol/mol`;
  }
  const noM = fromPpm("NO", noV) ?? 0;
  const no2M = fromPpm("NO2", no2V) ?? 0;
  return `代入：C(NOₓ) = ${noM.toFixed(2)} × 46.005/30.006 + ${no2M.toFixed(2)} = ${(noM * 46.005 / 30.006 + no2M).toFixed(2)} mg/m³`;
});

// ==================== 采样方法：冷干法（读数=干基）/ 热湿法（读数=湿基） ====================
type SampleMethod = "cold-dry" | "hot-wet";
const sampleMethod = ref<SampleMethod>("cold-dry");
const isHotWet = computed(() => sampleMethod.value === "hot-wet");
/** 热湿法读数为湿基，必须填含湿量才能换算干基 */
const dryReady = computed(() => {
  if (!isHotWet.value) return true;
  return env.Xsw !== null && env.Xsw < 100;
});

// ==================== 换算链 ====================
interface Row {
  key: GasKey | "NOx";
  label: string;
  ppm: number | null;
  massStdDry: number | null;
  massWetStd: number | null;
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  const calc = (key: GasKey | "NOx", label: string, ppm: number | null, M: number) => {
    if (ppm === null) return;
    const readMass = volumeToMass(ppm, M); // 仪器读数质量浓度（干基或湿基，视方法而定）
    if (isHotWet.value) {
      // 热湿法：读数=湿基，干基 = 湿基/(1−Xsw/100)，湿基列显示原始读数
      if (env.Xsw === null || env.Xsw >= 100) return; // 缺含湿量不计算
      const mStdDry = readMass / (1 - env.Xsw / 100);
      list.push({
        key, label, ppm,
        massStdDry: mStdDry,
        massWetStd: readMass, // = 仪器原始读数
      });
    } else {
      // 冷干法：读数=干基，直接显示；湿基不适用，显示 —
      list.push({
        key, label, ppm,
        massStdDry: readMass,
        massWetStd: null, // 冷干法不显示湿基
      });
    }
  };
  calc("SO2", "SO₂", toPpm("SO2", gases.SO2), MOL.SO2);
  calc("NO", "NO", toPpm("NO", gases.NO), MOL.NO);
  calc("NO2", "NO₂", toPpm("NO2", gases.NO2), MOL.NO2);
  // NOx 放最后（以 NO2 计）
  calc("NOx", "NOₓ（以 NO₂ 计）", noxPpm.value, MOL.NO2);
  return list;
});

// ==================== 折算 ====================
const alphaResult = computed(() => {
  if (env.O2dry === null || env.O2dry >= 21) return null;
  return excessAir(env.O2dry);
});

interface AdjustRow { label: string; csnDry: number; adjusted: number }
const adjustRows = computed<AdjustRow[]>(() => {
  if (env.O2dry === null || env.O2dry >= 21 || o2sInput.value === null || o2sInput.value >= 21) return [];
  return rows.value
    .filter((r) => r.massStdDry !== null)
    .map((r) => ({
      label: r.label,
      csnDry: r.massStdDry!,
      adjusted: adjustByO2(r.massStdDry!, env.O2dry!, o2sInput.value!).adjusted,
    }));
});

function loadDemo() {
  Object.assign(env, { ba: UV_DEMO.ba, ps: UV_DEMO.ps, ts: UV_DEMO.ts, Xsw: UV_DEMO.Xsw, O2dry: UV_DEMO.O2dry, o2s: UV_DEMO.o2s });
  o2sInput.value = UV_DEMO.o2s;
  Object.assign(gases, { SO2: UV_DEMO.so2_ppm, NO: UV_DEMO.no_ppm, NO2: UV_DEMO.no2_ppm });
  noxInput.value = null;
  concUnit.value = "ppm";
  ElMessage.success("已填入示例数据");
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  return String(Number(v.toFixed(2)));
}

// ==================== 公式气泡（? 提示） ====================
const formulaTips: Record<string, { title: string; formula: string; desc: string }> = {
  SM: {
    title: "采样方法：冷干法 vs 热湿法",
    formula: "热湿法换干基：C干 = C湿 / (1 − Xsw/100)",
    desc: "冷干法（完全抽取+冷凝除湿）：仪器读数为干基浓度，无需含湿量换算；热湿法（全程伴热）：仪器读数为湿基浓度，必须填写含湿量 Xsw 换算为干基后再进行标态/折算计算。",
  },
  A3: {
    title: "体积浓度 → 标态质量浓度",
    formula: "C = M/22.4 × Cv",
    desc: "M 摩尔质量（SO₂=64.06、NO=30.006、NO₂=46.005 g/mol）；22.4 标态摩尔体积 L/mol；Cv 体积浓度 μmol/mol",
  },
  A2: {
    title: "干基 ↔ 湿基",
    formula: "C干 = C湿 / (1 − Xsw/100)；C湿 = C干 × (1 − Xsw/100)",
    desc: "Xsw 含湿量 %。冷干法仪器读数为干基浓度，无需含湿量换算；热湿法仪器读数为湿基浓度，需先除以 (1−Xsw/100) 换算为干基再参与后续计算。",
  },
  A4: {
    title: "NOx 浓度（以 NO₂ 计）",
    formula: "体积：C(NOx) = C(NO) + C(NO₂)；质量：C(NOx) = C(NO) × 46.005/30.006 + C(NO₂)",
    desc: "NOx 以 NO₂ 计（M=46.005 g/mol）。体积浓度为 NO 与 NO₂ 直接相加；质量浓度需将 NO 按 M(NO₂)/M(NO) 折算后与 NO₂ 相加。未填写时自动按 NO+NO₂ 求和；直接填写 NOₓ 则覆盖求和值。",
  },
  A8: {
    title: "实测过剩空气系数",
    formula: "α = 21 / (21 − O₂干)",
    desc: "O₂干 为干烟气中氧含量 %",
  },
  A9: {
    title: "基准含氧量折算",
    formula: "C折 = Csn干 × (21 − O₂s) / (21 − O₂干)",
    desc: "O₂s 为行业基准含氧量（按排放标准取值）；Csn干 为标态干基质量浓度",
  },
};
const tipVisible = reactive<Record<string, boolean>>({});
function toggleTip(k: string) {
  tipVisible[k] = !tipVisible[k];
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
        依据 HJ 75 / HJ 1045 附录 A 公式链：仪器直读浓度 → 标态质量浓度 → 干湿基 → 基准含氧量折算。支持<b>冷干法（干基读数）</b>与<b>热湿法（湿基读数，需含湿量换算）</b>；NOₓ 由 NO+NO₂ 自动计算（以 NO₂ 计），也可直接填写 NOₓ 值。公式处的 <span class="q-demo">?</span> 可点击查看具体计算公式。
      </el-alert>

      <div class="grp-title">
        采样方法
        <span class="q-tip" @click="toggleTip('SM')">?</span>
        <div v-if="tipVisible.SM" class="tip-pop tip-pop-right">
          <div class="tip-title">{{ formulaTips.SM.title }}</div>
          <div class="tip-formula">{{ formulaTips.SM.formula }}</div>
          <div class="tip-desc">{{ formulaTips.SM.desc }}</div>
        </div>
        <el-radio-group v-model="sampleMethod" size="small" class="unit-switch">
          <el-radio-button value="cold-dry">冷干法</el-radio-button>
          <el-radio-button value="hot-wet">热湿法</el-radio-button>
        </el-radio-group>
      </div>
      <div v-if="isHotWet" class="method-banner">热湿法：仪器读数为<b>湿基浓度</b>，需填写含湿量 Xsw 换算为干基后计算。</div>

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
        <div class="field" :class="{ 'field-warn': isHotWet && (env.Xsw === null || env.Xsw >= 100) }">
          <label>
            含湿量 Xsw（%）<span v-if="isHotWet" class="req">*</span>
            <span class="q-tip" @click="toggleTip('A2')">?</span>
            <div v-if="tipVisible.A2" class="tip-pop">
              <div class="tip-title">{{ formulaTips.A2.title }}</div>
              <div class="tip-formula">{{ formulaTips.A2.formula }}</div>
              <div class="tip-desc">{{ formulaTips.A2.desc }}</div>
            </div>
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

      <div class="grp-title">
        仪器直读浓度
        <el-radio-group v-model="concUnit" size="small" class="unit-switch">
          <el-radio-button value="ppm">μmol/mol</el-radio-button>
          <el-radio-button value="mg">mg/m³</el-radio-button>
        </el-radio-group>
      </div>
      <div class="gas-grid">
        <div class="field">
          <label>SO₂（{{ unitLabel }}）</label>
          <el-input-number v-model="gases.SO2" :min="0" :precision="1" :controls="false" placeholder="86" style="width:100%" />
        </div>
        <div class="field">
          <label>NO（{{ unitLabel }}）</label>
          <el-input-number v-model="gases.NO" :min="0" :precision="1" :controls="false" placeholder="92" style="width:100%" />
        </div>
        <div class="field">
          <label>NO₂（{{ unitLabel }}）</label>
          <el-input-number v-model="gases.NO2" :min="0" :precision="1" :controls="false" placeholder="6" style="width:100%" />
        </div>
        <div class="field nox-show">
          <label>
            NOₓ（{{ unitLabel }}）
            <span class="q-tip" @click="toggleTip('A4')">?</span>
            <div v-if="tipVisible.A4" class="tip-pop">
              <div class="tip-title">{{ formulaTips.A4.title }}</div>
              <div class="tip-formula">{{ formulaTips.A4.formula }}</div>
              <div v-if="a4Steps" class="tip-desc">{{ a4Steps }}</div>
            </div>
          </label>
          <el-input-number v-model="noxInput" :min="0" :precision="1" :controls="false" :placeholder="noxPpm !== null ? noxPpm.toFixed(1) : '自动'" style="width:100%" />
          <div class="nox-hint" v-if="noxHasInput">已手动填写，覆盖 NO+NO₂ 之和</div>
          <div class="nox-hint" v-else-if="noxPpm !== null">NO+NO₂ = {{ fromPpm("NO2", noxPpm)?.toFixed(1) }} {{ unitLabel }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：浓度换算结果 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="layers" :size="17" /> 浓度换算结果</h3>
        <span v-if="isHotWet" class="method-chip" :class="{ ok: dryReady }">
          {{ dryReady ? "热湿法 · 湿基读数已按 Xsw 换算干基" : "热湿法 · 待填含湿量 Xsw" }}
        </span>
        <span v-else class="method-chip ok">冷干法 · 干基读数直接计算</span>
      </div>
      <template v-if="rows.length">
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th>污染物</th>
              <th>体积浓度<br><small>μmol/mol</small></th>
              <th class="hot-col">
                标态干基 <small>mg/m³</small>
                <span class="q-tip" @click="toggleTip('A3')">?</span>
                <div v-if="tipVisible.A3" class="tip-pop">
                  <div class="tip-title">{{ formulaTips.A3.title }}</div>
                  <div class="tip-formula">{{ formulaTips.A3.formula }}</div>
                  <div class="tip-desc">{{ formulaTips.A3.desc }}</div>
                </div>
              </th>
              <th>
                {{ isHotWet ? "湿基（仪器读数）" : "标态湿基" }} <small>mg/m³</small>
                <span class="q-tip" @click="toggleTip('A2')">?</span>
                <div v-if="tipVisible.A2" class="tip-pop">
                  <div class="tip-title">{{ formulaTips.A2.title }}</div>
                  <div class="tip-formula">{{ formulaTips.A2.formula }}</div>
                  <div class="tip-desc">{{ formulaTips.A2.desc }}</div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key" :class="{ noxrow: r.key === 'NOx' }">
              <td class="gas-name">{{ r.label }}</td>
              <td>{{ fmt(fromPpm(r.key === "NOx" ? "NO2" : r.key, r.ppm)) }}</td>
              <td class="hot-col"><b>{{ fmt(r.massStdDry) }}</b></td>
              <td>{{ fmt(r.massWetStd) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="matrix-note">
        标态：0℃、101.325 kPa；{{ isHotWet
          ? "热湿法：湿基列 = 仪器原始读数；干基 = 湿基读数 /(1−Xsw/100)"
          : "冷干法：标态干基 = 仪器直读浓度换算；湿基列不适用（—）" }}；NOₓ 以 NO₂ 计，置于表末。
      </p>
      </template>
      <div v-else class="empty-hint">
        <Icon name="info" :size="14" />
        {{ isHotWet
          ? "热湿法：填写仪器湿基读数 + 含湿量 Xsw 后自动换算干基计算"
          : "填写上方仪器直读浓度后自动计算" }}
      </div>
    </div>

    <!-- ===== 卡片三：折算浓度 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="trendUp" :size="17" /> 折算浓度<span v-if="adjustRows.length">（基准含氧量 {{ o2sInput }}%）</span></h3>
        <div class="alpha-badge" v-if="alphaResult">α = {{ alphaResult.alpha.toFixed(4) }}
          <span class="q-tip" @click="toggleTip('A8')">?</span>
          <div v-if="tipVisible.A8" class="tip-pop">
            <div class="tip-title">{{ formulaTips.A8.title }}</div>
            <div class="tip-formula">{{ formulaTips.A8.formula }}</div>
            <div class="tip-desc">{{ formulaTips.A8.desc }}</div>
          </div>
        </div>
      </div>
      <template v-if="adjustRows.length">
      <div class="adj-grid">
        <div v-for="r in adjustRows" :key="r.label" class="vr-card">
          <span class="vr-label">{{ r.label }}</span>
          <div class="vr-val">
            <span class="vr-base">{{ fmt(r.csnDry) }} →</span>
            <b>{{ fmt(r.adjusted) }}</b> mg/m³
          </div>
        </div>
      </div>
      <div class="steps" v-if="isAdmin && alphaResult">
        <div class="steps-title">折算公式
          <span class="q-tip" @click="toggleTip('A9')">?</span>
          <div v-if="tipVisible.A9" class="tip-pop">
            <div class="tip-title">{{ formulaTips.A9.title }}</div>
            <div class="tip-formula">{{ formulaTips.A9.formula }}</div>
            <div class="tip-desc">{{ formulaTips.A9.desc }}</div>
          </div>
        </div>
        <div class="step-line">C折 = Csn干 × (21−O₂s)/(21−O₂干)，O₂s = {{ o2sInput }}%</div>
      </div>
      </template>
      <div v-else class="empty-hint"><Icon name="info" :size="14" /> 填写氧量干基 O₂ 与基准含氧量 O₂s 后自动折算</div>
    </div>

    <!-- ===== 卡片四：公式说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 公式依据（HJ 75 / HJ 1045 附录 A）</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>采样方法（冷干法 / 热湿法）</h4>
        <div class="formula">冷干法：读数即干基，直接计算；热湿法：C干 = C湿 / (1 − Xsw/100) 后再计算</div>
        <h4>工况浓度 ↔ 标况浓度</h4>
        <div class="formula">Csn = Cs × 101325/(Ba+Ps) × (273+ts)/273</div>
        <h4>干基 ↔ 湿基</h4>
        <div class="formula">C干 = C湿 / (1 − Xsw/100)　（体积浓度与质量浓度算法相同）</div>
        <h4>体积浓度 ↔ 标态质量浓度</h4>
        <div class="formula">C = M/22.4 × Cv　（M：SO₂=64.06、NO=30.006、NO₂=46.005 g/mol）</div>
        <h4>NOx（以 NO₂ 计）</h4>
        <div class="formula">质量：CNOx = CNO × M(NO₂)/M(NO) + CNO₂</div>
        <div class="formula">体积：CNOx = CNOv + CNO₂v</div>
        <h4>过剩空气系数 / 基准含氧量折算</h4>
        <div class="formula">α = 21%/(21% − O₂干)</div>
        <div class="formula">C折 = Csn干 × (21 − O₂s)/(21 − O₂干)　（若标准给 αs：C折 = Csn干 × α/αs）</div>
        <ul>
          <li>仪器直读单位可切换 μmol/mol ↔ mg/m³，内部统一按体积浓度参与计算</li>
          <li>基准含氧量按行业排放标准下拉选择，也支持自定义输入</li>
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
.q-demo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; border-radius: 50%; font-size: 10.5px; font-weight: 700;
  color: var(--primary); border: 1px solid var(--primary); vertical-align: middle; cursor: pointer;
}

.grp-title {
  font-size: 12.5px; font-weight: 700; color: var(--primary);
  padding: 6px 10px; background: rgba(37, 99, 235, 0.06); border-radius: 8px;
  margin: 14px 0 10px;
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
}
.grp-title:first-of-type { margin-top: 0; }
.unit-switch { flex-shrink: 0; }
.tip-pop-right { left: auto; right: 0; transform: none; }

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

.env-grid, .gas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 16px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.field label .q-tip { vertical-align: -3px; }
.field label .tip-pop { left: 0; transform: none; margin-top: 6px; }
/* NOₓ ?气泡：紧贴按钮下方、跟随字段宽度、仅显示公式 */
.nox-tip {
  position: static;
  max-width: none; margin: 4px 0 6px;
  white-space: nowrap;
}
.nox-tip .tip-formula { margin-bottom: 0; }
.req { color: #ef4444; margin-left: 2px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }
.o2s-switch { margin-top: 4px; }
.nox-show .nox-hint { font-size: 11.5px; color: var(--primary); margin-top: 4px; }

/* ? 公式气泡 */
.q-tip {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  font-size: 11px; font-weight: 700; color: var(--primary);
  border: 1px solid rgba(37, 99, 235, 0.5); margin-left: 5px;
  cursor: pointer; user-select: none; vertical-align: middle; position: relative;
}
.q-tip:hover { background: rgba(37, 99, 235, 0.1); }
.tip-pop {
  position: absolute; z-index: 20; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  width: max-content; max-width: 320px;
  background: var(--white, #fff); border: 1px solid var(--border-light);
  border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.13);
  padding: 12px 14px; text-align: left;
}
.tip-title { font-size: 12.5px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.tip-formula {
  font-family: Consolas, Monaco, monospace; font-size: 12.5px; color: var(--primary);
  background: rgba(37, 99, 235, 0.06); border-radius: 8px; padding: 6px 10px; margin-bottom: 6px;
  white-space: pre-wrap; word-break: break-all;
}
.tip-desc { font-size: 12px; color: var(--text-light); line-height: 1.6; }

.matrix-wrap { overflow-x: auto; }
.matrix { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
.matrix th {
  background: rgba(37, 99, 235, 0.07); color: var(--text); font-weight: 600;
  padding: 10px 12px; text-align: right; white-space: nowrap;
  border-bottom: 2px solid rgba(37, 99, 235, 0.25);
  position: relative;
}
.matrix th:first-child { text-align: left; border-top-left-radius: 10px; }
.matrix th:last-child { border-top-right-radius: 10px; }
.matrix td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--border-light); color: var(--text); font-family: Consolas, Monaco, monospace; }
.matrix td.gas-name { text-align: left; font-family: inherit; font-weight: 700; }
.matrix th small { font-weight: 400; color: var(--text-light); }
.matrix .hot-col { background: rgba(37, 99, 235, 0.05); }
.matrix .hot-col b { color: var(--primary); font-size: 15px; }
.matrix .noxrow td { border-top: 2px dashed rgba(37, 99, 235, 0.35); }
.matrix .noxrow td.gas-name { color: var(--primary); }
.matrix-note { margin: 10px 0 0; font-size: 12px; color: var(--text-light); }

.alpha-badge {
  font-size: 14px; font-weight: 800; color: var(--primary);
  background: rgba(37, 99, 235, 0.08); border-radius: 10px; padding: 6px 14px;
  display: flex; align-items: center;
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

.empty-hint {
  margin-top: 4px; padding: 14px; border-radius: 12px;
  border: 1.5px dashed var(--border-light); color: var(--text-light); font-size: 12.5px;
  display: flex; align-items: center; gap: 8px;
}
.steps { margin-top: 14px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 12px 16px; }
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 6px; display: flex; align-items: center; }
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
  .tip-pop { max-width: 240px; }
}
</style>
