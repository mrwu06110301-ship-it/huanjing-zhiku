<script setup lang="ts">
import { ref, onMounted, computed, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getToolBySlug } from "@/api/tool";
import type { ToolOut } from "@/types";
import FlueSamplingCalculator from "@/components/FlueSamplingCalculator.vue";
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

function handleCalculate() { alert("计算功能开发中"); }
</script>

<template>
  <div class="tool-page" v-if="tool">
    <FlueSamplingCalculator v-if="isFlueSampling" />

    <template v-else>
      <div class="page-header">
        <div class="page-header-left">
          <h1>
            <Icon :name="tool.slug?.includes('converter') ? 'tools' : tool.slug?.includes('stability') ? 'globe' : 'calculator'" :size="26" />
            {{ tool.name }}
          </h1>
          <p>{{ tool.description }}</p>
        </div>
        <el-button plain size="small" @click="share(tool.name, tool.description)">
          <Icon name="share" :size="14" /> 分享
        </el-button>
      </div>

      <div class="tool-body">
        <div class="tool-inputs">
          <h3>输入参数</h3>
          <div class="input-group" v-if="tool.slug === 'atmospheric-stability'">
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
.tool-page { max-width: 1200px; margin: 0 auto; padding: 24px 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-header-left h1 { font-size: 26px; font-weight: 800; display: flex; align-items: center; gap: 10px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.page-header-left p { font-size: 14px; color: var(--text-light); margin-top: 6px; }
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
