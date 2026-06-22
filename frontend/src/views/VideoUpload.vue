<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { createVideo, updateVideo, getVideo, checkUploadPermission } from "@/api/video";
import { uploadImage, uploadVideo } from "@/api/upload";
import { getCategories } from "@/api/category";
import type { CategoryOut } from "@/types";
import { ElMessage } from "element-plus";
import CoverEditor from "@/components/CoverEditor.vue";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const uploadMode = ref<"local" | "embed">("local");
const submitting = ref(false);
const uploadingVideo = ref(false);
const videoPreviewUrl = ref("");
const embedPreviewSrc = ref("");  // iframe 预览 src
const videoEl = ref<HTMLVideoElement | null>(null);
const coverEditorRef = ref<InstanceType<typeof CoverEditor>>();

const isEdit = computed(() => !!route.query.edit);
const videoId = computed(() => Number(route.query.edit || 0));
const videoCategories = ref<CategoryOut[]>([]);

const form = ref({
  title: "",
  description: "",
  video_url: "",
  embed_url: "",
  video_type: "popularization",
  cover_image: "",
  duration: "",
  is_public: true,
  category_id: null as number | null,
});

onMounted(async () => {
  if (!auth.isLoggedIn()) {
    ElMessage.warning("请先登录");
    router.push("/login");
    return;
  }

  if (isEdit.value) {
    try {
      const res = await getVideo(videoId.value);
      const v = res.data;
      Object.assign(form.value, {
        title: v.title, description: v.description,
        video_url: v.video_url, embed_url: v.embed_url,
        video_type: v.video_type, cover_image: v.cover_image,
        duration: v.duration, is_public: v.is_public,
        category_id: v.category_id,
      });
      // 编辑时自动选择模式
      uploadMode.value = v.video_url ? "local" : "embed";
      if (v.video_url) videoPreviewUrl.value = v.video_url;
    } catch {
      ElMessage.error("视频不存在");
      router.push("/videos");
      return;
    }
  } else {
    try {
      const perm = await checkUploadPermission();
      if (!perm.data.can_upload) {
        ElMessage.warning("您没有上传视频的权限");
        router.push("/videos");
        return;
      }
    } catch {
      ElMessage.warning("请先登录");
      router.push("/login");
    }
  }
  // 加载视频分类
  try {
    const res = await getCategories("video");
    videoCategories.value = res.data || [];
    // 默认选中第一个
    if (videoCategories.value.length > 0 && !form.value.category_id) {
      form.value.category_id = videoCategories.value[0].id;
    }
  } catch (e) { console.error('load categories failed', e); }
});

/** 切换上传方式时重置 */
function switchMode(mode: "local" | "embed") {
  uploadMode.value = mode;
  form.value.video_url = "";
  form.value.embed_url = "";
  videoPreviewUrl.value = "";
  embedPreviewSrc.value = "";
  form.value.duration = "";
}

/** 本地上传 */
async function handleVideoUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  const file = input.files[0];
  videoPreviewUrl.value = URL.createObjectURL(file);
  if (!form.value.title) {
    form.value.title = file.name.replace(/\.[^.]+$/, "");
  }
  uploadingVideo.value = true;
  try {
    const res = await uploadVideo(file);
    form.value.video_url = res.data.url;
    ElMessage.success("视频上传成功");
  } catch {
    ElMessage.error("视频上传失败");
    videoPreviewUrl.value = "";
  } finally {
    uploadingVideo.value = false;
  }
}

/** 嵌入地址输入 */
function onEmbedInput(val: string) {
  form.value.embed_url = val;
  embedPreviewSrc.value = "";
  videoPreviewUrl.value = "";

  // 1. 直接视频文件链接 → video 预览
  if (/\.(mp4|webm|avi|mov|mkv|flv|wmv)(\?|$)/i.test(val)) {
    videoPreviewUrl.value = val;
    return;
  }

  // 2. iframe 嵌入代码 → 提取 src
  const iframeMatch = val.match(/src=["']([^"']+)["']/);
  if (iframeMatch) {
    embedPreviewSrc.value = iframeMatch[1];
    return;
  }

  // 3. B站视频链接 → 转为 embed URL
  const bvMatch = val.match(/video\/(BV\w+)/);
  if (bvMatch) {
    embedPreviewSrc.value = `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`;
    return;
  }

  // 4. 裸 URL（非视频文件）→ 直接 iframe 预览
  if (val.startsWith("http")) {
    embedPreviewSrc.value = val;
  }
}

/** 截取封面 */
function captureFrame() {
  const video = videoEl.value;
  if (!video || !videoPreviewUrl.value) {
    ElMessage.warning("请先加载视频");
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
      try {
        const res = await uploadImage(file);
        form.value.cover_image = res.data.url;
        ElMessage.success("封面截取成功 ✓");
      } catch { ElMessage.error("封面上传失败"); }
    }, "image/jpeg", 0.9);
  } catch { ElMessage.error("截取失败"); }
}

/** 手动上传封面（嵌入模式用） */
async function handleCoverUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const res = await uploadImage(input.files[0]);
    form.value.cover_image = res.data.url;
    ElMessage.success("封面上传成功");
  } catch { ElMessage.error("封面上传失败"); }
}

/** 自动获取时长 */
function onVideoMeta() {
  const video = videoEl.value;
  if (!video) return;
  const secs = Math.floor(video.duration || 0);
  if (secs > 0) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    form.value.duration = `${m}:${String(s).padStart(2, "0")}`;
  }
}

async function submit() {
  if (!form.value.title.trim()) {
    ElMessage.warning("请输入视频标题");
    return;
  }
  if (uploadMode.value === "local" && !form.value.video_url) {
    ElMessage.warning("请先上传视频文件");
    return;
  }
  if (uploadMode.value === "embed" && !form.value.embed_url) {
    ElMessage.warning("请输入嵌入播放地址");
    return;
  }
  if (!form.value.category_id && videoCategories.value.length > 0) {
    ElMessage.warning("请选择视频分类");
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateVideo(videoId.value, { ...form.value, category_id: form.value.category_id || undefined });
      ElMessage.success("视频更新成功");
    } else {
      await createVideo({ ...form.value, category_id: form.value.category_id || undefined });
      ElMessage.success("视频发布成功");
    }
    if (videoPreviewUrl.value) URL.revokeObjectURL(videoPreviewUrl.value);
    router.push("/videos");
  } catch {
    ElMessage.error(isEdit.value ? "更新失败" : "发布失败");
  } finally { submitting.value = false; }
}
</script>

<template>
  <div class="upload-page">
    <div class="upload-header">
      <h1>{{ isEdit ? '✏️ 编辑视频' : '🎬 上传视频' }}</h1>
      <p v-if="!isEdit">选择上传方式，预览时截取封面，时长自动获取</p>
    </div>

    <div class="upload-form">
      <!-- 上传方式切换 -->
      <div v-if="!isEdit" class="mode-tabs">
        <button :class="['mode-btn', { active: uploadMode === 'local' }]" @click="switchMode('local')">
          📁 本地上传
        </button>
        <button :class="['mode-btn', { active: uploadMode === 'embed' }]" @click="switchMode('embed')">
          🔗 嵌入地址
        </button>
      </div>

      <el-form label-position="top" @submit.prevent>
        <!-- 本地上传 -->
        <template v-if="uploadMode === 'local'">
          <el-form-item label="选择视频文件" required>
            <div class="upload-area">
              <label class="file-btn">
                <span v-if="uploadingVideo">⏳ 上传中...</span>
                <span v-else>📁 选择视频文件</span>
                <input type="file" accept="video/*" hidden :disabled="uploadingVideo" @change="handleVideoUpload" />
              </label>
              <span v-if="form.video_url" class="upload-ok">✅ 已上传</span>
              <span class="upload-hint">mp4/webm/avi/mov/mkv · 最大 500MB</span>
            </div>
          </el-form-item>
        </template>

        <!-- 嵌入地址 -->
        <template v-if="uploadMode === 'embed'">
          <el-form-item label="嵌入播放地址" required>
            <el-input
              :model-value="form.embed_url"
              @input="onEmbedInput"
              placeholder="B站/YouTube 嵌入链接或视频直链URL"
            />
          </el-form-item>
        </template>

        <!-- 视频预览 — 直接视频文件 -->
        <div v-if="videoPreviewUrl" class="preview-wrap">
          <video
            ref="videoEl"
            :src="videoPreviewUrl"
            controls
            class="video-preview"
            @loadedmetadata="onVideoMeta"
          ></video>
          <button class="capture-btn" type="button" @click="captureFrame">
            📸 截取当前画面为封面
          </button>
        </div>

        <!-- 嵌入预览 — iframe 嵌入 -->
        <div v-if="embedPreviewSrc" class="preview-wrap">
          <iframe
            :src="embedPreviewSrc"
            class="embed-preview"
            frameborder="0"
            allowfullscreen
          ></iframe>
          <p class="embed-hint">嵌入视频无法截取封面，可填写视频直链URL或手动上传封面</p>
        </div>

        <!-- 封面预览 + 编辑 -->
        <el-form-item v-if="form.cover_image" label="封面预览">
          <div class="cover-section">
            <div class="cover-preview">
              <img :src="form.cover_image" alt="封面" />
              <button class="cover-remove" type="button" @click="form.cover_image = ''">✕</button>
            </div>
            <button class="edit-cover-btn" type="button" @click="coverEditorRef?.open()">
              🎨 编辑封面
            </button>
          </div>
        </el-form-item>

        <!-- 手动上传封面（嵌入模式无截帧时使用） -->
        <el-form-item v-if="!form.cover_image && uploadMode === 'embed'">
          <label class="file-btn" style="display:inline-flex">
            📁 上传封面图片
            <input type="file" accept="image/*" hidden @change="handleCoverUpload" />
          </label>
        </el-form-item>

        <!-- 公共字段 -->
        <el-form-item label="视频标题" required>
          <el-input v-model="form.title" placeholder="输入视频标题" maxlength="200" />
        </el-form-item>

        <el-form-item label="视频描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="输入视频描述" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="视频分类">
              <el-select v-model="form.category_id" placeholder="选择分类" style="width:100%">
                <el-option v-for="cat in videoCategories" :key="cat.id" :label="cat.name" :value="cat.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="uploadMode === 'embed' ? '时长' : '时长（自动获取）'">
              <el-input
                v-model="form.duration"
                :readonly="uploadMode === 'local'"
                :placeholder="uploadMode === 'embed' ? '手动输入，如 12:30' : '加载视频后自动显示'"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="公开">
          <el-switch v-model="form.is_public" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit" size="large">
            {{ isEdit ? '保存修改' : '发布视频' }}
          </el-button>
          <el-button @click="router.push('/videos')" size="large">取消</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 封面编辑器 -->
    <CoverEditor ref="coverEditorRef" :image-url="form.cover_image" @saved="(url: string) => form.cover_image = url" />
  </div>
</template>

<style scoped>
.upload-page { max-width: 800px; margin: 0 auto; }
.upload-header { text-align: center; margin-bottom: 24px; }
.upload-header h1 { font-size: 26px; font-weight: 800; color: #1a1a1a; margin-bottom: 6px; }
.upload-header p { color: #888; font-size: 15px; }

.upload-form {
  background: #fff; border-radius: 12px; padding: 28px 32px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}

/* 模式切换 */
.mode-tabs {
  display: flex; gap: 8px; margin-bottom: 20px;
}
.mode-btn {
  flex: 1; padding: 10px; border: 2px solid #eee; border-radius: 10px;
  background: #fff; cursor: pointer; font-size: 15px; font-weight: 600;
  color: #666; transition: all 0.2s; text-align: center;
}
.mode-btn.active { border-color: #00ccaa; color: #00aa88; background: #f0faf6; }
.mode-btn:hover { border-color: #b3e6d6; }

/* 上传区 */
.upload-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.file-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 24px; background: linear-gradient(135deg, #00ccaa, #00b894);
  color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 15px; font-weight: 600; transition: all 0.2s;
}
.file-btn:hover { opacity: 0.9; }
.upload-ok { color: #00aa88; font-weight: 500; font-size: 14px; }
.upload-hint { font-size: 12px; color: #bbb; }

/* 预览 */
.preview-wrap { text-align: center; margin-bottom: 20px; }
.video-preview {
  width: 100%; max-height: 400px;
  border-radius: 10px; background: #000; margin-bottom: 12px;
}
.capture-btn {
  padding: 10px 28px; background: #f0faf6; color: #00aa88;
  border: 1px solid #b3e6d6; border-radius: 10px; cursor: pointer;
  font-size: 15px; font-weight: 500; transition: all 0.2s;
}
.capture-btn:hover { background: #d6f5ed; }

/* 嵌入预览 */
.embed-preview {
  width: 100%; aspect-ratio: 16 / 9;
  border-radius: 10px; background: #000;
}
.embed-hint { font-size: 13px; color: #bbb; margin-top: 8px; }

/* 封面 */
.cover-section { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.cover-preview {
  position: relative; width: 240px; height: 135px;
  border-radius: 8px; overflow: hidden; border: 1px solid #eee;
}
.cover-preview img { width: 100%; height: 100%; object-fit: cover; }
.cover-remove {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,0.5); color: #fff; border: none; cursor: pointer; font-size: 12px;
}
.edit-cover-btn {
  padding: 8px 16px; border: 1px solid #ddd; border-radius: 8px;
  background: #fafafa; cursor: pointer; font-size: 14px; color: #555; white-space: nowrap;
  transition: all 0.2s;
}
.edit-cover-btn:hover { border-color: #00ccaa; color: #00aa88; background: #f0faf6; }

@media (max-width: 768px) {
  .upload-page { padding: 0 12px; }
  .upload-form { padding: 20px 16px; }
}
</style>
