<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getStandards } from "@/api/standard";
import { getCategories } from "@/api/category";
import type { StandardOut, CategoryOut } from "@/types";
import { useShare } from "@/composables/useShare";
import Icon from "@/components/Icon.vue";

const { share } = useShare();
const router = useRouter();
const standards = ref<StandardOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeCat = ref<number | null>(null);
const searchQuery = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = 24;
const total = ref(0);
const loadingMore = ref(false);

const hasMore = computed(() => standards.value.length < total.value);

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return standards.value;
  const q = searchQuery.value.trim().toLowerCase();
  return standards.value.filter(s =>
    s.title.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q)
  );
});

async function loadStandards(append = false) {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      page_size: pageSize,
      std_type: "document",
    };
    if (activeCat.value) params.category_id = activeCat.value;
    const res = await getStandards(params as any);
    const items = res.data.items || [];
    if (append) {
      standards.value = [...standards.value, ...items];
    } else {
      standards.value = items;
    }
    total.value = res.data.total || 0;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  page.value++;
  loadStandards(true);
}

onMounted(async () => {
  const catRes = await getCategories("standard");
  categories.value = catRes.data;
  loadStandards();
});

function switchCat(id: number | null) {
  activeCat.value = id;
  page.value = 1;
  loadStandards();
}

/** 跳转 kkFileView 在线预览（全格式，手机端可用） */
function openPdf(s: StandardOut) {
  if (s.file_url) {
    const fileAbsUrl = `${window.location.origin}${s.file_url}`;
    const previewUrl = `${window.location.origin}/preview/onlinePreview?url=${encodeURIComponent(btoa(fileAbsUrl))}`;
    window.open(previewUrl, "_blank", "noopener");
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title-icon">
          <Icon name="standard" :size="26" />
        </div>
        <h1>方法标准</h1>
        <p>环境标准 · 职业卫生标准 · EPA标准（共 {{ total }} 项）</p>
      </div>
      <el-button plain size="small" @click="share('方法标准', '环境标准 · 职业卫生标准 · EPA标准')">
        <Icon name="share" :size="14" style="margin-right:6px" /> 分享
      </el-button>
    </div>

    <div class="category-tabs">
      <span :class="['tab', { active: activeCat === null }]" @click="switchCat(null)">全部</span>
      <span
        v-for="c in categories"
        :key="c.id"
        :class="['tab', { active: activeCat === c.id }]"
        @click="switchCat(c.id)"
      >{{ c.name }}</span>
      <div class="search-wrap">
        <Icon name="search" :size="15" class="search-ic" />
        <input v-model="searchQuery" placeholder="搜索标准号/名称..." class="local-search" />
      </div>
    </div>

    <div v-loading="loading" class="std-grid">
      <div
        v-for="s in filtered"
        :key="s.id"
        class="std-card"
        @click="openPdf(s)"
      >
        <div class="std-icon-wrap">
          <Icon name="doc" :size="24" />
        </div>
        <div class="std-info">
          <h3>{{ s.title }}</h3>
          <div class="std-meta">
            <span v-if="s.category_name" class="meta-cat">{{ s.category_name }}</span>
            <span class="meta-item"><Icon name="eye" :size="12" /> {{ s.view_count }}</span>
          </div>
        </div>
        <div class="std-pdf-badge">
          <Icon name="eye" :size="14" />
          <span>预览</span>
        </div>
      </div>
      <el-empty v-if="!loading && standards.length === 0" description="暂无标准文档" />
    </div>

    <div v-if="hasMore && !searchQuery" class="load-more-wrap">
      <button class="load-more-btn" :disabled="loadingMore" @click="loadMore">
        <span v-if="loadingMore">加载中...</span>
        <template v-else>
          加载更多（{{ standards.length }}/{{ total }}）
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 40px 0 24px; }
.page-header-left h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.page-header-left p { color: var(--text-light); font-size: 15px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.tab {
  padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px;
  background: var(--white); border: 1px solid var(--border); transition: all 0.2s var(--ease);
}
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--gradient-primary); color: #fff; border-color: transparent; font-weight: 600; }

.search-wrap {
  position: relative; margin-left: auto; display: flex; align-items: center;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.local-search {
  padding: 7px 14px 7px 34px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 170px; transition: all 0.2s; background: var(--white);
}
.local-search:focus { border-color: var(--primary); width: 210px; }

.std-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; min-height: 200px; }
.std-card {
  display: flex; align-items: flex-start; gap: 14px; padding: 16px 18px;
  background: var(--white); border-radius: var(--radius-lg);
  cursor: pointer; transition: all 0.25s var(--ease); box-shadow: var(--shadow);
  border: 1px solid var(--border-light); position: relative;
}
.std-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: rgba(37, 99, 235, 0.22); }
.std-icon-wrap {
  width: 44px; height: 44px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-light); border-radius: var(--radius-sm); color: var(--primary);
  transition: all 0.25s var(--ease);
}
.std-card:hover .std-icon-wrap { background: var(--gradient-primary); color: #fff; }
.std-info { flex: 1; min-width: 0; }
.std-info h3 {
  font-size: 14px; margin-bottom: 8px; line-height: 1.45; font-weight: 600;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.std-meta { display: flex; gap: 10px; margin-top: 4px; font-size: 12px; color: var(--text-muted); align-items: center; flex-wrap: wrap; }
.meta-cat {
  padding: 2px 8px; background: var(--primary-light); color: var(--primary);
  border-radius: 4px; font-size: 11px; font-weight: 500;
}
.meta-item { display: flex; align-items: center; gap: 4px; }
.std-pdf-badge {
  position: absolute; right: 14px; top: 14px;
  display: flex; align-items: center; gap: 3px;
  font-size: 11px; color: var(--text-muted);
  padding: 3px 8px; border-radius: 4px;
  background: var(--bg-soft); opacity: 0; transition: all 0.2s var(--ease);
}
.std-card:hover .std-pdf-badge {
  opacity: 1; color: var(--primary); background: var(--primary-light);
}

.load-more-wrap { display: flex; justify-content: center; padding: 32px 0 8px; }
.load-more-btn {
  padding: 10px 32px; border-radius: 20px; border: 1px solid var(--border);
  background: var(--white); color: var(--text-light); font-size: 14px; cursor: pointer;
  transition: all 0.2s var(--ease);
}
.load-more-btn:hover:not(:disabled) {
  border-color: var(--primary); color: var(--primary); box-shadow: var(--shadow-md);
}
.load-more-btn:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; }
  .page-header-left h1 { font-size: 22px; }
  .std-grid { grid-template-columns: 1fr; gap: 10px; }
  .search-wrap { margin-left: 0; width: 100%; }
  .local-search { width: 100%; }
  .local-search:focus { width: 100%; }
  .category-tabs { gap: 6px; }
  .tab { padding: 6px 14px; font-size: 13px; }
  .std-pdf-badge { opacity: 1; }
}
</style>
