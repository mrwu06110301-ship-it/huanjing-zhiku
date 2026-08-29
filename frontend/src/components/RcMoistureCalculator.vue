<script setup lang="ts">
/**
 * RcMoistureCalculator.vue — 阻容含湿量模型
 * 阻容法：电阻测温度 + 电容测相对湿度 → 水蒸气分压 → 含湿量（体积比）
 * 方式1 饱和蒸汽压法 / 方式2 露点法，双路径对照；输入即算
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { computeMoisture, saturationVaporPressure, MOISTURE_DEMO } from "@/utils/rc-moisture";

const form = reactive({
  temperature: null as number | null, // 传感器温度 ℃
  humidity: null as number | null,    // 相对湿度 %
  pressure: 101.325 as number | null, // 当前气压 kPa
  method: 1 as 1 | 2,
});

const rhInvalid = computed(() => form.humidity !== null && (form.humidity <= 0 || form.humidity > 100));
const formValid = computed(
  () => form.temperature !== null && form.humidity !== null && form.pressure !== null && form.pressure > 0 && !rhInvalid.value
);

/** 双方式同时计算对照 */
const result1 = computed(() =>
  formValid.value
    ? computeMoisture({ temperature: form.temperature!, humidity: form.humidity!, pressure: form.pressure!, method: 1 })
    : null
);
const result2 = computed(() =>
  formValid.value
    ? computeMoisture({ temperature: form.temperature!, humidity: form.humidity!, pressure: form.pressure!, method: 2 })
    : null
);
const current = computed(() => (form.method === 1 ? result1.value : result2.value));

/** 饱和蒸汽压速查表（当前温度 ±5℃ 及常用点） */
const tableTemps = computed(() => {
  const t = form.temperature;
  const base = t === null ? 25 : Math.round(t);
  const set = new Set<number>([0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]);
  for (let d = -5; d <= 5; d++) if (base + d >= 0) set.add(base + d);
  return [...set].sort((a, b) => a - b).map((tt) => ({ t: tt, p: saturationVaporPressure(tt) }));
});

function loadDemo() {
  Object.assign(form, MOISTURE_DEMO);
  ElMessage.success("已填入示例：25℃ / 60%RH / 101.325 kPa");
}

const showExplain = ref(false);
</script>

<template>
  <div class="rm-tool">
    <!-- ===== 卡片一：含湿量计算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="waterLevel" :size="17" /> 阻容含湿量模型（温度 + 相对湿度 → 含湿量）</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo">填入示例</el-button>
        </div>
      </div>

      <el-alert type="info" :closable="false" show-icon class="rule-tip">
        阻容法传感器：电阻测温度 T、电容测相对湿度 RH。<b>方式1</b> 由 T 查饱和水蒸气压 → 分压 = P饱和×RH；<b>方式2</b> 先算露点，由露点查饱和蒸汽压即水蒸气分压。两种方式结果一致，双路径自动对照。
      </el-alert>

      <div class="rm-layout">
        <!-- 左：输入 -->
        <div class="rm-inputs">
          <div class="field">
            <label>当前温度 T（℃）<span class="req">*</span></label>
            <el-input-number v-model="form.temperature" :min="0" :max="100" :precision="1" :controls="false" placeholder="25.0" style="width:100%" />
          </div>
          <div class="field">
            <label>相对湿度 RH（%）<span class="req">*</span></label>
            <el-input-number v-model="form.humidity" :min="0" :max="100" :precision="1" :controls="false" placeholder="60" style="width:100%" />
            <div v-if="rhInvalid" class="field-err">RH 需在 0~100% 之间</div>
          </div>
          <div class="field">
            <label>当前气压（kPa）<span class="req">*</span></label>
            <el-input-number v-model="form.pressure" :min="30" :max="120" :precision="2" :controls="false" placeholder="101.325" style="width:100%" />
          </div>
          <div class="field">
            <label>计算方式</label>
            <el-radio-group v-model="form.method">
              <el-radio-button :value="1">方式1 饱和蒸汽压法</el-radio-button>
              <el-radio-button :value="2">方式2 露点法</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 右：结果 -->
        <div class="rm-outputs">
          <div class="vr-card main">
            <span class="vr-label">含湿量 Xsw（体积比）</span>
            <div class="vr-val"><b>{{ current ? current.moisture.toFixed(3) : "—" }}</b> %</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">水蒸气分压</span>
            <div class="vr-val"><b>{{ current ? current.pPartial.toFixed(4) : "—" }}</b> kPa</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">露点 Td</span>
            <div class="vr-val"><b>{{ current ? current.dewPoint.toFixed(2) : "—" }}</b> ℃</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">T 对应饱和蒸汽压</span>
            <div class="vr-val"><b>{{ current ? current.pSat.toFixed(4) : "—" }}</b> kPa</div>
          </div>
          <div class="vr-card compare" v-if="result1 && result2">
            <span class="vr-label">双方式对照</span>
            <div class="cmp-line">方式1：{{ result1.moisture.toFixed(3) }} %</div>
            <div class="cmp-line">方式2：{{ result2.moisture.toFixed(3) }} %</div>
            <div class="cmp-diff">偏差 {{ Math.abs(result1.moisture - result2.moisture).toFixed(4) }} 个百分点</div>
          </div>
        </div>
      </div>

      <div class="steps" v-if="current">
        <div class="steps-title">计算过程（{{ form.method === 1 ? "方式1 饱和蒸汽压法" : "方式2 露点法" }}）</div>
        <div v-for="(s, i) in current.steps" :key="i" class="step-line">{{ s }}</div>
      </div>
    </div>

    <!-- ===== 卡片二：饱和水蒸气压速查表 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="layers" :size="17" /> 饱和水蒸气压速查表（kPa）</h3>
      </div>
      <div class="vapor-table">
        <div v-for="row in tableTemps" :key="row.t" :class="['vt-cell', { hot: form.temperature !== null && row.t === Math.round(form.temperature) }]">
          <span class="vt-t">{{ row.t }}℃</span>
          <span class="vt-p">{{ row.p.toFixed(3) }}</span>
        </div>
      </div>
      <p class="vt-note">Buck 公式计算（0~100℃ 精度 ±0.06%），绿色高亮为当前输入温度附近；方式1 的「查表」即用此表。</p>
    </div>

    <!-- ===== 卡片三：公式说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 原理与公式说明</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>方式1：饱和蒸汽压法</h4>
        <div class="formula">P饱和 = 0.61121 × exp((18.678 − T/234.5) × T/(257.14 + T))　kPa（Buck 公式，可查表）</div>
        <div class="formula">P分压 = P饱和 × RH/100</div>
        <div class="formula">含湿量 Xsw = P分压 / P当前 × 100（体积比 %）</div>
        <h4>方式2：露点法</h4>
        <div class="formula">α = ln(RH/100) + 17.625T/(243.04+T)；Td = 243.04α/(17.625 − α)　（Magnus-Tetens 露点）</div>
        <div class="formula">P分压 = P饱和(Td)；Xsw = P分压/P当前 × 100</div>
        <ul>
          <li>露点定义：气体冷却到该温度时水蒸气达到饱和，故<b>露点对应的饱和蒸汽压 = 当前实际水蒸气分压</b>，两方式数学等价</li>
          <li>阻容传感器：高分子电容感湿（RH）+ 热敏电阻测温（T），烟气测量时传感器处温度不应超过 180℃</li>
          <li>烟气测量中 P当前 取烟道绝对压（烟道静压表压 + 大气压）；含湿量用于颗粒物/气态污染物干基浓度换算</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rm-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

.rm-layout { display: grid; grid-template-columns: minmax(280px, 400px) 1fr; gap: 20px; align-items: start; }
.rm-inputs { display: flex; flex-direction: column; gap: 12px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }

.rm-outputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; align-content: start; }
.vr-card {
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 14px; padding: 13px 16px; font-size: 14px; color: var(--text);
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.vr-label { font-size: 12px; color: var(--text-light); }
.vr-val { white-space: nowrap; font-size: 13px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; }
.vr-card b { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.25; margin-right: 2px; }
.vr-card.main { background: rgba(37, 99, 235, 0.07); border-color: rgba(37, 99, 235, 0.25); }
.vr-card.main .vr-val, .vr-card.main b { color: var(--primary); }
.vr-card.main b { font-size: 26px; }
.vr-card.compare { grid-column: 1 / -1; background: rgba(6, 182, 212, 0.05); border-color: rgba(6, 182, 212, 0.3); }
.cmp-line { font-size: 13px; color: var(--text); }
.cmp-diff { font-size: 12px; color: var(--text-light); margin-top: 2px; }

.steps { margin-top: 16px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 14px 16px; }
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 8px; }
.step-line { font-size: 12.5px; color: var(--text-light); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

.vapor-table { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.vt-cell {
  display: flex; justify-content: space-between; align-items: baseline;
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 10px; padding: 8px 12px;
}
.vt-cell.hot { background: rgba(22, 163, 74, 0.1); border-color: rgba(22, 163, 74, 0.4); }
.vt-t { font-size: 12.5px; color: var(--text-light); font-weight: 600; }
.vt-p { font-size: 13px; font-weight: 700; color: var(--text); font-family: Consolas, monospace; }
.vt-cell.hot .vt-p { color: #166534; }
.vt-note { margin: 10px 0 0; font-size: 12px; color: var(--text-light); }

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

.rm-tool :deep(.el-input__wrapper),
.rm-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.rm-tool :deep(.el-input__wrapper.is-focus),
.rm-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.rm-tool :deep(.el-button:not(.is-text):not(.is-link)) { border-radius: 12px; }
.rm-tool :deep(.el-radio-button:first-child .el-radio-button__inner) { border-radius: 12px 0 0 12px; }
.rm-tool :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: 0 12px 12px 0; }

@media (max-width: 860px) { .rm-layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .rm-outputs { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 19px; }
  .vr-card.main b { font-size: 22px; }
  .vapor-table { grid-template-columns: repeat(3, 1fr); }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
