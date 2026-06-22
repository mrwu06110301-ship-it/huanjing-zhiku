<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getFAQs } from "@/api/faq";
import { getCategories } from "@/api/category";
import type { FAQOut, CategoryOut } from "@/types";
import { useShare } from "@/composables/useShare";

const faqs = ref<FAQOut[]>([]);
const { share } = useShare();
const categories = ref<CategoryOut[]>([]);
const activeType = ref("");
const searchQuery = ref("");
const loading = ref(false);

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return faqs.value;
  const q = searchQuery.value.trim().toLowerCase();
  return faqs.value.filter(f =>
    f.question.toLowerCase().includes(q) || (f.answer || "").toLowerCase().includes(q)
  );
});

const typeTabs = [
  { label: "全部", value: "" },
  { label: "现场常见问题", value: "onsite" },
  { label: "用户提问", value: "user_question" },
  { label: "设备问题", value: "equipment" },
  { label: "维修维护指南", value: "maintenance" },
];

async function loadFAQs() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 50 };
    if (activeType.value) params.faq_type = activeType.value;
    const res = await getFAQs(params as any);
    faqs.value = res.data.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const catRes = await getCategories("faq");
  categories.value = catRes.data;
  loadFAQs();
});

function switchType(type: string) {
  activeType.value = type;
  loadFAQs();
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <h1>❓ 常见问题</h1>
        <p>现场问题、设备维护、用户答疑</p>
      </div>
      <el-button plain size="small" @click="share('常见问题', '现场问题、设备维护、用户答疑')">🔗 分享</el-button>
    </div>

    <div class="category-tabs">
      <span
        v-for="tab in typeTabs"
        :key="tab.value"
        :class="['tab', { active: activeType === tab.value }]"
        @click="switchType(tab.value)"
      >{{ tab.label }}</span>
      <input v-model="searchQuery" placeholder="搜索问题..." class="local-search" />
    </div>

    <div v-loading="loading" class="faq-list">
      <el-collapse>
        <el-collapse-item
          v-for="f in filtered"
          :key="f.id"
          :title="f.question"
        >
          <div style="line-height: 1.8; color: var(--text);">
            {{ f.answer }}
          </div>
          <div class="faq-meta">
            <span>{{ f.author_name }}</span>
            <span>{{ f.created_at?.substring(0, 10) }}</span>
            <span>👁 {{ f.view_count }}</span>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!loading && faqs.length === 0" description="暂无问题" />
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 40px 0 24px; }
.page-header-left h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.page-header-left p { color: var(--text-light); font-size: 15px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.tab { padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px; background: var(--white); border: 1px solid var(--border); transition: all 0.2s; }
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.faq-meta { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: var(--text-light); }

.local-search {
  margin-left: auto; padding: 6px 14px; border: 1px solid #e0e0e0; border-radius: 16px;
  font-size: 13px; outline: none; width: 150px; transition: all 0.2s;
}
.local-search:focus { border-color: #00ccaa; width: 190px; }
</style>
