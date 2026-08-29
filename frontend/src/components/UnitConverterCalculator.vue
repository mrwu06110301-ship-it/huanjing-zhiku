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
  to: "mgm3" as CommonUnit,
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
  const t = commonForm.from;
  commonForm.from = commonForm.to;
  commonForm.to = t;
}

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
  to: "mgm3" as VocUnit,
  temp: "25C" as "25C" | "0C",
});

const currentVocGas = computed<VocGasDef>(() => VOC_GASES[vocForm.gasIdx]);
const vocFromInvalid = computed(() => !vocUnitAvailable(currentVocGas.value, vocForm.from));

function swapVoc() {
  const t = vocForm.from;
  vocForm.from = vocForm.to;
  vocForm.to = t;
}

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
      <!-- 气体选择：二选一 -->
      <div class="mode-row">
        <el-radio-group v-model="commonForm.gasMode">
          <el-radio-button value="preset">下拉选择气体</el-radio-button>
          <el-radio-button value="custom">输入其他分子式</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="commonForm.temp">
          <el-radio-button value="25C">25℃ 参比</el-radio-button>
          <el-radio-button value="0C">0℃ 标况</el-radio-button>
        </el-radio-group>
      </div>

      <div class="gas-picker">
        <div v-if="commonForm.gasMode === 'preset'" class="field grow">
          <label>常用气体</label>
          <el-select v-model="commonForm.gasIdx" style="width: 100%">
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

      <!-- 输入即换算 -->
      <div class="convert-row">
        <div class="field val-field">
          <label>输入数值</label>
          <el-input-number v-model="commonForm.value" :controls="false" placeholder="输入后自动换算" style="width:100%" />
        </div>
        <div class="field">
          <label>原单位</label>
          <el-select v-model="commonForm.from" style="width:100%">
            <el-option v-for="u in Object.keys(COMMON_UNIT_LABEL)" :key="u" :value="u" :label="COMMON_UNIT_LABEL[u as CommonUnit]" />
          </el-select>
        </div>
        <button class="swap-btn" @click="swapCommon" title="交换单位"><Icon name="refresh" :size="16" /></button>
        <div class="field">
          <label>目标单位（高亮）</label>
          <el-select v-model="commonForm.to" style="width:100%">
            <el-option v-for="u in Object.keys(COMMON_UNIT_LABEL)" :key="u" :value="u" :label="COMMON_UNIT_LABEL[u as CommonUnit]" />
          </el-select>
        </div>
      </div>

      <div v-if="commonForm.value === null" class="empty-hint">
        <Icon name="info" :size="15" /> 输入数值后，全部单位换算结果自动显示
      </div>

      <div v-if="commonAll.length" class="all-units">
        <div class="au-title">
          全单位换算结果
          <span class="au-sub">{{ fmtResult(commonForm.value) }} {{ COMMON_UNIT_LABEL[commonForm.from] }} 时</span>
        </div>
        <div class="au-grid">
          <div v-for="a in commonAll" :key="a.unit" :class="['au-cell', { hot: a.unit === commonForm.to, src: a.unit === commonForm.from }]">
            <span class="au-val">{{ fmtResult(a.value) }}</span>
            <span class="au-unit">{{ a.label }}<template v-if="a.unit === commonForm.from"> ·输入</template><template v-if="a.unit === commonForm.to"> ·目标</template></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Tab2 VOCs ===== -->
    <div v-else class="card">
      <div class="mode-row">
        <div class="field grow" style="max-width:320px">
          <label>VOCs 气体</label>
          <el-select v-model="vocForm.gasIdx" style="width: 100%">
            <el-option v-for="(g, i) in VOC_GASES" :key="g.name" :value="i" :label="`${g.name}（${g.formula}）`">
              <span>{{ g.name }}</span>
              <span class="opt-hint">
                {{ g.formula }}<template v-if="g.carbonCount"> · nC={{ g.carbonCount }}</template><template v-if="g.molarMass"> · M={{ g.molarMass }}</template>
              </span>
            </el-option>
          </el-select>
        </div>
        <el-radio-group v-model="vocForm.temp">
          <el-radio-button value="25C">25℃ 参比</el-radio-button>
          <el-radio-button value="0C">0℃ 标况</el-radio-button>
        </el-radio-group>
      </div>

      <el-alert v-if="currentVocGas.name === '总烃'" type="warning" :closable="false" show-icon class="thc-tip">
        总烃为混合物，无确定分子式——不支持 ppm / mg/m³，仅支持以碳计与以甲烷计单位互转（比值 16.043 / 12.011）
      </el-alert>

      <div class="convert-row">
        <div class="field val-field">
          <label>输入数值</label>
          <el-input-number v-model="vocForm.value" :controls="false" placeholder="输入后自动换算" style="width:100%" />
        </div>
        <div class="field">
          <label>原单位</label>
          <el-select v-model="vocForm.from" style="width:100%">
            <el-option v-for="u in Object.keys(VOC_UNIT_LABEL)" :key="u" :value="u" :label="VOC_UNIT_LABEL[u as VocUnit]" :disabled="!vocUnitAvailable(currentVocGas, u as VocUnit)" />
          </el-select>
          <div v-if="vocFromInvalid" class="field-err">总烃不支持该单位，请选碳计/甲烷计</div>
        </div>
        <button class="swap-btn" @click="swapVoc" title="交换单位"><Icon name="refresh" :size="16" /></button>
        <div class="field">
          <label>目标单位（高亮）</label>
          <el-select v-model="vocForm.to" style="width:100%">
            <el-option v-for="u in Object.keys(VOC_UNIT_LABEL)" :key="u" :value="u" :label="VOC_UNIT_LABEL[u as VocUnit]" :disabled="!vocUnitAvailable(currentVocGas, u as VocUnit)" />
          </el-select>
        </div>
      </div>

      <div v-if="vocForm.value === null" class="empty-hint">
        <Icon name="info" :size="15" /> 输入数值后，全部可用单位换算结果自动显示
      </div>

      <div v-if="vocAll.length" class="all-units">
        <div class="au-title">
          可用单位换算结果<template v-if="currentVocGas.name === '总烃'">（ppm / mg/m³ 不适用）</template>
          <span class="au-sub">{{ fmtResult(vocForm.value) }} {{ VOC_UNIT_LABEL[vocForm.from] }} 时</span>
        </div>
        <div class="au-grid">
          <div v-for="a in vocAll" :key="a.unit" :class="['au-cell', { hot: a.unit === vocForm.to, src: a.unit === vocForm.from }]">
            <span class="au-val">{{ fmtResult(a.value) }}</span>
            <span class="au-unit">{{ a.label }}<template v-if="a.unit === vocForm.from"> ·输入</template><template v-if="a.unit === vocForm.to"> ·目标</template></span>
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
.uc-tool { display: flex; flex-direction: column; gap: 18px; }

.tab-bar { display: flex; gap: 10px; }
.tab-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 12px 16px; border-radius: 14px; border: 1px solid var(--border-light);
  background: var(--white); color: var(--text-light); font-size: 14.5px; font-weight: 600;
  cursor: pointer; transition: all 0.25s var(--ease); box-shadow: var(--shadow);
}
.tab-btn:hover { color: var(--primary); border-color: var(--primary); }
.tab-btn.active {
  background: var(--gradient-primary, linear-gradient(135deg, #2563eb, #06b6d4));
  color: #fff; border-color: transparent;
}

.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}

.mode-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.gas-picker { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 4px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.grow { flex: 1; min-width: 220px; }
.field label { font-size: 13px; color: var(--text-light); font-weight: 500; }
.field-err { font-size: 11.5px; color: #ef4444; }
.opt-hint { float: right; font-size: 11px; color: var(--text-light); margin-left: 10px; font-family: Consolas, monospace; }

.m-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: rgba(37, 99, 235, 0.06); border-radius: 12px;
  padding: 9px 14px; font-size: 13px; color: var(--text-light); margin-bottom: 16px;
}
.m-bar b { color: var(--primary); font-size: 14.5px; margin: 0 2px; }

.convert-row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.convert-row .field { flex: 1; min-width: 130px; }
.convert-row .val-field { flex: 1.3; min-width: 160px; }
.swap-btn {
  width: 40px; height: 32px; border-radius: 12px; border: 1px solid var(--border-light);
  background: var(--white); color: var(--text-light); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: all 0.25s var(--ease); margin-top: 27px;
}
.swap-btn:hover { color: var(--primary); border-color: var(--primary); transform: rotate(180deg); }

.empty-hint {
  margin-top: 14px; padding: 14px; border-radius: 12px;
  border: 1.5px dashed var(--border-light); color: var(--text-light); font-size: 13px;
  display: flex; align-items: center; gap: 8px;
}

.all-units { margin-top: 18px; }
.au-title { font-size: 13.5px; font-weight: 700; color: var(--text); margin-bottom: 10px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.au-sub { font-size: 12px; font-weight: 400; color: var(--text-light); }
.au-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.au-cell {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 12px 14px; text-align: center;
  display: flex; flex-direction: column; gap: 5px; transition: all 0.2s var(--ease);
}
.au-cell.src { border-color: rgba(6, 182, 212, 0.45); background: rgba(6, 182, 212, 0.06); }
.au-cell.hot { background: rgba(37, 99, 235, 0.1); border-color: rgba(37, 99, 235, 0.4); }
.au-val { font-size: 17px; font-weight: 800; color: var(--text); word-break: break-all; font-family: Consolas, Monaco, monospace; }
.au-cell.hot .au-val { color: var(--primary); font-size: 19px; }
.au-unit { font-size: 12px; color: var(--text-light); font-weight: 500; }

.thc-tip { margin-bottom: 14px; }

.formula-card { padding: 18px 24px; }
.fc-title {
  font-size: 14.5px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 7px;
  cursor: pointer; user-select: none;
}
.fc-title:hover { color: var(--primary); }
.fc-toggle { font-size: 12px; color: var(--text-light); font-weight: 400; margin-left: auto; }
.fc-body { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.f-line {
  font-family: Consolas, Monaco, monospace; font-size: 13px; color: var(--text-light);
  background: var(--bg-soft, #f6f8fa); border-radius: 8px; padding: 7px 12px;
}
.f-line.note { color: #92400e; background: rgba(217, 119, 6, 0.07); }

/* 丝滑输入 */
.uc-tool :deep(.el-input__wrapper),
.uc-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.uc-tool :deep(.el-input__wrapper.is-focus),
.uc-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.uc-tool :deep(.el-button) { border-radius: 12px; }
.uc-tool :deep(.el-radio-button:first-child .el-radio-button__inner) { border-radius: 12px 0 0 12px; }
.uc-tool :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: 0 12px 12px 0; }

@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .mode-row { flex-direction: column; align-items: stretch; }
  .convert-row .field { min-width: calc(50% - 10px); }
  .convert-row .val-field { min-width: 100%; }
  .swap-btn { margin-top: 0; align-self: center; }
  .au-grid { grid-template-columns: 1fr 1fr; }
  .mode-row :deep(.el-radio-group) { width: 100%; display: flex; }
  .mode-row :deep(.el-radio-button) { flex: 1; }
}
</style>
