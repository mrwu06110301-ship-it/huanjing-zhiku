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
const activeModule = ref("forum");

const colorOptions = [
  "#00ccaa", "#00b894", "#3498db", "#2980b9", "#9b59b6",
  "#e74c3c", "#e67e22", "#f39c12", "#2ecc71", "#1abc9c",
  "#34495e", "#7f8c8d",
];

const modules = [
  { value: "forum", label: "技术论坛", icon: "📝" },
  { value: "video", label: "学习视频", icon: "🎬" },
  { value: "standard", label: "方法标准", icon: "📋" },
  { value: "faq", label: "常见问题", icon: "❓" },
  { value: "tool", label: "常用工具", icon: "🔧" },
];

const form = ref({
  module: "forum",
  name: "",
  slug: "",
  description: "",
  color: "",
  sort_order: 0,
});

const currentCats = computed(() =>
  categories.value.filter(c => c.module === activeModule.value)
);

async function loadCategories() {
  loading.value = true;
  try {
    const res = await getCategories();
    categories.value = res.data;
  } finally { loading.value = false; }
}

function switchModule(mod: string) {
  activeModule.value = mod;
}

function openAdd() {
  editingId.value = null;
  form.value = { module: activeModule.value, name: "", slug: "", description: "", color: "", sort_order: 0 };
  dialogVisible.value = true;
}

function openEdit(cat: CategoryOut) {
  editingId.value = cat.id;
  form.value = {
    module: cat.module,
    name: cat.name,
    slug: cat.slug,
    description: cat.description || "",
    color: cat.color || "",
    sort_order: cat.sort_order || 0,
  };
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) { ElMessage.warning("请输入分类名称"); return; }
  if (!form.value.slug.trim()) { ElMessage.warning("请输入分类标识"); return; }
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
  } catch { ElMessage.error("保存失败"); }
}

async function handleDelete(cat: CategoryOut) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${cat.name}」？`, "提示", {
      confirmButtonText: "删除", cancelButtonText: "取消", type: "warning",
    });
    await deleteCategory(cat.id);
    ElMessage.success("已删除");
    loadCategories();
  } catch { /* cancel */ }
}

onMounted(loadCategories);
</script>

<template>
  <div class="category-page" v-if="auth.isAdmin()">
    <div class="page-header">
      <h1>📂 分类管理</h1>
    </div>

    <div class="category-layout">
      <!-- 左侧模块菜单 -->
      <aside class="module-sidebar">
        <button
          v-for="m in modules"
          :key="m.value"
          :class="['module-btn', { active: activeModule === m.value }]"
          @click="switchModule(m.value)"
        >
          <span class="module-icon">{{ m.icon }}</span>
          <span class="module-label">{{ m.label }}</span>
        </button>
      </aside>

      <!-- 右侧分类内容 -->
      <div class="category-content">
        <div class="content-header">
          <h2>{{ modules.find(m => m.value === activeModule)?.label || activeModule }}</h2>
          <el-button type="primary" size="small" @click="openAdd()">＋ 新增分类</el-button>
        </div>

        <div v-loading="loading" class="category-table">
          <table v-if="currentCats.length > 0">
            <thead>
              <tr>
                <th>分类名称</th>
                <th>标识</th>
                <th v-if="activeModule === 'video'">标签色</th>
                <th>排序</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cat in currentCats" :key="cat.id">
                <td>{{ cat.name }}</td>
                <td><code>{{ cat.slug }}</code></td>
                <td v-if="activeModule === 'video'">
                  <span v-if="cat.color" :style="{ backgroundColor: cat.color, display:'inline-block', width:'20px', height:'20px', borderRadius:'4px', verticalAlign:'middle', border:'1px solid #ccc', marginRight:'6px' }">&nbsp;</span>
                  <span v-else style="color:#bbb;font-size:13px">-</span>
                </td>
                <td>{{ cat.sort_order }}</td>
                <td class="action-cell">
                  <el-button size="small" @click="openEdit(cat)">编辑</el-button>
                  <el-button size="small" type="danger" @click="handleDelete(cat)">删除</el-button>
                </td>
              </tr>
            </tbody>
          </table>
          <el-empty v-else description="暂无分类，点击上方新增" />
        </div>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑分类' : '新增分类'" width="480px">
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="分类名称">
          <el-input v-model="form.name" placeholder="如：废气监测" />
        </el-form-item>
        <el-form-item label="分类标识">
          <el-input v-model="form.slug" placeholder="如：waste-gas" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="activeModule === 'video'" label="标签颜色">
          <div class="color-picker-inline">
            <button v-for="c in colorOptions" :key="c" type="button" :class="['color-btn', { active: form.color === c }]" :style="{ background: c }" @click="form.color = c"></button>
            <el-tooltip content="清除颜色" placement="top">
              <button type="button" :class="['color-btn', { active: !form.color }]" @click="form.color = ''" style="border:2px dashed #ccc;background:#fff;font-size:12px;color:#999">✕</button>
            </el-tooltip>
          </div>
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
.category-page { max-width: 1000px; margin: 0 auto; padding: 24px 0; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 700; }

.category-layout { display: flex; gap: 20px; align-items: flex-start; }

/* 左侧模块菜单 */
.module-sidebar {
  width: 140px; flex-shrink: 0;
  background: #fff; border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
}
.module-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 12px 14px;
  border: none; background: transparent; cursor: pointer;
  font-size: 14px; color: #555; transition: all 0.15s;
  border-bottom: 1px solid #f5f5f5;
}
.module-btn:last-child { border-bottom: none; }
.module-btn:hover { background: #f5f8fa; color: #00aa88; }
.module-btn.active { background: #f0faf6; color: #00aa88; font-weight: 600; }
.module-icon { font-size: 18px; }
.module-label { }

/* 右侧内容 */
.category-content { flex: 1; min-width: 0; }
.content-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.content-header h2 { font-size: 18px; font-weight: 700; margin: 0; }

.category-table {
  background: #fff; border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow-x: auto;
}
.category-table table { width: 100%; border-collapse: collapse; }
.category-table th {
  background: #f8f9fa; padding: 10px 14px; text-align: left;
  font-size: 13px; font-weight: 600; color: #888;
  border-bottom: 1px solid #eee; white-space: nowrap;
}
.category-table td {
  padding: 10px 14px; border-bottom: 1px solid #f5f5f5; font-size: 14px;
}
.category-table tr.sub-row { background: #fafbfc; }
.category-table tr.sub-row td { font-size: 13px; }
.action-cell { white-space: nowrap; }
code { font-size: 12px; color: #999; background: #f5f5f5; padding: 1px 6px; border-radius: 3px; }

.color-picker-inline { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.color-btn {
  width: 28px; height: 28px; border-radius: 6px;
  border: 2px solid #eee; cursor: pointer; padding: 0;
  transition: all 0.15s;
}
.color-btn.active { border-color: #333; transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); }
.color-btn:hover { border-color: #00ccaa; }
</style>
