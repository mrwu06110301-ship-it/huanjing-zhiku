<script setup lang="ts">
/**
 * UnitConverterCalculator.vue — 单位换算
 * Tab1 常用气体换算：ppm / mg/m³ / μmol/mol / % / ppb 互转（气体下拉+自定义分子式自动算 M）
 * Tab2 VOCs 换算：ppm / mg/m³ / ppm(C) / mg/m³(C) / ppm(CH4) / mg/m³(CH4)（总烃仅碳计/甲烷计）
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  COMMON_GASES, COMMON_UNIT_LABEL, convertCommonSafe, parseMolarMass,
  VOC_GASES, VOC_UNIT_LABEL, convertVoc, vocUnitAvailable,
  type CommonUnit, type GasDef, type VocGasDef, type VocUnit,
} from "@/utils/unit-gas-conversion";

const activeTab = ref<"common" | "voc">("common");

// ==================== Tab1 常用气体 ====================
const commonForm = reactive({
  gasIdx: 3, // 默认一氧化碳
  customFormula: "",   // 自定义分子式（非空时优先生效）
  value: null as number | null,
  from: "ppm" as CommonUnit,
  to: "mgm3" as CommonUnit,
  temp: "25C" as "25C" | "0C",
});
const commonResult = ref<number | null>(null);
const commonUnits = Object.keys(COMMON_UNIT_LABEL) as CommonUnit[];

const currentGas = computed<GasDef | null>(() => {
  if (commonForm.customFormula.trim()) {
    const m = parseMolarMass(commonForm.customFormula.trim());
    if (m === null) return null;
    return { name: "自定义", formula: commonForm.customFormula.trim().toUpperCase(), molarMass: Math.round(m * 1000) / 1000 };
  }
  return COMMON_GASES[commonForm.gasIdx] || null;
});

// 切换气体/分子式/温度后自动重算
watch([() => commonForm.gasIdx, () => commonForm.customFormula, () => commonForm.temp], () => {
  if (commonResult.value !== null) calcCommon();
});

function swapCommon() {
  const t = commonForm.from;
  commonForm.from = commonForm.to;
  commonForm.to = t;
  if (commonResult.value !== null) calcCommon();
}

function calcCommon() {
  const gas = currentGas.value;
  if (!gas) {
    ElMessage.warning("自定义分子式无法解析，请检查（如 SO2、C6H6、Ca(OH)2）");
    commonResult.value = null;
    return;
  }
  if (commonForm.value === null || commonForm.value === 0 && commonForm.from === "pct") {
    // 0 也允许换算
  }
  if (commonForm.value === null) {
    ElMessage.warning("请输入数值");
    commonResult.value = null;
    return;
  }
  if (commonForm.from === commonForm.to) {
    commonResult.value = commonForm.value;
    return;
  }
  commonResult.value = convertCommonSafe({
    value: commonForm.value,
    from: commonForm.from,
    to: commonForm.to,
    molarMass: gas.molarMass,
    temp: commonForm.temp,
  });
}

function fmtResult(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 10000) return v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1) return String(Number(v.toFixed(4)));
  if (Math.abs(v) >= 0.0001) return String(Number(v.toFixed(6)));
  return v.toExponential(4);
}

/** 全单位一览（当前气体当前值） */
const commonAll = computed(() => {
  const gas = currentGas.value;
  if (!gas || commonForm.value === null) return [];
  return commonUnits.map((u) => ({
    unit: u,
    label: COMMON_UNIT_LABEL[u],
    value: fmtResult(convertCommonSafe({
      value: commonForm.value!, from: commonForm.from, to: u,
      molarMass: gas.molarMass, temp: commonForm.temp,
    })),
  }));
});

// ==================== Tab2 VOCs ====================
const vocForm = reactive({
  gasIdx: 3, // 默认二甲苯... 修正：0=甲烷 1=丙烷 2=苯 3=甲苯
  value: null as number | null,
  from: "ppm" as VocUnit,
  to: "mgm3" as VocUnit,
  temp: "25C" as "25C" | "0C",
});
const vocResult = ref<number | null>(null);
const vocUnits = Object.keys(VOC_UNIT_LABEL) as VocUnit[];

const currentVocGas = computed<VocGasDef>(() => VOC_GASES[vocForm.gasIdx]);

// 切换气体时：若当前单位对总烃不可用，重置为碳计
watch(() => vocForm.gasIdx, () => {
  const g = currentVocGas.value;
  if (!vocUnitAvailable(g, vocForm.from)) vocForm.from = "ppmC";
  if (!vocUnitAvailable(g, vocForm.to)) vocForm.to = "mgm3C";
  if (vocResult.value !== null) calcVoc();
});
watch(() => vocForm.temp, () => { if (vocResult.value !== null) calcVoc(); });

function swapVoc() {
  const t = vocForm.from;
  vocForm.from = vocForm.to;
  vocForm.to = t;
  if (vocResult.value !== null) calcVoc();
}

function calcVoc() {
  const gas = currentVocGas.value;
  if (commonForm.value === null && vocForm.value === null) { /* noop */ }
  if (vocForm.value === null) {
    ElMessage.warning("请输入数值");
    vocResult.value = null;
    return;
  }
  if (!vocUnitAvailable(gas, vocForm.from)) {
    ElMessage.warning("总烃无确定分子式，不支持 ppm / mg/m³，请使用碳计或甲烷计单位");
    vocResult.value = null;
    return;
  }
  if (vocForm.from === vocForm.to) {
    vocResult.value = vocForm.value;
    return;
  }
  const r = convertVoc({ value: vocForm.value, from: vocForm.from, to: vocForm.to, gas, temp: vocForm.temp });
  if (r === null) {
    ElMessage.warning("该气体不支持此单位组合");
    vocResult.value = null;
    return;
  }
  vocResult.value = r;
}

const vocAll = computed(() => {
  const gas = currentVocGas.value;
  if (vocForm.value === null) return [];
  return vocUnits
    .filter((u) => vocUnitAvailable(gas, u))
    .map((u) => ({
      unit: u,
      label: VOC_UNIT_LABEL[u],
      value: fmtResult(convertVoc({ value: vocForm.value!, from: vocForm.from, to: u, gas, temp: vocForm.temp })),
    }));
});
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
      <div class="gas-picker">
        <div class="field grow">
          <label>常用气体（下拉选择）</label>
          <el-select v-model="commonForm.gasIdx" style="width: 100%">
            <el-option v-for="(g, i) in COMMON_GASES" :key="g.name + i" :value="i" :label="`${g.name}（${g.formula}）`">
              <span>{{ g.name }}</span>
              <span class="opt-hint">{{ g.formula }} · M={{ g.molarMass }}</span>
            </el-option>
          </el-select>
        </div>
        <div class="field grow">
          <label>或输入其他分子式（自动计算摩尔质量）</label>
          <el-input v-model="commonForm.customFormula" placeholder="如 C3H8、CH2O、Ca(OH)2" clearable />
        </div>
        <div class="field">
          <label>状态</label>
          <el-radio-group v-model="commonForm.temp">
            <el-radio-button value="25C">25℃ 参比</el-radio-button>
            <el-radio-button value="0C">0℃ 标况</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <div v-if="currentGas" class="m-bar">
        <Icon name="info" :size="14" />
        {{ currentGas.formula }} 摩尔质量 M = <b>{{ currentGas.molarMass }}</b> g/mol
        <template v-if="commonForm.temp === '25C'">· 摩尔体积 24.45 L/mol</template>
        <template v-else>· 摩尔体积 22.414 L/mol</template>
      </div>

      <div class="convert-row">
        <div class="field">
          <label>数值</label>
          <el-input-number v-model="commonForm.value" :controls="false" placeholder="输入数值" style="width:100%" @change="calcCommon" />
        </div>
        <div class="field">
          <label>原单位</label>
          <el-select v-model="commonForm.from" style="width:100%" @change="calcCommon">
            <el-option v-for="u in commonUnits" :key="u" :value="u" :label="COMMON_UNIT_LABEL[u]" />
          </el-select>
        </div>
        <button class="swap-btn" @click="swapCommon" title="交换单位"><Icon name="refresh" :size="16" /></button>
        <div class="field">
          <label>目标单位</label>
          <el-select v-model="commonForm.to" style="width:100%" @change="calcCommon">
            <el-option v-for="u in commonUnits" :key="u" :value="u" :label="COMMON_UNIT_LABEL[u]" />
          </el-select>
        </div>
        <el-button type="primary" @click="calcCommon">
          <Icon name="calculator" :size="15" style="margin-right:5px" /> 换算
        </el-button>
      </div>

      <div v-if="commonResult !== null" class="result-banner">
        <div class="rb-main">
          {{ fmtResult(commonForm.value) }} {{ COMMON_UNIT_LABEL[commonForm.from] }}
          <Icon name="arrowRight" :size="18" class="rb-arrow" />
          <b>{{ fmtResult(commonResult) }}</b> {{ COMMON_UNIT_LABEL[commonForm.to] }}
        </div>
      </div>

      <div v-if="commonAll.length" class="all-units">
        <div class="au-title">全部单位对照</div>
        <div class="au-grid">
          <div v-for="a in commonAll" :key="a.unit" :class="['au-cell', { hot: a.unit === commonForm.to }]">
            <span class="au-val">{{ a.value }}</span>
            <span class="au-unit">{{ a.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Tab2 VOCs ===== -->
    <div v-else class="card">
      <div class="gas-picker">
        <div class="field grow">
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
        <div class="field">
          <label>状态</label>
          <el-radio-group v-model="vocForm.temp">
            <el-radio-button value="25C">25℃ 参比</el-radio-button>
            <el-radio-button value="0C">0℃ 标况</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <el-alert v-if="currentVocGas.name === '总烃'" type="warning" :closable="false" show-icon class="thc-tip">
        总烃为混合物，无确定分子式——不支持 ppm / mg/m³，仅支持以碳计与以甲烷计单位互转（比值 16.043 / 12.011）
      </el-alert>

      <div class="convert-row">
        <div class="field">
          <label>数值</label>
          <el-input-number v-model="vocForm.value" :controls="false" placeholder="输入数值" style="width:100%" @change="calcVoc" />
        </div>
        <div class="field">
          <label>原单位</label>
          <el-select v-model="vocForm.from" style="width:100%" @change="calcVoc">
            <el-option v-for="u in vocUnits" :key="u" :value="u" :label="VOC_UNIT_LABEL[u]" :disabled="!vocUnitAvailable(currentVocGas, u)" />
          </el-select>
        </div>
        <button class="swap-btn" @click="swapVoc" title="交换单位"><Icon name="refresh" :size="16" /></button>
        <div class="field">
          <label>目标单位</label>
          <el-select v-model="vocForm.to" style="width:100%" @change="calcVoc">
            <el-option v-for="u in vocUnits" :key="u" :value="u" :label="VOC_UNIT_LABEL[u]" :disabled="!vocUnitAvailable(currentVocGas, u)" />
          </el-select>
        </div>
        <el-button type="primary" @click="calcVoc">
          <Icon name="calculator" :size="15" style="margin-right:5px" /> 换算
        </el-button>
      </div>

      <div v-if="vocResult !== null" class="result-banner">
        <div class="rb-main">
          {{ fmtResult(vocForm.value) }} {{ VOC_UNIT_LABEL[vocForm.from] }}
          <Icon name="arrowRight" :size="18" class="rb-arrow" />
          <b>{{ fmtResult(vocResult) }}</b> {{ VOC_UNIT_LABEL[vocForm.to] }}
        </div>
      </div>

      <div v-if="vocAll.length" class="all-units">
        <div class="au-title">可用单位对照<template v-if="currentVocGas.name === '总烃'">（ppm / mg/m³ 不适用）</template></div>
        <div class="au-grid">
          <div v-for="a in vocAll" :key="a.unit" :class="['au-cell', { hot: a.unit === vocForm.to }]">
            <span class="au-val">{{ a.value }}</span>
            <span class="au-unit">{{ a.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 公式说明 -->
    <div class="card formula-card">
      <div class="fc-title"><Icon name="question" :size="16" /> 换算公式</div>
      <div class="fc-body">
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

.gas-picker { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.grow { flex: 1; min-width: 220px; }
.field label { font-size: 13px; color: var(--text-light); font-weight: 500; }
.opt-hint { float: right; font-size: 11px; color: var(--text-light); margin-left: 10px; font-family: Consolas, monospace; }

.m-bar {
  display: flex; align-items: center; gap: 6px;
  background: rgba(37, 99, 235, 0.06); border-radius: 12px;
  padding: 9px 14px; font-size: 13px; color: var(--text-light); margin-bottom: 16px;
}
.m-bar b { color: var(--primary); font-size: 14.5px; margin: 0 2px; }

.convert-row {
  display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
}
.convert-row .field { flex: 1; min-width: 130px; }
.swap-btn {
  width: 40px; height: 32px; border-radius: 12px; border: 1px solid var(--border-light);
  background: var(--white); color: var(--text-light); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: all 0.25s var(--ease); margin-bottom: 1px;
}
.swap-btn:hover { color: var(--primary); border-color: var(--primary); transform: rotate(180deg); }

.result-banner {
  margin-top: 18px; border-radius: 14px; padding: 16px 20px;
  background: rgba(37, 99, 235, 0.06); border: 1px solid rgba(37, 99, 235, 0.22);
}
.rb-main { font-size: 15px; color: var(--text); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rb-main b { font-size: 26px; font-weight: 800; color: var(--primary); }
.rb-arrow { color: var(--primary); }

.all-units { margin-top: 16px; }
.au-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 10px; }
.au-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.au-cell {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 12px; padding: 10px 12px; text-align: center;
  display: flex; flex-direction: column; gap: 3px; transition: all 0.2s var(--ease);
}
.au-cell.hot { background: rgba(37, 99, 235, 0.1); border-color: rgba(37, 99, 235, 0.35); }
.au-val { font-size: 15px; font-weight: 700; color: var(--text); word-break: break-all; }
.au-cell.hot .au-val { color: var(--primary); }
.au-unit { font-size: 11.5px; color: var(--text-light); }

.thc-tip { margin-bottom: 14px; }

.formula-card { padding: 18px 24px; }
.fc-title { font-size: 14.5px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
.fc-body { display: flex; flex-direction: column; gap: 6px; }
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
  .convert-row .field { min-width: calc(50% - 10px); }
  .convert-row { justify-content: space-between; }
  .au-grid { grid-template-columns: 1fr 1fr; }
  .rb-main b { font-size: 22px; }
}
</style>
