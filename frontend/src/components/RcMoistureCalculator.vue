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

      <el-alert type="info" :closable="false" show-icon class="rule-tip">
        P当前 为<b>传感器处实际绝对压力</b> = 大气压 + 计前压力（计前负压表读数为负值，直接填负数；常压扩散测量计前压力填 0）。
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
            <label>大气压 Ba（kPa）<span class="req">*</span></label>
            <el-input-number v-model="form.atmospheric" :min="30" :max="120" :precision="2" :controls="false" placeholder="101.325" style="width:100%" />
          </div>
          <div class="field">
            <label>计前压力 Pg（表压 kPa，负压填负数）<span class="req">*</span></label>
            <el-input-number v-model="form.gauge" :min="-95" :max="50" :precision="2" :controls="false" placeholder="0" style="width:100%" />
          </div>
          <div class="p-current">
            P当前 = {{ form.atmospheric ?? "—" }} + {{ form.gauge ?? "—" }} =
            <b>{{ pCurrent !== null ? pCurrent.toFixed(2) : "—" }}</b> kPa
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
        查表线性插值：{{ form.temperature }}℃ = P({{ interpInfo.tLow }}) + {{ interpInfo.frac }} × (P({{ interpInfo.tHigh }}) − P({{ interpInfo.tLow }})) =
        <b>{{ interpInfo.p.toFixed(4) }}</b> kPa
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
.rm-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

/* 方式选择卡 */
.method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.method-card {
  border: 1.5px solid var(--border-light); border-radius: 14px;
  padding: 16px 18px; cursor: pointer; user-select: none;
  transition: all 0.2s var(--ease, ease); background: var(--bg-soft, #f6f8fa);
}
.method-card:hover { border-color: rgba(37, 99, 235, 0.45); }
.method-card.active {
  border-color: var(--primary); background: rgba(37, 99, 235, 0.06);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.12);
}
.method-name { font-size: 14.5px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.method-card.active .method-name { color: var(--primary); }
.method-path { font-size: 12.5px; color: var(--primary); font-family: Consolas, monospace; margin-bottom: 6px; }
.method-desc { font-size: 12.5px; color: var(--text-light); line-height: 1.6; }

.rm-layout { display: grid; grid-template-columns: minmax(280px, 400px) 1fr; gap: 20px; align-items: start; }
.rm-inputs { display: flex; flex-direction: column; gap: 12px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }
.p-current {
  font-size: 13px; color: var(--text-light); background: var(--bg-soft, #f6f8fa);
  border-radius: 10px; padding: 9px 13px; border: 1px dashed var(--border-light);
}
.p-current b { color: var(--text); font-size: 14px; }

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

.steps { margin-top: 16px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 14px 16px; }
.steps-title { font-size: 12.5px; font-weight: 700; color: var(--text-light); margin-bottom: 8px; }
.step-line { font-size: 12.5px; color: var(--text-light); line-height: 1.9; font-family: Consolas, Monaco, monospace; word-break: break-all; }

.vapor-table { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.vt-cell {
  display: flex; justify-content: space-between; align-items: baseline;
  background: var(--bg-soft, #f6f8fa); border: 1px solid var(--border-light);
  border-radius: 10px; padding: 7px 11px;
}
.vt-cell.hot { background: rgba(22, 163, 74, 0.1); border-color: rgba(22, 163, 74, 0.4); }
.vt-cell.warm { background: rgba(22, 163, 74, 0.06); border-color: rgba(22, 163, 74, 0.25); }
.vt-t { font-size: 12.5px; color: var(--text-light); font-weight: 600; }
.vt-p { font-size: 12.5px; font-weight: 700; color: var(--text); font-family: Consolas, monospace; }
.vt-cell.hot .vt-p, .vt-cell.warm .vt-p { color: #166534; }
.vt-note { margin: 10px 0 0; font-size: 12px; color: var(--text-light); }
.interp-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: rgba(22, 163, 74, 0.08); border: 1px dashed rgba(22, 163, 74, 0.35);
  border-radius: 10px; padding: 8px 13px; margin-bottom: 12px;
  font-size: 12.5px; color: var(--text-light);
}
.interp-bar b { color: #166534; font-size: 13.5px; }

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

@media (max-width: 860px) {
  .rm-layout { grid-template-columns: 1fr; }
  .method-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .rm-outputs { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 19px; }
  .vr-card.main b { font-size: 22px; }
  .vapor-table { grid-template-columns: repeat(3, 1fr); }  .head-actions { width: 100%; }
  .head-actions :deep(.el-button) { flex: 1; margin-left: 0; }
}
</style>
