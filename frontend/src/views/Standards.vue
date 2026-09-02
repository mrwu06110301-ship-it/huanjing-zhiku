<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { getStandards, uploadStandardsBatch, deleteStandard, recordStandardView } from "@/api/standard";
import { getCategories } from "@/api/category";
import { checkUploadPermission } from "@/api/video";
import type { StandardOut, CategoryOut } from "@/types";
import { useShare } from "@/composables/useShare";
import { useAuthStore } from "@/stores/auth";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";

const { share } = useShare();
const auth = useAuthStore();
const standards = ref<StandardOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeCat = ref<number | null>(null);
const searchQuery = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = 24;
const total = ref(0);
const loadingMore = ref(false);

/** 上传权限：与管理员用户管理的上传权限挂钩（同视频/论坛/FAQ 口径） */
const canUpload = ref(false);

// ---------- 批量上传 ----------
const uploadVisible = ref(false);
const uploadCategoryId = ref<number | null>(null);
const uploadFiles = ref<File[]>([]);
const uploading = ref(false);
/** 逐文件上传进度：当前第 N/M 个 + 文件名 + 单文件传输百分比 */
const uploadProgress = ref<{ current: number; total: number; name: string; percent: number } | null>(null);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files) return;
  const allowed = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"];
  for (const f of Array.from(input.files)) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      ElMessage.warning(`跳过不支持的文件：${f.name}（仅支持 PDF/Word/Excel/PPT）`);
      continue;
    }
    uploadFiles.value.push(f);
  }
  input.value = ""; // 允许重复选择同一文件
}

function removeFile(idx: number) {
  uploadFiles.value.splice(idx, 1);
}

function openUploadDialog() {
  if (categories.value.length === 0) {
    ElMessage.warning("暂无标准分类，请先在分类管理中创建");
    return;
  }
  uploadCategoryId.value = activeCat.value ?? categories.value[0].id;
  uploadFiles.value = [];
  uploadVisible.value = true;
}

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

async function submitUpload() {
  if (!uploadCategoryId.value) { ElMessage.warning("请选择分类"); return; }
  if (uploadFiles.value.length === 0) { ElMessage.warning("请选择要上传的文件"); return; }
  uploading.value = true;
  const total = uploadFiles.value.length;
  const failedList: { file: string; reason: string }[] = [];
  let success = 0;
  // 逐个文件上传：真实进度（第 N/M 个 + 单文件传输百分比），单文件失败不阻断
  for (let i = 0; i < uploadFiles.value.length; i++) {
    const f = uploadFiles.value[i];
    uploadProgress.value = { current: i + 1, total, name: f.name, percent: 0 };
    try {
      await uploadStandardsBatch([f], uploadCategoryId.value, (p) => {
        if (uploadProgress.value) uploadProgress.value.percent = p;
      });
      success++;
    } catch (e: any) {
      failedList.push({ file: f.name, reason: e?.response?.data?.detail || "上传失败" });
    }
  }
  uploading.value = false;
  uploadProgress.value = null;
  // 刷新列表（切到刚上传的分类方便查看）
  if (activeCat.value && activeCat.value !== uploadCategoryId.value) {
    switchCat(uploadCategoryId.value);
  } else {
    page.value = 1;
    loadStandards();
  }
  if (failedList.length === 0) {
    uploadFiles.value = [];
    uploadVisible.value = false;
    ElMessage.success(`成功上传 ${success} 个标准`);
  } else {
    // 失败文件保留在列表里可重试，成功的移除
    uploadFiles.value = uploadFiles.value.filter((f) => failedList.some((x) => x.file === f.name));
    const reasons = failedList.map((x) => `${x.file}：${x.reason}`).join("；");
    ElMessage.warning(`成功 ${success} 个，失败 ${failedList.length} 个（${reasons}）。失败文件已保留，可再次点击「上传」重试。`);
  }
}

// ---------- 管理员删除 ----------
async function handleDelete(s: StandardOut) {
  try {
    await ElMessageBox.confirm(`确定删除「${s.title}」吗？文件将一并删除，不可恢复。`, "删除标准", {
      type: "warning", confirmButtonText: "删除", cancelButtonText: "取消",
    });
  } catch { return; }
  try {
    await deleteStandard(s.id);
    ElMessage.success("已删除");
    loadStandards();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "删除失败");
  }
}

const hasMore = computed(() => standards.value.length < total.value);

/** 关键词防抖搜索：走后端 API 查全量，而非本地过滤 */
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadStandards();
  }, 400);
});
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

async function loadStandards(append = false) {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      page_size: pageSize,
      std_type: "document",
    };
    if (activeCat.value) params.category_id = activeCat.value;
    if (searchQuery.value.trim()) params.keyword = searchQuery.value.trim();
    const res = await getStandards(params as any);
    const items = res.data.items || [];
    if (append) {
      standards.value = [...standards.value, ...items];
    } else {
      standards.value = items;
    }
    total.value = res.data.total || 0;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  page.value++;
  loadStandards(true);
}

onMounted(async () => {
  const catRes = await getCategories("standard");
  categories.value = catRes.data;
  loadStandards();
  if (auth.isLoggedIn()) {
    try {
      const res = await checkUploadPermission();
      canUpload.value = res.data.can_upload;
    } catch { /* ignore */ }
  }
});

function switchCat(id: number | null) {
  activeCat.value = id;
  page.value = 1;
  loadStandards();
}

/** 统一走 kkFileView 在线预览（服务器已开启缓存持久化，二次预览秒开）
 * 大文件首次预览需服务器转换 10~60s：先探测缓存，未缓存时在页内显示转换进度，
 * 完成后给出打开按钮（异步上下文 window.open 会被移动端拦截，需用户点击兜底） */
type PreviewState = "probing" | "converting" | "ready";
const previewWait = ref<{ state: PreviewState; title: string; seconds: number; url: string } | null>(null);
let previewTimer: ReturnType<typeof setInterval> | null = null;
let previewPoll: ReturnType<typeof setInterval> | null = null;
let previewGuard: ReturnType<typeof setTimeout> | null = null;

function clearPreviewTimers() {
  if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  if (previewPoll) { clearInterval(previewPoll); previewPoll = null; }
  if (previewGuard) { clearTimeout(previewGuard); previewGuard = null; }
}

function closePreviewWait() {
  clearPreviewTimers();
  previewWait.value = null;
}

/** 轮询探测 kkFileView 是否已完成转换：请求转换产物第一页 0.jpg */
function probeConverted(fileKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = `${window.location.origin}/preview/${fileKey}/0.jpg?t=${Date.now()}`;
    const timer = setTimeout(() => { img.src = ""; resolve(false); }, 8000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 10); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = url;
  });
}

/** ready 状态：自动尝试开新页（桌面通常放行），被拦截时用户点按钮 */
function tryOpenPreview(url: string) {
  const win = window.open(url, "_blank", "noopener");
  if (win) {
    // 打开成功，短暂展示后收起
    setTimeout(() => closePreviewWait(), 600);
  }
  // win 为 null 说明被弹窗拦截，保留 ready 状态让用户点击
}

function openPdf(s: StandardOut) {
  if (!s.file_url) return;
  recordStandardView(s.id); // 异步计数，不阻塞预览
  s.view_count = (s.view_count || 0) + 1; // 本地即时更新

  const absUrl = `${window.location.origin}${s.file_url}`;
  // file_url 形如 /uploads/<uuid>.pdf → kkFileView 转换缓存目录以文件名（去扩展名）命名
  const fileKey = s.file_url.split("/").pop()!.replace(/\.[^.]+$/, "");
  const previewUrl = `${window.location.origin}/preview/onlinePreview?url=${encodeURIComponent(btoa(absUrl))}`;

  clearPreviewTimers();
  previewWait.value = { state: "probing", title: s.title, seconds: 0, url: previewUrl };

  probeConverted(fileKey).then(async (cached) => {
    if (cached) {
      // 已有转换缓存：秒开
      if (previewWait.value) previewWait.value.state = "ready";
      tryOpenPreview(previewUrl);
      return;
    }
    // 未缓存：进入转换等待，后台触发 onlinePreview（fetch 发出即触发服务器转换，断连不影响服务端落盘）
    if (previewWait.value) previewWait.value.state = "converting";
    let seconds = 0;
    previewTimer = setInterval(() => {
      seconds += 1;
      if (previewWait.value) previewWait.value.seconds = seconds;
    }, 1000);
    fetch(previewUrl, { mode: "no-cors" }).catch(() => {});
    // 每 3s 探测转换产物
    previewPoll = setInterval(async () => {
      const done = await probeConverted(fileKey);
      if (done && previewWait.value) {
        clearPreviewTimers();
        previewWait.value.state = "ready";
        tryOpenPreview(previewUrl);
      }
    }, 3000);
    // 最长 3 分钟兜底
    previewGuard = setTimeout(() => {
      if (previewWait.value && previewWait.value.state === "converting") {
        closePreviewWait();
        ElMessage.warning("转换超时，请稍后重试或下载后查看");
      }
    }, 180000);
  });
}

onBeforeUnmount(() => {
  clearPreviewTimers();
});
</script>

<template>
  <div class="page">
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="standard" :size="26" />
          </div>
          <h1>方法标准</h1>
        </div>
        <p class="page-header-sub">环境标准 · 职业卫生标准 · EPA标准（共 {{ total }} 项）</p>
      </div>
      <div class="header-actions">
        <el-button v-if="canUpload" type="primary" size="small" @click="openUploadDialog">
          <Icon name="plus" :size="14" style="margin-right:6px" /> 上传标准
        </el-button>
        <el-button plain size="small" class="share-btn" @click="share('方法标准', '环境标准 · 职业卫生标准 · EPA标准')">
          <Icon name="share" :size="14" style="margin-right:6px" /> 分享
        </el-button>
      </div>
    </div>

    <div class="cat-pills category-tabs">
      <span :class="['cat-pill', { active: activeCat === null }]" @click="switchCat(null)">全部</span>
      <span
        v-for="c in categories"
        :key="c.id"
        :class="['cat-pill', { active: activeCat === c.id }]"
        @click="switchCat(c.id)"
      >{{ c.name }}</span>
      <div class="search-wrap">
        <Icon name="search" :size="15" class="search-ic" />
        <input v-model="searchQuery" placeholder="搜索标准号/名称..." class="local-search" />
        <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</span>
      </div>
    </div>

    <div v-loading="loading" class="std-grid">
      <div
        v-for="s in standards"
        :key="s.id"
        class="std-card"
        @click="openPdf(s)"
      >
        <div class="std-icon-wrap">
          <Icon name="doc" :size="24" />
        </div>
        <div class="std-info">
          <h3>{{ s.title }}</h3>
          <div class="std-meta">
            <span v-if="s.category_name" class="meta-cat">{{ s.category_name }}</span>
            <span class="meta-item"><Icon name="eye" :size="12" /> {{ s.view_count }}</span>
          </div>
        </div>
        <div class="std-pdf-badge">
          <Icon name="eye" :size="14" />
          <span>预览</span>
        </div>
        <button v-if="auth.isAdmin()" class="std-delete-btn" title="删除标准" @click.stop="handleDelete(s)">
          <Icon name="close" :size="13" />
        </button>
      </div>
      <el-empty v-if="!loading && standards.length === 0" description="暂无标准文档" />
    </div>

    <div v-if="hasMore && !searchQuery" class="load-more-wrap">
      <button class="load-more-btn" :disabled="loadingMore" @click="loadMore">
        <span v-if="loadingMore">加载中...</span>
        <template v-else>
          加载更多（{{ standards.length }}/{{ total }}）
        </template>
      </button>
    </div>

    <!-- 首次预览转换等待层 -->
    <div v-if="previewWait" class="preview-wait-mask">
      <div class="preview-wait-card">
        <template v-if="previewWait.state !== 'ready'">
          <div class="pw-spinner"></div>
          <h4>{{ previewWait.state === 'probing' ? '正在检查文档缓存...' : '正在转换文档' }}</h4>
          <p class="pw-title">{{ previewWait.title }}</p>
          <p v-if="previewWait.state === 'converting'" class="pw-tip">已等待 {{ previewWait.seconds }}s，完成后自动打开预览</p>
          <p v-else class="pw-tip">即将开始...</p>
          <p v-if="previewWait.state === 'converting'" class="pw-sub">大文件首次转换约需 10~60 秒，请勿关闭页面</p>
          <button class="pw-cancel" @click="closePreviewWait">取消</button>
        </template>
        <template v-else>
          <div class="pw-done">
            <Icon name="info" :size="34" />
          </div>
          <h4>转换完成</h4>
          <p class="pw-title">{{ previewWait.title }}</p>
          <button class="pw-open-btn" @click="tryOpenPreview(previewWait.url)">
            <Icon name="eye" :size="15" /> 打开预览
          </button>
          <p class="pw-sub">若未自动打开，请点击上方按钮</p>
        </template>
      </div>
    </div>

    <!-- 批量上传弹窗 -->
    <el-dialog v-model="uploadVisible" title="批量上传标准" width="560px" :close-on-click-modal="!uploading">
      <div class="upload-form">
        <div class="upload-field">
          <label class="upload-label">所属分类 <span class="req">*</span></label>
          <el-select v-model="uploadCategoryId" placeholder="选择标准分类" style="width: 100%" :disabled="uploading">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </div>
        <div class="upload-field">
          <label class="upload-label">选择文件 <span class="req">*</span></label>
          <div v-if="!uploading" class="upload-drop">
            <label class="upload-pick">
              <Icon name="plus" :size="20" />
              <span>点击选择文件</span>
              <span class="upload-hint">支持 PDF / Word / Excel / PPT，单文件 ≤ 200MB，可多选</span>
              <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" hidden @change="onFileChange" />
            </label>
          </div>
          <div v-else class="upload-progress">
            <div class="up-info">
              <span class="up-count">正在上传 {{ uploadProgress?.current }}/{{ uploadProgress?.total }}</span>
              <span class="up-name">{{ uploadProgress?.name }}</span>
            </div>
            <el-progress :percentage="uploadProgress?.percent ?? 0" :stroke-width="8" />
          </div>
          <ul v-if="uploadFiles.length" class="upload-list">
            <li v-for="(f, i) in uploadFiles" :key="i" :class="{ uploading: uploading }">
              <Icon name="doc" :size="14" />
              <span class="upload-name">{{ f.name }}</span>
              <span class="upload-size">{{ fmtSize(f.size) }}</span>
              <span v-if="!uploading" class="upload-remove" @click="removeFile(i)">×</span>
              <span v-else class="upload-state">待上传</span>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <el-button @click="uploadVisible = false" :disabled="uploading">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">
          {{ uploading ? "上传中..." : `上传${uploadFiles.length ? `（${uploadFiles.length} 个文件）` : ""}` }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { padding: 40px 0 24px; }

/* cat-pill 统一样式已全局定义于 App.vue */
.category-tabs { margin-bottom: 20px; }

.search-wrap {
  position: relative; margin-left: auto; display: flex; align-items: center;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.search-clear {
  position: absolute; right: 10px; color: var(--text-muted);
  cursor: pointer; font-size: 16px; line-height: 1; padding: 2px;
}
.search-clear:hover { color: var(--primary); }
.local-search {
  padding: 7px 14px 7px 34px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 170px; transition: all 0.2s; background: var(--white);
}
.local-search:focus { border-color: var(--primary); width: 210px; }

.std-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; min-height: 200px; }
.std-card {
  display: flex; align-items: flex-start; gap: 14px; padding: 16px 18px;
  background: var(--white); border-radius: var(--radius-lg);
  cursor: pointer; transition: all 0.25s var(--ease); box-shadow: var(--shadow);
  border: 1px solid var(--border-light); position: relative;
}
.std-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: rgba(37, 99, 235, 0.22); }
.std-icon-wrap {
  width: 44px; height: 44px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-light); border-radius: var(--radius-sm); color: var(--primary);
  transition: all 0.25s var(--ease);
}
.std-card:hover .std-icon-wrap { background: var(--gradient-primary); color: #fff; }
.std-info { flex: 1; min-width: 0; }
.std-info h3 {
  font-size: 14px; margin-bottom: 8px; line-height: 1.45; font-weight: 600;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.std-meta { display: flex; gap: 10px; margin-top: 4px; font-size: 12px; color: var(--text-muted); align-items: center; flex-wrap: wrap; }
.meta-cat {
  padding: 2px 8px; background: var(--primary-light); color: var(--primary);
  border-radius: 4px; font-size: 11px; font-weight: 500;
}
.meta-item { display: flex; align-items: center; gap: 4px; }
.std-pdf-badge {
  position: absolute; right: 14px; top: 14px;
  display: flex; align-items: center; gap: 3px;
  font-size: 11px; color: var(--text-muted);
  padding: 3px 8px; border-radius: 4px;
  background: var(--bg-soft); opacity: 0; transition: all 0.2s var(--ease);
}
.std-card:hover .std-pdf-badge {
  opacity: 1; color: var(--primary); background: var(--primary-light);
}
.std-delete-btn {
  position: absolute; right: 14px; top: 12px;
  width: 24px; height: 24px; display: none;
  align-items: center; justify-content: center;
  border: none; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--text-muted);
  transition: all 0.2s var(--ease);
}
.std-card:hover .std-delete-btn { display: flex; }
.std-delete-btn:hover { background: #fee2e2; color: #dc2626; }
/* 管理员卡片：预览徽标让位删除按钮 */
.std-card:has(.std-delete-btn):hover .std-pdf-badge { right: 46px; }

.header-actions { display: flex; gap: 8px; align-items: center; }

/* 上传弹窗 */
.upload-form { display: flex; flex-direction: column; gap: 16px; }
.upload-field { display: flex; flex-direction: column; gap: 8px; }
.upload-label { font-size: 13px; font-weight: 600; color: var(--text); }
.req { color: #dc2626; }
.upload-drop { display: flex; }
.upload-pick {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 24px 16px; border: 1.5px dashed var(--border); border-radius: 10px;
  color: var(--text-muted); cursor: pointer; transition: all 0.2s var(--ease);
  background: var(--bg-soft);
}
.upload-pick:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
.upload-pick span { font-size: 13px; }
.upload-hint { font-size: 11px !important; color: var(--text-muted); }
.upload-list {
  list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto;
  border: 1px solid var(--border-light); border-radius: 8px;
}
.upload-list li {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  font-size: 12px; color: var(--text); border-bottom: 1px solid var(--border-light);
}
.upload-list li:last-child { border-bottom: none; }
.upload-list li.uploading { opacity: 0.75; }
.upload-state { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.upload-progress { padding: 6px 2px; }
.up-info { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.up-count { font-weight: 700; color: var(--primary); flex-shrink: 0; }
.up-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-light); }
.upload-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.upload-size { color: var(--text-muted); flex-shrink: 0; }
.upload-remove {
  cursor: pointer; font-size: 16px; line-height: 1; color: var(--text-muted);
  padding: 0 2px; flex-shrink: 0;
}
.upload-remove:hover { color: #dc2626; }

.load-more-wrap { display: flex; justify-content: center; padding: 32px 0 8px; }
.load-more-btn {
  padding: 10px 32px; border-radius: 20px; border: 1px solid var(--border);
  background: var(--white); color: var(--text-light); font-size: 14px; cursor: pointer;
  transition: all 0.2s var(--ease);
}
.load-more-btn:hover:not(:disabled) {
  border-color: var(--primary); color: var(--primary); box-shadow: var(--shadow-md);
}
.load-more-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ======== 首次预览转换等待层 ======== */
.preview-wait-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}
.preview-wait-card {
  width: min(360px, 92vw);
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 32px 24px 26px;
  text-align: center;
  box-shadow: var(--shadow-xl);
  animation: pwIn 0.25s var(--ease);
}
@keyframes pwIn {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pw-spinner {
  width: 44px;
  height: 44px;
  margin: 0 auto 18px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: pwSpin 0.8s linear infinite;
}
@keyframes pwSpin { to { transform: rotate(360deg); } }
.preview-wait-card h4 {
  font-size: 16px;
  color: var(--text);
  margin: 0 0 10px;
}
.pw-title {
  font-size: 13px;
  color: var(--text-light);
  margin: 0 0 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pw-tip {
  font-size: 13.5px;
  color: var(--primary);
  margin: 0 0 6px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.pw-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
.pw-done {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #059669;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pw-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 30px;
  margin: 4px 0 10px;
  background: var(--gradient-primary);
  color: #fff;
  border: none;
  border-radius: 22px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--ease);
}
.pw-open-btn:hover { opacity: 0.9; transform: translateY(-1px); }
.pw-cancel {
  margin-top: 14px;
  padding: 7px 22px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s var(--ease);
}
.pw-cancel:hover { color: var(--text-light); border-color: var(--text-muted); }

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; }
  .page-header h1 { font-size: 22px; }  .std-grid { grid-template-columns: 1fr; gap: 10px; }
  .search-wrap { margin-left: 0; width: 100%; }
  .local-search { width: 100%; }
  .local-search:focus { width: 100%; }
  .std-pdf-badge { opacity: 1; }
  .std-delete-btn { display: flex; }
}
</style>
