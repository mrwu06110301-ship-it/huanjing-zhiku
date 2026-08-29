<script setup lang="ts">
/**
 * AtmosphericStabilityCalculator.vue — 大气稳定度计算工具
 * 依据 HJ/T 55-2000《大气污染物无组织排放监测技术导则》
 * 输入：测量时间/经纬度/测量高度/云量/区域 + 10 组分钟过程数据（支持 Excel 模板导入）
 * 输出：完整报表（原始输入 + 过程计算 + 适宜度结论），可打印/导出
 */
import { ref, reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import { Download, Upload } from "@element-plus/icons-vue";
import {
  calcStability,
  type StabilityInput,
  type MinuteRecord,
  type StabilityResult,
  SUITABILITY_MEANING,
} from "@/utils/atmospheric-stability";
import Icon from "@/components/Icon.vue";

// ====================== 表单状态 ======================
const form = reactive({
  measureTime: "", // 结束时间
  longitude: null as number | null,
  latitude: null as number | null,
  measureHeight: 2 as number | null, // 测量高度 m
  totalCloud: null as number | null,
  lowCloud: null as number | null,
  region: "urban" as "urban" | "rural",
});

interface Row extends MinuteRecord {}
const rows = ref<Row[]>(
  Array.from({ length: 10 }, () => ({
    windSpeed: null as unknown as number,
    windDir: null as unknown as number,
    pressure: null as unknown as number,
    temperature: null as unknown as number,
    humidity: null as unknown as number,
  }))
);

const result = ref<StabilityResult | null>(null);
const showExplanation = ref(false);

// ====================== 设备定位 ======================
const locating = ref(false);

function locateDevice() {
  if (!navigator.geolocation) {
    ElMessage.warning("当前设备/浏览器不支持定位功能");
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.longitude = Number(pos.coords.longitude.toFixed(4));
      form.latitude = Number(pos.coords.latitude.toFixed(4));
      locating.value = false;
      ElMessage.success("定位成功，已填入经纬度");
    },
    (err) => {
      locating.value = false;
      if (err.code === err.PERMISSION_DENIED) {
        ElMessage.error("定位被拒绝，请在浏览器设置中允许位置权限（手机需开启系统定位）");
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        ElMessage.error("无法获取位置信息，请检查设备定位服务是否开启");
      } else {
        ElMessage.error("定位超时，请手动输入经纬度");
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

// ====================== 标准查表快查 ======================
interface TableDef { title: string; note?: string; head: string[]; rows: string[][] }
const tableViewer = ref(false);
const activeTable = ref<TableDef | null>(null);

function showTable(key: string) {
  activeTable.value = REF_TABLES[key] ?? null;
  if (activeTable.value) tableViewer.value = true;
}

const REF_TABLES: Record<string, TableDef> = {
  t3: {
    title: "表3 太阳辐射等级",
    note: "云量按天空十分制。白天按太阳高度角 h₀ 分档，夜间取「夜间」列。",
    head: ["总云量/低云量", "夜间", "h₀≤15°", "15°<h₀≤35°", "35°<h₀≤65°", "h₀>65°"],
    rows: [
      ["≤4/≤4", "-2", "-1", "+1", "+2", "+3"],
      ["5~7/≤4", "-1", "0", "+1", "+2", "+3"],
      ["≥8/≤4", "-1", "0", "0", "+1", "+1"],
      ["≥5/5~7", "0", "0", "0", "0", "+1"],
      ["≥8/≥8", "0", "0", "0", "0", "0"],
    ],
  },
  t4: {
    title: "表4 大气稳定度等级",
    note: "按地面风速（10m 高 10 分钟平均）与太阳辐射等级交叉查取。",
    head: ["地面风速(m/s)", "+3", "+2", "+1", "0", "-1", "-2"],
    rows: [
      ["≤1.9", "A", "A-B", "B", "D", "E", "F"],
      ["2~2.9", "A-B", "B", "C", "D", "E", "F"],
      ["3~4.9", "B", "B-C", "C", "D", "D", "E"],
      ["≥6", "D", "D", "D", "D", "D", "D"],
    ],
  },
  n: {
    title: "风廓线幂指数 n",
    note: "各种稳定度条件下的风廓线幂指数值（附录D 推荐值）。",
    head: ["地区", "A", "B", "C", "D", "E·F"],
    rows: [
      ["城市", "0.10", "0.15", "0.20", "0.25", "0.30"],
      ["乡村", "0.07", "0.07", "0.10", "0.15", "0.25"],
    ],
  },
  t5: {
    title: "表5 风向变化的适宜程度分类",
    note: "风向变化大小以风向标准差 σθ（±5°）表征。",
    head: ["风向变化大小 (σθ)", "<15°", "15°~29°", "30°~45°", ">45°"],
    rows: [["适宜程度类别", "a", "b", "c", "d"]],
  },
  t6: {
    title: "表6 风速的适宜程度分类",
    note: "以平均风速（10 分钟平均值）划分。",
    head: ["平均风速 (m/s)", "1.0~2.0", "2.1~3.0", "3.1~4.5", ">4.5"],
    rows: [["适宜程度类别", "a", "b", "c", "d"]],
  },
  t7: {
    title: "表7 大气稳定度的适宜程度分类",
    note: "按大气稳定度等级划分。",
    head: ["大气稳定度等级", "F、E", "D", "C", "B、A"],
    rows: [["适宜程度类别", "a", "b", "c", "d"]],
  },
  r853: {
    title: "8.5.3 监测取消条件",
    note: "原文：如果三项气象因子中的任一项达到 d 类，或者其中两项达到 c 类，则该次无组织排放监测应取消，或更换时日。",
    head: ["情形", "处理"],
    rows: [
      ["任一项达到 d 类", "取消监测或更换时日"],
      ["其中两项达到 c 类", "取消监测或更换时日"],
    ],
  },
};

// ====================== 计算 ======================
const canCalc = computed(() => {
  const base =
    form.measureTime &&
    form.longitude !== null &&
    form.latitude !== null &&
    form.measureHeight !== null &&
    form.totalCloud !== null &&
    form.lowCloud !== null;
  if (!base) return false;
  // 至少 2 组有效风速风向
  const valid = rows.value.filter(
    (r) => Number.isFinite(r.windSpeed) && Number.isFinite(r.windDir)
  );
  return valid.length >= 2;
});

function collectInput(): StabilityInput {
  return {
    measureTime: form.measureTime,
    longitude: form.longitude!,
    latitude: form.latitude!,
    measureHeight: form.measureHeight!,
    totalCloud: form.totalCloud!,
    lowCloud: form.lowCloud!,
    region: form.region,
    records: rows.value
      .filter((r) => Number.isFinite(r.windSpeed) && Number.isFinite(r.windDir))
      .map((r) => ({
        windSpeed: Number(r.windSpeed),
        windDir: Number(r.windDir),
        pressure: Number(r.pressure) || 0,
        temperature: Number(r.temperature) || 0,
        humidity: Number(r.humidity) || 0,
      })),
  };
}

function calculate() {
  try {
    if (form.totalCloud! < form.lowCloud!) {
      ElMessage.warning("总云量不应小于低云量，请检查");
      return;
    }
    result.value = calcStability(collectInput());
  } catch (e: any) {
    ElMessage.error(e?.message || "计算失败，请检查输入");
  }
}

function reset() {
  form.measureTime = "";
  form.longitude = null;
  form.latitude = null;
  form.measureHeight = 2;
  form.totalCloud = null;
  form.lowCloud = null;
  form.region = "urban";
  rows.value = Array.from({ length: 10 }, () => ({
    windSpeed: null as unknown as number,
    windDir: null as unknown as number,
    pressure: null as unknown as number,
    temperature: null as unknown as number,
    humidity: null as unknown as number,
  }));
  result.value = null;
}

// ====================== 模板下载与导入 ======================
const fileInput = ref<HTMLInputElement | null>(null);

function downloadTemplate() {
  const header = [
    ["大气稳定度计算数据导入模板"],
    ["说明：填写【基本信息】与【过程数据】两个区域；过程数据每分钟一组，填 10 组"],
    [],
    ["【基本信息】"],
    ["测量时间（结束时间）", "2026-08-28 16:53:17"],
    ["经度（°，东经为正）", "121.6938"],
    ["纬度（°，北纬为正）", "31.2452"],
    ["测量高度（m，测风仪离地高度）", "2"],
    ["总云量（0-10 十分制）", "3"],
    ["低云量（0-10 十分制）", "3"],
    ["区域（城市/农村）", "农村"],
    [],
    ["【过程数据】每分钟一组，共10组；风速1位小数，风向整数"],
    ["序号", "风速(m/s)", "风向(°)", "大气压(kPa)", "温度(℃)", "湿度(%RH)"],
  ];
  for (let i = 1; i <= 10; i++) {
    header.push([String(i), "", "", "", "", ""]);
  }
  const csv =
    "\uFEFF" +
    header.map((r) => r.map((c => `"${c ?? ""}"`)).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "大气稳定度数据导入模板.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (!t || isNaN(Number(t))) return null;
  return Number(t);
}

function handleImportFile(ev: Event) {
  const file = (ev.target as HTMLInputElement)?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = (reader.result as string).replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      // 定位两个区块
      let baseIdx = -1;
      let dataIdx = -1;
      lines.forEach((l, i) => {
        if (l.includes("【基本信息】")) baseIdx = i;
        if (l.includes("【过程数据】")) dataIdx = i;
      });
      if (baseIdx < 0 || dataIdx < 0) throw new Error("模板格式不正确");
      // 基本信息：键值对
      const kv: Record<string, string> = {};
      for (let i = baseIdx + 1; i < dataIdx; i++) {
        const cells = parseCsvLine(lines[i]);
        if (cells.length >= 2 && cells[0]) kv[cells[0].trim()] = cells[1]?.trim() ?? "";
      }
      const findKey = (kw: string) => Object.keys(kv).find((k) => k.includes(kw));
      form.measureTime = kv[findKey("测量时间") ?? ""] ?? "";
      form.longitude = num(kv[findKey("经度") ?? ""]);
      form.latitude = num(kv[findKey("纬度") ?? ""]);
      form.measureHeight = num(kv[findKey("测量高度") ?? ""]) ?? 2;
      form.totalCloud = num(kv[findKey("总云量") ?? ""]);
      form.lowCloud = num(kv[findKey("低云量") ?? ""]);
      const regionStr = kv[findKey("区域") ?? ""] ?? "";
      form.region = regionStr.includes("农") ? "rural" : "urban";
      // 过程数据
      const header = parseCsvLine(lines[dataIdx + 1]);
      const colOf = (kw: string) => header.findIndex((h) => h.includes(kw));
      const cIdx = colOf("风速"), dIdx = colOf("风向"), pIdx = colOf("大气压"), tIdx = colOf("温度"), hIdx = colOf("湿度");
      const newRows: Row[] = [];
      for (let i = dataIdx + 2; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const ws = num(cells[cIdx]);
        const wd = num(cells[dIdx]);
        if (ws === null || wd === null) continue;
        newRows.push({
          windSpeed: ws,
          windDir: wd,
          pressure: num(cells[pIdx]) ?? 0,
          temperature: num(cells[tIdx]) ?? 0,
          humidity: num(cells[hIdx]) ?? 0,
        });
      }
      if (newRows.length < 2) throw new Error("过程数据不足（至少 2 组有效风速风向）");
      // 填充到 10 行
      const padded = [...newRows];
      while (padded.length < 10) {
        padded.push({ windSpeed: null as unknown as number, windDir: null as unknown as number, pressure: null as unknown as number, temperature: null as unknown as number, humidity: null as unknown as number });
      }
      rows.value = padded.slice(0, Math.max(10, newRows.length));
      ElMessage.success(`导入成功：${newRows.length} 组过程数据`);
    } catch (e: any) {
      ElMessage.error(e?.message || "导入失败，请使用下载的模板填写");
    }
    if (fileInput.value) fileInput.value.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function triggerImport() {
  fileInput.value?.click();
}

// ====================== 报表 ======================
function fmt(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "-";
  return v.toFixed(digits);
}

const suitBadge: Record<string, string> = { a: "badge-a", b: "badge-b", c: "badge-c", d: "badge-d" };

function printReport() {
  window.print();
}

function dirTo16(d: number): string {
  const names = ["北", "北东北", "东北", "东东北", "东", "东东南", "东南", "南东南", "南", "南西南", "西南", "西西南", "西", "西西北", "西北", "北西北"];
  return names[Math.round(d / 22.5) % 16];
}

function radiationLabel(lv: number): string {
  if (lv > 0) return `+${lv}（强太阳辐射）`;
  if (lv < 0) return `${lv}（弱太阳辐射）`;
  return "0（中性）";
}
</script>

<template>
  <div class="atm-tool">
    <!-- ===== 输入区 ===== -->
    <div class="input-card">
      <div class="card-head">
        <h3><Icon name="edit" :size="17" /> 输入参数</h3>
        <div class="head-actions">
          <el-button size="small" plain @click="downloadTemplate">
            <el-icon><Download /></el-icon>&nbsp;下载导入模板
          </el-button>
          <el-button size="small" plain type="primary" @click="triggerImport">
            <el-icon><Upload /></el-icon>&nbsp;导入数据
          </el-button>
          <input ref="fileInput" type="file" accept=".csv" style="display: none" @change="handleImportFile" />
        </div>
      </div>

      <el-alert type="info" :closable="false" show-icon class="import-tip">
        模板支持一次导入全部参数（基本信息 + 每分钟一组的过程数据）；过程数据风速、风向为必填，气压/温度/湿度选填。
      </el-alert>

      <div class="input-columns">
        <!-- 左栏：基本信息（纵排） -->
        <div class="col-left">
          <div class="col-title">
            <Icon name="write" :size="15" /> 基本信息
          </div>

          <div class="field">
            <label>测量时间（结束时间）<span class="req">*</span></label>
            <el-date-picker
              v-model="form.measureTime"
              type="datetime"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="选择日期时间"
              style="width: 100%"
            />
          </div>

          <div class="field">
            <label>经纬度（东经/北纬为正）<span class="req">*</span></label>
            <div class="geo-grid">
              <el-input-number v-model="form.longitude" :min="-180" :max="180" :precision="4" :controls="false" placeholder="经度" />
              <el-input-number v-model="form.latitude" :min="-90" :max="90" :precision="4" :controls="false" placeholder="纬度" />
              <el-button class="geo-btn" :loading="locating" @click="locateDevice">
                <Icon name="globe" :size="14" style="margin-right:5px" />
                获取设备定位
              </el-button>
            </div>
          </div>

          <div class="field">
            <label>测量高度（m，测风仪离地高度）<span class="req">*</span></label>
            <el-input-number v-model="form.measureHeight" :min="0.1" :max="100" :precision="1" :controls="false" style="width: 100%" />
          </div>

          <div class="cloud-row">
            <div class="field">
              <label>总云量（十分制）<span class="req">*</span></label>
              <el-input-number v-model="form.totalCloud" :min="0" :max="10" :precision="0" :controls="false" style="width: 100%" />
            </div>
            <div class="field">
              <label>低云量（十分制）<span class="req">*</span></label>
              <el-input-number v-model="form.lowCloud" :min="0" :max="10" :precision="0" :controls="false" style="width: 100%" />
            </div>
          </div>

          <div class="field">
            <label>区域<span class="req">*</span></label>
            <el-radio-group v-model="form.region">
              <el-radio-button value="urban">城市</el-radio-button>
              <el-radio-button value="rural">农村</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 右栏：分钟过程数据 -->
        <div class="col-right">
          <div class="rows-head">
            <h4><Icon name="chart" :size="15" style="margin-right:5px" />过程数据（每分钟一组）</h4>
            <span class="rows-hint">风速、风向必填；建议 10 组</span>
          </div>
          <div class="table-scroll">
            <table class="rows-table">
              <thead>
                <tr>
                  <th style="width: 40px">#</th>
                  <th>风速 (m/s)<span class="req">*</span></th>
                  <th>风向 (°)<span class="req">*</span></th>
                  <th>大气压 (kPa)</th>
                  <th>温度 (℃)</th>
                  <th>湿度 (%RH)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in rows" :key="i">
                  <td class="row-no">{{ i + 1 }}</td>
                  <td><el-input-number v-model="r.windSpeed" :min="0" :max="60" :precision="1" :controls="false" placeholder="0.0" /></td>
                  <td><el-input-number v-model="r.windDir" :min="0" :max="360" :precision="0" :controls="false" placeholder="0-360" /></td>
                  <td><el-input-number v-model="r.pressure" :min="30" :max="110" :precision="1" :controls="false" placeholder="101.3" /></td>
                  <td><el-input-number v-model="r.temperature" :min="-60" :max="60" :precision="1" :controls="false" placeholder="25.0" /></td>
                  <td><el-input-number v-model="r.humidity" :min="0" :max="100" :precision="1" :controls="false" placeholder="60.0" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <el-button type="primary" size="large" :disabled="!canCalc" @click="calculate">
          <Icon name="calculator" :size="16" style="margin-right: 6px" /> 开始计算
        </el-button>
        <el-button size="large" @click="reset">重置</el-button>
      </div>
    </div>

    <!-- ===== 报表区 ===== -->
    <div v-if="result" class="report-card" id="atm-report">
      <div class="report-head">
        <div>
          <h3><Icon name="doc" :size="17" /> 大气稳定度评定报表</h3>
          <p class="report-sub">依据 HJ/T 55-2000《大气污染物无组织排放监测技术导则》</p>
        </div>
        <el-button size="small" plain @click="printReport">
          <el-icon><Download /></el-icon>&nbsp;打印 / 导出 PDF
        </el-button>
      </div>

      <!-- 结论横幅 -->
      <div :class="['verdict', `verdict-${result.totalSuitability}`]">
        <div class="verdict-grade">
          总适宜度 <strong>{{ result.totalSuitability }}</strong> 类
        </div>
        <div class="verdict-text">{{ result.conclusion }}</div>
        <div v-if="result.shouldCancel" class="verdict-cancel">⚠ {{ result.cancelReason }}</div>
        <div v-else class="verdict-ok">✓ 气象条件满足开展无组织排放监测的基本要求</div>
      </div>

      <!-- 1. 原始输入 -->
      <h4 class="sec-title">一、原始输入</h4>
      <table class="report-table">
        <tbody>
          <tr>
            <th>测量时间</th><td>{{ form.measureTime || "-" }}</td>
            <th>区域</th><td>{{ form.region === "urban" ? "城市" : "农村" }}</td>
          </tr>
          <tr>
            <th>经度</th><td>{{ form.longitude }}°</td>
            <th>纬度</th><td>{{ form.latitude }}°</td>
          </tr>
          <tr>
            <th>测量高度</th><td>{{ form.measureHeight }} m</td>
            <th>总云量 / 低云量</th><td>{{ form.totalCloud }} / {{ form.lowCloud }}</td>
          </tr>
        </tbody>
      </table>

      <div class="table-scroll">
        <table class="report-table minute-table">
          <thead>
            <tr><th>#</th><th>风速(m/s)</th><th>风向(°)</th><th>大气压(kPa)</th><th>温度(℃)</th><th>湿度(%RH)</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows.filter(x => Number.isFinite(x.windSpeed) && Number.isFinite(x.windDir))" :key="i">
              <td>{{ i + 1 }}</td><td>{{ r.windSpeed }}</td><td>{{ r.windDir }}</td>
              <td>{{ r.pressure || "-" }}</td><td>{{ r.temperature || "-" }}</td><td>{{ r.humidity || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 2. 过程计算 -->
      <h4 class="sec-title">二、过程计算</h4>
      <table class="report-table">
        <tbody>
          <tr><th>平均温度</th><td>{{ fmt(result.avgTemperature, 1) }} ℃</td><th>平均湿度</th><td>{{ fmt(result.avgHumidity, 1) }} %RH</td></tr>
          <tr><th>平均气压</th><td>{{ fmt(result.avgPressure, 1) }} kPa</td><th>平均风速</th><td>{{ fmt(result.avgWindSpeed, 1) }} m/s</td></tr>
          <tr><th>平均风向（矢量平均）</th><td>{{ fmt(result.avgWindDir, 1) }}°（{{ dirTo16(result.avgWindDir) }}）</td><th>风向标准差 σθ（Yamartino）<button class="tbl-link" @click="showTable('t5')" title="查看表5">表5 ⓘ</button></th><td>{{ fmt(result.windDirStdDev, 1) }}°</td></tr>
          <tr><th>测量高度</th><td>{{ form.measureHeight }} m</td><th>10m 地面风速</th><td>{{ fmt(result.windSpeed10m, 1) }} m/s</td></tr>
          <tr><th>日期序号 dn</th><td>{{ result.dayInYear }}（0 起点计数）</td><th>地球公转角 Q0</th><td>{{ fmt(result.earthRotationAngle, 4) }} rad</td></tr>
          <tr><th>太阳倾角 δ</th><td>{{ fmt(result.sunDipAngle) }}°</td><th>太阳高度角 h₀</th><td>{{ fmt(result.sunElevation) }}°（{{ result.isNight ? "夜间" : "白天" }}）</td></tr>
          <tr><th>太阳辐射等级<button class="tbl-link" @click="showTable('t3')" title="查看表3">表3 ⓘ</button></th><td>{{ radiationLabel(result.radiationLevel) }}</td><th>风廓线幂指数 n<button class="tbl-link" @click="showTable('n')" title="查看风廓线幂指数表">附录D ⓘ</button></th><td>{{ result.windProfileExponent }}</td></tr>
          <tr><th>稳定度预测等级（平均风速）<button class="tbl-link" @click="showTable('t4')" title="查看表4">表4 ⓘ</button></th><td>{{ result.stabilityPredicted }}</td><th>大气稳定度等级（10m 风速）<button class="tbl-link" @click="showTable('t4')" title="查看表4">表4 ⓘ</button></th><td class="level-strong">{{ result.stabilityLevel }}</td></tr>
        </tbody>
      </table>

      <!-- 3. 结论 -->
      <h4 class="sec-title">三、适宜度评定与结论</h4>
      <table class="report-table suit-table">
        <thead>
          <tr><th>评定项</th><th>依据</th><th>类别</th><th>含义</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>大气稳定度适宜度</td>
            <td>稳定度等级 {{ result.stabilityLevel }}<button class="tbl-link" @click="showTable('t7')" title="查看表7">表7 ⓘ</button></td>
            <td><span :class="['suit-badge', suitBadge[result.stabilitySuitability]]">{{ result.stabilitySuitability }}</span></td>
            <td class="left">{{ SUITABILITY_MEANING[result.stabilitySuitability] }}</td>
          </tr>
          <tr>
            <td>风向变化适宜度</td>
            <td>σθ = {{ fmt(result.windDirStdDev, 1) }}°<button class="tbl-link" @click="showTable('t5')" title="查看表5">表5 ⓘ</button></td>
            <td><span :class="['suit-badge', suitBadge[result.windDirSuitability]]">{{ result.windDirSuitability }}</span></td>
            <td class="left">{{ SUITABILITY_MEANING[result.windDirSuitability] }}</td>
          </tr>
          <tr>
            <td>风速适宜度</td>
            <td>平均风速 {{ fmt(result.avgWindSpeed, 1) }} m/s<button class="tbl-link" @click="showTable('t6')" title="查看表6">表6 ⓘ</button></td>
            <td><span :class="['suit-badge', suitBadge[result.windSpeedSuitability]]">{{ result.windSpeedSuitability }}</span></td>
            <td class="left">{{ SUITABILITY_MEANING[result.windSpeedSuitability] }}</td>
          </tr>
          <tr class="total-row">
            <td>总适宜度（8.5.2）</td>
            <td>取三项中适宜程度最差的一类（对监测最不利者）</td>
            <td><span :class="['suit-badge', suitBadge[result.totalSuitability]]">{{ result.totalSuitability }}</span></td>
            <td class="left">{{ SUITABILITY_MEANING[result.totalSuitability] }}</td>
          </tr>
        </tbody>
      </table>
      <div class="rule-bar">
        <span><strong>8.5.3 取消规则</strong>（点击查看原文）：</span>
        <button class="tbl-link" @click="showTable('r853')">8.5.3 条款 ⓘ</button>
        <span class="rule-text">任一项达到 d 类，或其中两项达到 c 类 → 应取消监测或更换时日</span>
        <span :class="['rule-status', result.shouldCancel ? 'rule-bad' : 'rule-good']">
          {{ result.shouldCancel ? "⚠ 本次触发取消条件" : "✓ 本次未触发取消条件" }}
        </span>
      </div>
      <div class="conclusion-box">
        <strong>结论判定：</strong>{{ result.conclusion }}。
        <template v-if="result.shouldCancel"> {{ result.cancelReason }}</template>
        <template v-else> 本次气象条件符合 HJ/T 55-2000 对无组织排放监测的要求，可正常开展监测。</template>
      </div>
    </div>

    <div v-else class="empty-hint">
      <Icon name="chart" :size="44" />
      <p>填写参数后点击「开始计算」，将生成完整评定报表</p>
    </div>

    <!-- ===== 标准查表快查弹窗 ===== -->
    <el-dialog
      v-model="tableViewer"
      :title="activeTable?.title"
      width="560px"
      append-to-body
      destroy-on-close
    >
      <p v-if="activeTable?.note" class="dialog-note">{{ activeTable.note }}</p>
      <table class="ref-table" v-if="activeTable">
        <thead>
          <tr>
            <th v-for="(h, i) in activeTable.head" :key="i">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in activeTable.rows" :key="ri">
            <td v-for="(cell, ci) in row" :key="ci" :class="{ 'row-head': ci === 0 }">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <span class="dialog-src">来源：HJ/T 55-2000《大气污染物无组织排放监测技术导则》</span>
      </template>
    </el-dialog>

    <!-- ===== 计算过程说明 ===== -->
    <div class="explain-card">
      <div class="explain-head" @click="showExplanation = !showExplanation">
        <h3><Icon name="question" :size="17" /> 计算过程说明（HJ/T 55-2000）</h3>
        <span class="toggle">{{ showExplanation ? "收起 ▲" : "展开 ▼" }}</span>
      </div>
      <div v-show="showExplanation" class="explain-body">
        <ol>
          <li>
            <strong>平均量</strong>：平均风速、温度、湿度、气压取各分钟数据算术平均。
            <em>平均风向</em>为环形量（0°/360° 相同），采用<strong>单位矢量平均</strong>：
            θ̄ = atan2( Σsinθᵢ/n, Σcosθᵢ/n )。
          </li>
          <li><strong>日期序号 dn</strong>：测量日期为一年中的第几天（0 起点计数，1月1日 = 0）。</li>
          <li><strong>地球公转角 Q0</strong> = (360 × dn / 365) / 180 × π（弧度）。</li>
          <li>
            <strong>太阳倾角 δ</strong>（HJ/T 55 附录B Cooper 公式）：
            δ = [0.006918 − 0.399912cosQ0 + 0.0702578sinQ0 − 0.006758cosQ0 + 0.000907sin2Q0 − 0.002697cos3Q0 + 0.00148sin3Q0] × 180/π。
          </li>
          <li>
            <strong>太阳高度角 h₀</strong>（导则式2）：
            h₀ = arcsin[ sinφ·sinδ + cosφ·cosδ·cos(15t + λ − 300) ]，
            其中 φ 纬度、λ 经度、t 北京时间（24h 制小数）。
          </li>
          <li>
            <strong>太阳辐射等级</strong>（表3）：夜间仅按云量组合取值；白天按总云量/低云量组合行 + 太阳高度角分档
            （h₀≤15°、15~35°、35~65°、&gt;65°）交叉查表。
          </li>
          <li>
            <strong>大气稳定度等级</strong>（表4）：地面风速档（≤1.9 / 2~2.9 / 3~4.9 / ≥6 m/s）× 太阳辐射等级（+3 ~ −2）交叉查表得 A~F。
            先以<strong>平均风速</strong>查得预测等级用于确定风廓线指数，再以换算后的 <strong>10m 风速</strong>查得最终稳定度等级。
          </li>
          <li>
            <strong>风廓线幂指数 n</strong>：按区域（城市/乡村）与稳定度等级查表——
            城市 A 0.10 / B 0.15 / C 0.20 / D 0.25 / E·F 0.30；乡村 A·B 0.07 / C 0.10 / D 0.15 / E·F 0.25。
          </li>
          <li>
            <strong>10m 地面风速</strong>（导则 7.1）：Ū₁₀ = Ū_z × (10/z)ⁿ，z 为测风实际高度。
          </li>
          <li>
            <strong>风向标准差 σθ</strong>：风向是 0~360° 循环量，不能直接算术平均，采用
            <strong>Yamartino (1984) 算法</strong>：
            E = √(1 − (M_sin² + M_cos²))，σθ = [1.0 + (2/√3 − 1)·E³]·arcsin(E)。
          </li>
          <li>
            <strong>适宜度分类</strong>（导则 8.1，表5/6/7）：
            a 类 不利于扩散、适宜监测；b 类 较不利于扩散、较适宜监测；c 类 有利于扩散、较不适宜监测；d 类 很有利于扩散、不适宜监测。
            <br />风速按平均风速分档（1.0~2.0→a / 2.1~3.0→b / 3.1~4.5→c / &gt;4.5→d）；
            风向按 σθ 分档（&lt;15°→a / 15~29°→b / 30~45°→c / &gt;45°→d）；
            稳定度按等级分类（E·F→a / D→b / C→c / A·B→d）。
          </li>
          <li>
            <strong>总适宜度</strong>（8.5.2）：取风向变化、平均风速、大气稳定度三项中<strong>适宜程度最差</strong>的一类估计总体。
          </li>
          <li>
            <strong>取消判定</strong>（8.5.3）：任一项达到 d 类，或其中两项达到 c 类，该次无组织排放监测应取消或更换日期。
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>

<style scoped>
.atm-tool { display: flex; flex-direction: column; gap: 20px; }

/* ===== 输入卡片 ===== */
.input-card, .report-card, .explain-card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.card-head, .report-head, .explain-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.card-head h3, .report-head h3, .explain-head h3 {
  font-size: 16px; font-weight: 700; color: var(--text);
  display: flex; align-items: center; gap: 8px; margin: 0;
}
.head-actions { display: flex; gap: 8px; }
.import-tip { margin-bottom: 18px; }

/* ===== 左右分栏输入布局 ===== */
.input-columns {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 0 28px;
  align-items: start;
}
.col-left {
  border-right: 1px dashed var(--border-light);
  padding-right: 28px;
  display: flex; flex-direction: column; gap: 14px;
}
.col-title {
  font-size: 13.5px; font-weight: 700; color: var(--text);
  display: flex; align-items: center; gap: 6px; margin-bottom: 2px;
}
.col-title:first-child { margin-top: 0; }
.field label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 6px; font-weight: 500; }
.req { color: #ef4444; margin-left: 2px; }

/* 经纬度 + 定位按钮 */
.geo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.geo-btn { grid-column: span 2; width: 100%; }

/* 总云量/低云量并排 */
.cloud-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* 右栏分钟数据 */
.col-right { min-width: 0; }
.rows-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; }
.rows-head h4 {
  font-size: 13.5px; font-weight: 700; color: var(--text); margin: 0;
  display: flex; align-items: center;
}
.rows-hint { font-size: 12px; color: var(--text-muted); }

/* ===== 输入框大圆角 + 丝滑过渡（覆盖 Element Plus 默认） ===== */
.atm-tool :deep(.el-input__wrapper),
.atm-tool :deep(.el-input-number .el-input__wrapper),
.atm-tool :deep(.el-select__wrapper),
.atm-tool :deep(.el-date-editor.el-input .el-input__wrapper),
.atm-tool :deep(.el-textarea__inner) {
  border-radius: 12px;
  transition: box-shadow 0.25s var(--ease), border-color 0.25s var(--ease), background-color 0.25s var(--ease);
}
.atm-tool :deep(.el-input__wrapper.is-focus),
.atm-tool :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 4px 14px rgba(37, 99, 235, 0.12);
}
.atm-tool :deep(.el-button:not(.is-text):not(.is-link)) {
  border-radius: 12px;
  transition: all 0.25s var(--ease);
}
.atm-tool :deep(.el-radio-group) .el-radio-button__inner {
  border-radius: 0;
  transition: all 0.2s var(--ease);
}
.atm-tool :deep(.el-radio-group) .el-radio-button:first-child .el-radio-button__inner {
  border-radius: 12px 0 0 12px;
}
.atm-tool :deep(.el-radio-group) .el-radio-button:last-child .el-radio-button__inner {
  border-radius: 0 12px 12px 0;
}

/* 表引用链接 */
.tbl-link {
  display: inline-flex; align-items: center;
  margin-left: 6px; padding: 1px 7px;
  font-size: 11.5px; font-weight: 600;
  color: var(--primary); background: var(--primary-light);
  border: 1px solid rgba(37, 99, 235, 0.18); border-radius: 10px;
  cursor: pointer; transition: all 0.2s var(--ease); vertical-align: middle;
}
.tbl-link:hover { background: var(--primary); color: #fff; border-color: var(--primary); }

/* 8.5.3 规则条 */
.rule-bar {
  margin-top: 14px; padding: 12px 16px;
  background: var(--bg-soft); border-radius: var(--radius);
  font-size: 13px; color: var(--text);
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
}
.rule-bar .tbl-link { margin-left: 0; }
.rule-text { color: var(--text-light); }
.rule-status { margin-left: auto; font-weight: 700; font-size: 12.5px; }
.rule-bad { color: #dc2626; }
.rule-good { color: #16a34a; }

/* 快查弹窗 */
.dialog-note { font-size: 12.5px; color: var(--text-muted); margin: 0 0 12px; line-height: 1.6; }
.ref-table { width: 100%; border-collapse: collapse; }
.ref-table th, .ref-table td {
  border: 1px solid var(--border-light); padding: 7px 10px;
  font-size: 13px; text-align: center; color: var(--text);
}
.ref-table thead th { background: var(--primary-light); color: var(--primary); font-weight: 700; white-space: nowrap; }
.ref-table .row-head { background: var(--bg-soft); font-weight: 600; color: var(--text-light); }
.dialog-src { font-size: 12px; color: var(--text-muted); }

.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rows-table, .minute-table { width: 100%; border-collapse: collapse; min-width: 620px; }
.rows-table th, .rows-table td, .minute-table th, .minute-table td {
  padding: 7px 8px; font-size: 13px; text-align: center; border-bottom: 1px solid var(--border-light);
}
.rows-table th { color: var(--text-light); font-weight: 600; background: var(--bg-soft); white-space: nowrap; }
.rows-table .row-no { color: var(--text-muted); font-size: 12px; }
.rows-table :deep(.el-input__inner) { text-align: center; }
.rows-table :deep(.el-input-number) { width: 100%; }

.btn-row { margin-top: 18px; display: flex; gap: 10px; }

/* ===== 报表 ===== */
.report-sub { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }
.verdict { border-radius: var(--radius); padding: 16px 20px; margin: 14px 0 20px; border: 1px solid transparent; }
.verdict-a { background: #fff7ed; border-color: rgba(234, 88, 12, 0.2); color: #9a3412; }
.verdict-b { background: #fefce8; border-color: rgba(202, 138, 4, 0.2); color: #854d0e; }
.verdict-c { background: #f0fdf4; border-color: rgba(22, 163, 74, 0.2); color: #166534; }
.verdict-d { background: #eff6ff; border-color: rgba(37, 99, 235, 0.2); color: #1e40af; }
.verdict-grade { font-size: 15px; margin-bottom: 6px; }
.verdict-grade strong { font-size: 22px; font-weight: 800; margin: 0 2px; }
.verdict-text { font-size: 14px; line-height: 1.7; }
.verdict-cancel { margin-top: 10px; font-size: 13px; font-weight: 600; color: #b91c1c; }
.verdict-ok { margin-top: 10px; font-size: 13px; font-weight: 600; color: #15803d; }

.sec-title {
  font-size: 14.5px; font-weight: 700; color: var(--text);
  margin: 22px 0 10px; padding-left: 10px;
  border-left: 3px solid var(--primary);
}

.report-table { width: 100%; border-collapse: collapse; }
.report-table th, .report-table td {
  border: 1px solid var(--border-light); padding: 8px 12px; font-size: 13px;
}
.report-table tbody th {
  background: var(--bg-soft); color: var(--text-light); font-weight: 600;
  text-align: left; white-space: nowrap; width: 22%;
}
.report-table td { color: var(--text); }
.minute-table { min-width: 560px; margin-top: 10px; }
.minute-table thead th { background: var(--bg-soft); color: var(--text-light); font-weight: 600; }
.level-strong { font-weight: 800; color: var(--primary); font-size: 15px; }

.suit-table thead th { background: var(--bg-soft); color: var(--text-light); font-weight: 600; }
.suit-table .left { text-align: left; }
.total-row td { background: var(--primary-light); font-weight: 600; }
.suit-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  font-weight: 800; font-size: 14px; color: #fff;
}
.badge-a { background: #ea580c; }
.badge-b { background: #ca8a04; }
.badge-c { background: #16a34a; }
.badge-d { background: #2563eb; }

.conclusion-box {
  margin-top: 14px; padding: 14px 18px; font-size: 14px; line-height: 1.8;
  background: var(--bg-soft); border-radius: var(--radius); border-left: 3px solid var(--primary);
  color: var(--text);
}

/* ===== 说明 ===== */
.explain-head { cursor: pointer; user-select: none; }
.explain-head:hover h3 { color: var(--primary); }
.toggle { font-size: 12px; color: var(--text-muted); }
.explain-body ol { margin: 0; padding-left: 20px; }
.explain-body li { font-size: 13.5px; line-height: 1.9; color: var(--text-light); margin-bottom: 8px; }
.explain-body strong { color: var(--text); }
.explain-body em { font-style: normal; color: var(--primary); font-weight: 600; }

.empty-hint {
  text-align: center; padding: 46px 0; color: var(--text-muted);
  background: var(--bg-soft); border-radius: var(--radius-lg);
}
.empty-hint p { margin-top: 10px; font-size: 13.5px; }

/* ===== 打印 ===== */
@media print {
  body * { visibility: hidden; }
  #atm-report, #atm-report * { visibility: visible; }
  #atm-report { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; }
}

/* ===== 移动端 H5 适配 ===== */
@media (max-width: 900px) {
  .input-columns { grid-template-columns: 1fr; gap: 18px; }
  .col-left { border-right: none; padding-right: 0; border-bottom: 1px dashed var(--border-light); padding-bottom: 18px; }
}

@media (max-width: 640px) {
  .input-card, .report-card, .explain-card { padding: 16px 14px; border-radius: 16px; }
  .card-head { flex-direction: column; align-items: stretch; gap: 10px; }
  .head-actions { justify-content: flex-end; }
  .import-tip { margin-bottom: 14px; }
  .cloud-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .geo-grid { grid-template-columns: 1fr; gap: 8px; }
  .geo-btn { grid-column: span 1; }
  /* 分钟数据表：横向滚动自然，输入框收紧 */
  .rows-table, .minute-table { min-width: 540px; }
  .rows-table th, .rows-table td { padding: 6px 5px; font-size: 12.5px; }
  .btn-row { flex-direction: column; gap: 10px; }
  .btn-row :deep(.el-button) { width: 100%; margin-left: 0; }
  .verdict { padding: 14px 14px; }
  .verdict-grade strong { font-size: 19px; }
  .rule-status { margin-left: 0; width: 100%; }
  .report-head { flex-direction: column; align-items: stretch; gap: 10px; }
  .explain-body ol { padding-left: 18px; }
}
</style>
