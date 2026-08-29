<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticle, deleteArticle, approveArticle, rejectArticle } from "@/api/article";
import { getComments, addComment, deleteComment } from "@/api/comment";
import type { ArticleOut, CommentOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";
// 图片预览组件按需引入（避免全量注册）
import { ElImageViewer } from "element-plus";
import { useShare } from "@/composables/useShare";
import Icon from "@/components/Icon.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { share } = useShare();

const article = ref<ArticleOut | null>(null);
const comments = ref<CommentOut[]>([]);
const newComment = ref("");
const loading = ref(false);
const commentLoading = ref(false);

const is_admin = computed(() => auth.isAdmin());
const is_author = computed(() => auth.user?.id === article.value?.author_id);
const can_edit = computed(() => is_admin.value || is_author.value);
// 管理员审核：仅对未发布的文章显示审核按钮
const can_review = computed(() => is_admin.value && !!article.value && article.value.status !== "approved");

async function handleReview(action: "approve" | "reject") {
  if (!article.value) return;
  const id = article.value.id;
  const isApprove = action === "approve";
  try {
    await ElMessageBox.confirm(
      isApprove ? "确定审核通过并发布这篇文章？" : "确定拒绝这篇文章？",
      "审核确认",
      { confirmButtonText: isApprove ? "通过" : "拒绝", cancelButtonText: "取消", type: "warning" }
    );
  } catch { return; }
  try {
    if (isApprove) await approveArticle(id);
    else await rejectArticle(id);
    ElMessage.success(isApprove ? "已审核通过" : "已拒绝");
    const res = await getArticle(id);
    article.value = res.data;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "操作失败");
  }
}

const rendered_content = computed(() => {
  if (!article.value?.content) return "";
  const content = article.value.content;
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content.split("\n").map((line: string) => `<p>${line || "<br>"}</p>`).join("");
});

// ==================== 正文图片点击预览 ====================
const previewVisible = ref(false);
const previewUrlList = ref<string[]>([]);
const previewIndex = ref(0);
const contentRef = ref<HTMLDivElement>();

/** 点击正文任意图片 → 全屏大图预览（可缩放/切换） */
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === "IMG") {
    const imgs = Array.from(contentRef.value?.querySelectorAll("img") || []);
    const idx = imgs.indexOf(target as HTMLImageElement);
    previewUrlList.value = imgs.map(img => img.currentSrc || img.src);
    previewIndex.value = idx >= 0 ? idx : 0;
    previewVisible.value = true;
  }
}

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
  } finally { loading.value = false; }
});

async function handleAddComment() {
  if (!newComment.value.trim()) { ElMessage.warning("请输入评论内容"); return; }
  if (!auth.token) { ElMessage.warning("请先登录"); router.push("/login"); return; }
  commentLoading.value = true;
  try {
    await addComment(Number(route.params.id), newComment.value);
    ElMessage.success("评论成功"); newComment.value = "";
    const res = await getComments(Number(route.params.id));
    comments.value = res.data || [];
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || "评论失败"); }
  finally { commentLoading.value = false; }
}

function handleDeleteComment(id: number) {
  ElMessageBox.confirm("确定删除此评论？", "删除确认", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" })
    .then(() => {
      deleteComment(id).then(() => { ElMessage.success("删除成功"); return getComments(Number(route.params.id)); })
        .then((res) => { comments.value = res.data || []; });
    }).catch(() => {});
}

function handleEdit() { router.push(`/article/edit/${route.params.id}`); }
function handleDelete() {
  ElMessageBox.confirm("确定删除此文章？删除后不可恢复。", "删除确认", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" })
    .then(() => { deleteArticle(Number(route.params.id)).then(() => { ElMessage.success("删除成功"); router.push("/forum"); }); })
    .catch(() => {});
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
      <div class="detail-header">
        <div class="detail-meta-top">
          <span class="meta-category">{{ article.category_name || "论坛" }}</span>
          <span v-if="article.status === 'pending'" class="meta-status pending">待审核</span>
          <span v-if="article.status === 'rejected'" class="meta-status rejected">已拒绝</span>
        </div>
        <h1 class="detail-title">{{ article.title }}</h1>
        <div class="detail-author">
          <div class="author-info">
            <img v-if="article.author_avatar" :src="article.author_avatar" alt="" class="author-avatar-img" />
            <div v-else class="author-avatar">{{ (article.author_name || "匿")[0] }}</div>
            <div class="author-detail">
              <span class="author-name">{{ article.author_name }}</span>
              <span class="author-time">{{ formatDate(article.created_at) }} {{ formatTime(article.created_at) }}</span>
            </div>
          </div>
          <div class="article-stats">
            <span><Icon name="eye" :size="14" /> {{ article.view_count }}</span>
            <span><Icon name="heart" :size="14" /> {{ article.like_count }}</span>
          </div>
        </div>
      </div>

      <div
        class="detail-content rich-text"
        ref="contentRef"
        v-html="rendered_content"
        @click="onContentClick"
      ></div>

      <div class="detail-actions">
        <template v-if="can_review">
          <el-button type="success" size="small" @click="handleReview('approve')">
            <Icon name="check" :size="14" /> 审核通过
          </el-button>
          <el-button type="danger" size="small" @click="handleReview('reject')">
            <Icon name="close" :size="14" /> 拒绝
          </el-button>
        </template>
        <el-button plain size="small" @click="share(article.title, article.summary)">
          <Icon name="share" :size="14" /> 分享
        </el-button>
        <el-button v-if="can_edit" type="primary" plain size="small" @click="handleEdit">
          <Icon name="edit" :size="14" /> 编辑
        </el-button>
        <el-button v-if="can_edit" type="danger" plain size="small" @click="handleDelete">
          <Icon name="delete" :size="14" /> 删除
        </el-button>
      </div>

      <div class="comments-section">
        <h3>留言（{{ comments.length }}）</h3>
        <div class="comment-input" v-if="auth.isLoggedIn()">
          <el-input v-model="newComment" type="textarea" :rows="3" placeholder="写下你的留言..." />
          <el-button type="primary" size="small" @click="handleAddComment" :loading="commentLoading" style="margin-top: 8px;">发表留言</el-button>
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
                <span v-if="auth.user?.id === c.author_id || auth.isAdmin()" class="comment-delete" @click="handleDeleteComment(c.id)">删除</span>
              </div>
              <div class="comment-body">{{ c.content }}</div>
            </div>
          </div>
          <el-empty v-if="comments.length === 0" description="暂无留言，来说两句吧~" :image-size="80" />
        </div>
      </div>

      <!-- 正文图片全屏预览（滚轮/双指缩放、左右切换） -->
      <el-image-viewer
        v-if="previewVisible"
        :url-list="previewUrlList"
        :initial-index="previewIndex"
        teleported
        @close="previewVisible = false"
      />
    </template>
  </div>
</template>

<style scoped>
.detail-page { max-width: 680px; margin: 0 auto; padding: 24px 0; }
.detail-header { margin-bottom: 24px; }
.detail-meta-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.meta-category {
  color: var(--primary); font-weight: 600; font-size: 13px;
  background: rgba(0,204,170,0.1); padding: 3px 12px; border-radius: 6px;
}
.meta-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.meta-status.pending { background: rgba(245,158,11,0.12); color: #e67e22; }
.meta-status.rejected { background: rgba(239,68,68,0.1); color: #e74c3c; }
.detail-title { font-size: 26px; font-weight: 800; line-height: 1.5; margin-bottom: 16px; color: var(--text); }
.detail-author { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--card-border); }
.author-info { display: flex; align-items: center; gap: 12px; }
.author-avatar {
  width: 42px; height: 42px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.author-avatar-img {
  width: 42px; height: 42px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
}
.author-detail { display: flex; flex-direction: column; gap: 2px; }
.author-name { font-size: 15px; font-weight: 600; color: var(--text); }
.author-time { font-size: 12px; color: var(--text-light); }
.article-stats { display: flex; gap: 16px; font-size: 13px; color: var(--text-light); align-items: center; }
.article-stats span { display: flex; align-items: center; gap: 4px; }
.detail-content {
  background: var(--card-bg); border-radius: var(--radius);
  padding: 32px 28px; box-shadow: var(--shadow);
  border: 1px solid var(--card-border); margin-bottom: 16px;
  font-size: 16px; line-height: 2; color: var(--text); word-wrap: break-word;
}
.detail-content :deep(h1) { font-size: 22px; font-weight: 700; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary); }
.detail-content :deep(h2) { font-size: 20px; font-weight: 600; margin: 20px 0 12px; }
.detail-content :deep(h3) { font-size: 18px; font-weight: 600; margin: 16px 0 10px; }
.detail-content :deep(p) { margin: 0 0 16px; }
.detail-content :deep(blockquote) { margin: 16px 0; padding: 12px 16px; background: rgba(0,204,170,0.04); border-left: 4px solid var(--primary); color: var(--text); border-radius: 0 6px 6px 0; }
.detail-content :deep(code) { background: rgba(0,204,170,0.08); padding: 2px 6px; border-radius: 3px; font-size: 14px; color: var(--primary); }
.detail-content :deep(pre) { background: #1a2332; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; margin: 16px 0; }
.detail-content :deep(pre code) { background: none; color: inherit; padding: 0; }
.detail-content :deep(ul), .detail-content :deep(ol) { padding-left: 20px; margin: 8px 0; }
.detail-content :deep(li) { margin: 4px 0; }
.detail-content :deep(img) {
  max-width: 100% !important;  /* 手机端兜底：超出容器时缩到容器宽 */
  height: auto !important;     /* 等比：高度跟随宽度缩放，宽度保留编辑器内联值 */
  object-fit: contain;
  border-radius: 8px; margin: 12px 0;
  cursor: zoom-in;             /* 提示可点击放大预览 */
  transition: opacity 0.2s;
}
.detail-content :deep(img:hover) { opacity: 0.92; }
.detail-content :deep(a) { color: var(--primary); text-decoration: none; }
.detail-content :deep(table) { width: 100%; border-collapse: collapse; margin: 12px 0; }
.detail-content :deep(th), .detail-content :deep(td) { border: 1px solid var(--card-border); padding: 8px 12px; text-align: left; font-size: 14px; }
.detail-content :deep(th) { background: rgba(0,204,170,0.06); font-weight: 600; }
.detail-actions { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 24px; padding: 12px 16px; background: var(--card-bg); border-radius: 10px; border: 1px solid var(--card-border); }
.comments-section { background: var(--card-bg); border-radius: var(--radius); padding: 24px; box-shadow: var(--shadow); border: 1px solid var(--card-border); }
.comments-section h3 { font-size: 17px; font-weight: 700; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--card-border); color: var(--text); }
.comment-input { margin-bottom: 24px; }
.login-hint { padding: 12px 16px; background: rgba(0,204,170,0.04); border-radius: 10px; font-size: 14px; color: var(--text-light); margin-bottom: 20px; text-align: center; }
.login-hint a { color: var(--primary); text-decoration: none; font-weight: 600; }
.comment-list { display: flex; flex-direction: column; gap: 16px; }
.comment-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--card-border); }
.comment-item:last-child { border-bottom: none; }
.comment-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; flex-shrink: 0; }
.comment-body-wrap { flex: 1; min-width: 0; }
.comment-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.comment-author { font-weight: 600; color: var(--text); font-size: 14px; }
.comment-date { color: var(--text-light); font-size: 12px; }
.comment-delete { margin-left: auto; color: var(--text-light); cursor: pointer; font-size: 12px; transition: color 0.2s; }
.comment-delete:hover { color: #e74c3c; }
.comment-body { font-size: 14px; line-height: 1.7; color: var(--text); }
@media (max-width: 768px) {
  .detail-page { padding: 16px 0; }
  .detail-title { font-size: 20px; }
  .detail-content { padding: 20px 16px; font-size: 15px; }
  .detail-author { flex-direction: column; align-items: flex-start; gap: 8px; }
  /* 手机端编辑器遗留固定宽高同样被上方 !important 规则覆盖 */
}
</style>
