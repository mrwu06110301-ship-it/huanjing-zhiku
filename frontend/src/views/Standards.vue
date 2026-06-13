<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getStandards } from "@/api/standard";
import { getCategories } from "@/api/category";
import type { StandardOut, CategoryOut } from "@/types";

const router = useRouter();
const standards = ref<StandardOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeType = ref("");
const loading = ref(false);

const typeTabs = [
  { label: "全部", value: "" },
  { label: "标准文档", value: "document" },
  { label: "标准解读", value: "interpretation" },
  { label: "选型手册", value: "selection_guide" },
];

async function loadStandards() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 20 };
    if (activeType.value) params.std_type = activeType.value;
    const res = await getStandards(params as any);
    standards.value = res.data.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const catRes = await getCategories("standard");
  categories.value = catRes.data;
  loadStandards();
});

function switchType(type: string) {
  activeType.value = type;
  loadStandards();
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>📋 方法标准</h1>
      <p>标准文档、标准解读、选型手册</p>
    </div>

    <div class="category-tabs">
      <span
        v-for="tab in typeTabs"
        :key="tab.value"
        :class="['tab', { active: activeType === tab.value }]"
        @click="switchType(tab.value)"
      >{{ tab.label }}</span>
    </div>

    <div v-loading="loading" class="std-grid">
      <div
        v-for="s in standards"
        :key="s.id"
        class="std-card"
        @click="router.push(`/article/${s.id}`)"
      >
        <div class="std-icon">
          📄
        </div>
        <div class="std-info">
          <h3>{{ s.title }}</h3>
          <p>{{ s.description }}</p>
          <div class="std-meta">
            <span>{{ s.author_name }}</span>
            <span>👁 {{ s.view_count }}</span>
            <span>⬇️ {{ s.download_count }}</span>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && standards.length === 0" description="暂无标准文档" />
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

.std-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.std-card { display: flex; gap: 16px; padding: 20px; background: var(--white); border-radius: var(--radius); cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow); }
.std-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.1); }
.std-icon { font-size: 40px; line-height: 1; padding-top: 4px; }
.std-info { flex: 1; min-width: 0; }
.std-info h3 { font-size: 16px; margin-bottom: 6px; line-height: 1.4; }
.std-info p { font-size: 13px; color: var(--text-light); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.std-meta { display: flex; gap: 12px; margin-top: 10px; font-size: 12px; color: var(--text-light); }
</style>
