<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getTools } from "@/api/tool";
import { getCategories } from "@/api/category";
import type { ToolOut } from "@/types";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const allTools = ref<ToolOut[]>([]);
const categories = ref<{ id: number; name: string }[]>([]);
const activeCategory = ref("");

// 本地过滤：切换分类时其他分类与工具不消失，列表即时切换
const tools = computed(() =>
  activeCategory.value
    ? allTools.value.filter((t) => t.category === activeCategory.value)
    : allTools.value
);

async function loadTools() {
  const res = await getTools();
  allTools.value = res.data || [];
}

async function loadCategories() {
  // 分类与管理后台挂钩：module=tool 的分类即工具分类
  try {
    const res = await getCategories("tool");
    categories.value = (res.data || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }));
  } catch {
    categories.value = [];
  }
}

function getToolIcon(slug: string): string {
  const map: Record<string, string> = {
    "atmospheric-stability": "trendUp",
    "unit-converter": "layers",
    "air-sampling-model": "flame",
    "pollution-source-model": "fire",
    "doas-model": "beaker",
    "flue-sampling": "filter",
  };
  return map[slug] || "tool";
}

onMounted(() => {
  loadTools();
  loadCategories();
});

function goTool(slug: string) {
  router.push(`/tools/${slug}`);
}
</script>

<template>
  <div class="page">
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="tool" :size="26" />
          </div>
          <h1>常用工具</h1>
        </div>
        <p class="page-header-sub">大气监测采样模型与计算工具</p>
      </div>
    </div>

    <div class="category-tabs" v-if="categories.length">
      <span
        :class="['tab', { active: activeCategory === '' }]"
        @click="activeCategory = ''"
      >全部</span>
      <span
        v-for="cat in categories"
        :key="cat.id"
        :class="['tab', { active: activeCategory === cat.name }]"
        @click="activeCategory = activeCategory === cat.name ? '' : cat.name"
      >{{ cat.name }}</span>
    </div>

    <div class="tool-grid">
      <div
        v-for="t in tools"
        :key="t.id"
        class="tool-card"
        @click="goTool(t.slug)"
      >
        <div class="tool-icon">
          <Icon :name="getToolIcon(t.slug)" :size="40" />
        </div>
        <h3>{{ t.name }}</h3>
        <p>{{ t.description }}</p>
        <span class="tool-category">{{ t.category }}</span>
        <span class="tool-arrow"><Icon name="arrowRight" :size="16" /></span>
      </div>
      <el-empty v-if="tools.length === 0" description="暂无工具" />
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { padding: 40px 0 24px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
.tab {
  padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px;
  background: var(--white); border: 1px solid var(--border); transition: all 0.2s var(--ease);
}
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--gradient-primary); color: #fff; border-color: transparent; font-weight: 600; }

.tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
.tool-card {
  background: var(--white); border-radius: var(--radius-lg); padding: 28px 24px; text-align: center;
  cursor: pointer; transition: all 0.3s var(--ease); box-shadow: var(--shadow); position: relative;
  border: 1px solid var(--border-light);
}
.tool-card:hover {
  transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: rgba(0, 184, 217, 0.2);
}
.tool-icon { font-size: 40px; display: block; margin-bottom: 14px; transition: transform 0.3s var(--ease); }
.tool-card:hover .tool-icon { transform: scale(1.15); }
.tool-card h3 { font-size: 16px; margin-bottom: 8px; font-weight: 600; }
.tool-card p { font-size: 13px; color: var(--text-light); line-height: 1.5; }
.tool-category {
  display: inline-block; margin-top: 10px;
  padding: 3px 12px; background: var(--primary-light); color: var(--primary);
  border-radius: 4px; font-size: 11px; font-weight: 500;
}
.tool-arrow {
  position: absolute; right: 16px; bottom: 16px;
  color: var(--text-muted); opacity: 0; transform: translateX(-8px);
  transition: all 0.3s var(--ease);
}
.tool-card:hover .tool-arrow { opacity: 1; transform: translateX(0); color: var(--primary); }
</style>
