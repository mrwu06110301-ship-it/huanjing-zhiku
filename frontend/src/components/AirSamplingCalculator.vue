<script setup lang="ts">
/**
 * AirSamplingCalculator.vue — 大气采样模型
 * 卡片一：流量换算（自动计算；左输入/右结果 + 右侧现场条件隔离区）
 * 卡片二：采样体积换算（左侧输入 / 右侧结果上下排布，自动计算）
 * 卡片三：设备标况体积对比（独立隔离区，自动对比）
 * 卡片四：公式与流量体系说明
 * 依据 JJG 956-2013《大气采样器检定规程》、JJG 1169-2019《烟气采样器检定规程》
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  convertFlow, convertVolume, FLOW_LABEL,
  type FlowKind, type FlowSetting, type VolumeConvertResult,
} from "@/utils/atmospheric-sampling";

// ====================== 卡片一：流量换算（自动计算） ======================
const flowForm = reactive({
  Q: null as number | null,
  from: "inlet" as FlowKind,
  to: "normal" as FlowKind,
  temperature: 25.0 as number | null,
  pressure: 101.3 as number | null,
  gaugePressure: 0 as number | null,
});
const flowResult = ref<number | null>(null);
const flowFactor = ref<number | null>(null);

const flowKinds: { value: FlowKind; label: string; hint: string }[] = [
  { value: "inlet", label: "入口流量", hint: "环境温度、实测大气压" },
  { value: "normal", label: "标况流量", hint: "0℃、101.325 kPa" },
  { value: "reference", label: "参比流量", hint: "25℃、101.325 kPa" },
  { value: "scale", label: "刻度流量", hint: "20℃、实测大气压（扣计前负压）" },
];

const needGauge = computed(
  () => flowForm.from === "scale" || flowForm.to === "scale"
);
const gaugeInvalid = computed(
  () =>
    needGauge.value &&
    (flowForm.gaugePressure === null ||
      flowForm.pressure === null ||
      flowForm.pressure - flowForm.gaugePressure <= 0)
);

function calcFlow() {
  const f = flowForm;
  if (f.Q === null || f.temperature === null || f.pressure === null || gaugeInvalid.value) {
    flowResult.value = null;
    flowFactor.value = null;
    return;
  }
  const base = convertFlow({
    Q: 1, from: f.from, to: f.to, temperature: f.temperature,
    pressure: f.pressure, gaugePressure: f.gaugePressure ?? 0,
  });
  flowFactor.value = base;
  flowResult.value = f.from === f.to ? f.Q : base * f.Q;
}
watch(flowForm, calcFlow, { deep: true });

function swapFlow() {
  const t = flowForm.from;
  flowForm.from = flowForm.to;
  flowForm.to = t;
}

// ====================== 卡片二：体积换算（自动计算） ======================
const volForm = reactive({
  flowSetting: "inlet" as FlowSetting,
  accumulatedVolume: null as number | null,
  temperature: 25.0 as number | null,
  pressure: 101.3 as number | null,
  gaugePressure: 0 as number | null,
});
const volResult = ref<VolumeConvertResult | null>(null);

const volGaugeInvalid = computed(
  () =>
    volForm.flowSetting === "scale" &&
    (volForm.gaugePressure === null ||
      volForm.pressure === null ||
      volForm.pressure - volForm.gaugePressure <= 0)
);

function calcVolume() {
  const f = volForm;
  if (f.accumulatedVolume === null || f.temperature === null || f.pressure === null || volGaugeInvalid.value) {
    volResult.value = null;
    return;
  }
  volResult.value = convertVolume({
    flowSetting: f.flowSetting,
    accumulatedVolume: f.accumulatedVolume,
    temperature: f.temperature,
    pressure: f.pressure,
    gaugePressure: f.gaugePressure ?? 0,
  });
}
watch(volForm, calcVolume, { deep: true });

// ====================== 卡片三：设备标况体积对比（独立隔离区） ======================
const deviceNormalVolume = ref<number | null>(null);
const volDiff = computed(() => {
  if (deviceNormalVolume.value === null || deviceNormalVolume.value <= 0 || !volResult.value) return null;
  const calc = volResult.value.normalVolume;
  return {
    device: deviceNormalVolume.value,
    calc,
    diffPct: ((calc - deviceNormalVolume.value) / deviceNormalVolume.value) * 100,
  };
});
const diffOk = computed(() => volDiff.value !== null && Math.abs(volDiff.value.diffPct) <= 1);

// ====================== 示例数据 ======================
function loadDemo(demo: "inlet" | "scale") {
  if (demo === "inlet") {
    volForm.flowSetting = "inlet";
    volForm.accumulatedVolume = 3.28;
    volForm.temperature = 26.1;
    volForm.pressure = 100.91;
    volForm.gaugePressure = 0;
    deviceNormalVolume.value = 2.98;
  } else {
    volForm.flowSetting = "scale";
    volForm.accumulatedVolume = 2.9;
    volForm.temperature = 27.7;
    volForm.pressure = 100.93;
    volForm.gaugePressure = 16.45;
    deviceNormalVolume.value = 2.41;
  }
  ElMessage.success("已填入示例数据，结果自动换算");
}

// ====================== 计算说明（默认折叠） ======================
const showExplain = ref(false);

/** 随流量设置方式动态变化的规则提示 */
const settingRule = computed(() => {
  switch (volForm.flowSetting) {
    case "inlet":
      return "累计体积为入口流量体积（环境温度、实测大气压下），按 V标 = V入 × P/101.325 × 273.15/(T+273.15) 换算";
    case "normal":
      return "累计体积即为标况体积（0℃、101.325 kPa），V标 = 累计值，同时反推入口体积供校验";
    case "scale":
      return "累计体积为刻度流量体积（20℃、实测大气压扣计前负压），需先反推入口体积再换算标况";
  }
});
</script>

<template>
  <div class="as-tool">
    <!-- ===== 卡片一：流量换算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="trendUp" :size="17" /> 流量换算（入口 / 标况 / 参比 / 刻度）</h3>
      </div>

      <!-- 上：现场条件隔离区 -->
      <div class="env-panel">
        <div class="panel-title"><Icon name="info" :size="14" /> 现场条件</div>
        <div class="env-fields">
          <div class="field">
            <label>环境温度（℃）</label>
            <el-input-number v-model="flowForm.temperature" :min="-50" :max="60" :precision="1" :controls="false" placeholder="25.0" style="width:100%" />
          </div>
          <div class="field">
            <label>大气压（kPa）</label>
            <el-input-number v-model="flowForm.pressure" :min="30" :max="110" :precision="2" :controls="false" placeholder="101.3" style="width:100%" />
          </div>
          <div class="field" v-if="needGauge">
            <label>计前负压 Pf（kPa）</label>
            <el-input-number v-model="flowForm.gaugePressure" :min="0" :max="100" :precision="2" :controls="false" placeholder="16.45" style="width:100%" />
            <div v-if="gaugeInvalid" class="field-err">需满足：大气压 − Pf &gt; 0</div>
          </div>
        </div>
      </div>

      <!-- 下：换算主区（输入 ⇆ 结果） -->
      <div class="flow-main">
        <div class="convert-row">
          <div class="io-card">
            <label><span>输入流量</span><span class="unit">L/min</span></label>
            <div class="io-line">
              <el-input-number v-model="flowForm.Q" :min="0" :precision="1" :controls="false" placeholder="0.5" class="io-num" />
              <el-select v-model="flowForm.from" class="io-select">
                <el-option v-for="k in flowKinds" :key="k.value" :value="k.value" :label="k.label">
                  <span>{{ k.label }}</span>
                  <span class="opt-hint">{{ k.hint }}</span>
                </el-option>
              </el-select>
            </div>
          </div>

          <div class="swap-cell">
            <el-button circle plain @click="swapFlow" title="交换方向">
              <Icon name="refresh" :size="14" />
            </el-button>
          </div>

          <div class="io-card result-card">
            <label><span>换算结果</span><span class="unit">L/min</span></label>
            <div class="io-line">
              <div class="result-num">
                <template v-if="flowResult !== null">{{ flowResult.toFixed(2) }}</template>
                <span v-else>—</span>
              </div>
              <el-select v-model="flowForm.to" class="io-select">
                <el-option v-for="k in flowKinds" :key="k.value" :value="k.value" :label="k.label">
                  <span>{{ k.label }}</span>
                  <span class="opt-hint">{{ k.hint }}</span>
                </el-option>
              </el-select>
            </div>
          </div>
        </div>

        <div class="fr-factor" v-if="flowFactor !== null">
          换算系数（目标/已知）= {{ flowFactor.toFixed(5) }}
          <span v-if="needGauge" class="fr-note">（含计前负压 {{ flowForm.gaugePressure }} kPa 修正）</span>
          <span v-else-if="flowForm.from === flowForm.to" class="fr-note">（同类型流量，系数为 1）</span>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：采样体积换算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="database" :size="17" /> 采样体积换算（累计体积 → 标况体积）</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo('inlet')">示例：入口流设置</el-button>
          <el-button size="small" plain @click="loadDemo('scale')">示例：刻流设置</el-button>
        </div>
      </div>

      <el-alert type="warning" :closable="false" show-icon class="rule-tip">
        <b>当前规则（{{ volForm.flowSetting === "inlet" ? "入口" : volForm.flowSetting === "normal" ? "标况" : "刻度" }}）</b>：{{ settingRule }}
      </el-alert>

      <div class="vol-layout">
        <!-- 左：输入区（纵排） -->
        <div class="vol-inputs">
          <div class="field">
            <label>流量设置方式<span class="req">*</span></label>
            <el-radio-group v-model="volForm.flowSetting">
              <el-radio-button value="inlet">入口</el-radio-button>
              <el-radio-button value="normal">标况</el-radio-button>
              <el-radio-button value="scale">刻度</el-radio-button>
            </el-radio-group>
          </div>
          <div class="field">
            <label>累计体积（L）<span class="req">*</span></label>
            <el-input-number v-model="volForm.accumulatedVolume" :min="0" :precision="2" :controls="false" placeholder="如 3.28" style="width:100%" />
          </div>
          <div class="field">
            <label>环境温度（℃）<span class="req">*</span></label>
            <el-input-number v-model="volForm.temperature" :min="-50" :max="60" :precision="1" :controls="false" placeholder="26.1" style="width:100%" />
          </div>
          <div class="field">
            <label>大气压（kPa）<span class="req">*</span></label>
            <el-input-number v-model="volForm.pressure" :min="30" :max="110" :precision="2" :controls="false" placeholder="101.3" style="width:100%" />
          </div>
          <div class="field" v-if="volForm.flowSetting === 'scale'">
            <label>计前负压 Pf（kPa）<span class="req">*</span></label>
            <el-input-number v-model="volForm.gaugePressure" :min="0" :max="100" :precision="2" :controls="false" placeholder="16.45" style="width:100%" />
            <div v-if="volGaugeInvalid" class="field-err">需满足：大气压 − Pf &gt; 0</div>
          </div>
        </div>

        <!-- 右：换算体积结果（上下排布） -->
        <div class="vol-outputs">
          <div class="vr-card main">
            <span class="vr-label">标况体积（0℃ / 101.325 kPa）</span>
            <div class="vr-val"><b>{{ volResult ? volResult.normalVolume.toFixed(2) : "—" }}</b> L</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">入口体积（中间量）</span>
            <div class="vr-val"><b>{{ volResult ? volResult.inletVolume.toFixed(3) : "—" }}</b> L</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">参比体积（25℃）</span>
            <div class="vr-val"><b>{{ volResult ? volResult.referenceVolume.toFixed(2) : "—" }}</b> L</div>
          </div>
        </div>
      </div>

      <div class="steps" v-if="volResult">
        <div class="steps-title">计算过程</div>
        <div v-for="(s, i) in volResult.steps" :key="i" class="step-line">{{ s }}</div>
      </div>
    </div>

    <!-- ===== 卡片三：设备标况体积对比（独立隔离区） ===== -->
    <div class="card compare-card">
      <div class="card-head">
        <h3><Icon name="check" :size="17" /> 设备标况体积对比</h3>
      </div>

      <div class="cmp-grid">
        <div class="cmp-item">
          <label>仪器显示标况体积（L）</label>
          <el-input-number v-model="deviceNormalVolume" :min="0" :precision="2" :controls="false" placeholder="输入仪器显示值" style="width:100%" />
        </div>
        <div class="cmp-vs">VS</div>
        <div class="cmp-item calc">
          <label>本工具计算标况体积（L）</label>
          <div class="cmp-val">{{ volResult ? volResult.normalVolume.toFixed(2) : "—" }}</div>
        </div>
      </div>

      <div v-if="volDiff" :class="['diff-bar', diffOk ? 'diff-ok' : 'diff-warn']">
        <Icon :name="diffOk ? 'check' : 'info'" :size="15" />
        <template v-if="diffOk">
          偏差 {{ volDiff.diffPct.toFixed(2) }}%，与仪器显示（{{ volDiff.device }} L）数据一致
        </template>
        <template v-else>
          偏差 {{ volDiff.diffPct.toFixed(1) }}%——若流量设置为「标况」而偏差明显，请确认流量设置方式与计前负压
        </template>
      </div>
      <div v-else class="cmp-hint">先在上方「采样体积换算」得出计算标况体积，再输入仪器显示值即可自动对比（偏差 ≤ 1% 判定一致）</div>
    </div>

    <!-- ===== 卡片四：公式与说明 ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 公式与流量体系说明</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <div class="flow-map">
          <div class="fm-col">
            <div class="fm-title">大气采样器 <small>JJG 956-2013 检定刻度流量</small></div>
            <div class="fm-box source">孔口流量<small>计温、计压</small></div>
            <div class="fm-arrow">↓</div>
            <div class="fm-box">入口流量<small>环境温度、实测大气压</small></div>
            <div class="fm-tri">标况流量（0℃、101.325 kPa）· 参比流量（25℃）· 刻度流量（20℃）可相互转换</div>
          </div>
          <div class="fm-col">
            <div class="fm-title">烟气采样器 <small>JJG 1169-2019 检定入口流量</small></div>
            <div class="fm-box source">孔口流量<small>计温、计压</small></div>
            <div class="fm-arrow">↓</div>
            <div class="fm-box">入口流量<small>环境温度、实测大气压</small></div>
            <div class="fm-tri">标况流量（0℃、101.325 kPa）可相互转换</div>
          </div>
        </div>

        <h4>入口流量 → 标况 / 参比流量</h4>
        <div class="formula">Q标 = Q入 × P/101.325 × 273.15/(T+273.15)</div>
        <div class="formula">Q参比 = Q入 × P/101.325 × (25+273.15)/(T+273.15)</div>

        <h4>入口流量 → 刻度流量</h4>
        <div class="formula">Q刻 = Q入 × P/√(101.325×(P−P_f)) × √((273.15+20)/(T+273.15))</div>

        <h4>采样体积换算</h4>
        <div class="formula">V标 = V入 × P/101.325 × 273.15/(T+273.15)</div>
        <ul>
          <li><b>Q标</b> 标况流量（0℃、1 个标准大气压）；<b>Q参比</b> 参比流量（25℃、1 个标准大气压）</li>
          <li><b>P</b> 实测大气压 kPa；<b>T</b> 实测环境温度 ℃；<b>P_f</b> 管路计前负压 kPa（刻度流量参与）</li>
          <li><b>P_s</b> 标准状态大气压 101.325 kPa；刻度状态热力学温度取 (273.15+20) K</li>
          <li>累计体积归属：刻流设置 → 刻度体积（先反推入口体积）；入口设置 → 入口体积；<b>标况设置 → 累计值即为标况体积</b>（反推入口体积供校验）</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.as-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.head-actions { display: flex; gap: 8px; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

/* ===== 卡片一：流量换算布局 ===== */
.flow-main { margin-top: 16px; min-width: 0; }
.convert-row { display: flex; gap: 10px; align-items: stretch; }
.io-card {
  flex: 1; min-width: 0;
  border: 1px solid var(--border-light); background: #fff;
  border-radius: 16px; padding: 12px 14px 14px;
  transition: border-color 0.25s var(--ease), box-shadow 0.25s var(--ease);
}
.io-card:focus-within { border-color: rgba(37, 99, 235, 0.45); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.1); }
.io-card > label {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12.5px; color: var(--text-light); font-weight: 600; margin-bottom: 8px;
}
.io-card .unit { font-weight: 400; opacity: 0.85; }
.io-line { display: flex; gap: 8px; align-items: center; }
.io-num { flex: 1; min-width: 0; }
.io-select { width: 132px; flex: none; }
.result-card { background: rgba(37, 99, 235, 0.05); border-color: rgba(37, 99, 235, 0.25); }
.result-num {
  flex: 1; min-width: 0; font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1.15;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.swap-cell { display: flex; align-items: center; flex: none; }
.fr-factor { margin-top: 12px; font-size: 12.5px; color: var(--text-light); }
.fr-note { opacity: 0.8; }

/* 现场条件隔离区（顶部横排） */
.env-panel {
  border: 1.5px dashed rgba(37, 99, 235, 0.35); background: rgba(37, 99, 235, 0.045);
  border-radius: 16px; padding: 14px 16px 16px;
}
.panel-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--primary); margin-bottom: 12px; }
.env-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px 16px; align-items: start; }
.env-panel .field label { margin-bottom: 4px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }

/* 表单字段 */
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.opt-hint { float: right; font-size: 11px; color: var(--text-light); margin-left: 12px; }

/* 大圆角丝滑输入 */
.as-tool :deep(.el-input__wrapper),
.as-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.as-tool :deep(.el-input__wrapper.is-focus),
.as-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.as-tool :deep(.el-button:not(.is-text):not(.is-link)) { border-radius: 12px; transition: all 0.25s var(--ease); }
.as-tool :deep(.el-radio-button:first-child .el-radio-button__inner) { border-radius: 12px 0 0 12px; }
.as-tool :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: 0 12px 12px 0; }

/* ===== 卡片二：体积换算布局 ===== */
.vol-layout { display: grid; grid-template-columns: minmax(250px, 320px) 1fr; gap: 18px; align-items: start; }
.vol-inputs { display: flex; flex-direction: column; gap: 13px; }
.vol-outputs { display: flex; flex-direction: column; gap: 10px; }
.vr-card {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 14px 18px; font-size: 14px; color: var(--text);
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.vr-label { font-size: 12.5px; color: var(--text-light); }
.vr-val { white-space: nowrap; font-size: 13px; color: var(--text-light); }
.vr-card b { font-size: 24px; font-weight: 800; color: var(--text); line-height: 1.2; margin-right: 2px; }
.vr-card.main { background: rgba(37, 99, 235, 0.07); border-color: rgba(37, 99, 235, 0.25); }
.vr-card.main .vr-val, .vr-card.main b { color: var(--primary); }
.vr-card.main b { font-size: 28px; }

.steps {
  margin-top: 14px; background: var(--bg-soft, #f6f8fa);
  border-radius: 12px; padding: 14px 16px;
}
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 8px; }
.step-line { font-size: 12.5px; color: var(--text-light); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

/* ===== 卡片三：设备对比隔离区 ===== */
.compare-card { border: 1.5px dashed rgba(37, 99, 235, 0.3); background: linear-gradient(180deg, rgba(37, 99, 235, 0.03), transparent 60%), var(--white); }
.cmp-grid { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.cmp-item { min-width: 210px; flex: 1; max-width: 320px; }
.cmp-item label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.cmp-item.calc .cmp-val {
  font-size: 22px; font-weight: 800; color: var(--primary);
  border: 1px solid var(--border-light); background: var(--bg-soft, #f6f8fa);
  border-radius: 12px; padding: 5px 14px; line-height: 1.4; white-space: nowrap;
}
.cmp-vs { font-size: 13px; font-weight: 800; color: var(--text-light); padding-bottom: 12px; flex: none; }
.cmp-hint { margin-top: 12px; font-size: 12.5px; color: var(--text-light); }

.diff-bar {
  margin-top: 14px; padding: 11px 14px; border-radius: 12px;
  display: flex; align-items: center; gap: 8px; font-size: 13px;
}
.diff-ok { background: rgba(22, 163, 74, 0.08); color: #166534; }
.diff-warn { background: rgba(217, 119, 6, 0.08); color: #92400e; }

/* ===== 说明 ===== */
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

.flow-map { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 8px; }
.fm-col { background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 14px 16px; }
.fm-title { font-size: 13.5px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
.fm-title small { display: block; font-weight: 400; font-size: 11.5px; color: var(--text-light); margin-top: 2px; }
.fm-box {
  background: #fff; border: 1px solid var(--border-light); border-radius: 10px;
  padding: 9px 12px; font-size: 13px; font-weight: 600; color: var(--text);
  text-align: center; margin-bottom: 6px;
}
.fm-box small { display: block; font-weight: 400; font-size: 11px; color: var(--text-light); }
.fm-box.source { background: var(--primary-light); color: var(--primary); }
.fm-arrow { text-align: center; color: var(--text-light); font-size: 13px; }
.fm-tri { font-size: 11.5px; color: var(--text-light); line-height: 1.6; margin-top: 4px; text-align: center; }

/* ===== 移动端 ===== */
@media (max-width: 860px) {
  .vol-layout { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .convert-row { flex-direction: column; }
  .swap-cell { transform: rotate(90deg); padding: 2px 0; }
  .io-line { flex-wrap: wrap; }
  .io-num { flex: 1 1 100%; }
  .io-select { flex: 1 1 100%; width: 100%; }
  .result-num { font-size: 20px; }
  .flow-map { grid-template-columns: 1fr; }
  .vr-card b { font-size: 20px; }
  .vr-card.main b { font-size: 23px; }
  .cmp-grid { flex-direction: column; align-items: stretch; }
  .cmp-item { max-width: none; }
  .cmp-vs { padding-bottom: 0; text-align: center; }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
