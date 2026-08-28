<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Icon from "@/components/Icon.vue";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const route = useRoute();
const router = useRouter();

const fileUrl = (route.query.url as string) || "";
const title = (route.query.title as string) || "标准文档预览";

const loading = ref(true);
const error = ref("");
const pdfDoc = ref<pdfjsLib.PDFDocumentProxy | null>(null);
const pageNum = ref(1);
const pageCount = ref(0);
const rendering = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);

/** 以容器宽度渲染当前页（适配手机） */
async function renderPage(num: number) {
  if (!pdfDoc.value || rendering.value || !canvasRef.value) return;
  rendering.value = true;
  try {
    const page = await pdfDoc.value.getPage(num);
    const container = canvasRef.value.parentElement as HTMLElement;
    // 设备像素比，保证高清屏清晰
    const dpr = window.devicePixelRatio || 1;
    // 容器可用宽度（留 padding）
    const availW = Math.max(container.clientWidth - 16, 280);
    const viewport = page.getViewport({ scale: 1 });
    const scale = availW / viewport.width;
    const scaled = page.getViewport({ scale: scale * dpr });

    const canvas = canvasRef.value;
    const ctx = canvas.getContext("2d")!;
    canvas.height = scaled.height;
    canvas.width = scaled.width;
    // CSS 尺寸 = 逻辑宽度
    canvas.style.width = `${availW}px`;
    canvas.style.height = `${scaled.height / dpr}px`;

    await page.render({
      canvasContext: ctx,
      viewport: scaled,
    }).promise;
    pageNum.value = num;
  } finally {
    rendering.value = false;
  }
}

function prevPage() {
  if (pageNum.value > 1) renderPage(pageNum.value - 1);
}
function nextPage() {
  if (pageNum.value < pageCount.value) renderPage(pageNum.value + 1);
}

function download() {
  if (fileUrl) {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `${title}.pdf`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/standards");
}

onMounted(async () => {
  if (!fileUrl) {
    error.value = "缺少文件地址";
    loading.value = false;
    return;
  }
  try {
    const task = pdfjsLib.getDocument({ url: fileUrl });
    task.onProgress = (data: { loaded: number; total: number }) => {
      if (data.total > 0) {
        // 可选：展示加载百分比
      }
    };
    const doc = await task.promise;
    pdfDoc.value = doc;
    pageCount.value = doc.numPages;
    await nextTick();
    await renderPage(1);
  } catch (e) {
    error.value = "PDF 加载失败，请尝试下载后查看";
    console.error("PDF load error:", e);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  pdfDoc.value?.destroy();
});
</script>

<template>
  <div class="preview-page">
    <div class="preview-toolbar">
      <button class="tb-btn" @click="goBack">
        <Icon name="arrowLeft" :size="16" /> 返回
      </button>
      <div class="tb-title">{{ title }}</div>
      <div class="tb-actions">
        <button class="tb-btn primary" @click="download">
          <Icon name="download" :size="15" /> 下载
        </button>
      </div>
    </div>

    <div v-if="loading" class="preview-status">
      <div class="spinner"></div>
      <p>文档加载中...</p>
    </div>

    <div v-else-if="error" class="preview-status error">
      <Icon name="info" :size="36" />
      <p>{{ error }}</p>
      <button class="tb-btn primary" @click="download">下载 PDF</button>
    </div>

    <template v-else>
      <div class="canvas-wrap">
        <canvas ref="canvasRef"></canvas>
      </div>

      <div class="pager">
        <button class="pg-btn" :disabled="pageNum <= 1 || rendering" @click="prevPage">
          <Icon name="arrowLeft" :size="15" />
        </button>
        <span class="pg-indicator">{{ pageNum }} / {{ pageCount }}</span>
        <button class="pg-btn" :disabled="pageNum >= pageCount || rendering" @click="nextPage">
          <Icon name="arrowRight" :size="15" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px 0 48px;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: var(--white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
.tb-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--white);
  color: var(--text-light);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s var(--ease);
  flex-shrink: 0;
}
.tb-btn:hover { border-color: var(--primary); color: var(--primary); }
.tb-btn.primary {
  background: var(--gradient-primary);
  color: #fff;
  border-color: transparent;
}
.tb-btn.primary:hover { opacity: 0.9; color: #fff; }

.preview-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 20px;
  color: var(--text-muted);
}
.preview-status.error { color: #ef4444; }
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.canvas-wrap {
  display: flex;
  justify-content: center;
  background: #525659;
  border-radius: var(--radius-lg);
  padding: 12px 8px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.canvas-wrap canvas {
  display: block;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 18px 0 0;
}
.pg-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--white);
  color: var(--text-light);
  cursor: pointer;
  transition: all 0.2s var(--ease);
}
.pg-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pg-indicator {
  font-size: 14px;
  color: var(--text-light);
  font-variant-numeric: tabular-nums;
  min-width: 64px;
  text-align: center;
}

@media (max-width: 768px) {
  .preview-page { padding: 8px 0 40px; }
  .preview-toolbar { padding: 10px 12px; gap: 8px; }
  .tb-btn { padding: 6px 10px; font-size: 12px; }
  .tb-title { font-size: 13px; }
  .canvas-wrap { padding: 8px 4px; border-radius: var(--radius); }
}
</style>
