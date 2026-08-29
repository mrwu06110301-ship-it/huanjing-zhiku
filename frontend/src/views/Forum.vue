<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticles, getMyArticles, deleteArticle, approveArticle, rejectArticle } from "@/api/article";
import { getCategories } from "@/api/category";
import type { ArticleListOut, CategoryOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const auth = useAuthStore();

const articles = ref<ArticleListOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeCategory = ref<number | null>(null);
const searchQuery = ref("");
const localFiltered = ref<ArticleListOut[] | null>(null);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 10;

const showPending = ref(false);
const pendingArticles = ref<ArticleListOut[]>([]);

/** 我的文章 */
const showMine = ref(false);
const myArticles = ref<ArticleListOut[]>([]);
const myLoading = ref(false);

const is_admin = computed(() => auth.isAdmin());

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
    if (activeCategory.value) params.category_id = activeCategory.value;
    if (showPending.value) params.status = "pending";
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

/** 加载我的文章（含全部审核状态） */
async function loadMyArticles() {
  if (!auth.isLoggedIn()) return;
  myLoading.value = true;
  try {
    const res = await getMyArticles();
    myArticles.value = res.data.items || [];
  } catch { /* ignore */ }
  finally { myLoading.value = false; }
}

/** 切换到我的文章视图 */
function toggleMine() {
  showMine.value = !showMine.value;
  if (showMine.value) {
    showPending.value = false;
    loadMyArticles();
  }
}

/** 状态徽标文案 */
function statusLabel(s: string): string {
  return s === "approved" ? "已发布" : s === "pending" ? "待审核" : "已拒绝";
}

function handleMyDelete(id: number) {
  ElMessageBox.confirm("确定删除此文章？删除后不可恢复。", "删除确认", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  }).then(async () => {
    try {
      await deleteArticle(id);
      ElMessage.success("删除成功");
      loadMyArticles();
      loadArticles();
      if (is_admin.value) loadPendingArticles();
    } catch { ElMessage.error("删除失败"); }
  }).catch(() => {});
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

async function handleApprove(id: number) {
  try {
    await approveArticle(id);
    ElMessage.success("审核通过");
    loadArticles();
    loadPendingArticles();
  } catch { /* 失败 */ }
}

async function handleReject(id: number) {
  try {
    await rejectArticle(id);
    ElMessage.success("已拒绝");
    loadArticles();
    loadPendingArticles();
  } catch { /* 失败 */ }
}

function filterLocal() {
  if (!searchQuery.value.trim()) { localFiltered.value = null; return; }
  const q = searchQuery.value.trim().toLowerCase();
  localFiltered.value = articles.value.filter(a =>
    a.title.toLowerCase().includes(q) || (a.summary || "").toLowerCase().includes(q)
  );
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
        <h3 class="sidebar-title"><Icon name="folder" :size="17" /> 论坛分类</h3>
        <div class="category-list">
          <div
            :class="['category-item', { active: activeCategory === null }]"
            @click="switchCategory(null)"
          >
            <div class="cat-icon"><Icon name="grid" :size="18" /></div>
            <span class="cat-name">全部</span>
          </div>
          <div
            v-for="cat in categories"
            :key="cat.id"
            :class="['category-item', { active: activeCategory === cat.id }]"
            @click="switchCategory(cat.id)"
          >
            <div class="cat-icon"><Icon name="folder" :size="18" /></div>
            <span class="cat-name">{{ cat.name }}</span>
          </div>
        </div>
      </div>

      <!-- 管理员：待审核提醒 -->
      <div v-if="is_admin && pendingArticles.length" class="sidebar-section pending-section">
        <h3 class="sidebar-title">
          <Icon name="clock" :size="17" /> 待审核
          <span class="pending-badge">{{ pendingArticles.length }}</span>
        </h3>
        <div class="pending-toggle" @click="showPending = !showPending">
          {{ showPending ? "查看已发布" : "查看待审核" }}
        </div>
      </div>

      <!-- 我的文章入口（已登录用户） -->
      <div v-if="auth.isLoggedIn()" class="sidebar-section">
        <div :class="['mine-toggle', { active: showMine }]" @click="toggleMine">
          <Icon name="user" :size="15" /> 我的文章
        </div>
      </div>

      <!-- 管理员/已登录：发布按钮 -->
      <div v-if="is_admin || auth.isLoggedIn()" class="sidebar-section">
        <button class="create-btn" @click="handleCreate">
          <Icon name="edit" :size="16" /> 发布文章
        </button>
      </div>
    </aside>

    <!-- 右侧内容区 -->
    <main class="forum-main">
      <!-- 顶部标题栏 -->
      <div class="forum-header page-header-row">
        <div class="header-left">
          <div class="page-header-main">
            <div class="page-title-icon">
              <Icon name="forum" :size="26" />
            </div>
            <h1>技术论坛</h1>
          </div>
          <p class="page-header-sub">共 {{ total }} 篇技术干货</p>
        </div>
        <div class="header-right">
          <div class="search-wrap">
            <Icon name="search" :size="15" class="search-ic" />
            <input v-model="searchQuery" placeholder="搜索文章..." class="local-search-input" @input="filterLocal" />
          </div>
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

      <!-- 文章列表（我的文章视图） -->
      <template v-if="showMine">
        <div v-loading="myLoading" class="article-list">
          <div
            v-for="article in myArticles"
            :key="article.id"
            class="article-card"
            @click="router.push(`/article/${article.id}`)"
          >
            <div :class="['status-tag', article.status]">{{ statusLabel(article.status) }}</div>

            <div class="article-body">
              <div class="article-info">
                <h3 class="article-title">{{ article.title }}</h3>
                <p class="article-summary" v-if="article.summary">{{ article.summary }}</p>
                <div class="article-meta">
                  <span class="meta-category">{{ article.category_name || "论坛" }}</span>
                  <span class="meta-dot">·</span>
                  <span><Icon name="clock" :size="12" /> {{ formatDate(article.created_at) }}</span>
                  <span class="meta-dot">·</span>
                  <span><Icon name="eye" :size="12" /> {{ article.view_count }}</span>
                </div>
              </div>
              <div class="article-cover" v-if="article.cover_image">
                <img :src="article.cover_image" :alt="article.title" />
              </div>
            </div>

            <!-- 本人操作 -->
            <div class="article-actions" @click.stop>
              <el-button size="small" text type="primary" @click="handleEdit(article.id)">
                <Icon name="edit" :size="14" /> 编辑
              </el-button>
              <el-button size="small" text type="danger" @click="handleMyDelete(article.id)">
                <Icon name="delete" :size="14" /> 删除
              </el-button>
            </div>
          </div>

          <el-empty
            v-if="!myLoading && myArticles.length === 0"
            description="你还没有发布过文章"
          />
        </div>
      </template>

      <!-- 文章列表（普通视图） -->
      <template v-else>
      <div v-loading="loading" class="article-list">
        <div
          v-for="article in (localFiltered || articles)"
          :key="article.id"
          class="article-card"
          @click="router.push(`/article/${article.id}`)"
        >
          <div v-if="article.is_pinned" class="pin-tag">
            <Icon name="pin" :size="12" /> 置顶
          </div>

          <div class="article-body">
            <div class="article-info">
              <h3 class="article-title">{{ article.title }}</h3>
              <p class="article-summary" v-if="article.summary">{{ article.summary }}</p>
              <div class="article-meta">
                <span class="meta-category">{{ article.category_name || "论坛" }}</span>
                <span class="meta-dot">·</span>
                <span class="meta-author">
                  <img v-if="article.author_avatar" :src="article.author_avatar" alt="" class="meta-avatar" />
                  <Icon v-else name="user" :size="12" />
                  {{ article.author_name }}
                </span>
                <span class="meta-dot">·</span>
                <span><Icon name="clock" :size="12" /> {{ formatDate(article.created_at) }}</span>
              </div>
            </div>
            <div class="article-cover" v-if="article.cover_image">
              <img :src="article.cover_image" :alt="article.title" />
            </div>
          </div>

          <!-- 管理员操作按钮 -->
          <div v-if="is_admin" class="article-actions" @click.stop>
            <template v-if="showPending">
              <el-button size="small" text type="success" @click="handleApprove(article.id)">
                <Icon name="check" :size="15" /> 通过
              </el-button>
              <el-button size="small" text type="warning" @click="handleReject(article.id)">
                <Icon name="close" :size="15" /> 拒绝
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" text type="primary" @click="handleEdit(article.id)">
                <Icon name="edit" :size="14" /> 编辑
              </el-button>
              <el-button size="small" text type="danger" @click="handleDelete(article.id)">
                <Icon name="delete" :size="14" /> 删除
              </el-button>
            </template>
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
      </template>
    </main>
  </div>
</template>

<style scoped>
.forum-layout {
  display: flex;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
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
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 18px;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s var(--ease);
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
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cat-name {
  flex: 1;
}

.pending-badge {
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 600;
  margin-left: 6px;
}

.pending-section {
  border-left: 3px solid #ef4444;
}

.pending-toggle {
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
  padding: 6px 0;
  transition: color 0.2s;
}
.pending-toggle:hover {
  color: var(--accent);
}

.mine-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--border, #e5e7eb);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-light);
  cursor: pointer;
  transition: all 0.2s var(--ease);
  background: var(--white, #fff);
}
.mine-toggle:hover { color: var(--primary); border-color: var(--primary); }
.mine-toggle.active {
  background: var(--gradient-primary, linear-gradient(135deg, #2563eb, #06b6d4));
  color: #fff;
  border-color: transparent;
}

.status-tag {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  z-index: 2;
}
.status-tag.approved { background: rgba(22, 163, 74, 0.12); color: #166534; }
.status-tag.pending { background: rgba(217, 119, 6, 0.12); color: #92400e; }
.status-tag.rejected { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }

.create-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--gradient-primary);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s var(--ease);
  box-shadow: 0 2px 12px var(--primary-glow);
}
.create-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px var(--primary-glow);
}

/* ===== 右侧主内容 ===== */
.forum-main {
  flex: 1;
  min-width: 0;
}

.forum-header {
  margin-bottom: 4px;
  padding-top: 12px;
}

.search-wrap {
  position: relative; display: flex; align-items: center;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.local-search-input {
  padding: 8px 14px 8px 36px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 160px; transition: all 0.25s var(--ease); background: var(--white);
}
.local-search-input:focus { border-color: var(--primary); width: 200px; box-shadow: 0 0 0 3px var(--primary-glow); }

/* 状态标签 */
.status-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--white);
  border-radius: 10px;
  padding: 4px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border-light);
}

.status-tab {
  padding: 7px 20px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s var(--ease);
  color: var(--text-light);
  font-weight: 500;
}

.status-tab:hover {
  color: var(--primary);
}

.status-tab.active {
  background: var(--gradient-primary);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px var(--primary-glow);
}

/* ===== 文章卡片 ===== */
.article-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.article-card {
  background: var(--white);
  padding: 18px 90px 18px 24px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.article-card:first-child {
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.article-card:last-child {
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  border-bottom: none;
}

.article-card:only-child {
  border-radius: var(--radius-lg);
}

.article-card:hover {
  background: var(--bg-soft);
}

.pin-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #fff7ed;
  color: #ea580c;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  border: 1px solid rgba(234, 88, 12, 0.15);
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
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  flex-wrap: wrap;
}
.article-meta span {
  display: flex;
  align-items: center;
  gap: 3px;
}

.meta-category {
  color: var(--primary);
  font-weight: 600;
}

.meta-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.meta-dot {
  color: var(--border);
}

.article-cover {
  width: 130px;
  height: 96px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg);
}

.article-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s var(--ease);
}
.article-card:hover .article-cover img {
  transform: scale(1.05);
}

/* 管理员操作 */
.article-actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  justify-content: flex-end;
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
  margin-top: 28px;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .forum-layout {
    flex-direction: column;
    padding: 0 12px;
    gap: 16px;
  }

  .forum-sidebar {
    width: 100%;
    position: static;
  }

  .category-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }

  .category-item {
    padding: 7px 14px;
    font-size: 13px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--border-light);
  }
  .cat-icon { display: none; }

  .forum-header {
    padding-top: 0;
  }

  .header-right {
    display: none;
  }

  .article-cover {
    width: 90px;
    height: 68px;
  }

  .article-actions {
    opacity: 1;
  }
}
</style>
