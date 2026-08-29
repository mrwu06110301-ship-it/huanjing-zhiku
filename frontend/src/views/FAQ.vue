<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getFAQs } from "@/api/faq";
import { getCategories } from "@/api/category";
import type { FAQOut, CategoryOut } from "@/types";
import { useShare } from "@/composables/useShare";
import Icon from "@/components/Icon.vue";

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
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="faq" :size="26" />
          </div>
          <h1>常见问题</h1>
        </div>
        <p class="page-header-sub">现场问题、设备维护、用户答疑</p>
      </div>
      <el-button plain size="small" class="share-btn" @click="share('常见问题', '现场问题、设备维护、用户答疑')">
        <Icon name="share" :size="14" style="margin-right:6px" /> 分享
      </el-button>
    </div>

    <div class="controls">
      <div class="category-tabs">
        <span
          v-for="tab in typeTabs"
          :key="tab.value"
          :class="['tab', { active: activeType === tab.value }]"
          @click="switchType(tab.value)"
        >{{ tab.label }}</span>
      </div>
      <div class="search-wrap">
        <Icon name="search" :size="15" class="search-ic" />
        <input v-model="searchQuery" placeholder="搜索问题..." class="local-search" />
      </div>
    </div>

    <div v-loading="loading" class="faq-list">
      <el-collapse>
        <el-collapse-item
          v-for="f in filtered"
          :key="f.id"
        >
          <template #title>
            <span class="faq-question">{{ f.question }}</span>
          </template>
          <div class="faq-answer">
            {{ f.answer }}
          </div>
          <div class="faq-meta">
            <span><Icon name="user" :size="12" /> {{ f.author_name }}</span>
            <span><Icon name="clock" :size="12" /> {{ f.created_at?.substring(0, 10) }}</span>
            <span><Icon name="eye" :size="12" /> {{ f.view_count }}</span>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!loading && faqs.length === 0" description="暂无问题" />
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { padding: 40px 0 24px; }

.controls { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.category-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tab {
  padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px;
  background: var(--white); border: 1px solid var(--border); transition: all 0.2s var(--ease);
  font-weight: 500; color: var(--text-light);
}
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--gradient-primary); color: #fff; border-color: transparent; font-weight: 600; box-shadow: 0 2px 8px var(--primary-glow); }

.search-wrap {
  position: relative; display: flex; align-items: center; margin-left: auto;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.local-search {
  padding: 8px 14px 8px 36px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 160px; transition: all 0.25s var(--ease); background: var(--white);
}
.local-search:focus { border-color: var(--primary); width: 200px; box-shadow: 0 0 0 3px var(--primary-glow); }

.faq-list {
  background: var(--white); border-radius: var(--radius-lg);
  padding: 8px 24px 24px; box-shadow: var(--shadow); border: 1px solid var(--border-light);
}

.faq-question {
  font-size: 16px; font-weight: 600; color: var(--text);
}

.faq-answer {
  line-height: 1.9; color: var(--text-light); font-size: 15px;
  padding: 4px 0;
}

.faq-meta {
  display: flex; gap: 18px; margin-top: 14px; font-size: 12px; color: var(--text-muted);
}
.faq-meta span {
  display: flex; align-items: center; gap: 4px;
}

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; }
  .controls { flex-direction: column; align-items: stretch; }
  .search-wrap { margin-left: 0; }
  .local-search { width: 100%; }
  .faq-list { padding: 8px 16px 20px; }
}
</style>
