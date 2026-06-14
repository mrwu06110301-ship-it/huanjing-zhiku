<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticle, createArticle, updateArticle } from "@/api/article";
import { getCategories } from "@/api/category";
import { uploadImage } from "@/api/upload";
import type { CategoryOut } from "@/types";
import { ElMessage } from "element-plus";
import RichEditor from "@/components/RichEditor.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const isEdit = ref(false);
const categories = ref<CategoryOut[]>([]);
const loading = ref(false);

// 表单字段
const title = ref("");
const content = ref("");
const summary = ref("");
const cover_image = ref("");
const category_id = ref<number | null>(null);
const is_pinned = ref(false);
const contentKey = ref(0); // 强制RichEditor重挂载

onMounted(async () => {
  if (!auth.token) {
    ElMessage.warning("请先登录");
    router.push("/login");
    return;
  }

  const catRes = await getCategories("forum");
  categories.value = catRes.data;

  const id = route.params.id as string | undefined;
  if (id && id !== "new" && id !== "") {
    isEdit.value = true;
    loading.value = true;
    try {
      const res = await getArticle(Number(id));
      title.value = res.data.title;
      content.value = res.data.content || "";
      contentKey.value++;
      summary.value = res.data.summary || "";
      cover_image.value = res.data.cover_image || "";
      category_id.value = res.data.category_id;
      is_pinned.value = res.data.is_pinned;
    } finally {
      loading.value = false;
    }
  }
});

// 自动摘要回调
function handleAutoSummary(text: string) {
  if (!summary.value || summary.value.length < 10) {
    summary.value = text;
  }
}

// 封面图上传
async function handleCoverUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loading.value = true;
  try {
    const res = await uploadImage(file);
    cover_image.value = res.data.url;
    ElMessage.success("封面图上传成功");
  } catch {
    ElMessage.error("上传失败");
  } finally {
    loading.value = false;
    input.value = "";
  }
}

// 拖拽上传
function handleDrop(e: DragEvent) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) {
    uploadImageFile(file);
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
}

async function uploadImageFile(file: File) {
  loading.value = true;
  try {
    const res = await uploadImage(file);
    cover_image.value = res.data.url;
    ElMessage.success("封面图上传成功");
  } catch {
    ElMessage.error("上传失败");
  } finally {
    loading.value = false;
  }
}

// 粘贴图片
function handleCoverPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        uploadImageFile(file);
        return;
      }
    }
  }
}

async function handleSave() {
  if (!title.value.trim()) {
    ElMessage.warning("请输入标题");
    return;
  }

  const data = {
    title: title.value.trim(),
    content: content.value,
    summary: summary.value.trim(),
    cover_image: cover_image.value.trim(),
    module: "forum",
    category_id: category_id.value,
    is_pinned: is_pinned.value,
  };

  loading.value = true;
  try {
    const res = isEdit.value
      ? await updateArticle(Number(route.params.id), data)
      : await createArticle(data);

    const articleId = isEdit.value ? Number(route.params.id) : res.data.id;
    ElMessage.success(isEdit.value ? "更新成功" : "已提交，等待管理员审核");
    window.open(`/article/${articleId}`, "_blank");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "操作失败");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="edit-page">
    <div class="page-header">
      <h1>{{ isEdit ? "编辑文章" : "发布文章" }}</h1>
      <p>分享你的技术心得与行业经验</p>
    </div>

    <div v-loading="loading" class="edit-form">
      <!-- 标题 -->
      <div class="form-group">
        <label>标题 <span class="required">*</span></label>
        <el-input v-model="title" placeholder="请输入文章标题" size="large" maxlength="200" show-word-limit />
      </div>

      <!-- 分类 -->
      <div class="form-group">
        <label>分类</label>
        <el-select v-model="category_id" placeholder="选择分类" clearable style="width: 100%">
          <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
        </el-select>
      </div>

      <!-- 摘要 -->
      <div class="form-group">
        <label>摘要 <span class="hint">（编辑正文后自动提取，也可手动修改）</span></label>
        <el-input v-model="summary" placeholder="简短描述，将显示在文章列表中" maxlength="200" show-word-limit :rows="2" type="textarea" />
      </div>

      <!-- 封面图 -->
      <div class="form-group">
        <label>封面图</label>
        <div
          class="cover-area"
          @drop="handleDrop"
          @dragover="handleDragOver"
          @paste="handleCoverPaste"
        >
          <div v-if="cover_image" class="cover-preview">
            <img :src="cover_image" alt="封面" />
            <button class="cover-remove" @click="cover_image = ''">✕</button>
          </div>
          <label v-else class="cover-upload">
            <input type="file" accept="image/*" @change="handleCoverUpload" hidden />
            <span class="upload-icon">📷</span>
            <span>点击上传 · 拖拽图片到此处 · Ctrl+V粘贴</span>
          </label>
        </div>
      </div>

      <!-- 富文本编辑器 -->
      <div class="form-group">
        <label>正文 <span class="required">*</span></label>
        <RichEditor :key="contentKey" v-model="content" @auto-summary="handleAutoSummary" />
      </div>

      <!-- 置顶 -->
      <div class="form-group" v-if="auth.isAdmin()">
        <el-checkbox v-model="is_pinned">置顶此文章</el-checkbox>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <el-button @click="router.back()">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="loading">
          {{ isEdit ? "保存修改" : "提交审核" }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 0;
}

.page-header {
  margin-bottom: 28px;
}

.page-header h1 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 4px;
}

.page-header p {
  color: var(--text-light);
  font-size: 14px;
}

.edit-form {
  background: var(--white);
  border-radius: var(--radius);
  padding: 28px;
  box-shadow: var(--shadow);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text);
}

.required {
  color: #e74c3c;
}

.hint {
  font-weight: 400;
  color: var(--text-light);
  font-size: 12px;
}

.cover-area {
  border: 2px dashed var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.cover-area:hover {
  border-color: var(--primary);
}

.cover-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  cursor: pointer;
  color: var(--text-light);
  font-size: 14px;
  transition: background 0.2s;
}

.cover-upload:hover {
  background: #f8f9fa;
}

.upload-icon {
  font-size: 36px;
}

.cover-preview {
  position: relative;
  max-height: 300px;
  overflow: hidden;
}

.cover-preview img {
  width: 100%;
  max-height: 300px;
  object-fit: cover;
  display: block;
}

.cover-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-remove:hover {
  background: rgba(0, 0, 0, 0.8);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

@media (max-width: 768px) {
  .edit-form {
    padding: 16px;
  }
}
</style>
