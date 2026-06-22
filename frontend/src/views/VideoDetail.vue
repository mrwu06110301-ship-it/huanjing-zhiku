<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getVideo, deleteVideo, type VideoOut } from "@/api/video";
import { ElMessage } from "element-plus";
import { useShare } from "@/composables/useShare";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { share } = useShare();
const video = ref<VideoOut | null>(null);
const loading = ref(true);

// 评论
const comments = ref<any[]>([]);
const commentsLoading = ref(false);
const commentText = ref("");

onMounted(async () => {
  const id = Number(route.params.id);
  if (!id) { router.push("/videos"); return; }
  try {
    const res = await getVideo(id);
    video.value = res.data;
    loadComments();
  } catch {
    ElMessage.error("视频不存在");
    router.push("/videos");
  } finally { loading.value = false; }
});

async function loadComments() {
  if (!video.value) return;
  commentsLoading.value = true;
  try {
    const res = await fetch(`/api/videos/${video.value.id}/comments`);
    comments.value = await res.json();
  } catch { comments.value = []; }
  finally { commentsLoading.value = false; }
}

async function submitComment() {
  if (!commentText.value.trim() || !video.value) return;
  if (!auth.isLoggedIn()) { ElMessage.warning("请先登录"); return; }
  try {
    const res = await fetch(`/api/videos/${video.value.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.token}` },
      body: JSON.stringify({ content: commentText.value.trim() }),
    });
    if (!res.ok) { ElMessage.error("评论失败"); return; }
    commentText.value = "";
    loadComments();
  } catch { ElMessage.error("评论失败"); }
}

async function deleteComment(id: number) {
  if (!video.value) return;
  try {
    const res = await fetch(`/api/videos/${video.value.id}/comments/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${auth.token}` },
    });
    if (res.ok) { loadComments(); }
  } catch { /* ignore */ }
}

function handleDelete() {
  if (!video.value) return;
  deleteVideo(video.value.id).then(() => {
    ElMessage.success("已删除"); router.push("/videos");
  }).catch(() => ElMessage.error("删除失败"));
}

function formatDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function formatFullDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

function typeLabel(t: string) {
  const map: Record<string, string> = { popularization: "知识科普", demo: "实操演示", discussion: "技术探讨" };
  return map[t] || t;
}

function tagColor(v: any) {
  if (v?.category_color) return v.category_color;
  const colorMap: Record<string, string> = { popularization: "#00ccaa", demo: "#ff6b00", discussion: "#3498db" };
  return colorMap[v?.video_type] || "#00ccaa";
}

function tagText(v: any) {
  return v?.category_name || typeLabel(v?.video_type || "");
}

const embedSrc = computed(() => {
  if (!video.value?.embed_url) return "";
  const match = video.value.embed_url.match(/src=["']([^"']+)["']/);
  if (match) return match[1];
  const bvMatch = video.value.embed_url.match(/video\/(BV\w+)/);
  if (bvMatch) return `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`;
  return video.value.embed_url;
});
</script>

<template>
  <div class="detail-page">
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else-if="video">
      <div class="video-player">
        <iframe v-if="embedSrc" :src="embedSrc" frameborder="0" allowfullscreen class="player-iframe"></iframe>
        <video v-else-if="video.video_url" controls class="player-video" playsinline webkit-playsinline x5-playsinline preload="metadata" :src="video.video_url"></video>
        <div v-else class="no-source">暂无视频源</div>
      </div>

      <div class="video-info">
        <h1 class="video-title">{{ video.title }}</h1>
        <div class="video-meta">
          <span class="meta-tag" :style="{ background: tagColor(video) }">{{ tagText(video) }}</span>
          <span>{{ video.view_count || 0 }}次播放</span>
          <span>{{ video.author_name }}</span>
          <span>{{ formatDate(video.created_at) }}</span>
          <span v-if="video.duration">时长: {{ video.duration }}</span>
        </div>
        <p v-if="video.description" class="video-desc">{{ video.description }}</p>
        <div v-if="auth.isAdmin()" class="admin-actions">
          <el-button plain size="small" @click="share(video.title, video.description)">🔗 分享</el-button>
          <el-button v-if="auth.isAdmin()" type="primary" plain size="small" @click="router.push('/video/upload?edit=' + video.id)">✏️ 编辑</el-button>
          <el-button v-if="auth.isAdmin()" type="danger" plain size="small" @click="handleDelete">🗑️ 删除</el-button>
        </div>
      </div>

      <!-- 评论 -->
      <div class="comments-section">
        <h3 class="comment-title">💬 评论 ({{ comments.length }})</h3>
        <div v-if="auth.isLoggedIn()" class="comment-form">
          <el-input v-model="commentText" type="textarea" :rows="2" placeholder="发表评论..." maxlength="300" show-word-limit />
          <el-button type="primary" size="small" @click="submitComment" style="margin-top:8px">发表评论</el-button>
        </div>
        <div v-else class="login-hint">
          <router-link to="/login">登录</router-link> 后可以发表评论
        </div>
        <div v-if="commentsLoading" class="loading">加载评论...</div>
        <div v-else-if="comments.length === 0" class="empty">暂无评论</div>
        <div v-else class="comment-list">
          <div v-for="c in comments" :key="c.id" class="comment-item">
            <div class="comment-meta">
              <strong>{{ c.author_name }}</strong>
              <span class="comment-date">{{ formatFullDate(c.created_at) }}</span>
              <button
                v-if="auth.isAdmin() || (auth.user && c.author_id === auth.user.id)"
                class="comment-del"
                @click="deleteComment(c.id)"
              >删除</button>
            </div>
            <div class="comment-content">{{ c.content }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page { max-width: 1000px; margin: 0 auto; }
.loading { text-align: center; padding: 60px 0; color: #999; }
.video-player {
  background: #000; border-radius: 12px; overflow: hidden; margin-bottom: 20px;
  position: relative; width: 100%; padding-bottom: 56.25%; /* 16:9 */
}
.player-iframe {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
}
.player-video {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;
}
.no-source { display: flex; align-items: center; justify-content: center; height: 100%; color: #666; }

.video-info {
  background: #fff; border-radius: 12px; padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); margin-bottom: 20px;
}
.video-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 10px; }
.video-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: #888; align-items: center; margin-bottom: 12px; }
.meta-tag { background: #00ccaa; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.video-desc { font-size: 15px; line-height: 1.8; color: #555; margin-bottom: 16px; }
.admin-actions { padding-top: 16px; border-top: 1px solid #f0f0f0; }

/* 评论 */
.comments-section {
  background: #fff; border-radius: 12px; padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.comment-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px; }
.comment-form { margin-bottom: 16px; }
.login-hint { text-align: center; padding: 20px; color: #999; font-size: 14px; }
.login-hint a { color: #00ccaa; font-weight: 600; }
.comment-list { display: flex; flex-direction: column; gap: 12px; }
.comment-item { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.comment-item:last-child { border-bottom: none; }
.comment-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 13px; }
.comment-date { color: #bbb; font-size: 12px; }
.comment-del {
  margin-left: auto; background: none; border: none; color: #e74c3c;
  cursor: pointer; font-size: 12px; opacity: 0; transition: opacity 0.2s;
}
.comment-item:hover .comment-del { opacity: 1; }
.comment-content { font-size: 15px; color: #444; line-height: 1.7; }
</style>
