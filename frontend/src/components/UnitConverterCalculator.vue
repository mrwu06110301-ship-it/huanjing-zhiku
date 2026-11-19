<script setup lang="ts">
/**
 * UnitConverterCalculator.vue — 单位换算
 * Tab1 常用气体换算：ppm / mg/m³ / μmol/mol / % / ppb 互转（气体选择与自定义分子式二选一）
 * Tab2 VOCs 换算：ppm / mg/m³ / ppm(C) / mg/m³(C) / ppm(CH4) / mg/m³(CH4)（总烃仅碳计/甲烷计）
 * 输入即自动计算，全单位对照直接展示；公式说明默认折叠
 */
import { ref, reactive, computed } from "vue";
import Icon from "@/components/Icon.vue";
import {
  COMMON_GASES, COMMON_UNIT_LABEL, convertCommonSafe, parseMolarMass,
  VOC_GASES, VOC_UNIT_LABEL, convertVoc, vocUnitAvailable,
  type CommonUnit, type GasDef, type VocGasDef, type VocUnit,
} from "@/utils/unit-gas-conversion";

const activeTab = ref<"common" | "voc">("common");

function fmtResult(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 10000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1) return String(Number(v.toFixed(4)));
  if (Math.abs(v) >= 0.0001) return String(Number(v.toFixed(6)));
  return v.toExponential(4);
}

// ==================== Tab1 常用气体 ====================
const commonForm = reactive({
  gasMode: "preset" as "preset" | "custom", // 二选一：常用气体 / 自定义分子式
  gasIdx: 3, // 默认一氧化碳
  customFormula: "",
  value: null as number | null,
  from: "ppm" as CommonUnit,
  temp: "25C" as "25C" | "0C",
});

const customError = computed(() => {
  const s = commonForm.customFormula.trim();
  if (commonForm.gasMode === "custom" && s && parseMolarMass(s) === null) {
    return "分子式无法解析，请检查（如 SO2、C6H6、Ca(OH)2）";
  }
  return "";
});

const currentGas = computed<GasDef | null>(() => {
  if (commonForm.gasMode === "custom") {
    const s = commonForm.customFormula.trim();
    if (!s || customError.value) return null;
    const m = parseMolarMass(s)!;
    return { name: "自定义", formula: s.toUpperCase(), molarMass: Math.round(m * 1000) / 1000 };
  }
  return COMMON_GASES[commonForm.gasIdx] || null;
});

function swapCommon() {
  // 预留：无目标单位后交换按钮已移除
}
// eslint-disable-next-line
void swapCommon;

/** 全单位换算（输入即算） */
const commonAll = computed(() => {
  const gas = currentGas.value;
  if (!gas || commonForm.value === null) return [];
  return (Object.keys(COMMON_UNIT_LABEL) as CommonUnit[]).map((u) => ({
    unit: u,
    label: COMMON_UNIT_LABEL[u],
    value: convertCommonSafe({
      value: commonForm.value!, from: commonForm.from, to: u,
      molarMass: gas.molarMass, temp: commonForm.temp,
    }),
  }));
});

// ==================== Tab2 VOCs ====================
const vocForm = reactive({
  gasIdx: 3, // 默认甲苯
  value: null as number | null,
  from: "ppm" as VocUnit,
  temp: "25C" as "25C" | "0C",
});

const currentVocGas = computed<VocGasDef>(() => VOC_GASES[vocForm.gasIdx]);
const vocFromInvalid = computed(() => !vocUnitAvailable(currentVocGas.value, vocForm.from));

/** 可用单位换算（输入即算） */
const vocAll = computed(() => {
  const gas = currentVocGas.value;
  if (vocForm.value === null || vocFromInvalid.value) return [];
  return (Object.keys(VOC_UNIT_LABEL) as VocUnit[])
    .filter((u) => vocUnitAvailable(gas, u))
    .map((u) => ({
      unit: u,
      label: VOC_UNIT_LABEL[u],
      value: convertVoc({ value: vocForm.value!, from: vocForm.from, to: u, gas, temp: vocForm.temp }),
    }));
});

// ==================== 公式说明（默认折叠） ====================
const showFormula = ref(false);
</script>

<template>
  <div class="uc-tool">
    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'common' }]" @click="activeTab = 'common'">
        <Icon name="flame" :size="15" /> 常用气体换算
      </button>
      <button :class="['tab-btn', { active: activeTab === 'voc' }]" @click="activeTab = 'voc'">
        <Icon name="beaker" :size="15" /> VOCs 气体换算
      </button>
    </div>

    <!-- ===== Tab1 常用气体 ===== -->
    <div v-if="activeTab === 'common'" class="card">
      <!-- 点选面板：气体来源 + 换算基准 -->
      <div class="seg-panel">
        <div class="seg-cell">
          <span class="seg-label">气体来源</span>
          <div class="seg-group">
            <button :class="['seg-btn', { active: commonForm.gasMode === 'preset' }]" @click="commonForm.gasMode = 'preset'">列表选择</button>
            <button :class="['seg-btn', { active: commonForm.gasMode === 'custom' }]" @click="commonForm.gasMode = 'custom'">输入分子式</button>
          </div>
        </div>
        <div class="seg-cell">
          <span class="seg-label">换算基准</span>
          <div class="seg-group">
            <button :class="['seg-btn', { active: commonForm.temp === '25C' }]" @click="commonForm.temp = '25C'">25℃ 参比</button>
            <button :class="['seg-btn', { active: commonForm.temp === '0C' }]" @click="commonForm.temp = '0C'">0℃ 标况</button>
          </div>
        </div>
      </div>

      <div class="gas-picker">
        <div v-if="commonForm.gasMode === 'preset'" class="field grow">
          <label>常用气体</label>
          <el-select v-model="commonForm.gasIdx" style="width: 100%" popper-class="dark-tool-popper">
            <el-option v-for="(g, i) in COMMON_GASES" :key="g.name + i" :value="i" :label="`${g.name}（${g.formula}）`">
              <span>{{ g.name }}</span>
              <span class="opt-hint">{{ g.formula }} · M={{ g.molarMass }}</span>
            </el-option>
          </el-select>
        </div>
        <div v-else class="field grow">
          <label>气体分子式（自动计算摩尔质量）</label>
          <el-input v-model="commonForm.customFormula" placeholder="如 C3H8、CH2O、Ca(OH)2" clearable />
          <div v-if="customError" class="field-err">{{ customError }}</div>
        </div>
      </div>

      <div v-if="currentGas" class="m-bar">
        <Icon name="info" :size="14" />
        {{ currentGas.formula }} 摩尔质量 M = <b>{{ currentGas.molarMass }}</b> g/mol
        <template v-if="commonForm.temp === '25C'">· 摩尔体积 24.45 L/mol</template>
        <template v-else>· 摩尔体积 22.414 L/mol</template>
      </div>

      <!-- 左：输入区 / 右：换算结果区 -->
      <div class="split-layout" v-if="currentGas">
        <div class="split-left">
          <div class="pane-title"><Icon name="flame" :size="14" /> 输入</div>
          <div class="field val-field">
            <label>输入数值</label>
            <el-input-number v-model="commonForm.value" :controls="false" placeholder="输入后自动换算" style="width:100%" />
          </div>
          <div class="field">
            <label>单位</label>
            <el-select v-model="commonForm.from" style="width:100%" popper-class="dark-tool-popper">
              <el-option v-for="u in Object.keys(COMMON_UNIT_LABEL)" :key="u" :value="u" :label="COMMON_UNIT_LABEL[u as CommonUnit]" />
            </el-select>
          </div>
          <div class="left-hint" v-if="commonForm.value === null">
            <Icon name="info" :size="14" /> 输入数值后，右侧自动显示全部单位换算结果
          </div>
        </div>

        <div class="split-divider"></div>

        <div class="split-right">
          <div class="pane-title">
            <Icon name="layers" :size="14" /> 换算结果
            <span class="au-sub" v-if="commonForm.value !== null">{{ fmtResult(commonForm.value) }} {{ COMMON_UNIT_LABEL[commonForm.from] }} 时</span>
          </div>
          <template v-if="commonAll.length">
            <div
              v-for="a in commonAll"
              :key="a.unit"
              :class="['result-row', { src: a.unit === commonForm.from }]"
            >
              <span class="rr-unit">{{ a.label }}<template v-if="a.unit === commonForm.from"> · 输入</template></span>
              <span class="rr-val">{{ fmtResult(a.value) }}</span>
            </div>
          </template>
          <div class="left-hint" v-else>
            <Icon name="info" :size="14" /> 等待输入…
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Tab2 VOCs ===== -->
    <div v-else class="card">
      <!-- 点选面板：气体选择 + 换算基准 -->
      <div class="seg-panel">
        <div class="seg-cell">
          <span class="seg-label">VOCs 气体</span>
          <div class="seg-group">
            <button
              v-for="(g, i) in VOC_GASES"
              :key="g.name"
              :class="['seg-btn', { active: vocForm.gasIdx === i }]"
              @click="vocForm.gasIdx = i"
            >{{ g.name }}</button>
          </div>
        </div>
        <div class="seg-cell">
          <span class="seg-label">换算基准</span>
          <div class="seg-group">
            <button :class="['seg-btn', { active: vocForm.temp === '25C' }]" @click="vocForm.temp = '25C'">25℃ 参比</button>
            <button :class="['seg-btn', { active: vocForm.temp === '0C' }]" @click="vocForm.temp = '0C'">0℃ 标况</button>
          </div>
        </div>
      </div>

      <div class="thc-tip" v-if="currentVocGas.name === '总烃'">
        总烃为混合物，无确定分子式——不支持 ppm / mg/m³，仅支持以碳计与以甲烷计单位互转（比值 16.043 / 12.011）
      </div>

      <!-- 左：输入区 / 右：换算结果区 -->
      <div class="split-layout">
        <div class="split-left">
          <div class="pane-title"><Icon name="beaker" :size="14" /> 输入</div>
          <div class="field val-field">
            <label>输入数值</label>
            <el-input-number v-model="vocForm.value" :controls="false" placeholder="输入后自动换算" style="width:100%" />
          </div>
          <div class="field">
            <label>单位</label>
            <el-select v-model="vocForm.from" style="width:100%" popper-class="dark-tool-popper">
              <el-option v-for="u in Object.keys(VOC_UNIT_LABEL)" :key="u" :value="u" :label="VOC_UNIT_LABEL[u as VocUnit]" :disabled="!vocUnitAvailable(currentVocGas, u as VocUnit)" />
            </el-select>
            <div v-if="vocFromInvalid" class="field-err">总烃不支持该单位，请选碳计/甲烷计</div>
          </div>
          <div class="left-hint" v-if="vocForm.value === null">
            <Icon name="info" :size="14" /> 输入数值后，右侧自动显示全部单位换算结果
          </div>
        </div>

        <div class="split-divider"></div>

        <div class="split-right">
          <div class="pane-title">
            <Icon name="layers" :size="14" /> 换算结果
            <span class="au-sub" v-if="vocForm.value !== null && !vocFromInvalid">{{ fmtResult(vocForm.value) }} {{ VOC_UNIT_LABEL[vocForm.from] }} 时</span>
          </div>
          <template v-if="vocAll.length">
            <div
              v-for="a in vocAll"
              :key="a.unit"
              :class="['result-row', { src: a.unit === vocForm.from }]"
            >
              <span class="rr-unit">{{ a.label }}<template v-if="a.unit === vocForm.from"> · 输入</template></span>
              <span class="rr-val">{{ fmtResult(a.value) }}</span>
            </div>
          </template>
          <div class="left-hint" v-else>
            <Icon name="info" :size="14" /> 等待输入…
          </div>
        </div>
      </div>
    </div>

    <!-- 公式说明（默认折叠） -->
    <div class="card formula-card">
      <div class="fc-title" @click="showFormula = !showFormula">
        <Icon name="question" :size="16" /> 换算公式说明
        <span class="fc-toggle">{{ showFormula ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showFormula" class="fc-body">
        <div class="f-line">mg/m³ = ppm × M / Vm　（Vm：25℃ 取 24.45，0℃ 取 22.414 L/mol）</div>
        <div class="f-line">ppm = mg/m³ × Vm / M</div>
        <div class="f-line">1% = 10⁴ ppm；1 ppm = 1000 ppb；1 μmol/mol = 1 ppm</div>
        <div class="f-line">ppm(C) = ppm × nC（碳原子数）；mg/m³(C) = mg/m³ × nC × 12.011 / M</div>
        <div class="f-line">甲烷计（等效甲烷）：mg/m³(CH₄) = mg/m³(C) × 16.043 / 12.011</div>
        <div class="f-line note">总烃无确定分子式，仅支持碳计 ↔ 甲烷计互转（比值恒为 16.043 / 12.011）</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ================= 暗色仪表盘主题（与烟尘采样模型统一） ================= */
.uc-tool {
  --d-bg: #0f1419;
  --d-panel: #161d26;
  --d-panel2: #1c2530;
  --d-line: #2a3644;
  --d-txt: #e8edf2;
  --d-muted: #8b9bab;
  --d-dim: #54626f;
  --d-accent: #4fc3f7;
  --d-accent2: #66d9a8;
  --d-warn: #ffb454;
  --d-err: #ff6b6b;
  display: flex; flex-direction: column; gap: 16px;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* Tab 切换 */
.tab-bar { display: flex; gap: 8px; }
.tab-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 12px 16px; border-radius: 12px; border: 1px solid var(--d-line);
  background: var(--d-panel); color: var(--d-muted); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.tab-btn:hover { color: var(--d-accent); border-color: var(--d-accent); }
.tab-btn.active {
  background: rgba(79, 195, 247, 0.1);
  color: var(--d-accent); border-color: var(--d-accent);
}

.card {
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28);
  color: var(--d-txt);
}

.gas-picker { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 4px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.grow { flex: 1; min-width: 220px; }
.field label { font-size: 12.5px; color: var(--d-muted); font-weight: 500; }
.field-err { font-size: 11px; color: var(--d-err); }
.au-sub { font-size: 11.5px; font-weight: 400; color: var(--d-dim); }
.opt-hint { float: right; font-size: 11px; color: var(--d-muted); margin-left: 10px; font-family: Consolas, monospace; }

/* 点选面板 */
.seg-panel { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.seg-cell { display: flex; flex-direction: column; gap: 6px; }
.seg-label { font-size: 11px; color: var(--d-dim); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; }
.seg-group { display: flex; flex-wrap: wrap; gap: 8px; }
.seg-btn {
  padding: 7px 14px; border-radius: 9px; border: 1px solid var(--d-line);
  background: var(--d-panel2); color: var(--d-muted);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; line-height: 1.4; font-family: inherit;
}
.seg-btn:hover { border-color: var(--d-accent); color: var(--d-accent); }
.seg-btn.active {
  background: rgba(79, 195, 247, 0.12);
  color: var(--d-accent); border-color: var(--d-accent);
}

.m-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: rgba(79, 195, 247, 0.06); border: 1px dashed rgba(79, 195, 247, 0.28);
  border-radius: 9px;
  padding: 9px 14px; font-size: 12.5px; color: var(--d-muted); margin-bottom: 16px;
}
.m-bar b { color: var(--d-accent); font-size: 14px; margin: 0 2px; }

/* 左右分区 */
.split-layout {
  display: grid; grid-template-columns: minmax(260px, 340px) 1px 1fr;
  gap: 0 22px; align-items: stretch; margin-top: 6px;
}
.split-left { display: flex; flex-direction: column; gap: 12px; }
.split-right { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.split-divider { background: var(--d-line); }
.pane-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 600; color: var(--d-accent);
  letter-spacing: 0.6px; text-transform: uppercase;
  padding: 6px 10px; background: rgba(79, 195, 247, 0.06);
  border-radius: 8px; margin-bottom: 4px; flex-wrap: wrap;
}
.pane-title .au-sub { margin-left: auto; }
.left-hint {
  margin-top: 4px; padding: 12px; border-radius: 10px;
  border: 1px dashed var(--d-line); color: var(--d-dim); font-size: 12px;
  display: flex; align-items: center; gap: 8px;
}

/* 结果行 */
.result-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
  background: var(--d-panel); border: 1px solid var(--d-line);
  border-left: 2px solid transparent;
  border-radius: 10px; padding: 10px 16px; transition: all 0.15s;
}
.result-row:hover { border-color: rgba(79, 195, 247, 0.45); }
.result-row.src { background: rgba(79, 195, 247, 0.08); border-color: rgba(79, 195, 247, 0.4); }
.rr-unit {
  font-size: 12.5px; font-weight: 600; color: var(--d-txt);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
}
.result-row.src .rr-unit { color: var(--d-accent); }
.rr-val {
  font-size: 16.5px; font-weight: 700; color: var(--d-txt);
  font-family: Consolas, Monaco, monospace; word-break: break-all; text-align: right;
  font-variant-numeric: tabular-nums;
}
.result-row.src .rr-val { color: var(--d-accent); }

.thc-tip {
  background: rgba(255, 180, 84, 0.07); border: 1px dashed rgba(255, 180, 84, 0.35);
  border-radius: 9px; padding: 9px 13px; font-size: 12.5px;
  color: var(--d-warn); line-height: 1.7; margin-bottom: 14px;
}

.formula-card { padding: 16px 22px; }
.fc-title {
  font-size: 14px; font-weight: 600; color: var(--d-txt); display: flex; align-items: center; gap: 7px;
  cursor: pointer; user-select: none;
}
.fc-title:hover { color: var(--d-accent); }
.fc-toggle { font-size: 11.5px; color: var(--d-dim); font-weight: 400; margin-left: auto; }
.fc-body { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.f-line {
  font-family: Consolas, Monaco, monospace; font-size: 12.5px; color: var(--d-muted);
  background: var(--d-panel2); border-left: 2px solid var(--d-accent);
  border-radius: 8px; padding: 8px 12px;
}
.f-line.note { color: var(--d-warn); background: rgba(255, 180, 84, 0.06); border-left-color: var(--d-warn); }

/* ===== Element Plus 控件暗色覆盖 ===== */
.uc-tool :deep(.el-input__wrapper),
.uc-tool :deep(.el-select__wrapper) {
  background: var(--d-bg);
  box-shadow: 0 0 0 1px var(--d-line) inset;
  border-radius: 9px;
}
.uc-tool :deep(.el-input__wrapper.is-focus),
.uc-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--d-accent) inset, 0 0 0 3px rgba(79, 195, 247, 0.12);
}
.uc-tool :deep(.el-input__inner),
.uc-tool :deep(.el-select__placeholder),
.uc-tool :deep(.el-select__selected-item) {
  color: var(--d-txt);
}
.uc-tool :deep(.el-input__inner) {
  font-size: 19px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.uc-tool :deep(.el-input__inner::placeholder),
.uc-tool :deep(.el-select__placeholder.is-transparent) {
  color: #3f4b59; font-weight: 400; font-size: 13px;
}
.uc-tool :deep(.el-button) { border-radius: 9px; }

@media (max-width: 640px) {
  .card { padding: 16px 13px; }
  .split-layout { grid-template-columns: 1fr; gap: 14px; }
  .split-divider { height: 1px; width: 100%; }
  .rr-val { font-size: 15px; }
  .seg-cell:has(.seg-group .seg-btn:nth-child(3)) .seg-group { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .seg-cell:not(:has(.seg-group .seg-btn:nth-child(3))) .seg-group { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .seg-btn { padding: 8px 6px; text-align: center; font-size: 12px; }
}
</style>
