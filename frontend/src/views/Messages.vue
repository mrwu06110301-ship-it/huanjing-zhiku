<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import {
  getMessages, getMyMessages,
  createMessage, likeMessage, replyToMessage, getMessageReplies,
  deleteMessage, formatDate,
  type MessageOut,
} from "@/api/message";
import { ElMessage } from "element-plus";

const auth = useAuthStore();
const publishedMessages = ref<MessageOut[]>([]);
const myMessages = ref<MessageOut[]>([]);
const loading = ref(false);
const submitting = ref(false);

const form = ref({ content: "", contact: "" });
const activeTab = ref<"all" | "mine">("all");

// 回复
const replyingTo = ref<number | null>(null);
const replyText = ref("");
const expandedReplies = ref<Record<number, MessageOut[]>>({});
const loadingReplies = ref<Record<number, boolean>>({});

onMounted(() => {
  loadAll();
  if (auth.isLoggedIn()) loadMyMessages();
});

async function loadAll() {
  loading.value = true;
  try {
    const res = await getMessages({ page: 1, page_size: 50 });
    publishedMessages.value = res.data;
  } catch { /* ignore */ }
  finally { loading.value = false; }
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

function toggleReplies(msgId: number) {
  if (expandedReplies.value[msgId]) {
    delete expandedReplies.value[msgId];
  } else {
    loadReplies(msgId);
  }
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

function isSystemReply(msg: MessageOut): boolean {
  return !msg.content && !!msg.reply;
}
</script>

<template>
  <div class="messages-page">
    <div class="msg-header">
      <h1 class="msg-title">💬 留言墙</h1>
      <p class="msg-subtitle">畅所欲言，分享见解，共建知识社区</p>
    </div>

    <!-- 留言表单 -->
    <div class="msg-form-card">
      <h3 class="form-title">📝 发表留言</h3>
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
      <button :class="['tab-btn', { active: activeTab === 'all' }]" @click="activeTab = 'all'">全部留言</button>
      <button :class="['tab-btn', { active: activeTab === 'mine' }]" @click="activeTab = 'mine'">我的留言</button>
    </div>

    <!-- 全部留言 -->
    <div v-if="activeTab === 'all'" class="msg-list">
      <h3 class="list-title">💬 全部留言 ({{ publishedMessages.length }})</h3>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="publishedMessages.length === 0" class="empty">暂无留言，来做第一个吧！</div>
      <div v-else>
        <div v-for="msg in publishedMessages" :key="msg.id" class="msg-card">
          <div class="msg-meta">
            <span class="msg-author">{{ msg.author_name || '匿名' }}</span>
            <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
            <el-button v-if="auth.isAdmin()" type="danger" text size="small" @click="handleDelete(msg.id)">🗑️ 删除</el-button>
          </div>
          <div class="msg-content">{{ msg.content }}</div>

          <!-- 操作栏 -->
          <div class="msg-actions">
            <button class="action-btn" :class="{ liked: msg.liked }" @click="toggleLike(msg)">
              {{ msg.liked ? '❤️' : '🤍' }} {{ msg.like_count || 0 }}
            </button>
            <button class="action-btn" @click="toggleReplies(msg.id)">
              💬 回复 <span v-if="expandedReplies[msg.id]?.length">({{ expandedReplies[msg.id].length }})</span>
            </button>
            <button
              v-if="auth.isLoggedIn()"
              class="action-btn"
              @click="replyingTo = replyingTo === msg.id ? null : msg.id"
            >
              ✏️ 回复
            </button>
          </div>

          <!-- 回复输入 -->
          <div v-if="replyingTo === msg.id" class="reply-form">
            <el-input v-model="replyText" placeholder="输入回复内容..." size="small" />
            <el-button type="primary" size="small" @click="submitReply(msg.id)">发送</el-button>
            <el-button size="small" @click="replyingTo = null">取消</el-button>
          </div>

          <!-- 回复列表 -->
          <div v-if="expandedReplies[msg.id]" class="replies-wrap">
            <div v-if="loadingReplies[msg.id]" class="loading">加载中...</div>
            <div v-else-if="expandedReplies[msg.id].length === 0" class="empty">暂无回复</div>
            <div v-else class="replies-list">
              <div v-for="reply in expandedReplies[msg.id]" :key="reply.id" class="reply-item">
                <div class="reply-meta">
                  <span class="reply-author">{{ reply.author_name || '匿名' }}</span>
                  <span class="reply-date">{{ formatDate(reply.created_at) }}</span>
                </div>
                <div class="reply-content">{{ reply.content }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的留言 -->
    <div v-if="activeTab === 'mine' && auth.isLoggedIn()" class="msg-list">
      <h3 class="list-title">📋 我的留言 ({{ myMessages.length }})</h3>
      <div v-if="myMessages.length === 0" class="empty">您还没有留言</div>
      <div v-else>
        <div v-for="msg in myMessages" :key="msg.id" class="msg-card mine-card">
          <div class="msg-meta">
            <span class="msg-author">{{ msg.author_name || '我' }}</span>
            <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
          </div>

          <!-- 系统自动回复 -->
          <template v-if="isSystemReply(msg)">
            <div class="auto-reply">
              🤖 系统自动回复：{{ msg.reply }}
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
              <el-button type="danger" size="small" @click="handleDelete(msg.id)">🗑️ 删除</el-button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.messages-page { max-width: 800px; margin: 0 auto; }

.msg-header { text-align: center; margin-bottom: 28px; }
.msg-title { font-size: 28px; font-weight: 800; color: #1a1a1a; margin-bottom: 6px; }
.msg-subtitle { color: #888; font-size: 15px; }

/* 表单 */
.msg-form-card {
  background: #fff; border-radius: 12px; padding: 20px 24px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06); margin-bottom: 20px;
}
.form-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #333; }
.form-row { display: flex; gap: 12px; margin-top: 10px; align-items: center; }
.contact-input { flex: 1; }

/* 标签 */
.tab-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.tab-btn {
  padding: 8px 20px; border: 1px solid #e0e0e0; border-radius: 8px;
  background: #fff; cursor: pointer; font-size: 14px; color: #666;
  transition: all 0.2s;
}
.tab-btn.active { background: #00ccaa; color: #fff; border-color: #00ccaa; }

/* 列表 */
.msg-list {
  background: #fff; border-radius: 12px; padding: 20px 24px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}
.list-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 16px; }
.loading, .empty { text-align: center; color: #999; padding: 30px 0; }

/* 留言卡片 */
.msg-card { padding: 16px 0; border-bottom: 1px solid #f0f0f0; }
.msg-card:last-child { border-bottom: none; }
.msg-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.msg-author { font-weight: 600; color: #333; font-size: 14px; }
.msg-date { color: #aaa; font-size: 12px; }
.msg-content { font-size: 15px; line-height: 1.8; color: #444; white-space: pre-line; }

/* 回复 */
.admin-reply {
  margin-top: 10px; padding: 10px 14px; background: #f0faf6;
  border-radius: 8px; font-size: 14px; color: #555; border-left: 3px solid #00ccaa;
}
.admin-reply-label { font-weight: 600; color: #00aa88; margin-right: 6px; }
.auto-reply {
  margin-top: 10px; padding: 10px 14px; background: #f8f9fa;
  border-radius: 8px; font-size: 13px; color: #888;
}

/* 操作栏 */
.msg-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.action-btn {
  padding: 4px 12px; border: 1px solid #eee; border-radius: 6px;
  background: #fafafa; cursor: pointer; font-size: 13px; color: #666; transition: all 0.2s;
}
.action-btn:hover { background: #f0f0f0; border-color: #ddd; }
.action-btn.liked { color: #e74c3c; border-color: #fadbd8; background: #fdf2f2; }

.reply-form { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.reply-form .el-input { flex: 1; }
.replies-wrap { margin-top: 10px; padding-left: 24px; border-left: 2px solid #f0f0f0; }
.replies-list { display: flex; flex-direction: column; gap: 10px; }
.reply-item { padding: 10px 12px; background: #fafafa; border-radius: 8px; }
.reply-meta { display: flex; gap: 8px; margin-bottom: 4px; }
.reply-author { font-weight: 500; font-size: 13px; color: #333; }
.reply-date { font-size: 11px; color: #bbb; }
.reply-content { font-size: 14px; color: #555; line-height: 1.6; }

/* 管理员 */
.admin-actions { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee; }
.mine-card { background: #fafcfe; border-radius: 8px; padding: 16px; margin-bottom: 12px; border: 1px solid #f0f0f0; }
</style>
