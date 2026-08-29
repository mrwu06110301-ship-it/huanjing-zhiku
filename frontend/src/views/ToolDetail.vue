<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getToolBySlug } from "@/api/tool";
import type { ToolOut } from "@/types";
import FlueSamplingCalculator from "@/components/FlueSamplingCalculator.vue";
import AtmosphericStabilityCalculator from "@/components/AtmosphericStabilityCalculator.vue";
import AirSamplingCalculator from "@/components/AirSamplingCalculator.vue";
import { useShare } from "@/composables/useShare";
import Icon from "@/components/Icon.vue";

const route = useRoute();
const router = useRouter();
const { share } = useShare();
const tool = ref<ToolOut | null>(null);
const inputValues = reactive<Record<string, number>>({});

onMounted(async () => {
  const slug = route.params.slug as string;
  try { const res = await getToolBySlug(slug); tool.value = res.data; }
  catch { router.push("/tools"); }
});

const isFlueSampling = computed(() => tool.value?.slug === "flue-sampling");
const isAtmosphericStability = computed(() => tool.value?.slug === "atmospheric-stability");
const isAirSampling = computed(() => tool.value?.slug === "air-sampling-model");

/** 工具图标：与工具主页 Tools.vue 的 getToolIcon 保持一致 */
const toolIcon = computed(() => {
  const map: Record<string, string> = {
    "atmospheric-stability": "trendUp",
    "unit-converter": "layers",
    "air-sampling-model": "flame",
    "pollution-source-model": "fire",
    "doas-model": "beaker",
    "flue-sampling": "filter",
  };
  return map[tool.value?.slug ?? ""] || "tool";
});

function handleCalculate() { alert("计算功能开发中"); }
</script>

<template>
  <div class="tool-page" v-if="tool">
    <!-- 统一页头：图标+标题靠左上，样式与其他模块主页一致 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon :name="toolIcon" :size="26" />
          </div>
          <h1>{{ tool.name }}</h1>
        </div>
        <p class="page-header-sub">{{ tool.description }}</p>
      </div>
      <el-button plain size="small" class="share-btn" @click="share(tool.name, tool.description)">
        <Icon name="share" :size="14" style="margin-right:6px" /> 分享
      </el-button>
    </div>

    <FlueSamplingCalculator v-if="isFlueSampling" />
    <AtmosphericStabilityCalculator v-else-if="isAtmosphericStability" />
    <AirSamplingCalculator v-else-if="isAirSampling" />

    <template v-else>
      <div class="tool-body">
        <div class="tool-inputs">
          <h3>输入参数</h3>
          <div class="input-group" v-if="false">
            <!-- atmospheric-stability 已由独立组件 AtmosphericStabilityCalculator 承接 -->
            <label>风速（m/s）</label>
            <el-input v-model.number="inputValues.windSpeed" type="number" placeholder="请输入" />
            <label>太阳辐射等级</label>
            <el-select v-model="inputValues.solar" placeholder="请选择">
              <el-option label="强（4）" :value="4" />
              <el-option label="中等（2）" :value="2" />
              <el-option label="弱（1）" :value="1" />
            </el-select>
          </div>
          <div class="input-group" v-else-if="tool.slug === 'unit-converter'">
            <label>数值</label>
            <el-input v-model.number="inputValues.value" type="number" placeholder="请输入" />
            <label>转换类型</label>
            <el-select v-model="inputValues.type" placeholder="请选择">
              <el-option label="mg/m³ → ppm" value="mg_to_ppm" />
              <el-option label="ppm → mg/m³" value="ppm_to_mg" />
              <el-option label="℃ → ℉" value="c_to_f" />
            </el-select>
          </div>
          <div class="input-group" v-else>
            <p style="color: var(--text-light); font-size: 14px;">模型参数输入区 — 功能开发中</p>
          </div>
          <el-button type="primary" @click="handleCalculate" style="margin-top: 16px; width: 100%;">开始计算</el-button>
        </div>

        <div class="tool-result">
          <h3>计算结果</h3>
          <div class="result-placeholder">
            <Icon name="chart" :size="48" class="placeholder-icon" />
            <p>计算结果将在此处展示</p>
            <p style="font-size: 12px; color: var(--text-light);">支持导出 CSV / 复制结果</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tool-page { max-width: 1200px; margin: 0 auto; padding: 24px 0 40px; }
.tool-body { display: grid; grid-template-columns: 360px 1fr; gap: 24px; }
.tool-inputs {
  background: var(--card-bg); border-radius: var(--radius); padding: 24px;
  box-shadow: var(--shadow); height: fit-content; border: 1px solid var(--card-border);
}
.tool-inputs h3 { font-size: 17px; font-weight: 700; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--card-border); color: var(--text); }
.input-group label { display: block; font-size: 13px; color: var(--text-light); margin-bottom: 4px; margin-top: 12px; font-weight: 500; }
.tool-result {
  background: var(--card-bg); border-radius: var(--radius); padding: 24px;
  box-shadow: var(--shadow); border: 1px solid var(--card-border);
}
.tool-result h3 { font-size: 17px; font-weight: 700; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--card-border); color: var(--text); }
.result-placeholder { text-align: center; padding: 60px 20px; color: var(--text-light); }
.placeholder-icon { opacity: 0.3; margin-bottom: 12px; }
@media (max-width: 768px) { .tool-body { grid-template-columns: 1fr; } }
</style>