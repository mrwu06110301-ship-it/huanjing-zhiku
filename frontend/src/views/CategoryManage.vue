<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/api/category";
import type { CategoryOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";

const auth = useAuthStore();
const categories = ref<CategoryOut[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);

const modules = [
  { value: "forum", label: "技术论坛" },
  { value: "video", label: "学习视频" },
  { value: "standard", label: "方法标准" },
  { value: "faq", label: "常见问题" },
  { value: "tool", label: "常用工具" },
];

const form = ref({
  module: "forum",
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
});

const filteredCategories = computed(() => {
  return categories.value;
});

async function loadCategories() {
  loading.value = true;
  try {
    const res = await getCategories();
    categories.value = res.data;
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  editingId.value = null;
  form.value = { module: "forum", name: "", slug: "", description: "", sort_order: 0 };
  dialogVisible.value = true;
}

function openEdit(cat: CategoryOut) {
  editingId.value = cat.id;
  form.value = {
    module: cat.module,
    name: cat.name,
    slug: cat.slug,
    description: cat.description || "",
    sort_order: cat.sort_order || 0,
  };
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) {
    ElMessage.warning("请输入分类名称");
    return;
  }
  if (!form.value.slug.trim()) {
    ElMessage.warning("请输入分类标识");
    return;
  }

  try {
    if (editingId.value) {
      await updateCategory(editingId.value, form.value);
      ElMessage.success("更新成功");
    } else {
      await createCategory(form.value);
      ElMessage.success("创建成功");
    }
    dialogVisible.value = false;
    loadCategories();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "操作失败");
  }
}

async function handleDelete(cat: CategoryOut) {
  try {
    await ElMessageBox.confirm(`确定要删除分类「${cat.name}」吗？`, "确认删除", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await deleteCategory(cat.id);
    ElMessage.success("已删除");
    loadCategories();
  } catch {
    // 取消
  }
}

function getModuleLabel(module: string): string {
  return modules.find((m) => m.value === module)?.label || module;
}

onMounted(loadCategories);
</script>

<template>
  <div class="category-page" v-if="auth.isAdmin()">
    <div class="page-header">
      <h1>📂 分类管理</h1>
      <p>管理各模块的分类标签</p>
    </div>

    <div class="toolbar">
      <el-button type="primary" @click="openAdd">+ 新增分类</el-button>
    </div>

    <div class="category-table" v-loading="loading">
      <table>
        <thead>
          <tr>
            <th>模块</th>
            <th>分类名称</th>
            <th>标识</th>
            <th>排序</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in filteredCategories" :key="cat.id">
            <td><span class="module-tag">{{ getModuleLabel(cat.module) }}</span></td>
            <td>{{ cat.name }}</td>
            <td><code>{{ cat.slug }}</code></td>
            <td>{{ cat.sort_order }}</td>
            <td>
              <el-button size="small" @click="openEdit(cat)">编辑</el-button>
              <el-button size="small" type="danger" @click="handleDelete(cat)">删除</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <el-empty v-if="filteredCategories.length === 0" description="暂无分类" />
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑分类' : '新增分类'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="所属模块">
          <el-select v-model="form.module" style="width: 100%">
            <el-option v-for="m in modules" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类名称">
          <el-input v-model="form.name" placeholder="如：废气监测" />
        </el-form-item>
        <el-form-item label="分类标识">
          <el-input v-model="form.slug" placeholder="如：waste-gas" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.category-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.page-header p {
  color: var(--text-light);
  font-size: 14px;
}

.toolbar {
  margin-bottom: 16px;
}

.category-table {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.category-table table {
  width: 100%;
  border-collapse: collapse;
}

.category-table th {
  background: #f8f9fa;
  padding: 12px 16px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  border-bottom: 1px solid var(--border);
}

.category-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.category-table code {
  background: #f1f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--primary);
}

.module-tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
</style>
