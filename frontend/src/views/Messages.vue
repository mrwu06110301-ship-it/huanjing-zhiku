<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import {
  getMessages, getMyMessages,
  createMessage, likeMessage, replyToMessage, getMessageReplies,
  deleteMessage, deleteMessageReply, formatDate,
  type MessageOut,
} from "@/api/message";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";

const auth = useAuthStore();
const publishedMessages = ref<MessageOut[]>([]);
const myMessages = ref<MessageOut[]>([]);
const loading = ref(false);
const submitting = ref(false);

const form = ref({ content: "", contact: "" });
const activeTab = ref<"all" | "mine">("all");
// 排序：time 时间倒序 / likes 点赞数倒序
const sortBy = ref<"time" | "likes">("time");

// 回复
const replyingTo = ref<number | null>(null);
const replyText = ref("");
// 展开全部回复的留言 id 集合（默认只展示后端返回的前几条预览）
const expandedReplies = ref<Record<number, MessageOut[]>>({});
const loadingReplies = ref<Record<number, boolean>>({});
const PREVIEW_COUNT = 2;

/** 当前该留言应展示的回复列表：未展开用预览，展开用全量 */
function visibleReplies(msg: MessageOut): MessageOut[] {
  if (expandedReplies.value[msg.id]) return expandedReplies.value[msg.id];
  return (msg.replies_preview || []).map((r) => ({
    id: r.id, content: r.content, contact: "", author_id: null,
    author_name: r.author_name, status: "approved", like_count: 0, liked: false,
    reply: "", reply_count: 0, replies_preview: [],
    parent_id: msg.id, created_at: r.created_at,
  }));
}

/** 是否显示"查看更多回复"：有更多未展示的回复 */
function hasMoreReplies(msg: MessageOut): boolean {
  return !expandedReplies.value[msg.id] && (msg.reply_count || 0) > (msg.replies_preview || []).length;
}

onMounted(() => {
  loadAll();
  if (auth.isLoggedIn()) loadMyMessages();
});

async function loadAll() {
  loading.value = true;
  try {
    const res = await getMessages({ page: 1, page_size: 50, sort: sortBy.value });
    publishedMessages.value = res.data;
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

function switchSort(s: "time" | "likes") {
  if (sortBy.value === s) return;
  sortBy.value = s;
  loadAll();
}

async function loadMyMessages() {
  try {
    const res = await getMyMessages();
    myMessages.value = res.data;
  } catch { /* ignore */ }
}

async function submitMessage() {
  if (!form.value.content.trim()) {
    ElMessage.warning("请输入留言内容");
    return;
  }
  submitting.value = true;
  try {
    await createMessage({ content: form.value.content, contact: form.value.contact });
    ElMessage.success("留言发布成功！");
    form.value = { content: "", contact: "" };
    loadAll();
    if (auth.isLoggedIn()) {
      await loadMyMessages();
      activeTab.value = "mine";
    }
  } catch {
    ElMessage.error("提交失败");
  } finally { submitting.value = false; }
}

async function toggleLike(msg: MessageOut) {
  if (!auth.isLoggedIn()) {
    ElMessage.warning("请先登录后点赞");
    return;
  }
  try {
    const res = await likeMessage(msg.id);
    msg.like_count = res.data.like_count;
    msg.liked = res.data.action === "liked";
  } catch {
    ElMessage.error("操作失败");
  }
}

async function submitReply(msgId: number) {
  if (!replyText.value.trim()) return;
  try {
    await replyToMessage(msgId, replyText.value.trim());
    ElMessage.success("回复成功");
    replyText.value = "";
    replyingTo.value = null;
    loadReplies(msgId);
  } catch { ElMessage.error("回复失败"); }
}

async function loadReplies(msgId: number) {
  loadingReplies.value[msgId] = true;
  try {
    const res = await getMessageReplies(msgId);
    expandedReplies.value[msgId] = res.data;
  } catch { expandedReplies.value[msgId] = []; }
  finally { loadingReplies.value[msgId] = false; }
}

// 管理员删除
async function handleDelete(id: number) {
  try {
    await deleteMessage(id);
    ElMessage.success("已删除");
    loadAll();
    loadMyMessages();
  } catch { ElMessage.error("删除失败"); }
}

/** 是否显示回复删除按钮：管理员可删任意回复；作者可删自己的回复（仅已展开全量时） */
function canDeleteReply(reply: MessageOut): boolean {
  if (!auth.isLoggedIn()) return false;
  if (auth.isAdmin()) return true;
  return reply.author_id !== null && reply.author_id === auth.user?.id;
}

/** 删除回复：仅展开全量后允许（预览态没有 author_id，无法本地判断权限） */
async function handleDeleteReply(msg: MessageOut, replyId: number) {
  if (!expandedReplies.value[msg.id]) {
    // 预览态先展开全量再操作
    await loadReplies(msg.id);
  }
  try {
    await deleteMessageReply(msg.id, replyId);
    ElMessage.success("回复已删除");
    // 刷新全量回复 + 留言列表（reply_count 变化）
    await loadReplies(msg.id);
    loadAll();
  } catch { ElMessage.error("删除失败"); }
}

function isSystemReply(msg: MessageOut): boolean {
  return !msg.content && !!msg.reply;
}
</script>

<template>
  <div class="messages-page">
    <!-- 页面标题 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="message" :size="28" />
          </div>
          <h1>留言墙</h1>
        </div>
        <p class="page-header-sub">畅所欲言，分享见解，共建知识社区</p>
      </div>
    </div>

    <!-- 留言表单 -->
    <div class="msg-form-card">
      <h3 class="form-title"><Icon name="edit" :size="17" /> 发表留言</h3>
      <el-input
        v-model="form.content"
        type="textarea"
        :rows="3"
        placeholder="请输入您的留言内容..."
        maxlength="500"
        show-word-limit
      />
      <div class="form-row">
        <el-input
          v-model="form.contact"
          placeholder="联系方式（选填）"
          class="contact-input"
        />
        <el-button type="primary" :loading="submitting" @click="submitMessage">发布留言</el-button>
      </div>
    </div>

    <!-- 标签切换 -->
    <div v-if="auth.isLoggedIn()" class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'all' }]" @click="activeTab = 'all'">
        <Icon name="grid" :size="15" /> 全部留言
      </button>
      <button :class="['tab-btn', { active: activeTab === 'mine' }]" @click="activeTab = 'mine'">
        <Icon name="user" :size="15" /> 我的留言
      </button>
    </div>

    <!-- 全部留言 -->
    <div v-if="activeTab === 'all'" class="msg-list">
      <div class="list-title-row">
        <h3 class="list-title"><Icon name="message" :size="17" /> 全部留言 ({{ publishedMessages.length }})</h3>
        <div class="sort-switch">
          <button :class="['sort-btn', { active: sortBy === 'time' }]" @click="switchSort('time')">
            <Icon name="clock" :size="13" /> 最新
          </button>
          <button :class="['sort-btn', { active: sortBy === 'likes' }]" @click="switchSort('likes')">
            <Icon name="hot" :size="13" /> 最热
          </button>
        </div>
      </div>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="publishedMessages.length === 0" class="empty">暂无留言，来做第一个吧！</div>
      <div v-else>
        <div v-for="msg in publishedMessages" :key="msg.id" class="msg-card">
          <div class="msg-meta">
            <span class="msg-author"><Icon name="user" :size="13" /> {{ msg.author_name || '匿名' }}</span>
            <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
            <el-button v-if="auth.isAdmin()" type="danger" text size="small" @click="handleDelete(msg.id)">
              <Icon name="delete" :size="13" /> 删除
            </el-button>
          </div>
          <div class="msg-content">{{ msg.content }}</div>

          <!-- 操作栏 -->
          <div class="msg-actions">
            <button class="action-btn" :class="{ liked: msg.liked }" @click="toggleLike(msg)">
              <Icon :name="msg.liked ? 'heartFill' : 'heart'" :size="14" /> {{ msg.like_count || 0 }}
            </button>
            <button
              v-if="auth.isLoggedIn()"
              class="action-btn"
              @click="replyingTo = replyingTo === msg.id ? null : msg.id"
            >
              <Icon name="reply" :size="14" /> 回复
            </button>
          </div>

          <!-- 回复输入 -->
          <div v-if="replyingTo === msg.id" class="reply-form">
            <el-input v-model="replyText" placeholder="输入回复内容..." size="small" />
            <el-button type="primary" size="small" @click="submitReply(msg.id)">发送</el-button>
            <el-button size="small" @click="replyingTo = null">取消</el-button>
          </div>

          <!-- 回复列表：默认展示预览（前 2 条），"查看更多回复"展开全量 -->
          <div v-if="visibleReplies(msg).length > 0" class="replies-wrap">
            <div v-if="loadingReplies[msg.id]" class="loading">加载中...</div>
            <div v-else class="replies-list">
              <div v-for="reply in visibleReplies(msg)" :key="reply.id" class="reply-item">
                <div class="reply-meta">
                  <span class="reply-author"><Icon name="user" :size="12" /> {{ reply.author_name || '匿名' }}</span>
                  <span class="reply-date">{{ formatDate(reply.created_at) }}</span>
                  <button
                    v-if="canDeleteReply(reply)"
                    class="reply-delete-btn"
                    title="删除回复"
                    @click="handleDeleteReply(msg, reply.id)"
                  >
                    <Icon name="delete" :size="12" />
                  </button>
                </div>
                <div class="reply-content">{{ reply.content }}</div>
              </div>
            </div>
            <button v-if="hasMoreReplies(msg)" class="more-replies-btn" @click="loadReplies(msg.id)">
              查看更多回复（共 {{ msg.reply_count }} 条）
              <Icon name="arrowDown" :size="13" />
            </button>
            <button
              v-else-if="expandedReplies[msg.id]"
              class="more-replies-btn"
              @click="delete expandedReplies[msg.id]"
            >
              收起回复
              <Icon name="arrowUp" :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的留言 -->
    <div v-if="activeTab === 'mine' && auth.isLoggedIn()" class="msg-list">
      <h3 class="list-title"><Icon name="doc" :size="17" /> 我的留言 ({{ myMessages.length }})</h3>
      <div v-if="myMessages.length === 0" class="empty">您还没有留言</div>
      <div v-else>
        <div v-for="msg in myMessages" :key="msg.id" class="msg-card mine-card">
          <div class="msg-meta">
            <span class="msg-author"><Icon name="user" :size="13" /> {{ msg.author_name || '我' }}</span>
            <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
          </div>

          <!-- 系统自动回复 -->
          <template v-if="isSystemReply(msg)">
            <div class="auto-reply">
              <Icon name="robot" :size="14" /> 系统自动回复：{{ msg.reply }}
            </div>
          </template>

          <!-- 普通留言 -->
          <template v-else>
            <div class="msg-content">{{ msg.content }}</div>
            <div v-if="msg.reply" class="admin-reply">
              <span class="admin-reply-label">管理员</span>
              <span>{{ msg.reply }}</span>
            </div>
            <div v-if="auth.isAdmin()" class="admin-actions">
              <el-button type="danger" size="small" @click="handleDelete(msg.id)">
                <Icon name="delete" :size="13" /> 删除
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.messages-page { max-width: 800px; margin: 0 auto; }

.page-header { padding: 48px 0 32px; }

/* 表单 */
.msg-form-card {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); margin-bottom: 20px; border: 1px solid var(--border-light);
}
.form-title { font-size: 16px; font-weight: 600; margin-bottom: 14px; color: var(--text); display: flex; align-items: center; gap: 8px; }
.form-row { display: flex; gap: 12px; margin-top: 12px; align-items: center; }
.contact-input { flex: 1; }

/* 标签 */
.tab-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.tab-btn {
  padding: 9px 22px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--white); cursor: pointer; font-size: 14px; color: var(--text-light);
  transition: all 0.2s var(--ease); display: flex; align-items: center; gap: 7px; font-weight: 500;
}
.tab-btn:hover { border-color: var(--primary); color: var(--primary); }
.tab-btn.active { background: var(--gradient-primary); color: #fff; border-color: transparent; font-weight: 600; box-shadow: 0 2px 8px var(--primary-glow); }

/* 列表 */
.msg-list {
  background: var(--white); border-radius: var(--radius-lg); padding: 24px 28px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.list-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.list-title { font-size: 16px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
.sort-switch { display: flex; gap: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.sort-btn {
  padding: 6px 14px; border: none; background: var(--white); cursor: pointer;
  font-size: 13px; color: var(--text-light); transition: all 0.2s var(--ease);
  display: flex; align-items: center; gap: 4px;
}
.sort-btn + .sort-btn { border-left: 1px solid var(--border); }
.sort-btn.active { background: var(--primary); color: #fff; font-weight: 600; }
.loading, .empty { text-align: center; color: var(--text-muted); padding: 40px 0; }

/* 留言卡片 */
.msg-card { padding: 18px 0; border-bottom: 1px solid var(--border-light); }
.msg-card:last-child { border-bottom: none; padding-bottom: 0; }
.msg-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.msg-author { font-weight: 600; color: var(--text); font-size: 14px; display: flex; align-items: center; gap: 4px; }
.msg-date { color: var(--text-muted); font-size: 12px; }
.msg-content { font-size: 15px; line-height: 1.8; color: var(--text); white-space: pre-line; }

/* 回复 */
.admin-reply {
  margin-top: 12px; padding: 12px 16px; background: var(--accent-light);
  border-radius: 8px; font-size: 14px; color: var(--text-light); border-left: 3px solid var(--accent);
}
.admin-reply-label { font-weight: 600; color: var(--accent-dark); margin-right: 8px; }
.auto-reply {
  margin-top: 12px; padding: 12px 16px; background: var(--bg-soft);
  border-radius: 8px; font-size: 13px; color: var(--text-muted);
  display: flex; align-items: center; gap: 6px;
}

/* 操作栏 */
.msg-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.action-btn {
  padding: 5px 14px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--white); cursor: pointer; font-size: 13px; color: var(--text-light);
  transition: all 0.2s var(--ease); display: flex; align-items: center; gap: 4px;
}
.action-btn:hover { background: var(--bg); border-color: var(--primary-light); color: var(--primary); }
.action-btn.liked { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
.reply-count-badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--border-light); color: var(--text-muted);
  font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
  display: inline-block;
}
.reply-count-badge.has { background: var(--primary); color: #fff; }

.reply-form { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.reply-form .el-input { flex: 1; }
.replies-wrap { margin-top: 12px; padding-left: 24px; border-left: 2px solid var(--border-light); }
.replies-list { display: flex; flex-direction: column; gap: 10px; }
.reply-item { padding: 12px 14px; background: var(--bg-soft); border-radius: 8px; }
.reply-meta { display: flex; gap: 10px; margin-bottom: 4px; align-items: center; }
.reply-author { font-weight: 500; font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 4px; }
.reply-date { font-size: 11px; color: var(--text-muted); }
.reply-delete-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all 0.2s var(--ease);
}
.reply-delete-btn:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.reply-content { font-size: 14px; color: var(--text-light); line-height: 1.6; }
.more-replies-btn {
  margin-top: 10px; padding: 6px 14px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--primary); display: flex; align-items: center; gap: 4px;
  border-radius: 6px; transition: background 0.2s var(--ease);
}
.more-replies-btn:hover { background: var(--primary-light); }

/* 管理员 */
.admin-actions { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); }
.mine-card { background: var(--bg-soft); border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; border: 1px solid var(--border-light); }

@media (max-width: 768px) {
  .msg-form-card { padding: 20px 16px; }
  .msg-list { padding: 20px 16px; }
  .page-header { padding: 32px 0 24px; }
}
</style>
