<script setup lang="ts">
/**
 * AirSamplingCalculator.vue — 大气采样模型
 * 流量体系换算（入口/标况/参比/刻度）+ 采样累计体积 → 标况/参比体积
 * 依据 JJG 956-2013《大气采样器检定规程》、JJG 1169-2019《烟气采样器检定规程》
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  convertFlow, convertVolume, FLOW_LABEL, FLOW_SETTING_LABEL,
  type FlowKind, type FlowSetting, type VolumeConvertResult,
} from "@/utils/atmospheric-sampling";

// ====================== 流量换算 ======================
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

function calcFlow() {
  const f = flowForm;
  if (f.Q === null || f.temperature === null || f.pressure === null) {
    ElMessage.warning("请填写流量、环境温度和大气压");
    return;
  }
  if (f.from === f.to) {
    ElMessage.info("两种流量类型相同，无需换算");
    flowResult.value = f.Q;
    flowFactor.value = 1;
    return;
  }
  if (needGauge.value && (f.gaugePressure === null || f.gaugePressure < 0)) {
    ElMessage.warning("刻度流量换算需填写计前负压 Pf（kPa）");
    return;
  }
  if (needGauge.value && f.pressure - (f.gaugePressure ?? 0) <= 0) {
    ElMessage.warning("大气压必须大于计前负压");
    return;
  }
  const base = convertFlow({
    Q: 1, from: f.from, to: f.to, temperature: f.temperature,
    pressure: f.pressure, gaugePressure: f.gaugePressure ?? 0,
  });
  flowFactor.value = base;
  flowResult.value = base * f.Q;
}

// ====================== 体积换算 ======================
const volForm = reactive({
  flowSetting: "inlet" as FlowSetting,
  accumulatedVolume: null as number | null,
  temperature: 25.0 as number | null,
  pressure: 101.3 as number | null,
  gaugePressure: 0 as number | null,
  deviceNormalVolume: null as number | null, // 设备显示的标况体积（选填，用于比对）
});
const volResult = ref<VolumeConvertResult | null>(null);
const volDiff = ref<{ device: number; calc: number; diffPct: number } | null>(null);

function calcVolume() {
  const f = volForm;
  if (f.accumulatedVolume === null || f.temperature === null || f.pressure === null) {
    ElMessage.warning("请填写累计体积、环境温度和大气压");
    return;
  }
  if (f.flowSetting === "scale") {
    if (f.gaugePressure === null || f.gaugePressure < 0) {
      ElMessage.warning("刻流模式需填写计前负压 Pf（kPa）");
      return;
    }
    if (f.pressure - f.gaugePressure <= 0) {
      ElMessage.warning("大气压必须大于计前负压");
      return;
    }
  }
  volResult.value = convertVolume({
    flowSetting: f.flowSetting,
    accumulatedVolume: f.accumulatedVolume,
    temperature: f.temperature,
    pressure: f.pressure,
    gaugePressure: f.gaugePressure ?? 0,
  });

  // 与设备显示标况体积比对
  if (f.deviceNormalVolume !== null && f.deviceNormalVolume > 0) {
    const calc = volResult.value.normalVolume;
    volDiff.value = {
      device: f.deviceNormalVolume,
      calc,
      diffPct: ((calc - f.deviceNormalVolume) / f.deviceNormalVolume) * 100,
    };
  } else {
    volDiff.value = null;
  }
}

function loadDemo(demo: "inlet" | "scale") {
  if (demo === "inlet") {
    volForm.flowSetting = "inlet";
    volForm.accumulatedVolume = 3.28;
    volForm.temperature = 26.1;
    volForm.pressure = 100.91;
    volForm.gaugePressure = 0;
    volForm.deviceNormalVolume = 2.98;
  } else {
    volForm.flowSetting = "scale";
    volForm.accumulatedVolume = 2.9;
    volForm.temperature = 27.7;
    volForm.pressure = 100.93;
    volForm.gaugePressure = 16.45;
    volForm.deviceNormalVolume = 2.41;
  }
  volResult.value = null;
  volDiff.value = null;
  ElMessage.success("已填入示例数据，点击「换算体积」查看结果");
}

// ====================== 计算说明 ======================
const showExplain = ref(false);
</script>

<template>
  <div class="as-tool">
    <!-- ===== 卡片一：采样体积换算（核心功能放最前） ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="database" :size="17" /> 采样体积换算（累计体积 → 标况体积）</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo('inlet')">示例：入口流设置</el-button>
          <el-button size="small" plain @click="loadDemo('scale')">示例：刻流设置</el-button>
        </div>
      </div>

      <el-alert type="warning" :closable="false" show-icon class="rule-tip">
        <b>关键规则</b>：流量设置为「刻度」时累计体积为刻度流量体积（需先反推入口体积）；设置为「入口」时为入口体积；设置为「标况」时累计体积仍为<b>入口流量体积</b>（设备按入口控制采样）。
      </el-alert>

      <div class="vol-grid">
        <div class="field">
          <label>流量设置方式<span class="req">*</span></label>
          <el-radio-group v-model="volForm.flowSetting">
            <el-radio-button value="scale">刻度</el-radio-button>
            <el-radio-button value="inlet">入口</el-radio-button>
            <el-radio-button value="normal">标况</el-radio-button>
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
        </div>
        <div class="field">
          <label>设备显示标况体积（L，选填）</label>
          <el-input-number v-model="volForm.deviceNormalVolume" :min="0" :precision="2" :controls="false" placeholder="用于比对" style="width:100%" />
        </div>
      </div>

      <div class="btn-row">
        <el-button type="primary" @click="calcVolume">
          <Icon name="calculator" :size="15" style="margin-right:6px" /> 换算体积
        </el-button>
      </div>

      <!-- 体积结果 -->
      <div v-if="volResult" class="vol-result">
        <div class="vr-cards">
          <div class="vr-card main">
            <span class="vr-label">标况体积（0℃ / 101.325 kPa）</span>
            <b>{{ volResult.normalVolume.toFixed(2) }}</b> L
          </div>
          <div class="vr-card">
            <span class="vr-label">入口体积（中间量）</span>
            <b>{{ volResult.inletVolume.toFixed(3) }}</b> L
          </div>
          <div class="vr-card">
            <span class="vr-label">参比体积（25℃）</span>
            <b>{{ volResult.referenceVolume.toFixed(2) }}</b> L
          </div>
        </div>

        <div v-if="volDiff" :class="['diff-bar', Math.abs(volDiff.diffPct) <= 1 ? 'diff-ok' : 'diff-warn']">
          <Icon :name="Math.abs(volDiff.diffPct) <= 1 ? 'check' : 'info'" :size="15" />
          <template v-if="Math.abs(volDiff.diffPct) <= 1">
            与设备显示标况体积（{{ volDiff.device }} L）偏差 {{ volDiff.diffPct.toFixed(2) }}%，数据一致
          </template>
          <template v-else>
            与设备显示标况体积（{{ volDiff.device }} L）偏差 {{ volDiff.diffPct.toFixed(1) }}%——若流量设置为「标况」而偏差明显，请确认流量设置方式与计前负压
          </template>
        </div>

        <div class="steps">
          <div class="steps-title">计算过程</div>
          <div v-for="(s, i) in volResult.steps" :key="i" class="step-line">{{ s }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：流量互算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="trendUp" :size="17" /> 流量换算（入口 / 标况 / 参比 / 刻度）</h3>
      </div>

      <div class="flow-grid">
        <div class="field">
          <label>已知流量（L/min）<span class="req">*</span></label>
          <el-input-number v-model="flowForm.Q" :min="0" :precision="3" :controls="false" placeholder="1.0" style="width:100%" />
        </div>
        <div class="field">
          <label>已知类型<span class="req">*</span></label>
          <el-select v-model="flowForm.from" style="width:100%">
            <el-option v-for="k in flowKinds" :key="k.value" :value="k.value" :label="k.label">
              <span>{{ k.label }}</span>
              <span class="opt-hint">{{ k.hint }}</span>
            </el-option>
          </el-select>
        </div>
        <div class="field swap-cell">
          <el-button circle plain @click="const t = flowForm.from; flowForm.from = flowForm.to; flowForm.to = t" title="交换方向">
            <Icon name="refresh" :size="14" />
          </el-button>
        </div>
        <div class="field">
          <label>目标类型<span class="req">*</span></label>
          <el-select v-model="flowForm.to" style="width:100%">
            <el-option v-for="k in flowKinds" :key="k.value" :value="k.value" :label="k.label">
              <span>{{ k.label }}</span>
              <span class="opt-hint">{{ k.hint }}</span>
            </el-option>
          </el-select>
        </div>
        <div class="field">
          <label>环境温度（℃）<span class="req">*</span></label>
          <el-input-number v-model="flowForm.temperature" :min="-50" :max="60" :precision="1" :controls="false" placeholder="25.0" style="width:100%" />
        </div>
        <div class="field">
          <label>大气压（kPa）<span class="req">*</span></label>
          <el-input-number v-model="flowForm.pressure" :min="30" :max="110" :precision="2" :controls="false" placeholder="101.3" style="width:100%" />
        </div>
        <div class="field" v-if="needGauge">
          <label>计前负压 Pf（kPa）<span class="req">*</span></label>
          <el-input-number v-model="flowForm.gaugePressure" :min="0" :max="100" :precision="2" :controls="false" placeholder="16.45" style="width:100%" />
        </div>
      </div>

      <div class="btn-row">
        <el-button type="primary" @click="calcFlow">
          <Icon name="calculator" :size="15" style="margin-right:6px" /> 换算流量
        </el-button>
      </div>

      <div v-if="flowResult !== null" class="flow-result">
        <div class="fr-line">
          <span>{{ FLOW_LABEL[flowForm.from] }} {{ flowForm.Q }} L/min</span>
          <Icon name="arrowRight" :size="16" class="fr-arrow" />
          <span class="fr-target">{{ FLOW_LABEL[flowForm.to] }} <b>{{ flowResult.toFixed(4) }}</b> L/min</span>
        </div>
        <div class="fr-factor" v-if="flowFactor !== null">
          换算系数（目标/已知）= {{ flowFactor.toFixed(5) }}
          <span v-if="needGauge" class="fr-note">（含计前负压 {{ flowForm.gaugePressure }} kPa 修正）</span>
        </div>
      </div>
    </div>

    <!-- ===== 卡片三：公式与说明 ===== -->
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
          <li>累计体积归属：刻流设置 → 刻度体积（先反推入口体积）；入口设置 → 入口体积；<b>标况设置 → 仍为入口体积</b></li>
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

/* 表单网格 */
.vol-grid, .flow-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px 16px; align-items: end;
}
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.swap-cell { display: flex; justify-content: center; }
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

.btn-row { margin-top: 18px; display: flex; gap: 10px; }

/* 体积结果 */
.vol-result { margin-top: 18px; }
.vr-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.vr-card {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 14px 16px; font-size: 14px; color: var(--text);
  display: flex; flex-direction: column; gap: 4px;
}
.vr-card b { font-size: 24px; font-weight: 800; color: var(--text); line-height: 1.2; }
.vr-card.main { background: rgba(37, 99, 235, 0.07); border-color: rgba(37, 99, 235, 0.25); }
.vr-card.main b { color: var(--primary); font-size: 28px; }
.vr-label { font-size: 12px; color: var(--text-light); }

.diff-bar {
  margin-top: 12px; padding: 11px 14px; border-radius: 12px;
  display: flex; align-items: center; gap: 8px; font-size: 13px;
}
.diff-ok { background: rgba(22, 163, 74, 0.08); color: #166534; }
.diff-warn { background: rgba(217, 119, 6, 0.08); color: #92400e; }

.steps {
  margin-top: 14px; background: var(--bg-soft, #f6f8fa);
  border-radius: 12px; padding: 14px 16px;
}
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 8px; }
.step-line { font-size: 12.5px; color: var(--text-light); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

/* 流量结果 */
.flow-result { margin-top: 16px; }
.fr-line {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  font-size: 15px; color: var(--text);
  background: rgba(37, 99, 235, 0.06); border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 14px; padding: 14px 18px;
}
.fr-arrow { color: var(--primary); }
.fr-target b { font-size: 20px; color: var(--primary); margin: 0 2px; }
.fr-factor { margin-top: 10px; font-size: 12.5px; color: var(--text-light); }
.fr-note { opacity: 0.8; }

/* 说明 */
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

/* 移动端 */
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .vol-grid, .flow-grid { grid-template-columns: 1fr 1fr; gap: 12px 10px; }
  .flow-map { grid-template-columns: 1fr; }
  .vr-card b { font-size: 20px; }
  .vr-card.main b { font-size: 23px; }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
