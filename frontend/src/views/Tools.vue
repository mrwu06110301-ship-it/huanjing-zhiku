<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getTools } from "@/api/tool";
import type { ToolOut } from "@/types";

const router = useRouter();
const tools = ref<ToolOut[]>([]);
const categories = ref<string[]>([]);
const activeCategory = ref("");

async function loadTools() {
  const res = await getTools(activeCategory.value ? { category: activeCategory.value } : {});
  tools.value = res.data || [];
  // 提取所有分类
  const cats = new Set<string>();
  (res.data || []).forEach((t: ToolOut) => cats.add(t.category));
  categories.value = Array.from(cats);
}

onMounted(() => {
  loadTools();
});

function goTool(slug: string) {
  router.push(`/tools/${slug}`);
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>🧮 常用工具</h1>
      <p>大气监测采样模型与计算工具</p>
    </div>

    <div class="category-tabs" v-if="categories.length">
      <span
        :class="['tab', { active: activeCategory === '' }]"
        @click="activeCategory = ''; loadTools()"
      >全部</span>
      <span
        v-for="cat in categories"
        :key="cat"
        :class="['tab', { active: activeCategory === cat }]"
        @click="activeCategory = cat; loadTools()"
      >{{ cat }}</span>
    </div>

    <div class="tool-grid">
      <div
        v-for="t in tools"
        :key="t.id"
        class="tool-card"
        @click="goTool(t.slug)"
      >
        <div class="tool-icon">{{ t.icon }}</div>
        <h3>{{ t.name }}</h3>
        <p>{{ t.description }}</p>
        <span class="tool-category">{{ t.category }}</span>
        <span class="tool-arrow">→</span>
      </div>
      <el-empty v-if="tools.length === 0" description="暂无工具" />
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { text-align: center; padding: 40px 0 24px; }
.page-header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.page-header p { color: var(--text-light); font-size: 15px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.tab { padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px; background: var(--white); border: 1px solid var(--border); transition: all 0.2s; }
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.tool-card { background: var(--white); border-radius: var(--radius); padding: 24px; text-align: center; cursor: pointer; transition: all 0.25s; box-shadow: var(--shadow); position: relative; }
.tool-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.12); }
.tool-icon { font-size: 40px; display: block; margin-bottom: 12px; }
.tool-card h3 { font-size: 16px; margin-bottom: 8px; }
.tool-card p { font-size: 13px; color: var(--text-light); line-height: 1.5; }
.tool-category { display: inline-block; margin-top: 8px; padding: 2px 10px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 11px; }
.tool-arrow { position: absolute; right: 16px; bottom: 16px; color: var(--text-light); font-size: 18px; }
</style>
