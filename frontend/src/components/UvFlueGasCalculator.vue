<script setup lang="ts">
/**
 * UvFlueGasCalculator.vue — 紫外烟气模型
 * 依据 HJ 1045-2019 / HJ 1131-2020 / HJ 1132-2020（便携式紫外吸收法）
 * 功能：①DOAS 浓度反演（朗伯-比尔）②NOx 换算 ③干湿基转换 ④折算浓度+排放速率 ⑤HJ 指标判定
 * 输入即自动计算；公式说明默认折叠
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  beerLambert, noxSum, ppmToMgm3, wetToDry, adjustConcentration, emissionRate,
  calcRSD, judgeIndicator, HJ_LIMITS, UV_DEMO, M_NO2,
} from "@/utils/uv-flue-gas";

// ==================== 模块一：DOAS 浓度反演 ====================
const blForm = reactive({
  absorbance: null as number | null,
  crossSection: null as number | null,
  pathLength: null as number | null,
  pathUnit: "m" as "cm" | "m",
});
const blResult = computed(() => {
  if (blForm.absorbance === null || blForm.crossSection === null || blForm.crossSection <= 0 || blForm.pathLength === null || blForm.pathLength <= 0) return null;
  return beerLambert({
    absorbance: blForm.absorbance,
    crossSection: blForm.crossSection,
    pathLength: blForm.pathLength,
    pathUnit: blForm.pathUnit,
  });
});

// ==================== 模块二：NOx 换算 ====================
const noxForm = reactive({
  no: null as number | null,
  no2: null as number | null,
  temp: "25C" as "25C" | "0C",
});
const noxResult = computed(() => {
  if (noxForm.no === null || noxForm.no2 === null) return null;
  const { noxPpm } = noxSum(noxForm.no, noxForm.no2);
  return {
    noxPpm,
    noMgm3: ppmToMgm3(noxForm.no, 30.006, noxForm.temp),
    no2Mgm3: ppmToMgm3(noxForm.no2, M_NO2, noxForm.temp),
    noxMgm3: ppmToMgm3(noxPpm, M_NO2, noxForm.temp),
  };
});

// ==================== 模块三：干湿基 + 折算 + 排放 ====================
const convForm = reactive({
  cWet: null as number | null,   // 湿基浓度 mg/m³（仪器直读湿基，冷干法为干基）
  isDry: false,                   // 输入是否已是干基
  Xsw: null as number | null,    // 含湿量 %
  O2: null as number | null,
  O2Base: 9 as number | null,
  loadFactor: 1 as number | null,
  Qsnd: null as number | null,   // 标干流量 m³/h
});
const convResult = computed(() => {
  const f = convForm;
  if (f.cWet === null || f.Xsw === null || f.Xsw >= 100 || f.cWet < 0) return null;
  const cDry = f.isDry ? f.cWet : wetToDry(f.cWet, f.Xsw).cDry;
  const parts: { alpha?: number; alphaS?: number; adjusted?: number; rate?: number } = {};
  if (f.O2 !== null && f.O2 < 21 && f.O2Base !== null && f.O2Base < 21) {
    const adj = adjustConcentration({ concentration: cDry, O2: f.O2, O2Base: f.O2Base, loadFactor: f.loadFactor ?? 1 });
    parts.alpha = adj.alpha; parts.alphaS = adj.alphaS; parts.adjusted = adj.adjusted;
  }
  if (f.Qsnd !== null && f.Qsnd > 0) {
    parts.rate = emissionRate(cDry, f.Qsnd).rate;
  }
  return { cDry, ...parts };
});
const o2BasePresets = [3, 6, 9, 10];

// ==================== 模块四：HJ 指标判定 ====================
const qcForm = reactive({
  repeatValues: "" as string, // 逗号/空格分隔的重复测量值
  lodValue: null as number | null,  // 仪器检出限实测
  lodGas: "SO2" as "SO2" | "NO" | "NO2",
  indicationError: null as number | null, // 示值误差 %FS
  drift: null as number | null,           // 1h 漂移 %FS
});
const repeatParsed = computed(() =>
  qcForm.repeatValues.split(/[,，\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0)
);
const rsdResult = computed(() => (repeatParsed.value.length >= 2 ? calcRSD(repeatParsed.value) : null));
const lodJudge = computed(() => {
  if (qcForm.lodValue === null) return null;
  const limit = HJ_LIMITS.lod[qcForm.lodGas];
  return { limit, ...judgeIndicator({ name: `检出限（${qcForm.lodGas}）`, value: qcForm.lodValue, limit, unit: " mg/m³", betterWhenLower: true }) };
});
const errJudge = computed(() => {
  if (qcForm.indicationError === null) return null;
  return judgeIndicator({ name: "示值误差", value: qcForm.indicationError, limit: HJ_LIMITS.indicationErrorFS, unit: "%FS", betterWhenLower: true, note: "HJ 1045 ≤±2%FS；HJ 1131/1132 ≤±3%" });
});
const driftJudge = computed(() => {
  if (qcForm.drift === null) return null;
  return judgeIndicator({ name: "1h 零点/量程漂移", value: qcForm.drift, limit: HJ_LIMITS.drift1h, unit: "%FS", betterWhenLower: true });
});

function loadDemo() {
  Object.assign(blForm, { absorbance: UV_DEMO.absorbance, crossSection: UV_DEMO.crossSection, pathLength: UV_DEMO.pathLength, pathUnit: UV_DEMO.pathUnit });
  Object.assign(noxForm, { no: UV_DEMO.no_ppm, no2: UV_DEMO.no2_ppm });
  // 湿基示例：NOx 干基 173.1 mg/m³ × (1 − 7.8%) ≈ 159.6
  const cWetDemo = ppmToMgm3(UV_DEMO.no_ppm + UV_DEMO.no2_ppm, M_NO2, "25C") * (1 - UV_DEMO.Xsw / 100);
  Object.assign(convForm, { cWet: Math.round(cWetDemo * 10) / 10, isDry: false, Xsw: UV_DEMO.Xsw, O2: UV_DEMO.O2, O2Base: UV_DEMO.O2Base, loadFactor: 1, Qsnd: UV_DEMO.Qsnd });
  ElMessage.success("已填入示例数据");
}

const showExplain = ref(false);
</script>

<template>
  <div class="uv-tool">
    <!-- ===== 卡片一：DOAS 浓度反演 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="flask" :size="17" /> 紫外差分吸收（DOAS）浓度反演</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="loadDemo">填入示例</el-button>
        </div>
      </div>
      <el-alert type="info" :closable="false" show-icon class="rule-tip">
        朗伯-比尔定律 <b>A' = σ'·c·L</b>：由差分吸光度、差分吸收截面与光程反演待测气体浓度，差分算法可排除粉尘、水汽慢变化干扰（HJ 1131/1132 便携式紫外吸收法原理）。
      </el-alert>

      <div class="uv-layout">
        <div class="uv-inputs">
          <div class="field">
            <label>差分吸光度 A'（ln(I0'/I')）</label>
            <el-input-number v-model="blForm.absorbance" :min="0" :precision="4" :controls="false" placeholder="0.082" style="width:100%" />
          </div>
          <div class="field">
            <label>差分吸收截面 σ'（cm²/molecule）</label>
            <el-input-number v-model="blForm.crossSection" :min="0" :controls="false" :precision="2" :step="1e-19" placeholder="2.6E-19（科学计数）" style="width:100%" />
          </div>
          <div class="field row2">
            <div class="field-half">
              <label>光程 L</label>
              <el-input-number v-model="blForm.pathLength" :min="0.001" :precision="3" :controls="false" placeholder="0.3" style="width:100%" />
            </div>
            <div class="field-half">
              <label>单位</label>
              <el-radio-group v-model="blForm.pathUnit">
                <el-radio-button value="m">m</el-radio-button>
                <el-radio-button value="cm">cm</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </div>
        <div class="uv-outputs">
          <div class="vr-card main">
            <span class="vr-label">反演浓度</span>
            <div class="vr-val"><b>{{ blResult ? blResult.ppm.toFixed(2) : "—" }}</b> ppm</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">分子数浓度 N</span>
            <div class="vr-val"><b>{{ blResult ? blResult.moleculesPerCm3.toExponential(3) : "—" }}</b> /cm³</div>
          </div>
        </div>
      </div>
      <div class="steps" v-if="blResult">
        <div v-for="(s, i) in blResult.steps" :key="i" class="step-line">{{ s }}</div>
      </div>
    </div>

    <!-- ===== 卡片二：NOx 换算 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="chart" :size="17" /> NOx 浓度换算（HJ 1132）</h3>
        <el-radio-group v-model="noxForm.temp" size="small">
          <el-radio-button value="25C">25℃ 参比</el-radio-button>
          <el-radio-button value="0C">0℃ 标况</el-radio-button>
        </el-radio-group>
      </div>
      <div class="uv-layout">
        <div class="uv-inputs">
          <div class="field">
            <label>NO 浓度（μmol/mol）</label>
            <el-input-number v-model="noxForm.no" :min="0" :precision="1" :controls="false" placeholder="86" style="width:100%" />
          </div>
          <div class="field">
            <label>NO2 浓度（μmol/mol）</label>
            <el-input-number v-model="noxForm.no2" :min="0" :precision="1" :controls="false" placeholder="6" style="width:100%" />
          </div>
        </div>
        <div class="uv-outputs">
          <div class="vr-card main">
            <span class="vr-label">NOx（以 NO2 计）</span>
            <div class="vr-val"><b>{{ noxResult ? noxResult.noxMgm3.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">NOx（体积分数）</span>
            <div class="vr-val"><b>{{ noxResult ? noxResult.noxPpm.toFixed(1) : "—" }}</b> ppm</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">NO 质量浓度</span>
            <div class="vr-val"><b>{{ noxResult ? noxResult.noMgm3.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">NO2 质量浓度</span>
            <div class="vr-val"><b>{{ noxResult ? noxResult.no2Mgm3.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片三：干湿基 / 折算 / 排放 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="trendUp" :size="17" /> 浓度换算与排放速率</h3>
      </div>
      <div class="uv-layout">
        <div class="uv-inputs">
          <div class="field">
            <label>实测浓度（mg/m³）</label>
            <el-input-number v-model="convForm.cWet" :min="0" :precision="1" :controls="false" placeholder="173" style="width:100%" />
            <el-checkbox v-model="convForm.isDry" style="margin-top:4px">已是干基浓度（冷干法直读）</el-checkbox>
          </div>
          <div class="field">
            <label>含湿量 Xsw（%）</label>
            <el-input-number v-model="convForm.Xsw" :min="0" :max="100" :precision="2" :controls="false" placeholder="7.8" style="width:100%" />
          </div>
          <div class="field">
            <label>实测 O2（%）</label>
            <el-input-number v-model="convForm.O2" :min="0" :max="21" :precision="1" :controls="false" placeholder="13.5" style="width:100%" />
          </div>
          <div class="field">
            <label>基准含氧量（%）</label>
            <el-input-number v-model="convForm.O2Base" :min="0" :max="21" :precision="1" :controls="false" placeholder="9" style="width:100%" />
            <div class="preset-row">
              <el-tag v-for="p in o2BasePresets" :key="p" size="small" effect="plain" class="preset-tag" @click="convForm.O2Base = p">{{ p }}%</el-tag>
            </div>
          </div>
          <div class="field">
            <label>负荷系数</label>
            <el-input-number v-model="convForm.loadFactor" :min="0.1" :max="3" :precision="2" :controls="false" placeholder="1" style="width:100%" />
          </div>
          <div class="field">
            <label>标干流量 Qsnd（m³/h）</label>
            <el-input-number v-model="convForm.Qsnd" :min="0" :precision="0" :controls="false" placeholder="228000" style="width:100%" />
          </div>
        </div>
        <div class="uv-outputs">
          <div class="vr-card">
            <span class="vr-label">干基浓度</span>
            <div class="vr-val"><b>{{ convResult ? convResult.cDry.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card main">
            <span class="vr-label">折算浓度</span>
            <div class="vr-val"><b>{{ convResult && convResult.adjusted !== undefined ? convResult.adjusted.toFixed(1) : "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card main">
            <span class="vr-label">排放速率</span>
            <div class="vr-val"><b>{{ convResult && convResult.rate !== undefined ? convResult.rate.toFixed(3) : "—" }}</b> kg/h</div>
          </div>
          <div class="vr-card">
            <span class="vr-label">过剩空气系数 α</span>
            <div class="vr-val"><b>{{ convResult && convResult.alpha ? convResult.alpha.toFixed(4) : "—" }}</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片四：HJ 指标判定 ===== -->
    <div class="card">
      <div class="card-head">
        <h3><Icon name="check" :size="17" /> 仪器指标判定（HJ 1045 / 1131 / 1132）</h3>
      </div>
      <div class="uv-layout">
        <div class="uv-inputs">
          <div class="field">
            <label>重复测量值（逗号/空格分隔）</label>
            <el-input v-model="qcForm.repeatValues" placeholder="如 100.2, 100.8, 99.6, 100.4" />
          </div>
          <div class="field row2">
            <div class="field-half">
              <label>检出限实测（mg/m³）</label>
              <el-input-number v-model="qcForm.lodValue" :min="0" :precision="2" :controls="false" placeholder="1.8" style="width:100%" />
            </div>
            <div class="field-half">
              <label>气体</label>
              <el-select v-model="qcForm.lodGas" style="width:100%">
                <el-option label="SO2（限 2）" value="SO2" />
                <el-option label="NO（限 1）" value="NO" />
                <el-option label="NO2（限 2）" value="NO2" />
              </el-select>
            </div>
          </div>
          <div class="field row2">
            <div class="field-half">
              <label>示值误差（%FS）</label>
              <el-input-number v-model="qcForm.indicationError" :precision="2" :controls="false" placeholder="1.5" style="width:100%" />
            </div>
            <div class="field-half">
              <label>1h 漂移（%FS）</label>
              <el-input-number v-model="qcForm.drift" :precision="2" :controls="false" placeholder="1.2" style="width:100%" />
            </div>
          </div>
        </div>
        <div class="uv-outputs">
          <div class="vr-card" :class="{ ok: rsdResult && rsdResult.rsd <= 2, bad: rsdResult && rsdResult.rsd > 2 }">
            <span class="vr-label">重复性 RSD（限 ≤2%）</span>
            <div class="vr-val"><b>{{ rsdResult ? rsdResult.rsd.toFixed(2) : "—" }}</b> %</div>
          </div>
          <div class="vr-card" :class="{ ok: lodJudge?.pass, bad: lodJudge && !lodJudge.pass }">
            <span class="vr-label">检出限（限 {{ lodJudge ? lodJudge.limit : "—" }} mg/m³）</span>
            <div class="vr-val"><b>{{ qcForm.lodValue ?? "—" }}</b> mg/m³</div>
          </div>
          <div class="vr-card" :class="{ ok: errJudge?.pass, bad: errJudge && !errJudge.pass }">
            <span class="vr-label">示值误差（限 ≤±2%FS）</span>
            <div class="vr-val"><b>{{ qcForm.indicationError ?? "—" }}</b> %FS</div>
          </div>
          <div class="vr-card" :class="{ ok: driftJudge?.pass, bad: driftJudge && !driftJudge.pass }">
            <span class="vr-label">1h 漂移（限 ≤±2%FS）</span>
            <div class="vr-val"><b>{{ qcForm.drift ?? "—" }}</b> %FS</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 卡片五：公式说明（默认折叠） ===== -->
    <div class="card">
      <div class="explain-head" @click="showExplain = !showExplain">
        <h3><Icon name="question" :size="17" /> 原理与标准依据</h3>
        <span class="toggle">{{ showExplain ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplain" class="explain-body">
        <h4>紫外差分吸收光谱法（DOAS）</h4>
        <div class="formula">I(λ) = I0(λ) · exp[−Σ σi(λ)·ci·L]　（朗伯-比尔定律）</div>
        <div class="formula">c(ppm) = A'/（σ'·L) / 2.463×10¹³　（25℃、101.325 kPa，1ppm = 2.463×10¹³ molecule/cm³）</div>
        <ul>
          <li>差分算法将吸收光谱分为<b>快变化</b>（气体窄带吸收 σ'）与<b>慢变化</b>（粉尘、水汽、光源漂移），用最小二乘反演浓度</li>
          <li>常见紫外吸收波段：SO2 200~230nm、NO 195~225nm、NO2 220~260nm、NH3 200~220nm</li>
        </ul>
        <h4>NOx 与浓度换算</h4>
        <div class="formula">NOx(以NO2计) = NO + NO2（μmol/mol）；mg/m³ = ppm × M / 24.45（25℃）</div>
        <div class="formula">c干 = c湿/(1 − Xsw/100)；折算浓度 = c干 × α/αs × 负荷系数；G = c干 × Qsnd × 10⁻⁶</div>
        <h4>标准依据</h4>
        <ul>
          <li><b>HJ 1045-2019</b>：便携式紫外吸收法测量仪器技术要求（示值误差≤±2%FS、RSD≤2%、1h 漂移≤±2%FS、温度影响≤±5%FS、平行性 RSD≤5%、NO2→NO 转化器效率≥95%）</li>
          <li><b>HJ 1131-2020</b>：固定污染源废气 SO2 便携式紫外吸收法（检出限 2 mg/m³、测定下限 8 mg/m³）</li>
          <li><b>HJ 1132-2020</b>：固定污染源废气 NOx 便携式紫外吸收法（NO 检出限 1、NO2 检出限 2 mg/m³；示值误差≤±3%）</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// loadDemo 中湿基示例：NOx 干基 mg/m³ 折回湿基展示（UV_DEMO 补充方法）
export default { name: "UvFlueGasCalculator" };
</script>

<style scoped>
.uv-tool { display: flex; flex-direction: column; gap: 20px; }
.card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; margin: 0; }
.rule-tip { margin-bottom: 18px; }
.rule-tip :deep(.el-alert__description) { font-size: 13px; line-height: 1.7; }

.uv-layout { display: grid; grid-template-columns: minmax(280px, 400px) 1fr; gap: 20px; align-items: start; }
.uv-inputs { display: flex; flex-direction: column; gap: 12px; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.field.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-err { font-size: 11.5px; color: #ef4444; margin-top: 4px; }
.preset-row { display: flex; gap: 6px; margin-top: 6px; }
.preset-tag { cursor: pointer; }

.uv-outputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; align-content: start; }
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
.vr-card.ok { background: rgba(22, 163, 74, 0.08); border-color: rgba(22, 163, 74, 0.35); }
.vr-card.ok b { color: #166534; }
.vr-card.bad { background: rgba(217, 119, 6, 0.08); border-color: rgba(217, 119, 6, 0.4); }
.vr-card.bad b { color: #92400e; }

.steps { margin-top: 14px; background: var(--bg-soft, #f6f8fa); border-radius: 12px; padding: 12px 16px; }
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

.uv-tool :deep(.el-input__wrapper),
.uv-tool :deep(.el-select__wrapper) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease);
}
.uv-tool :deep(.el-input__wrapper.is-focus),
.uv-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.uv-tool :deep(.el-button:not(.is-text):not(.is-link)) { border-radius: 12px; }

@media (max-width: 860px) { .uv-layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .card { padding: 16px 14px; }
  .uv-outputs { grid-template-columns: 1fr 1fr; }
  .vr-card b { font-size: 18px; }
  .vr-card.main b { font-size: 20px; }
  .field.row2 { grid-template-columns: 1fr; }
}
</style>
