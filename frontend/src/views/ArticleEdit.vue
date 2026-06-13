<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getArticle, createArticle, updateArticle } from "@/api/article";
import { getCategories } from "@/api/category";
import type { CategoryOut } from "@/types";
import { ElMessage } from "element-plus";

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
const tags_str = ref(""); // 逗号分隔的标签字符串
const is_pinned = ref(false);

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
      content.value = res.data.content;
      summary.value = res.data.summary || "";
      cover_image.value = res.data.cover_image || "";
      category_id.value = res.data.category_id;
      tags_str.value = (res.data.tags || []).join("，");
      is_pinned.value = res.data.is_pinned;
    } finally {
      loading.value = false;
    }
  }
});

async function handleSave() {
  if (!title.value.trim()) {
    ElMessage.warning("请输入标题");
    return;
  }

  // 解析标签
  const tags = tags_str.value
    .split(/[，,、\s]+/)
    .map((t: string) => t.trim())
    .filter((t: string) => t.length > 0);

  const data = {
    title: title.value.trim(),
    content: content.value,
    summary: summary.value.trim(),
    cover_image: cover_image.value.trim(),
    module: "forum",
    category_id: category_id.value,
    tags,
    is_pinned: is_pinned.value,
  };

  loading.value = true;
  try {
    const res = isEdit.value
      ? await updateArticle(Number(route.params.id), data)
      : await createArticle(data);

    const articleId = isEdit.value ? Number(route.params.id) : res.data.id;
    ElMessage.success(isEdit.value ? "更新成功" : auth.isAdmin() ? "发布成功" : "发布成功，等待审核");
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

      <!-- 分类 + 标签 行 -->
      <div class="form-row">
        <div class="form-group flex-1">
          <label>分类</label>
          <el-select v-model="category_id" placeholder="选择分类" clearable style="width: 100%">
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.icon + ' ' + cat.name"
              :value="cat.id"
            />
          </el-select>
        </div>
        <div class="form-group flex-1">
          <label>标签</label>
          <el-input v-model="tags_str" placeholder="用逗号分隔，如：Python，FastAPI" />
        </div>
      </div>

      <!-- 摘要 -->
      <div class="form-group">
        <label>摘要</label>
        <el-input
          v-model="summary"
          placeholder="简短描述，将显示在文章列表中（可选）"
          maxlength="200"
          show-word-limit
          :rows="2"
          type="textarea"
        />
      </div>

      <!-- 封面图 -->
      <div class="form-group">
        <label>封面图 URL</label>
        <el-input v-model="cover_image" placeholder="https://example.com/image.jpg（可选）" />
      </div>

      <!-- 内容 - 增强编辑器 -->
      <div class="form-group">
        <label>正文 <span class="required">*</span> <span class="hint">（支持 Markdown 语法）</span></label>
        <div class="editor-wrapper">
          <div class="editor-toolbar">
            <span class="toolbar-item" @click="content += '**粗体文字**'">B</span>
            <span class="toolbar-item" @click="content += '\n## 标题\n'">H1</span>
            <span class="toolbar-item" @click="content += '\n- 列表项\n'">•</span>
            <span class="toolbar-item" @click="content += '\n> 引用文字\n'">❝</span>
            <span class="toolbar-item" @click="content += '\n---\n'">—</span>
          </div>
          <el-input
            v-model="content"
            type="textarea"
            :rows="20"
            placeholder="在这里输入文章内容...&#10;&#10;支持 Markdown 语法：&#10;# 一级标题&#10;## 二级标题&#10;**粗体** *斜体*&#10;-> 引用&#10;- 无序列表&#10;1. 有序列表"
            class="content-editor"
          />
        </div>
      </div>

      <!-- 置顶（仅管理员） -->
      <div class="form-group" v-if="auth.isAdmin()">
        <el-checkbox v-model="is_pinned">置顶此文章</el-checkbox>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <el-button @click="router.back()">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="loading">
          {{ isEdit ? "保存修改" : "发布文章" }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  max-width: 800px;
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

.form-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

/* 简易编辑器工具栏 */
.editor-wrapper {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  gap: 0;
  padding: 6px 8px;
  background: #f8f9fa;
  border-bottom: 1px solid var(--border);
}

.toolbar-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #555;
  transition: all 0.15s;
  user-select: none;
}

.toolbar-item:hover {
  background: var(--primary-light);
  color: var(--primary);
}

.content-editor :deep(.el-textarea__inner) {
  border: none;
  border-radius: 0;
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 14px;
  line-height: 1.8;
  padding: 16px;
  min-height: 400px;
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
  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .edit-form {
    padding: 16px;
  }
}
</style>
