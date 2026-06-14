<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { globalSearch, type SearchResultItem } from "@/api/search";

const router = useRouter();
const route = useRoute();
const query = ref("");
const results = ref<SearchResultItem[]>([]);
const searching = ref(false);
const searched = ref(false);

let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  // 支持从 URL 参数读取搜索词
  const q = route.query.q as string;
  if (q) {
    query.value = q;
    doSearch();
  }
});

function doSearch() {
  if (!query.value.trim()) {
    results.value = [];
    searched.value = false;
    return;
  }
  searching.value = true;
  searched.value = true;
  globalSearch(query.value.trim())
    .then((res) => {
      results.value = res.data.items;
    })
    .catch(() => {
      results.value = [];
    })
    .finally(() => {
      searching.value = false;
    });
}

watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(doSearch, 400);
});

function goResult(item: SearchResultItem) {
  router.push(item.url);
}

function typeIcon(type: string) {
  const map: Record<string, string> = { article: "📄", tool: "🧮", standard: "📋", faq: "❓" };
  return map[type] || "📌";
}

function typeLabel(type: string) {
  const map: Record<string, string> = { article: "文章", tool: "工具", standard: "标准", faq: "问答" };
  return map[type] || type;
}
</script>

<template>
  <div class="search-page">
    <div class="search-header">
      <h1 class="search-title">🔍 全局检索</h1>
      <p class="search-subtitle">搜索文章、工具、标准和问答</p>
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
          <span style="font-size: 18px">🔍</span>
        </template>
      </el-input>
    </div>

    <div v-if="searching" class="search-status">搜索中...</div>
    <div v-else-if="searched && results.length === 0" class="search-status">
      未找到与 "{{ query }}" 相关的内容
    </div>
    <div v-else-if="results.length > 0" class="search-results">
      <p class="results-count">找到 {{ results.length }} 条结果</p>
      <div
        v-for="item in results"
        :key="`${item.type}-${item.id}`"
        class="result-card"
        @click="goResult(item)"
      >
        <div class="result-type">
          <span class="type-icon">{{ typeIcon(item.type) }}</span>
          <span class="type-label">{{ typeLabel(item.type) }}</span>
        </div>
        <div class="result-body">
          <h3 class="result-title">{{ item.title }}</h3>
          <p class="result-summary">{{ item.summary }}</p>
        </div>
        <span class="result-arrow">→</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-page {
  max-width: 800px;
  margin: 0 auto;
}

.search-header {
  text-align: center;
  margin-bottom: 24px;
}

.search-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a1a1a;
  margin-bottom: 8px;
}

.search-subtitle {
  color: #888;
  font-size: 15px;
}

.search-box {
  margin-bottom: 24px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 12px;
  padding: 4px 16px;
  font-size: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

.search-status {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 15px;
}

.results-count {
  color: #888;
  font-size: 14px;
  margin-bottom: 16px;
}

.result-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #fff;
  border-radius: 10px;
  margin-bottom: 10px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: all 0.2s;
}

.result-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}

.result-type {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 50px;
}

.type-icon {
  font-size: 24px;
}

.type-label {
  font-size: 11px;
  color: #999;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
}

.result-body {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.result-summary {
  font-size: 13px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-arrow {
  color: #ccc;
  font-size: 18px;
}
</style>
