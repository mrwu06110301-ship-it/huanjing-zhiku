<script setup lang="ts">
/**
 * DustSamplingCalculator.vue — 烟尘采样模型（颗粒物）· 流程式
 *
 * 设计目标（11-19 第五轮重构）：
 *  - 流程化：静压 → 流速 → 等速流量 → 采样体积 → 排放，五步自上而下串行
 *  - 参数复用：一份输入全局共用，上游产物自动带入，不重复录入
 *  - 缺参提示：只在需要补参数的那一步显示灰色提示文字
 *  - 结果竖列报表：右侧按「项目 | 数值 | 单位」三列竖排，按步骤分组
 *  - 通用工具：标题下不挂标准特指提示，页头副标题在工具详情页隐藏
 *  - 工具化：暗色仪表盘风格、大号输入 + 单位后缀、实时联动、清空/示例
 *  - 移动端 H5 适配：单列大字号、44px 触控高度、报表横向可读
 *
 * 公式来源：GB/T 16157 + 《烟尘相关计算公式(1).xlsx》（逐格校对复核）
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";
import { O2_BASELINES } from "@/utils/o2-baseline";
import {
  DUST_FLOW, DUST_FLOW_DEMO, computeFlow,
  type DustField, type DustStep,
} from "@/utils/flue-dust-flow";

const auth = useAuthStore();
const isAdmin = computed(() => auth.isAdmin());

/* ============ 全局输入表（参数复用，一份值全流程共用） ============ */
const form = reactive<Record<string, number | null>>({});
/** 字段 key → 归属步骤（第一次声明该字段的步骤拥有输入框） */
const fieldOwner = new Map<string, string>();
/** 全部输入字段 key（去重） */
const allFieldKeys: string[] = [];
for (const st of DUST_FLOW) {
  for (const f of st.fields) {
    if (!fieldOwner.has(f.key)) {
      fieldOwner.set(f.key, st.id);
      allFieldKeys.push(f.key);
      form[f.key] = null;
    }
  }
}
/** 折算方法默认「烟温静压法」 */
form.method = 1;

/** 用户手动输入过的字段（不参与回填覆盖） */
const touched = reactive(new Set<string>());
/** 由计算派生出来的字段 */
const derived = reactive(new Set<string>());
/** 实测基准（'ps' 或 'pt'） */
const measured = ref<string | null>(null);

/* ============ 基准含氧量 ============ */
const o2BaseOptions = O2_BASELINES.map((b) => ({
  value: b.o2s,
  label: `${b.label} ${b.o2s}%`,
}));
const o2BaseCustom = ref(false);

function onO2BaseSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "custom") {
    o2BaseCustom.value = true;
    return;
  }
  o2BaseCustom.value = false;
  form.o2base = v === "" ? null : Number(v);
  computeAndFill();
}

/* ============ 通用 select 字段（折算方法） ============ */
function onSelect(key: string, e: Event) {
  const el = e.target as HTMLSelectElement;
  form[key] = el.value === "" ? null : Number(el.value);
  computeAndFill();
}

/* ============ 输入处理：允许负号，非法字符过滤 ============ */
function onInput(key: string, e: Event) {
  const el = e.target as HTMLInputElement;
  const clean = el.value.replace(/[^0-9.\-]/g, "");
  el.value = clean;
  touched.add(key);
  derived.delete(key);
  if (key === "ps" || key === "pt") markMeasured(key);
  if (clean === "" || clean === "-" || clean === ".") {
    form[key] = null;
    computeAndFill();
    return;
  }
  const n = parseFloat(clean);
  form[key] = Number.isFinite(n) ? n : null;
  computeAndFill();
}

/** 记录实测基准（用户手动编辑全压/静压时调用） */
function markMeasured(key: string) {
  measured.value = key;
  const other = key === "ps" ? "pt" : "ps";
  touched.delete(other);
  derived.add(other);
}

/* ============ 计算 ============ */
const flowResult = computed(() => {
  try {
    return computeFlow(form, { measured: measured.value, derived: Array.from(derived) });
  } catch {
    return computeFlow({}, {});
  }
});

/** 全压↔静压互转回填：把派生的一侧写回输入框 */
function computeAndFill() {
  const r = flowResult.value;
  const v = r.values;
  const push = (key: string, val: number | null, digits: number) => {
    if (val === null || val === undefined || !Number.isFinite(val)) return;
    if (touched.has(key)) return;
    const next = digits === 0 ? Math.round(val) : Number(val.toFixed(digits));
    if (form[key] !== next) {
      form[key] = next;
      derived.add(key);
    }
  };
  if (measured.value === "pt") push("ps", v.ps ?? null, 4);
  else if (measured.value === "ps") push("pt", v.pt ?? null, 4);
}

/** 被计算值填充的输入框（标「计算值」） */
const filledFields = computed<Set<string>>(() => {
  const set = new Set<string>();
  for (const key of derived) {
    if (!touched.has(key) && form[key] !== null) set.add(key);
  }
  return set;
});

/** 是否为派生值（模板直接判断用） */
function isFilled(key: string): boolean {
  return derived.has(key) && !touched.has(key) && form[key] !== null;
}

/* ============ 步骤视图模型 ============ */
interface StepFieldVM {
  field: DustField;
  /** 本步是否拥有该输入框 */
  editable: boolean;
}
interface StepVM {
  step: DustStep;
  state: any;
  fields: StepFieldVM[];
  /** 复用的上游产物 */
  upstream: { key: string; label: string; unit: string; value: number | null; from: string }[];
}

/** 上游产物 key → 显示名 */
const UPSTREAM_LABEL: Record<string, { label: string; unit: string }> = {
  ps: { label: "烟气静压 Ps", unit: "kPa" },
  vs: { label: "烟气流速 Vs", unit: "m/s" },
  qrs: { label: "等速采样流量 Qrs", unit: "L/min" },
  vnd: { label: "标况体积 Vnd", unit: "L" },
};

const stepVMs = computed<StepVM[]>(() => {
  const r = flowResult.value;
  const out: StepVM[] = [];
  for (const st of DUST_FLOW) {
    const state = r.steps[st.id];
    const fields: StepFieldVM[] = st.fields.map((f) => ({
      field: f,
      editable: fieldOwner.get(f.key) === st.id,
    }));
    const upstream = (st.upstream ?? []).map((k) => {
      const meta = UPSTREAM_LABEL[k] ?? { label: k, unit: "" };
      const ownerStep = DUST_FLOW.find((s) => s.results.some((rr) => rr.key === k));
      return {
        key: k,
        label: meta.label,
        unit: meta.unit,
        value: r.values[k] ?? null,
        from: ownerStep ? `${ownerStep.no}步` : "",
      };
    });
    out.push({ step: st, state, fields, upstream });
  }
  return out;
});

/** 结果报表行（过滤重复项） */
function reportRows(st: DustStep, state: any): any[] {
  const method = form.method;
  let rows = state.rows;
  if (st.id === "pressure") {
    // Ps / Pt 本身就是输入框，结果区不重复展示
    rows = rows.filter((x: any) => x.key !== "ps" && x.key !== "pt");
  }
  if (st.id === "isokinetic") {
    // Qrs 的 m³/h 换算值与 L/min 重复，去掉
    rows = rows.filter((x: any) => x.key !== "qh");
  }
  if (st.id === "volume") {
    // 工况体积两法只显示所选方法的那一个
    if (method === 2) rows = rows.filter((x: any) => x.key !== "volumeCondition");
    else rows = rows.filter((x: any) => x.key !== "volumeMeter");
  }
  return rows;
}

function fmt(v: number | null, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (digits === 0) return Math.round(v).toLocaleString("zh-CN");
  return v.toFixed(digits);
}

/* ============ 操作 ============ */
function loadDemo() {
  for (const key of allFieldKeys) form[key] = DUST_FLOW_DEMO[key] ?? null;
  o2BaseCustom.value = false;
  touched.clear();
  derived.clear();
  measured.value = "ps";
  computeAndFill();
  ElMessage.success("已填入示例数据");
}

function clearAll() {
  for (const key of allFieldKeys) form[key] = null;
  o2BaseCustom.value = false;
  touched.clear();
  derived.clear();
  measured.value = null;
  ElMessage.info("已清空");
}

const showExplain = ref(false);
const showAllSteps = ref(false);
const activeStep = ref<string>(DUST_FLOW[0].id);

function gotoStep(id: string) {
  activeStep.value = id;
  const el = document.getElementById("dust-step-" + id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <div class="ds">
    <!-- ===== 流程条 ===== -->
    <section class="panel flowbar">
      <div class="fb-h">
        <span class="fb-t">计算流程</span>
        <span class="fb-p">{{ flowResult.doneCount }} / {{ flowResult.totalCount }} 步已完成</span>
      </div>
      <div class="fb-list">
        <button
          v-for="st in DUST_FLOW"
          :key="st.id"
          :class="['fb-item', { done: flowResult.steps[st.id].done, active: activeStep === st.id }]"
          @click="gotoStep(st.id)"
        >
          <span class="fb-no">{{ st.no }}</span>
          <span class="fb-nm">{{ st.title }}</span>
          <span v-if="flowResult.steps[st.id].done" class="fb-ok">✓</span>
        </button>
      </div>
      <div class="bar-r">
        <button class="ghost" @click="loadDemo">填入示例</button>
        <button class="ghost danger" @click="clearAll">清空</button>
      </div>
    </section>

    <section class="panel">
      <div class="body">
        <!-- ===== 左：输入区（按步骤从上到下） ===== -->
        <div class="in">
          <div
            v-for="vm in stepVMs"
            :id="'dust-step-' + vm.step.id"
            :key="vm.step.id"
            :class="['sg', { done: vm.state.done }]"
          >
            <div class="sg-h">
              <span class="sg-no">{{ vm.step.no }}</span>
              <div class="sg-t">
                <b>{{ vm.step.title }}</b>
              </div>
              <span v-if="vm.state.done" class="sg-ok">已完成</span>
            </div>

            <!-- 上游产物复用 -->
            <div v-if="vm.upstream.length" class="sg-up">
              <div v-for="u in vm.upstream" :key="u.key" class="up-row">
                <span class="up-l">{{ u.label }}</span>
                <span class="up-v" :class="{ miss: u.value === null }">
                  {{ u.value === null ? "待前序步骤计算" : fmt(u.value, 4) }}
                </span>
                <span class="up-u">{{ u.unit }}</span>
                <span class="up-f">{{ u.from }}带入</span>
              </div>
            </div>

            <!-- 本步输入字段 -->
            <div class="flds">
              <template v-for="fv in vm.fields">
                <!-- 本步拥有该字段：可编辑输入框 -->
                <div
                  v-if="fv.editable"
                  :key="fv.field.key"
                  :class="['fld', { filled: filledFields.has(fv.field.key) }]"
                >
                  <label>
                    <span class="lbl">{{ fv.field.label }}</span>
                    <span class="sym">{{ fv.field.sym }}</span>
                    <span v-if="filledFields.has(fv.field.key)" class="calc-tag">计算值</span>
                  </label>
                  <!-- 基准含氧量：下拉 + 自定义 -->
                  <div v-if="fv.field.type === 'o2base'" class="wrap">
                    <select
                      class="sel"
                      :value="o2BaseCustom ? 'custom' : (form[fv.field.key] === null ? '' : String(form[fv.field.key]))"
                      @change="onO2BaseSelect"
                    >
                      <option value="">选择行业基准…</option>
                      <option v-for="o in o2BaseOptions" :key="o.value" :value="String(o.value)">
                        {{ o.label }}
                      </option>
                      <option value="custom">自定义输入</option>
                    </select>
                    <span class="unit">%</span>
                  </div>
                  <div v-else-if="fv.field.type === 'select'" class="wrap">
                    <select
                      class="sel"
                      :value="form[fv.field.key] === null ? '' : String(form[fv.field.key])"
                      @change="onSelect(fv.field.key, $event)"
                    >
                      <option value="">请选择…</option>
                      <option v-for="o in fv.field.options" :key="String(o.value)" :value="String(o.value)">
                        {{ o.label }}
                      </option>
                    </select>
                  </div>
                  <div v-else class="wrap">
                    <input
                      class="inp"
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      :value="form[fv.field.key] === null ? '' : String(form[fv.field.key])"
                      :placeholder="fv.field.ph || ''"
                      @input="onInput(fv.field.key, $event)"
                    />
                    <span class="unit">{{ fv.field.unit }}</span>
                  </div>
                  <div v-if="fv.field.tip" class="fld-tip">{{ fv.field.tip }}</div>
                </div>
                <!-- 上游步骤已填：本步只读复用 -->
                <div v-else :key="fv.field.key" class="fld reused">
                  <label>
                    <span class="lbl">{{ fv.field.label }}</span>
                    <span class="sym">{{ fv.field.sym }}</span>
                    <span class="reuse-tag">复用</span>
                  </label>
                  <div class="wrap ro">
                    <span class="ro-v">{{ form[fv.field.key] === null ? "—" : String(form[fv.field.key]) }}</span>
                    <span class="unit">{{ fv.field.unit }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- ===== 右：结果竖列报表 ===== -->
        <div class="out">
          <div class="rep-head">
            <span class="rh-t">计算结果报表</span>
            <span class="rh-p">项目 · 数值 · 单位</span>
          </div>

          <div v-for="vm in stepVMs" :key="vm.step.id" class="rep-grp">
            <div class="rg-h">
              <span class="rg-no">{{ vm.step.no }}</span>
              <span class="rg-t">{{ vm.step.title }}</span>
              <span v-if="vm.state.done" class="rg-ok">✓</span>
            </div>
            <div class="rep">
              <div
                v-for="row in reportRows(vm.step, vm.state)"
                :key="row.key"
                :class="['rp', { primary: row.primary, empty: row.value === null }]"
                :title="row.formula"
              >
                <span class="rp-l">{{ row.label }}</span>
                <span class="rp-v">{{ fmt(row.value, row.digits) }}</span>
                <span class="rp-u">{{ row.unit }}</span>
                <span v-if="row.note" class="rp-n">{{ row.note }}</span>
              </div>
            </div>
          </div>

          <!-- 计算过程 -->
          <div class="steps" v-if="isAdmin && flowResult.steps_log.length">
            <div class="steps-t" @click="showAllSteps = !showAllSteps">
              计算过程
              <span class="toggle">{{ showAllSteps ? "收起 ▲" : "展开 ▼" }}</span>
            </div>
            <div v-show="showAllSteps" class="step-list">
              <div v-for="(s, i) in flowResult.steps_log" :key="i" class="step">{{ s }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 公式与说明 ===== -->
    <section class="panel doc">
      <div class="doc-h" @click="showExplain = !showExplain">
        <div class="doc-t">
          <Icon name="flask" :size="15" />
          <b>公式与口径说明</b>
        </div>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="doc-b">
        <div v-for="vm in stepVMs" :key="vm.step.id" class="fx">
          <div class="fx-t">{{ vm.step.no }}. {{ vm.step.title }}</div>
          <div v-for="(f, i) in vm.step.formulas" :key="i" class="fx-sub">
            <div class="fx-st">{{ f.title }}</div>
            <div class="fx-l" v-for="(line, j) in f.lines" :key="j"><code>{{ line }}</code></div>
          </div>
          <ul v-if="vm.step.notes && vm.step.notes.length" class="fx-notes">
            <li v-for="(n, i) in vm.step.notes" :key="i">{{ n }}</li>
          </ul>
        </div>
        <ul class="notes">
          <li><b>统一标态干基口径</b>：标况采样体积、颗粒物浓度、标干烟气流量、排放速率四项均按标态干基计算，始终保持 C × Qn × 10⁻⁶ ≡ G，与排放标准限值直接可比。</li>
          <li><b>含湿量口径</b>：Xsw 统一按百分数数值填入（如 7.89 表示 7.89%），干基折算因子统一为 (1 − Xsw/100)。含湿量已在等速采样流量中扣除，体积折算不重复修正。</li>
          <li><b>标态温度</b>：统一取 273.15 K（0℃）、101.325 kPa。</li>
          <li><b>含氧量折算</b>：基准含氧量按行业标准选择（火电燃煤 6%、锅炉燃煤 9%、燃油/燃气 3/3.5%、水泥窑 10%、垃圾焚烧 11%、烧结 16% 等），也支持自定义。</li>
          <li><b>负荷系数</b>（出力系数）：锅炉按运行年限查表，一般验收监测取 1。</li>
          <li>公式经《烟尘相关计算公式(1).xlsx》逐格校对复核；参照 GB/T 16157《固定污染源排气中颗粒物测定与气态污染物采样方法》。</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ================= 暗色仪表盘主题（工具化风格） ================= */
.ds {
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.panel {
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28);
  color: var(--d-txt);
}

/* ---- 流程条 ---- */
.flowbar { padding: 14px 18px 16px; }
.fb-h {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
}
.fb-t {
  font-size: 11.5px; letter-spacing: 1px; text-transform: uppercase;
  color: var(--d-accent); font-weight: 600;
}
.fb-p { font-size: 12px; color: var(--d-muted); }
.fb-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.fb-item {
  display: flex; align-items: center; gap: 7px;
  background: var(--d-panel);
  border: 1px solid var(--d-line);
  border-radius: 10px;
  padding: 9px 11px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  min-width: 0;
}
.fb-item:hover { border-color: rgba(79, 195, 247, 0.5); }
.fb-item.active { border-color: var(--d-accent); background: rgba(79, 195, 247, 0.08); }
.fb-item.done { border-color: rgba(102, 217, 168, 0.45); }
.fb-no {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--d-panel2); color: var(--d-muted);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}
.fb-item.done .fb-no { background: rgba(102, 217, 168, 0.18); color: var(--d-accent2); }
.fb-nm {
  font-size: 12.5px; color: var(--d-txt); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fb-ok { color: var(--d-accent2); font-size: 12px; margin-left: auto; flex: none; }

.bar-r { display: flex; gap: 8px; }
.ghost {
  background: var(--d-panel2);
  border: 1px solid var(--d-line);
  color: var(--d-muted);
  border-radius: 9px;
  padding: 8px 14px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-family: inherit;
}
.ghost:hover { border-color: var(--d-accent); color: var(--d-txt); }
.ghost.danger:hover { border-color: var(--d-err); color: var(--d-err); }

/* ---- 主体两栏 ---- */
.body {
  display: grid;
  grid-template-columns: minmax(320px, 460px) 1fr;
}
.in {
  padding: 16px 20px 22px;
  border-right: 1px solid var(--d-line);
  background: var(--d-panel);
}
.out {
  padding: 16px 20px 22px;
  background: var(--d-bg);
  min-width: 0;
}

/* ---- 步骤分组 ---- */
.sg {
  border: 1px solid var(--d-line);
  border-radius: 12px;
  background: var(--d-panel2);
  padding: 13px 14px 15px;
  margin-bottom: 14px;
  scroll-margin-top: 12px;
}
.sg:last-child { margin-bottom: 0; }
.sg.done { border-color: rgba(102, 217, 168, 0.35); }
.sg-h { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sg-no {
  width: 22px; height: 22px; border-radius: 7px;
  background: var(--d-accent); color: #0b1117;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}
.sg.done .sg-no { background: var(--d-accent2); }
.sg-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sg-t b { font-size: 14.5px; font-weight: 600; }
.sg-ok {
  margin-left: auto; flex: none;
  font-size: 10.5px; color: var(--d-accent2);
  border: 1px solid rgba(102, 217, 168, 0.4);
  border-radius: 5px; padding: 2px 7px;
}

/* ---- 上游产物复用 ---- */
.sg-up { margin-bottom: 10px; display: flex; flex-direction: column; gap: 5px; }
.up-row {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 11.5px;
  padding: 5px 9px;
  background: rgba(79, 195, 247, 0.06);
  border: 1px dashed rgba(79, 195, 247, 0.28);
  border-radius: 7px;
}
.up-l { color: var(--d-muted); }
.up-v { color: var(--d-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.up-v.miss { color: var(--d-dim); font-weight: 400; }
.up-u { color: var(--d-dim); }
.up-f { margin-left: auto; color: var(--d-dim); font-size: 10.5px; }

/* ---- 输入 ---- */
.flds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fld { min-width: 0; }
.fld label {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 6px; margin-bottom: 6px;
}
.lbl { font-size: 12.5px; color: var(--d-muted); }
.sym {
  font-size: 11px; color: var(--d-dim);
  font-family: Consolas, "Courier New", monospace;
}
.fld-tip { font-size: 10.5px; color: var(--d-dim); margin-top: 4px; line-height: 1.4; }
.wrap {
  display: flex; align-items: center;
  background: var(--d-bg);
  border: 1px solid var(--d-line);
  border-radius: 9px;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
}
.wrap:focus-within {
  border-color: var(--d-accent);
  box-shadow: 0 0 0 3px rgba(79, 195, 247, 0.12);
}
.inp, .sel {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: var(--d-txt);
  font-size: 19px; font-weight: 600;
  padding: 10px 6px 10px 13px;
  font-variant-numeric: tabular-nums;
  width: 100%;
  appearance: none;
}
.sel {
  font-size: 13.5px; font-weight: 500;
  padding: 11px 26px 11px 13px;
  background-image: linear-gradient(45deg, transparent 50%, var(--d-muted) 50%),
    linear-gradient(135deg, var(--d-muted) 50%, transparent 50%);
  background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.sel option { background: var(--d-panel2); color: var(--d-txt); }
.inp::placeholder { color: #3f4b59; font-weight: 400; font-size: 13.5px; }
.unit {
  color: var(--d-muted); font-size: 12.5px;
  padding-right: 12px; white-space: nowrap; flex: none;
}

/* ---- 计算值标记 ---- */
.fld.filled .wrap {
  border-color: rgba(102, 217, 168, 0.45);
  background: rgba(102, 217, 168, 0.06);
}
.fld.filled .inp { color: var(--d-accent2); }
.calc-tag {
  font-size: 10px;
  color: var(--d-accent2);
  border: 1px solid rgba(102, 217, 168, 0.4);
  border-radius: 4px;
  padding: 1px 5px;
  flex: none;
  align-self: center;
}
.reuse-tag {
  font-size: 10px; color: var(--d-dim);
  border: 1px solid var(--d-line);
  border-radius: 4px; padding: 1px 5px;
  flex: none; align-self: center;
}
.fld.reused .wrap.ro {
  background: rgba(79, 195, 247, 0.05);
  border-color: rgba(79, 195, 247, 0.25);
  border-style: dashed;
}
.ro-v {
  flex: 1; min-width: 0;
  color: var(--d-accent); font-size: 17px; font-weight: 600;
  padding: 9px 6px 9px 13px;
  font-variant-numeric: tabular-nums;
}

/* ---- 右侧报表 ---- */
.rep-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.rh-t { font-size: 12px; color: var(--d-accent); letter-spacing: 0.6px; font-weight: 600; }
.rh-p { font-size: 11px; color: var(--d-dim); }
.rep-grp { margin-bottom: 16px; }
.rg-h {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 6px; margin-bottom: 7px;
  border-bottom: 1px solid var(--d-line);
}
.rg-no {
  width: 18px; height: 18px; border-radius: 5px;
  background: var(--d-panel2); color: var(--d-muted);
  font-size: 10.5px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}
.rg-t { font-size: 12.5px; color: var(--d-muted); font-weight: 600; }
.rg-ok { margin-left: auto; color: var(--d-accent2); font-size: 12px; }
.rep { display: flex; flex-direction: column; gap: 1px; }
.rp {
  display: grid;
  grid-template-columns: minmax(120px, 1.6fr) minmax(78px, 1fr) minmax(40px, auto);
  align-items: baseline;
  gap: 8px;
  padding: 7px 11px;
  background: var(--d-panel);
  border-left: 2px solid transparent;
}
.rp:nth-child(even) { background: rgba(255, 255, 255, 0.015); }
.rp.primary { background: rgba(79, 195, 247, 0.08); border-left-color: var(--d-accent); }
.rp-l { font-size: 12px; color: var(--d-muted); min-width: 0; }
.rp.primary .rp-l { color: var(--d-accent2); }
.rp-v {
  font-size: 16px; font-weight: 700; color: var(--d-txt);
  font-variant-numeric: tabular-nums; text-align: right;
  white-space: nowrap;
}
.rp.primary .rp-v { color: var(--d-accent); font-size: 18px; }
.rp.empty .rp-v { color: var(--d-dim); font-size: 14px; }
.rp-u { font-size: 11px; color: var(--d-dim); }
.rp-n {
  grid-column: 1 / -1;
  font-size: 10.5px; color: var(--d-dim); line-height: 1.45;
}

/* ---- 计算过程 ---- */
.steps {
  margin-top: 14px;
  background: var(--d-panel);
  border: 1px solid var(--d-line);
  border-radius: 11px;
  padding: 11px 14px;
}
.steps-t {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: var(--d-muted); cursor: pointer; user-select: none;
}
.toggle { font-size: 11.5px; color: var(--d-dim); }
.step-list { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.step {
  font-size: 12px; color: var(--d-muted);
  font-family: Consolas, "Courier New", monospace;
  line-height: 1.85;
  word-break: break-all;
}

/* ---- 说明卡 ---- */
.doc { background: var(--d-panel); }
.doc-h {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; cursor: pointer; user-select: none;
}
.doc-t { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.doc-b { padding: 0 20px 18px; }
.fx { margin-bottom: 14px; }
.fx-t {
  font-size: 12px; color: var(--d-accent);
  letter-spacing: 0.4px; margin-bottom: 7px; font-weight: 600;
}
.fx-sub { margin-bottom: 6px; }
.fx-st { font-size: 11px; color: var(--d-accent2); margin-bottom: 5px; }
.fx-l {
  font-family: Consolas, "Courier New", monospace;
  font-size: 12.5px; color: var(--d-muted);
  background: var(--d-panel2);
  border-left: 2px solid var(--d-accent);
  border-radius: 6px;
  padding: 7px 11px;
  margin-bottom: 5px;
  overflow-x: auto;
}
.fx-l code { color: var(--d-txt); }
.fx-notes { margin: 6px 0 0; padding-left: 18px; }
.fx-notes li { font-size: 12px; color: var(--d-dim); line-height: 1.8; }
.notes { margin: 8px 0 0; padding-left: 18px; }
.notes li {
  font-size: 12.5px; color: var(--d-muted);
  line-height: 1.9; margin-bottom: 2px;
}
.notes b { color: var(--d-txt); }

/* ================= 移动端 H5 ================= */
@media (max-width: 1020px) {
  .body { grid-template-columns: 1fr; }
  .in { border-right: none; border-bottom: 1px solid var(--d-line); }
}

@media (max-width: 640px) {
  .ds { gap: 12px; }
  .panel { border-radius: 13px; }
  .flowbar { padding: 12px 13px 14px; }
  .fb-list { grid-template-columns: repeat(2, 1fr); gap: 7px; }
  .fb-item { padding: 9px 10px; }
  .fb-nm { font-size: 11.5px; }
  .bar-r { width: 100%; }
  .bar-r .ghost { flex: 1; }
  .in, .out { padding: 13px; }
  .sg { padding: 12px 11px 13px; }
  .flds { grid-template-columns: 1fr 1fr; gap: 9px; }
  .inp { font-size: 17px; padding: 11px 4px 11px 11px; }
  .sel { font-size: 12.5px; }
  .unit { font-size: 11px; padding-right: 9px; }
  .rp { grid-template-columns: minmax(96px, 1.4fr) minmax(70px, 1fr) auto; gap: 6px; padding: 7px 9px; }
  .rp-l { font-size: 11.5px; }
  .rp-v { font-size: 15px; }
  .rp.primary .rp-v { font-size: 17px; }
  .doc-h { padding: 12px 14px; }
  .doc-b { padding: 0 14px 14px; }
  .fx-l { font-size: 11.5px; padding: 6px 9px; }
  .notes li { font-size: 12px; line-height: 1.75; }
}

@media (max-width: 380px) {
  .flds { grid-template-columns: 1fr; }
  .fb-list { grid-template-columns: 1fr; }
  .rp { grid-template-columns: 1fr auto; }
  .rp-u { display: none; }
}
</style>
