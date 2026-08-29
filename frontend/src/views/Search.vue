<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { globalSearch, type SearchResultItem } from "@/api/search";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const route = useRoute();
const query = ref("");
const results = ref<SearchResultItem[]>([]);
const searching = ref(false);
const searched = ref(false);

let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  const q = route.query.q as string;
  if (q) { query.value = q; doSearch(); }
});

// 顶栏搜索在搜索页内再次触发时，路由 query 变化但组件不重挂载——这里监听补执行
watch(() => route.query.q, (newQ) => {
  if (newQ && typeof newQ === "string") {
    query.value = newQ;
    doSearch();
  }
});

function doSearch() {
  if (!query.value.trim()) { results.value = []; searched.value = false; return; }
  searching.value = true; searched.value = true;
  globalSearch(query.value.trim())
    .then((res) => { results.value = res.data.items; })
    .catch(() => { results.value = []; })
    .finally(() => { searching.value = false; });
}

watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(doSearch, 400);
});

function goResult(item: SearchResultItem) { router.push(item.url); }

function typeIcon(type: string): string {
  const map: Record<string, string> = { article: "doc", tool: "tool", standard: "standard", faq: "faq", video: "video" };
  return map[type] || "pin";
}

function typeLabel(type: string) {
  const map: Record<string, string> = { article: "文章", tool: "工具", standard: "标准", faq: "问答", video: "视频" };
  return map[type] || type;
}
</script>

<template>
  <div class="search-page">
    <div class="search-header">
      <h1 class="search-title"><Icon name="search" :size="34" /> 全局检索</h1>
      <p class="search-subtitle">搜索文章、视频、工具、标准和问答</p>
    </div>

    <div class="search-box">
      <el-input
        v-model="query"
        placeholder="输入关键词搜索..."
        size="large"
        clearable
        class="search-input"
        @keyup.enter="doSearch"
      >
        <template #prefix>
          <Icon name="search" :size="20" style="opacity:0.5" />
        </template>
      </el-input>
    </div>

    <div v-if="searching" class="search-status">搜索中...</div>
    <div v-else-if="searched && results.length === 0" class="search-status">
      未找到与 "{{ query }}" 相关的内容
    </div>
    <div v-else-if="results.length > 0" class="search-results">
      <p class="results-count">找到 {{ results.length }} 条结果</p>
      <div v-for="item in results" :key="`${item.type}-${item.id}`" class="result-card" @click="goResult(item)">
        <div class="result-type">
          <Icon :name="typeIcon(item.type)" :size="24" />
          <span class="type-label">{{ typeLabel(item.type) }}</span>
        </div>
        <div class="result-body">
          <h3 class="result-title">{{ item.title }}</h3>
          <p class="result-summary">{{ item.summary }}</p>
        </div>
        <Icon name="arrowRight" :size="18" class="result-arrow" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-page { max-width: 800px; margin: 0 auto; padding: 24px 0; }
.search-header { text-align: center; margin-bottom: 28px; }
.search-title { font-size: 30px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.search-subtitle { color: var(--text-light); font-size: 15px; margin-top: 8px; }
.search-box { margin-bottom: 24px; }
.search-input :deep(.el-input__wrapper) {
  border-radius: 14px; padding: 6px 18px; font-size: 16px;
  box-shadow: var(--shadow); border: 1px solid var(--card-border);
  transition: all 0.3s;
}
.search-input :deep(.el-input__wrapper:hover) { border-color: var(--primary); box-shadow: 0 4px 20px rgba(0,204,170,0.1); }
.search-status { text-align: center; color: var(--text-light); padding: 60px 0; font-size: 15px; }
.results-count { color: var(--text-light); font-size: 14px; margin-bottom: 16px; }
.result-card {
  display: flex; align-items: center; gap: 16px; padding: 18px 20px;
  background: var(--card-bg); border: 1px solid var(--card-border);
  border-radius: 12px; margin-bottom: 10px; cursor: pointer;
  transition: all 0.3s; box-shadow: var(--shadow);
}
.result-card:hover { border-color: var(--primary); box-shadow: 0 8px 30px rgba(0,204,170,0.12); transform: translateY(-2px); }
.result-type { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 50px; color: var(--primary); }
.type-label { font-size: 11px; color: var(--primary); background: rgba(0,204,170,0.1); padding: 2px 8px; border-radius: 6px; font-weight: 500; }
.result-body { flex: 1; min-width: 0; }
.result-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.result-summary { font-size: 13px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-arrow { color: var(--text-light); flex-shrink: 0; transition: transform 0.2s; }
.result-card:hover .result-arrow { transform: translateX(4px); color: var(--primary); }
@media (max-width: 768px) { .search-page { padding: 16px; } }
</style>
