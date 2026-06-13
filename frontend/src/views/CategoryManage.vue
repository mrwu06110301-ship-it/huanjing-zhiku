<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/api/category";
import type { CategoryOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";

const auth = useAuthStore();

const categories = ref<CategoryOut[]>([]);
const loading = ref(false);
const activeModule = ref("forum");
const dialogVisible = ref(false);
const editMode = ref(false);
const editId = ref<number | null>(null);

// 表单
const form = ref({
  module: "forum",
  name: "",
  slug: "",
  description: "",
  icon: "",
  sort_order: 0,
});

const moduleOptions = [
  { value: "forum", label: "技术论坛 💬" },
  { value: "video", label: "学习视频 🎬" },
  { value: "standard", label: "方法标准 📋" },
  { value: "faq", label: "常见问题 ❓" },
  { value: "tool", label: "常用工具 🧮" },
];

const filteredCategories = computed(() => {
  return categories.value.filter((c) => c.module === activeModule.value);
});

async function loadCategories() {
  loading.value = true;
  try {
    const res = await getCategories(undefined, true);
    categories.value = res.data;
  } finally {
    loading.value = false;
  }
}

function openCreate(module: string) {
  editMode.value = false;
  editId.value = null;
  form.value = {
    module: module,
    name: "",
    slug: "",
    description: "",
    icon: "",
    sort_order: filteredCategories.value.length,
  };
  dialogVisible.value = true;
}

function openEdit(cat: CategoryOut) {
  editMode.value = true;
  editId.value = cat.id;
  form.value = {
    module: cat.module,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    icon: cat.icon,
    sort_order: cat.sort_order,
  };
  dialogVisible.value = true;
}

function generateSlug(name: string) {
  // 中文转拼音式 slug：直接用 name 的英文/数字部分，中文按拼音转换
  // 简单方案：取 name 中英文字母+数字，否则用 name+随机数
  const en = name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (en) return en;
  return `cat-${Date.now().toString(36)}`;
}

function onNameChange() {
  if (!editMode.value && !form.value.slug) {
    form.value.slug = generateSlug(form.value.name);
  }
}

async function handleSave() {
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    ElMessage.warning("名称和标识符不能为空");
    return;
  }
  try {
    if (editMode.value && editId.value) {
      await updateCategory(editId.value, form.value);
      ElMessage.success("分类已更新");
    } else {
      await createCategory(form.value);
      ElMessage.success("分类已创建");
    }
    dialogVisible.value = false;
    await loadCategories();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "操作失败");
  }
}

async function handleDelete(cat: CategoryOut) {
  try {
    await ElMessageBox.confirm(
      `确定停用分类「${cat.name}」？停用后该分类将不在前台显示，已有文章不受影响。`,
      "停用确认",
      { confirmButtonText: "停用", cancelButtonText: "取消", type: "warning" }
    );
    await deleteCategory(cat.id);
    ElMessage.success("分类已停用");
    await loadCategories();
  } catch {
    /* 取消操作 */
  }
}

async function handleReactivate(cat: CategoryOut) {
  await updateCategory(cat.id, { is_active: true });
  ElMessage.success("分类已启用");
  await loadCategories();
}

const moduleCount = computed(() => {
  const m: Record<string, number> = {};
  for (const c of categories.value) {
    m[c.module] = (m[c.module] || 0) + 1;
  }
  return m;
});

onMounted(() => {
  if (!auth.isAdmin()) {
    ElMessage.warning("需要管理员权限");
    return;
  }
  loadCategories();
});
</script>

<template>
  <div class="manage-page">
    <div class="page-header">
      <h1>分类管理</h1>
      <p>管理所有模块的分类标签，支持自定义增删改查</p>
    </div>

    <!-- 模块 Tab -->
    <div class="module-tabs">
      <button
        v-for="opt in moduleOptions"
        :key="opt.value"
        :class="['module-tab', { active: activeModule === opt.value }]"
        @click="activeModule = opt.value"
      >
        {{ opt.label }}
        <span class="count-badge">{{ moduleCount[opt.value] || 0 }}</span>
      </button>
    </div>

    <div class="manage-body">
      <!-- 工具栏 -->
      <div class="toolbar">
        <span class="toolbar-title">{{ activeModule }} 分类 ({{ filteredCategories.length }})</span>
        <el-button type="primary" size="small" @click="openCreate(activeModule)">
          ＋ 新建分类
        </el-button>
      </div>

      <!-- 分类表格 -->
      <el-table :data="filteredCategories" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="icon" label="图标" width="60">
          <template #default="{ row }">
            <span style="font-size: 22px">{{ row.icon || "📁" }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="slug" label="标识符" min-width="120" />
        <el-table-column prop="description" label="描述" min-width="160">
          <template #default="{ row }">
            <span class="desc-text">{{ row.description || "—" }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="70" align="center" />
        <el-table-column prop="is_active" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
              {{ row.is_active ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              v-if="row.is_active"
              size="small"
              text
              type="danger"
              @click="handleDelete(row)"
            >
              停用
            </el-button>
            <el-button v-else size="small" text type="success" @click="handleReactivate(row)">
              启用
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && filteredCategories.length === 0" description="暂无分类，点击上方按钮创建" />
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editMode ? '编辑分类' : '新建分类'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-position="top">
        <el-form-item label="模块">
          <el-select v-model="form.module" style="width: 100%">
            <el-option v-for="opt in moduleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：数智化畅享" @input="onNameChange" />
        </el-form-item>
        <el-form-item label="标识符" required>
          <el-input v-model="form.slug" placeholder="唯一标识，如：digital_insight" />
          <span class="form-hint">唯一标识，创建后不建议修改。英文字母+下划线</span>
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="emoji 如：💻" maxlength="2" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="简短描述该分类的用途" :rows="2" type="textarea" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
          <span class="form-hint">数字越小越靠前</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="loading">
          {{ editMode ? "保存修改" : "创建分类" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.manage-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px;
}

.page-header {
  margin-bottom: 24px;
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

/* 模块 Tabs */
.module-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.module-tab {
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--white);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  color: var(--text-light);
}

.module-tab:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.module-tab.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.count-badge {
  display: inline-block;
  margin-left: 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 12px;
}

.module-tab.active .count-badge {
  background: rgba(255, 255, 255, 0.25);
}

.manage-body {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.desc-text {
  color: var(--text-light);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  display: inline-block;
}

.form-hint {
  font-size: 12px;
  color: var(--text-light);
  margin-left: 8px;
}
</style>
