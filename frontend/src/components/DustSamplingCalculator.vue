<script setup lang="ts">
/**
 * DustSamplingCalculator.vue — 烟尘采样模型
 * 依据 ZR-3260D 型烟尘采样报表逻辑（GB/T 16157）：
 * 动压/静压/烟温 → 流速 → 等速流量 → 采样体积 → 颗粒物浓度/折算/排放速率
 * 输入即自动计算；左输入右结果；公式说明默认折叠
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { O2_BASELINES } from "@/utils/o2-baseline";
import { computeDustSampling, DUST_DEMO, type DustSamplingResult } from "@/utils/flue-dust-sampling";

const form = reactive({
  dynamicPressure: null as number | null,  // 动压 Pa
  staticPressure: null as number | null,   // 静压 kPa
  stackTemp: null as number | null,        // 烟温 ℃
  atmosphere: 101.325 as number | null,    // 大气压 kPa
  moisture: null as number | null,         // 含湿量 %
  pitotCoefficient: 0.84 as number | null, // 皮托管系数
  nozzleDiameter: 8 as number | null,      // 采样嘴 mm
  crossSection: null as number | null,     // 烟道截面 m²
  samplingMinutes: null as number | null,  // 采样时长 min
  filterInitialMass: null as number | null, // 滤筒初重 g
  filterFinalMass: null as number | null,   // 滤筒终重 g
  O2: null as number | null,               // 实测氧量 %
  O2Base: 9 as number | null,              // 基准含氧量 %
  loadFactor: 1 as number | null,          // 负荷系数
});

const result = ref<DustSamplingResult | null>(null);
/** 基准含氧量：行业下拉 + 自定义 */
const o2sCustom = ref(false);
const o2sOptions = O2_BASELINES.map((b) => ({ value: b.o2s, label: `${b.label} — ${b.o2s}%` }));

const o2Invalid = computed(() => form.O2 !== null && form.O2 >= 21);
const o2BaseInvalid = computed(() => form.O2Base !== null && form.O2Base >= 21);
const moistureInvalid = computed(() => form.moisture !== null && form.moisture >= 100);

const formValid = computed(() => {
  return (
    form.dynamicPressure !== null && form.dynamicPressure > 0 &&
    form.staticPressure !== null &&
    form.stackTemp !== null &&
    form.atmosphere !== null && form.atmosphere > 0 &&
    form.moisture !== null && !moistureInvalid.value &&
    form.pitotCoefficient !== null && form.pitotCoefficient > 0 &&
    form.nozzleDiameter !== null && form.nozzleDiameter > 0 &&
    form.crossSection !== null && form.crossSection > 0 &&
    form.samplingMinutes !== null && form.samplingMinutes > 0 &&
    form.filterInitialMass !== null &&
    form.filterFinalMass !== null &&
    form.O2 !== null && !o2Invalid.value &&
    form.O2Base !== null && !o2BaseInvalid.value &&
    form.loadFactor !== null && form.loadFactor > 0
  );
});

function calc() {
  if (!formValid.value) {
    result.value = null;
    return;
  }
  result.value = computeDustSampling({
    dynamicPressure: form.dynamicPressure!,
    staticPressure: form.staticPressure!,
    stackTemp: form.stackTemp!,
    atmosphere: form.atmosphere!,
    moisture: form.moisture!,
    pitotCoefficient: form.pitotCoefficient!,
    nozzleDiameter: form.nozzleDiameter!,
    crossSection: form.crossSection!,
    samplingMinutes: form.samplingMinutes!,
    filterInitialMass: form.filterInitialMass!,
    filterFinalMass: form.filterFinalMass!,
    O2: form.O2!,
    O2Base: form.O2Base!,
    loadFactor: form.loadFactor!,
  });
}
watch(form, calc, { deep: true });

function loadDemo() {
  Object.assign(form, DUST_DEMO);
  ElMessage.success("已填入报表实例数据，结果自动计算");
}

const showExplain = ref(false);
</script>

<template>
  <div class="ds-tool">
    <!-- ===== 卡片一：烟尘采样计算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="chimney" :size="17" /> 烟尘采样模型（颗粒物测定与排放计算）</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo">填入报表实例</el-button>
        </div>
      </div>

      <el-alert type="info" :closable="false" show-icon class="rule-tip">
        依据 <b>GB/T 16157</b> 颗粒物测定方法与 ZR-3260D 采样报表逻辑：由动压/静压/烟温算出烟气流速与等速采样流量，结合滤筒称量结果计算颗粒物浓度、折算浓度与排放速率。输入完成后自动计算。
      </el-alert>

      <div class="ds-layout">
        <!-- 左：输入区 -->
        <div class="ds-inputs">
          <div class="group-title">现场实测</div>
          <div class="field">
            <label>平均动压 Hd（Pa）<span class="req">*</span></label>
            <el-input-number v-model="form.dynamicPressure" :min="0" :precision="1" :controls="false" placeholder="65" style="width:100%" />
          </div>
          <div class="field">
            <label>平均静压 Ps（kPa）<span class="req">*</span></label>
            <el-input-number v-model="form.staticPressure" :min="-20" :max="20" :precision="2" :controls="false" placeholder="-0.04" style="width:100%" />
          </div>
          <div class="field">
            <label>平均烟温 t（℃）<span class="req">*</span></label>
            <el-input-number v-model="form.stackTemp" :min="0" :max="600" :precision="1" :controls="false" placeholder="93.4" style="width:100%" />
          </div>
          <div class="field">
            <label>大气压 Ba（kPa）<span class="req">*</span></label>
            <el-input-number v-model="form.atmosphere" :min="30" :max="110" :precision="2" :controls="false" placeholder="101.325" style="width:100%" />
          </div>
          <div class="field">
            <label>含湿量 Xsw（%）<span class="req">*</span></label>
            <el-input-number v-model="form.moisture" :min="0" :max="100" :precision="2" :controls="false" placeholder="7.89" style="width:100%" />
            <div v-if="moistureInvalid" class="field-err">含湿量需小于 100%</div>
          </div>
          <div class="field">
            <label>皮托管系数 Kp<span class="req">*</span></label>
            <el-input-number v-model="form.pitotCoefficient" :min="0.1" :max="2" :precision="2" :controls="false" placeholder="0.84（S 型）" style="width:100%" />
          </div>
          <div class="field">
            <label>烟道截面 F（m²）<span class="req">*</span></label>
            <el-input-number v-model="form.crossSection" :min="0.01" :precision="4" :controls="false" placeholder="9.6211" style="width:100%" />
          </div>

          <div class="group-title">采样与称量</div>
          <div class="field">
            <label>采样嘴直径 d（mm）<span class="req">*</span></label>
            <el-input-number v-model="form.nozzleDiameter" :min="1" :max="20" :precision="1" :controls="false" placeholder="8" style="width:100%" />
          </div>
          <div class="field">
            <label>采样时长 n（min）<span class="req">*</span></label>
            <el-input-number v-model="form.samplingMinutes" :min="1" :max="600" :precision="0" :controls="false" placeholder="45" style="width:100%" />
          </div>
          <div class="field">
            <label>滤筒初始重量 g1（g）<span class="req">*</span></label>
            <el-input-number v-model="form.filterInitialMass" :min="0" :precision="4" :controls="false" placeholder="10.1359" style="width:100%" />
          </div>
          <div class="field">
            <label>滤筒最终重量 g2（g）<span class="req">*</span></label>
            <el-input-number v-model="form.filterFinalMass" :min="0" :precision="4" :controls="false" placeholder="25.2569" style="width:100%" />
          </div>

          <div class="group-title">折算参数</div>
          <div class="field">
            <label>实测 O2 浓度（%）<span class="req">*</span></label>
            <el-input-number v-model="form.O2" :min="0" :max="21" :precision="1" :controls="false" placeholder="14.2" style="width:100%" />
            <div v-if="o2Invalid" class="field-err">O2 需小于 21%</div>
          </div>
          <div class="field">
            <label>基准含氧量（%）<span class="req">*</span></label>
            <el-select v-if="!o2sCustom" v-model="form.O2Base" filterable placeholder="选择行业" style="width:100%">
              <el-option v-for="o in o2sOptions" :key="o.value" :value="o.value" :label="o.label" />
            </el-select>
            <el-input-number
              v-else
              v-model="form.O2Base" :min="0" :max="21" :precision="1" :controls="false"
              placeholder="自定义基准含氧量" style="width:100%"
            />
            <div class="o2s-switch">
              <el-button link type="primary" size="small" @click="o2sCustom = !o2sCustom">
                {{ o2sCustom ? "← 返回行业下拉选择" : "自定义输入 →" }}
              </el-button>
            </div>
            <div v-if="o2BaseInvalid" class="field-err">基准含氧量需小于 21%</div>
          </div>
          <div class="field">
            <label>负荷系数<span class="req">*</span></label>
            <el-input-number v-model="form.loadFactor" :min="0.1" :max="3" :precision="2" :controls="false" placeholder="一般取 1" style="width:100%" />
          </div>
        </div>

        <!-- 右：结果区（上下排布） -->
        <div class="ds-outputs">
          <div class="vr-card main">
            <span class="vr-label">颗粒物浓度 C（实测）</span>
            <div class="vr-val"><b>{{ result ? result.concentration.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card main">
            <span class="vr-label">折算浓度 C折算（基准 O2）</span>
            <div class="vr-val"><b>{{ result ? result.concentrationAdjusted.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card main">
            <span class="vr-label">排放速率 G</span>
            <div class="vr-val"><b>{{ result ? result.emissionRate.toFixed(3) : "—" }}</b> kg/h</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">烟气流速 Vs</span>
            <div class="vr-val"><b>{{ result ? result.velocity.toFixed(2) : "—" }}</b> m/s</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">等速采样流量 Qrs</span>
            <div class="vr-val"><b>{{ result ? result.isokineticFlow.toFixed(2) : "—" }}</b> L/min</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">标况采样体积 Vnd</span>
            <div class="vr-val"><b>{{ result ? result.volumeStandard.toFixed(1) : "—" }}</b> L</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">颗粒物净重</span>
            <div class="vr-val"><b>{{ result ? result.dustMass.toFixed(4) : "—" }}</b> g</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">湿烟气密度 ρ</span>
            <div class="vr-val"><b>{{ result ? result.density.toFixed(4) : "—" }}</b> kg/m³</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">烟气流量 Qs（湿基工况）</span>
            <div class="vr-val"><b>{{ result ? result.flueGasFlow.toFixed(0) : "—" }}</b> m³/h</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">标干流量 Qsnd</span>
            <div class="vr-val"><b>{{ result ? result.dryStandardFlow.toFixed(0) : "—" }}</b> m³/h</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">过剩空气系数 α</span>
            <div class="vr-val"><b>{{ result ? result.alpha.toFixed(4) : "—" }}</b></div>
          </div>
        </div>
      </div>

      <div class="steps" v-if="result">
        <div class="steps-title">计算过程</div>
        <div v-for="(s, i) in result.steps" :key="i" class="step-line">{{ s }}</div>
      </div>
    </div>

    <!-- ===== 卡片二：公式与说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 公式与计算说明</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>烟气流速与等速采样</h4>
        <div class="formula">ρ = 1.34 × 273/(273+t) × (Ba+Ps)/101.325</div>
        <div class="formula">Vs = 1.414 × Kp × √(Hd/ρ)</div>
        <div class="formula">Qrs = 0.047 × d² × Vs × (1 − Xsw/100)</div>
        <h4>采样体积与浓度</h4>
        <div class="formula">V = Qrs × n；Vnd = V × 273/(273+t) × (Ba+Ps)/101.325</div>
        <div class="formula">C = (g2 − g1)/Vnd × 10⁶</div>
        <h4>折算与排放</h4>
        <div class="formula">α = 21/(21 − O2实测)；αs = 21/(21 − O2基准)</div>
        <div class="formula">C折算 = C × α/αs × 负荷系数</div>
        <div class="formula">Qs = Vs × F × 3600；Qsnd = Qs × 273/(273+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)</div>
        <div class="formula">G = C × Qsnd × 10⁻⁶</div>
        <ul>
          <li><b>Hd</b> 平均动压 Pa；<b>Ps</b> 平均静压 kPa（表压，烟气常为负值）；<b>Ba</b> 大气压 kPa；<b>t</b> 烟温 ℃</li>
          <li><b>Xsw</b> 烟气含湿量 %；<b>Kp</b> 皮托管系数（S 型取 0.84）；<b>d</b> 采样嘴直径 mm</li>
          <li><b>基准含氧量</b>：按行业排放标准下拉选择（火电燃煤 6%、锅炉燃煤 9%、燃油/燃气 3/3.5%、水泥窑 10%、垃圾焚烧 11%、钢铁烧结 16% 等），也支持自定义</li>
          <li><b>负荷系数</b>（出力系数）：锅炉按运行年限查表，一般验收监测取 1</li>
          <li>参照 GB/T 16157《固定污染源排气中颗粒物测定与气态污染物采样方法》</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ds-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

.ds-layout { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 20px; align-items: start; }
.ds-inputs { display: flex; flex-direction: column; gap: 12px; }
.group-title {
  font-size: 12.5px; font-weight: 700; color: var(--primary);
  padding: 6px 10px; background: rgba(37, 99, 235, 0.06); border-radius: 8px;
  margin-top: 6px;
}
.group-title:first-child { margin-top: 0; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }
.o2s-switch { margin-top: 4px; }

.ds-outputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.vr-card {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 13px 16px; font-size: 14px; color: var(--text);
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.vr-label { font-size: 12px; color: var(--text-light); }
.vr-val { white-space: nowrap; font-size: 13px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; }
.vr-card b { font-size: 21px; font-weight: 800; color: var(--text); line-height: 1.25; margin-right: 2px; }
.vr-card.main { background: rgba(37, 99, 235, 0.07); border-color: rgba(37, 99, 235, 0.25); }
.vr-card.main .vr-val, .vr-card.main b { color: var(--primary); }
.vr-card.main b { font-size: 24px; }

.steps { margin-top: 16px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 14px 16px; }
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 8px; }
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

/* 大圆角丝滑输入 */
.ds-tool :deep(.el-input__wrapper),
.ds-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.ds-tool :deep(.el-input__wrapper.is-focus),
.ds-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.ds-tool :deep(.el-button:not(.is-text):not(.is-link)) { border-radius: 12px; transition: all 0.25s var(--ease); }

@media (max-width: 860px) {
  .ds-layout { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .ds-outputs { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 18px; }
  .vr-card.main b { font-size: 20px; }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
