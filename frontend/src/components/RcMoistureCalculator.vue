<script setup lang="ts">
/**
 * RcMoistureCalculator.vue — 阻容含湿量模型
 * 阻容法：电阻测温度 + 电容测相对湿度 → 水蒸气分压 → 含湿量（体积比）
 * 方式1 饱和蒸汽压法 / 方式2 露点法（先选方式再计算）；P当前 = 大气压 + 计前压力
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin());
import { computeMoisture, satLookup, SAT_TABLE, MOISTURE_DEMO } from "@/utils/rc-moisture";

/** 方式说明（方式选择卡用） */
const METHODS = [
  {
    id: 1 as 1 | 2,
    name: "方式1 饱和蒸汽压法",
    path: "T → 查饱和蒸汽压 → ×RH → 分压",
    desc: "由当前温度查饱和水蒸气压（表/Buck 公式），乘以相对湿度得水蒸气分压",
  },
  {
    id: 2 as 1 | 2,
    name: "方式2 露点法",
    path: "T+RH → 露点 Td → 查蒸汽压 → 分压",
    desc: "先由 T、RH 计算露点，再由露点查饱和蒸汽压即实际水蒸气分压",
  },
];

const form = reactive({
  temperature: null as number | null, // 传感器温度 ℃
  humidity: null as number | null,    // 相对湿度 %
  atmospheric: 101.325 as number | null, // 大气压 kPa
  gauge: 0 as number | null,              // 计前压力（表压 kPa，负压为负值）
  method: 1 as 1 | 2,
});

const rhInvalid = computed(() => form.humidity !== null && (form.humidity <= 0 || form.humidity > 100));
const pCurrent = computed(() =>
  form.atmospheric !== null && form.gauge !== null ? form.atmospheric + form.gauge : null
);
const formValid = computed(
  () =>
    form.temperature !== null &&
    form.humidity !== null &&
    pCurrent.value !== null &&
    pCurrent.value > 0 &&
    !rhInvalid.value
);

/** 所选方式结果 */
const current = computed(() =>
  formValid.value
    ? computeMoisture({
        temperature: form.temperature!,
        humidity: form.humidity!,
        atmospheric: form.atmospheric!,
        gauge: form.gauge!,
        method: form.method,
      })
    : null
);

/** 饱和蒸汽压速查表：0~100℃ 全整数点（查表用），非整数温度线性插值 */
const tableTemps = computed(() =>
  SAT_TABLE.map((p, t) => ({ t, p }))
);

/** 当前温度的插值展示（如 25.3℃ 在 25~26 之间线性取值） */
const interpInfo = computed(() => {
  if (form.temperature === null) return null;
  const s = satLookup(form.temperature);
  return s.frac > 0 ? s : null;
});

function loadDemo() {
  Object.assign(form, MOISTURE_DEMO);
  ElMessage.success("已填入示例：25℃ / 60%RH / 大气压 101.325 kPa / 计前 0 kPa");
}

const showExplain = ref(false);
</script>

<template>
  <div class="rm-tool">
    <!-- ===== 卡片一：方式选择（前置） ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="waterLevel" :size="17" /> 计算方式</h3>
      </div>
      <div class="method-grid">
        <div
          v-for="m in METHODS"
          :key="m.id"
          :class="['method-card', { active: form.method === m.id }]"
          @click="form.method = m.id"
        >
          <div class="method-name">{{ m.name }}</div>
          <div class="method-path">{{ m.path }}</div>
          <div class="method-desc">{{ m.desc }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片二：含湿量计算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="filter" :size="17" /> 含湿量计算</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo">填入示例</el-button>
        </div>
      </div>

      <div class="rule-tip">
        <b>P当前</b> 为传感器处实际绝对压力 = 大气压 + 计前压力（计前负压表读数为负值，直接填负数；常压扩散测量计前压力填 0）。
      </div>

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
            <label>大气压 Ba（kPa）<span class="req">*</span></label>
            <el-input-number v-model="form.atmospheric" :min="30" :max="120" :precision="2" :controls="false" placeholder="101.325" style="width:100%" />
          </div>
          <div class="field">
            <label>计前压力 Pg（表压 kPa，负压填负数）<span class="req">*</span></label>
            <el-input-number v-model="form.gauge" :min="-95" :max="50" :precision="2" :controls="false" placeholder="0" style="width:100%" />
          </div>
        </div>

        <!-- 右：结果 -->
        <div class="rm-outputs">
          <div class="vr-card main">
            <span class="vr-label">含湿量 Xsw（体积比）</span>
            <div class="vr-val"><b>{{ current ? current.moisture.toFixed(3) : "—" }}</b> %</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">P当前（绝对压力）</span>
            <div class="vr-val"><b>{{ current ? current.pressure.toFixed(2) : "—" }}</b> kPa</div>
            <span class="vr-note">= Ba + Pg</span>
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
        </div>
      </div>

      <div class="steps" v-if="isAdmin && current">
        <div class="steps-title">计算过程（{{ form.method === 1 ? "方式1 饱和蒸汽压法" : "方式2 露点法" }}）</div>
        <div v-for="(s, i) in current.steps" :key="i" class="step-line">{{ s }}</div>
      </div>
    </div>

    <!-- ===== 卡片三：饱和水蒸气压速查表 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="layers" :size="17" /> 饱和水蒸气压速查表（kPa，0~100℃ 整数点）</h3>
      </div>
      <div class="interp-bar" v-if="interpInfo">
        <Icon name="info" :size="14" />
        查表线性插值：{{ form.temperature }}℃ 取 P({{ interpInfo.tLow }}) 与 P({{ interpInfo.tHigh }}) 之间，插值系数 {{ interpInfo.frac }}
      </div>
      <div class="vapor-table">
        <div v-for="row in tableTemps" :key="row.t" :class="['vt-cell', { hot: interpInfo !== null && (row.t === interpInfo.tLow || row.t === interpInfo.tHigh), warm: interpInfo === null && form.temperature !== null && row.t === Math.round(form.temperature) }]">
          <span class="vt-t">{{ row.t }}℃</span>
          <span class="vt-p">{{ row.p.toFixed(3) }}</span>
        </div>
      </div>
      <p class="vt-note">绿色高亮为插值所用的两个相邻整数点；计算时非整数温度在相邻整数点之间<b>线性插值取值</b>（如 25.3℃ 在 25~26 之间线性取值）。</p>
    </div>

    <!-- ===== 卡片四：公式说明（默认折叠） ===== -->
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
          <li>P当前 = 传感器处实际绝对压力 = 大气压 Ba + 计前压力 Pg（计前负压表读数为负值）；抽取式测量取计前负压，常压扩散式测量 Pg 填 0</li>
          <li>露点定义：气体冷却到该温度时水蒸气达到饱和，故<b>露点对应的饱和蒸汽压 = 当前实际水蒸气分压</b>，两方式数学等价</li>
          <li>阻容传感器：高分子电容感湿（RH）+ 热敏电阻测温（T），烟气测量时传感器处温度不应超过 180℃</li>
          <li>含湿量用于颗粒物/气态污染物干基浓度换算</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ================= 暗色仪表盘主题（与烟尘采样模型统一） ================= */
.rm-tool {
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
.card {
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 16px;
  padding: 20px 24px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28);
  color: var(--d-txt);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 15.5px; font-weight: 600; color: var(--d-txt); display: flex; align-items: center; gap: 8px; margin: 0; }

/* 提示条（替代 el-alert 蓝底） */
.rule-tip {
  background: rgba(79, 195, 247, 0.06);
  border: 1px dashed rgba(79, 195, 247, 0.28);
  border-radius: 9px;
  padding: 9px 13px;
  font-size: 12.5px;
  color: var(--d-muted);
  line-height: 1.7;
  margin-bottom: 16px;
}
.rule-tip b { color: var(--d-accent); }

/* 方式选择卡 */
.method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.method-card {
  border: 1px solid var(--d-line); border-radius: 12px;
  padding: 14px 16px; cursor: pointer; user-select: none;
  transition: all 0.15s; background: var(--d-panel2);
}
.method-card:hover { border-color: rgba(79, 195, 247, 0.5); }
.method-card.active {
  border-color: var(--d-accent); background: rgba(79, 195, 247, 0.08);
}
.method-name { font-size: 14px; font-weight: 600; color: var(--d-txt); margin-bottom: 6px; }
.method-card.active .method-name { color: var(--d-accent); }
.method-path { font-size: 12px; color: var(--d-accent2); font-family: Consolas, monospace; margin-bottom: 6px; }
.method-desc { font-size: 12px; color: var(--d-muted); line-height: 1.6; }

.rm-layout { display: grid; grid-template-columns: minmax(280px, 400px) 1fr; gap: 20px; align-items: start; }
.rm-inputs { display: flex; flex-direction: column; gap: 12px; }
.field label { display: block; font-size: 12.5px; color: var(--d-muted); margin-bottom: 6px; font-weight: 500; }
.req { color: var(--d-err); margin-left: 2px; }
.field-err { font-size: 11px; color: var(--d-err); margin-top: 4px; }

.rm-outputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; align-content: start; }
.vr-card {
  background: var(--d-panel); border: 1px solid var(--d-line);
  border-radius: 12px; padding: 12px 15px; font-size: 14px;
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.vr-label { font-size: 11.5px; color: var(--d-muted); }
.vr-val { white-space: nowrap; font-size: 12.5px; color: var(--d-muted); overflow: hidden; text-overflow: ellipsis; }
.vr-card b { font-size: 21px; font-weight: 700; color: var(--d-txt); line-height: 1.25; margin-right: 2px; font-variant-numeric: tabular-nums; }
.vr-note { font-size: 10.5px; color: var(--d-dim); }
.vr-card.main { background: rgba(79, 195, 247, 0.08); border-color: rgba(79, 195, 247, 0.35); }
.vr-card.main .vr-val, .vr-card.main b { color: var(--d-accent); }
.vr-card.main b { font-size: 25px; }

.steps { margin-top: 16px; background: var(--d-panel); border: 1px solid var(--d-line); border-radius: 11px; padding: 12px 15px; }
.steps-title { font-size: 12px; font-weight: 600; color: var(--d-muted); margin-bottom: 8px; }
.step-line { font-size: 12px; color: var(--d-muted); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

.vapor-table { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.vt-cell {
  display: flex; justify-content: space-between; align-items: baseline;
  background: var(--d-panel); border: 1px solid var(--d-line);
  border-radius: 10px; padding: 7px 11px;
}
.vt-cell.hot { background: rgba(102, 217, 168, 0.1); border-color: rgba(102, 217, 168, 0.4); }
.vt-cell.warm { background: rgba(102, 217, 168, 0.05); border-color: rgba(102, 217, 168, 0.25); }
.vt-t { font-size: 12px; color: var(--d-muted); font-weight: 600; }
.vt-p { font-size: 12px; font-weight: 700; color: var(--d-txt); font-family: Consolas, monospace; }
.vt-cell.hot .vt-p, .vt-cell.warm .vt-p { color: var(--d-accent2); }
.vt-note { margin: 10px 0 0; font-size: 11.5px; color: var(--d-dim); }
.vt-note b { color: var(--d-accent2); }
.interp-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: rgba(102, 217, 168, 0.06); border: 1px dashed rgba(102, 217, 168, 0.3);
  border-radius: 9px; padding: 8px 13px; margin-bottom: 12px;
  font-size: 12px; color: var(--d-muted);
}
.interp-bar b { color: var(--d-accent2); }

.explain-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.explain-head h3 { font-size: 15.5px; font-weight: 600; color: var(--d-txt); display: flex; align-items: center; gap: 8px; margin: 0; }
.explain-head:hover h3 { color: var(--d-accent); }
.toggle { font-size: 11.5px; color: var(--d-dim); }
.explain-body h4 { font-size: 13.5px; color: var(--d-txt); margin: 16px 0 8px; }
.formula {
  font-family: Consolas, Monaco, monospace; font-size: 12.5px;
  background: var(--d-panel2); border-left: 3px solid var(--d-accent);
  border-radius: 8px; padding: 9px 13px; margin: 8px 0; color: var(--d-txt);
  overflow-x: auto; white-space: nowrap;
}
.explain-body ul { margin: 8px 0 0; padding-left: 20px; }
.explain-body li { font-size: 12.5px; color: var(--d-muted); line-height: 1.9; }
.explain-body li b { color: var(--d-txt); }

/* ===== Element Plus 控件暗色覆盖 ===== */
.rm-tool :deep(.el-input__wrapper),
.rm-tool :deep(.el-select__wrapper),
.rm-tool :deep(.el-textarea__inner) {
  background: var(--d-bg);
  box-shadow: 0 0 0 1px var(--d-line) inset;
  border-radius: 9px;
}
.rm-tool :deep(.el-input__wrapper.is-focus),
.rm-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--d-accent) inset, 0 0 0 3px rgba(79, 195, 247, 0.12);
}
.rm-tool :deep(.el-input__inner),
.rm-tool :deep(.el-select__placeholder),
.rm-tool :deep(.el-select__selected-item) {
  color: var(--d-txt);
  font-size: 17px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.rm-tool :deep(.el-input__inner::placeholder),
.rm-tool :deep(.el-select__placeholder.is-transparent) {
  color: #3f4b59; font-weight: 400; font-size: 13px;
}
.rm-tool :deep(.el-button) {
  background: var(--d-panel2); border: 1px solid var(--d-line);
  color: var(--d-muted); border-radius: 9px;
}
.rm-tool :deep(.el-button:hover) {
  border-color: var(--d-accent); color: var(--d-txt);
}
.rm-tool :deep(.el-button--primary) {
  background: var(--d-accent); border-color: var(--d-accent); color: #0b1117;
  font-weight: 600;
}
.rm-tool :deep(.el-button--primary:hover) {
  background: #6ecdf8; border-color: #6ecdf8; color: #0b1117;
}
.rm-tool :deep(.el-input-number .el-input__inner) { text-align: left; }

@media (max-width: 860px) {
  .rm-layout { grid-template-columns: 1fr; }
  .method-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .card { padding: 16px 13px; }
  .rm-outputs { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 18px; }
  .vr-card.main b { font-size: 21px; }
  .vapor-table { grid-template-columns: repeat(3, 1fr); }
  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
