<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticles, deleteArticle } from "@/api/article";
import { getCategories } from "@/api/category";
import type { ArticleListOut, CategoryOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";

const router = useRouter();
const auth = useAuthStore();

const articles = ref<ArticleListOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeCategory = ref<number | null>(null);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 10;

// 管理员可见：待审核文章
const showPending = ref(false);
const pendingArticles = ref<ArticleListOut[]>([]);

const is_admin = computed(() => auth.isAdmin());

const categoryList = computed(() => {
  return [{ id: null, name: "全部", slug: "all", icon: "📂" } as any, ...categories.value];
});

async function loadCategories() {
  const res = await getCategories("forum");
  categories.value = res.data;
}

async function loadArticles() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      page_size: pageSize,
      module: "forum",
    };
    if (activeCategory.value) {
      params.category_id = activeCategory.value;
    }
    if (showPending.value) {
      params.status = "pending";
    }
    const res = await getArticles(params as any);
    articles.value = res.data.items || [];
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

async function loadPendingArticles() {
  if (!is_admin.value) return;
  try {
    const res = await getArticles({ module: "forum", status: "pending", page: 1, page_size: 100 } as any);
    pendingArticles.value = res.data.items || [];
  } catch { /* ignore */ }
}

function switchCategory(catId: number | null) {
  activeCategory.value = catId;
  page.value = 1;
  loadArticles();
}

function handleCreate() {
  router.push("/article/edit");
}

function handleEdit(id: number) {
  router.push(`/article/edit/${id}`);
}

async function handleDelete(id: number) {
  try {
    await ElMessageBox.confirm("确定删除此文章？删除后不可恢复。", "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await deleteArticle(id);
    ElMessage.success("删除成功");
    loadArticles();
    loadPendingArticles();
  } catch { /* 取消或失败 */ }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return dateStr.substring(0, 10);
}

onMounted(async () => {
  await loadCategories();
  await loadArticles();
  if (is_admin.value) loadPendingArticles();
});
</script>

<template>
  <div class="forum-layout">
    <!-- 左侧分类目录 -->
    <aside class="forum-sidebar">
      <div class="sidebar-section">
        <h3 class="sidebar-title">论坛分类</h3>
        <ul class="category-list">
          <li
            v-for="cat in categoryList"
            :key="cat.slug"
            :class="['category-item', { active: activeCategory === cat.id }]"
            @click="switchCategory(cat.id)"
          >
            <span class="cat-icon">{{ cat.icon }}</span>
            <span class="cat-name">{{ cat.name }}</span>
          </li>
        </ul>
      </div>

      <!-- 管理员：待审核提醒 -->
      <div v-if="is_admin && pendingArticles.length" class="sidebar-section pending-section">
        <h3 class="sidebar-title">
          待审核
          <span class="pending-badge">{{ pendingArticles.length }}</span>
        </h3>
        <div class="pending-toggle" @click="showPending = !showPending">
          {{ showPending ? "查看已发布" : "查看待审核" }}
        </div>
      </div>

      <!-- 管理员：发布按钮 -->
      <div v-if="is_admin" class="sidebar-section">
        <el-button type="primary" class="create-btn" @click="handleCreate">
          ✏️ 发布文章
        </el-button>
      </div>
    </aside>

    <!-- 右侧内容区 -->
    <main class="forum-main">
      <!-- 顶部标题栏 -->
      <div class="forum-header">
        <div class="header-left">
          <h1>技术论坛</h1>
          <span class="article-count">共 {{ total }} 篇</span>
        </div>
        <div class="header-right" v-if="!is_admin && auth.isLoggedIn()">
          <el-button size="small" type="primary" plain @click="handleCreate">✏️ 发布文章</el-button>
        </div>
      </div>

      <!-- 状态标签（管理员切换） -->
      <div v-if="is_admin" class="status-tabs">
        <span :class="['status-tab', { active: !showPending }]" @click="showPending = false; loadArticles()">
          已发布
        </span>
        <span :class="['status-tab', { active: showPending }]" @click="showPending = true; loadArticles()">
          待审核 ({{ pendingArticles.length }})
        </span>
      </div>

      <!-- 文章列表 — 公众号风格 -->
      <div v-loading="loading" class="article-list">
        <div
          v-for="article in articles"
          :key="article.id"
          class="article-card"
          @click="router.push(`/article/${article.id}`)"
        >
          <!-- 置顶标签 -->
          <div v-if="article.is_pinned" class="pin-tag">📌 置顶</div>

          <div class="article-body">
            <div class="article-info">
              <h3 class="article-title">{{ article.title }}</h3>
              <p class="article-summary" v-if="article.summary">{{ article.summary }}</p>
              <div class="article-meta">
                <span class="meta-category">{{ article.category_name || "论坛" }}</span>
                <span class="meta-dot">·</span>
                <span>{{ article.author_name }}</span>
                <span class="meta-dot">·</span>
                <span>{{ formatDate(article.created_at) }}</span>
              </div>
            </div>
            <div class="article-cover" v-if="article.cover_image">
              <img :src="article.cover_image" :alt="article.title" />
            </div>
          </div>

          <!-- 管理员操作按钮 -->
          <div v-if="is_admin" class="article-actions" @click.stop>
            <el-button size="small" text type="primary" @click="handleEdit(article.id)">编辑</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(article.id)">删除</el-button>
          </div>
        </div>

        <el-empty v-if="!loading && articles.length === 0" description="暂无文章" />
      </div>

      <!-- 分页 -->
      <div class="pagination" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="page"
          :total="total"
          :page-size="pageSize"
          layout="prev, pager, next"
          @current-change="loadArticles"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.forum-layout {
  display: flex;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px;
}

/* ===== 左侧边栏 ===== */
.forum-sidebar {
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: 88px;
  height: fit-content;
}

.sidebar-section {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
  margin-bottom: 16px;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.category-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--text-light);
}

.category-item:hover {
  background: var(--primary-light);
  color: var(--primary);
}

.category-item.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
}

.cat-icon {
  font-size: 18px;
}

.cat-name {
  flex: 1;
}

.pending-badge {
  background: #e74c3c;
  color: #fff;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.pending-section {
  border-left: 3px solid #e74c3c;
}

.pending-toggle {
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
  padding: 6px 0;
}

.pending-toggle:hover {
  text-decoration: underline;
}

.create-btn {
  width: 100%;
}

/* ===== 右侧主内容 ===== */
.forum-main {
  flex: 1;
  min-width: 0;
}

.forum-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.forum-header h1 {
  font-size: 24px;
  font-weight: 700;
  display: inline;
  margin-right: 10px;
}

.article-count {
  font-size: 13px;
  color: var(--text-light);
}

/* 状态标签 */
.status-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--white);
  border-radius: 8px;
  padding: 4px;
  box-shadow: var(--shadow);
}

.status-tab {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-light);
}

.status-tab:hover {
  color: var(--primary);
}

.status-tab.active {
  background: var(--primary);
  color: #fff;
  font-weight: 500;
}

/* ===== 文章卡片 — 公众号风格 ===== */
.article-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.article-card {
  background: var(--white);
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.article-card:first-child {
  border-radius: var(--radius) var(--radius) 0 0;
  box-shadow: var(--shadow);
}

.article-card:last-child {
  border-radius: 0 0 var(--radius) var(--radius);
  box-shadow: var(--shadow);
  border-bottom: none;
}

.article-card:only-child {
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.article-card:hover {
  background: #f8fafc;
}

.pin-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #fff3e0;
  color: #e67e22;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 8px;
}

.article-body {
  display: flex;
  gap: 16px;
}

.article-info {
  flex: 1;
  min-width: 0;
}

.article-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text);
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-card:hover .article-title {
  color: var(--primary);
}

.article-summary {
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.6;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #999;
  flex-wrap: wrap;
}

.meta-category {
  color: var(--primary);
  font-weight: 500;
}

.meta-dot {
  color: #ccc;
}

.article-cover {
  width: 120px;
  height: 90px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #f0f0f0;
}

.article-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 管理员操作 */
.article-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.article-card:hover .article-actions {
  opacity: 1;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .forum-layout {
    flex-direction: column;
    padding: 16px 12px;
  }

  .forum-sidebar {
    width: 100%;
    position: static;
  }

  .category-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .category-item {
    padding: 6px 12px;
    font-size: 13px;
  }

  .article-cover {
    width: 90px;
    height: 68px;
  }

  .article-actions {
    opacity: 1;
    position: static;
    margin-top: 8px;
    justify-content: flex-end;
  }
}
</style>
