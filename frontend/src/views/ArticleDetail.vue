<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticle, deleteArticle } from "@/api/article";
import { getComments, addComment, deleteComment } from "@/api/comment";
import type { ArticleOut, CommentOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";
import MarkdownIt from "markdown-it";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

const article = ref<ArticleOut | null>(null);
const comments = ref<CommentOut[]>([]);
const newComment = ref("");
const loading = ref(false);
const commentLoading = ref(false);

const is_admin = computed(() => auth.isAdmin());
const is_author = computed(() => auth.user?.id === article.value?.author_id);
const can_edit = computed(() => is_admin.value || is_author.value);

const rendered_content = computed(() => {
  if (!article.value?.content) return "";
  // 如果内容包含 markdown 标记（#、**、- 等），用 markdown 渲染
  const content = article.value.content;
  if (/^#|\*\*|^\-|^\>|^\`\`\`/m.test(content)) {
    return md.render(content);
  }
  // 否则保留换行
  return content.split("\n").map((line: string) => `<p>${line || "<br>"}</p>`).join("");
});

onMounted(async () => {
  if (!route.params.id) return;
  loading.value = true;
  try {
    const [artRes, cmtRes] = await Promise.all([
      getArticle(Number(route.params.id)),
      getComments(Number(route.params.id)),
    ]);
    article.value = artRes.data;
    comments.value = cmtRes.data || [];
  } finally {
    loading.value = false;
  }
});

async function handleAddComment() {
  if (!newComment.value.trim()) {
    ElMessage.warning("请输入评论内容");
    return;
  }
  if (!auth.token) {
    ElMessage.warning("请先登录");
    router.push("/login");
    return;
  }
  commentLoading.value = true;
  try {
    await addComment(Number(route.params.id), newComment.value);
    ElMessage.success("评论成功");
    newComment.value = "";
    const res = await getComments(Number(route.params.id));
    comments.value = res.data || [];
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "评论失败");
  } finally {
    commentLoading.value = false;
  }
}

function handleDeleteComment(id: number) {
  ElMessageBox.confirm("确定删除此评论？", "删除确认", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  }).then(() => {
    deleteComment(id).then(() => {
      ElMessage.success("删除成功");
      return getComments(Number(route.params.id));
    }).then((res) => {
      comments.value = res.data || [];
    });
  }).catch(() => {});
}

function handleEdit() {
  router.push(`/article/edit/${route.params.id}`);
}

function handleDelete() {
  ElMessageBox.confirm("确定删除此文章？删除后不可恢复。", "删除确认", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  }).then(() => {
    deleteArticle(Number(route.params.id)).then(() => {
      ElMessage.success("删除成功");
      router.push("/forum");
    });
  }).catch(() => {});
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
</script>

<template>
  <div class="detail-page" v-loading="loading">
    <template v-if="article">
      <!-- 公众号风格顶部 -->
      <div class="detail-header">
        <div class="detail-meta-top">
          <span class="meta-category">{{ article.category_name || "论坛" }}</span>
          <span v-if="article.status === 'pending'" class="meta-status pending">待审核</span>
          <span v-if="article.status === 'rejected'" class="meta-status rejected">已拒绝</span>
        </div>
        <h1 class="detail-title">{{ article.title }}</h1>
        <div class="detail-author">
          <div class="author-info">
            <div class="author-avatar">{{ (article.author_name || "匿")[0] }}</div>
            <div class="author-detail">
              <span class="author-name">{{ article.author_name }}</span>
              <span class="author-time">{{ formatDate(article.created_at) }} {{ formatTime(article.created_at) }}</span>
            </div>
          </div>
          <div class="article-stats">
            <span>👁 {{ article.view_count }}</span>
            <span>♡ {{ article.like_count }}</span>
          </div>
        </div>
        <!-- 标签 -->
        <div class="detail-tags" v-if="article.tags?.length">
          <span class="tag" v-for="t in article.tags" :key="t"># {{ t }}</span>
        </div>
      </div>

      <!-- 文章正文 — 公众号阅读风格 -->
      <div class="detail-content rich-text" v-html="rendered_content"></div>

      <!-- 管理员/作者操作栏 -->
      <div v-if="can_edit" class="detail-actions">
        <el-button type="primary" plain @click="handleEdit">✏️ 编辑</el-button>
        <el-button type="danger" plain @click="handleDelete">🗑️ 删除</el-button>
      </div>

      <!-- 评论区 -->
      <div class="comments-section">
        <h3>留言（{{ comments.length }}）</h3>

        <div class="comment-input" v-if="auth.isLoggedIn()">
          <el-input
            v-model="newComment"
            type="textarea"
            :rows="3"
            placeholder="写下你的留言..."
            :loading="commentLoading"
          />
          <el-button type="primary" size="small" @click="handleAddComment" style="margin-top: 8px;">
            发表留言
          </el-button>
        </div>
        <div v-else class="login-hint">
          请<router-link to="/login">登录</router-link>后发表留言
        </div>

        <div class="comment-list">
          <div v-for="c in comments" :key="c.id" class="comment-item">
            <div class="comment-avatar">{{ (c.author_name || "匿")[0] }}</div>
            <div class="comment-body-wrap">
              <div class="comment-header">
                <span class="comment-author">{{ c.author_name }}</span>
                <span class="comment-date">{{ formatDate(c.created_at) }}</span>
                <span
                  v-if="auth.user?.id === c.author_id || auth.isAdmin()"
                  class="comment-delete"
                  @click="handleDeleteComment(c.id)"
                >删除</span>
              </div>
              <div class="comment-body">{{ c.content }}</div>
            </div>
          </div>
          <el-empty v-if="comments.length === 0" description="暂无留言，来说两句吧~" :image-size="80" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 0;
}

/* ===== 顶部信息 ===== */
.detail-header {
  margin-bottom: 32px;
}

.detail-meta-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.meta-category {
  color: var(--primary);
  font-weight: 500;
  font-size: 13px;
  background: var(--primary-light);
  padding: 2px 10px;
  border-radius: 4px;
}

.meta-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.meta-status.pending {
  background: #fff3e0;
  color: #e67e22;
}

.meta-status.rejected {
  background: #fde8e8;
  color: #e74c3c;
}

.detail-title {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.5;
  margin-bottom: 16px;
  color: var(--text);
  letter-spacing: 0.5px;
}

.detail-author {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.author-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), #00ccaa);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.author-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.author-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
}

.author-time {
  font-size: 12px;
  color: #999;
}

.article-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #999;
}

.detail-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.tag {
  padding: 2px 10px;
  background: #f0f4f8;
  color: #666;
  border-radius: 4px;
  font-size: 12px;
}

/* ===== 正文 — 公众号阅读风格 ===== */
.detail-content {
  background: var(--white);
  border-radius: var(--radius);
  padding: 32px 28px;
  box-shadow: var(--shadow);
  margin-bottom: 24px;
  font-size: 16px;
  line-height: 2;
  color: #333;
  word-wrap: break-word;
}

/* rich-text markdown 渲染样式 */
.detail-content :deep(h1) {
  font-size: 22px;
  font-weight: 700;
  margin: 24px 0 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--primary);
}

.detail-content :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  margin: 20px 0 12px;
}

.detail-content :deep(h3) {
  font-size: 18px;
  font-weight: 600;
  margin: 16px 0 10px;
}

.detail-content :deep(p) {
  margin: 0 0 16px;
  text-indent: 0;
}

.detail-content :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 16px;
  background: #f8f9fa;
  border-left: 4px solid var(--primary);
  color: #555;
  border-radius: 0 6px 6px 0;
}

.detail-content :deep(code) {
  background: #f0f4f8;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 14px;
  color: #e74c3c;
}

.detail-content :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 16px 0;
}

.detail-content :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}

.detail-content :deep(ul),
.detail-content :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.detail-content :deep(li) {
  margin: 4px 0;
}

.detail-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 12px 0;
}

.detail-content :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.detail-content :deep(a:hover) {
  text-decoration: underline;
}

.detail-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.detail-content :deep(th),
.detail-content :deep(td) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
  font-size: 14px;
}

.detail-content :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
}

/* ===== 操作栏 ===== */
.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-bottom: 24px;
}

/* ===== 评论区 ===== */
.comments-section {
  background: var(--white);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow);
}

.comments-section h3 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.comment-input {
  margin-bottom: 24px;
}

.login-hint {
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
  text-align: center;
}

.login-hint a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.comment-item:last-child {
  border-bottom: none;
}

.comment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}

.comment-body-wrap {
  flex: 1;
  min-width: 0;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.comment-author {
  font-weight: 500;
  color: var(--text);
  font-size: 14px;
}

.comment-date {
  color: #bbb;
  font-size: 12px;
}

.comment-delete {
  margin-left: auto;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  transition: color 0.2s;
}

.comment-delete:hover {
  color: #e74c3c;
}

.comment-body {
  font-size: 14px;
  line-height: 1.7;
  color: #555;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .detail-page {
    padding: 16px 0;
  }

  .detail-title {
    font-size: 20px;
  }

  .detail-content {
    padding: 20px 16px;
    font-size: 15px;
    line-height: 1.8;
  }

  .detail-author {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
