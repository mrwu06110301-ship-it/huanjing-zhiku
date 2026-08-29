<script setup lang="ts">
/** 工具管理（管理员）— 调整工具分类标签/排序/公开状态等 */
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getToolsAdmin, updateTool, deleteTool } from "@/api/tool";
import { getCategories, createCategory } from "@/api/category";
import type { ToolOut, CategoryOut } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";

const auth = useAuthStore();
const tools = ref<ToolOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const loading = ref(false);

const TYPE_LABEL: Record<string, string> = {
  calculator: "计算器",
  converter: "换算器",
  model: "模型",
};

async function loadAll() {
  loading.value = true;
  try {
    const [t, c] = await Promise.all([getToolsAdmin(), getCategories("tool")]);
    tools.value = t.data || [];
    categories.value = c.data || [];
  } catch {
    ElMessage.error("加载失败");
  } finally {
    loading.value = false;
  }
}

// ===== 分类管理（快速新增） =====
const newCatVisible = ref(false);
const newCatName = ref("");

async function addCategoryQuick() {
  const name = newCatName.value.trim();
  if (!name) { ElMessage.warning("请输入分类名称"); return; }
  try {
    await createCategory({
      module: "tool",
      name,
      slug: `tool-${Date.now().toString(36)}`,
      sort_order: categories.value.length,
    });
    ElMessage.success("分类已创建");
    newCatVisible.value = false;
    newCatName.value = "";
    const c = await getCategories("tool");
    categories.value = c.data || [];
  } catch {
    ElMessage.error("创建失败");
  }
}

// ===== 行内切换分类 =====
async function changeCategory(tool: ToolOut, category: string) {
  try {
    await updateTool(tool.id, { category });
    tool.category = category;
    ElMessage.success(`「${tool.name}」已切换到「${category || "未分类"}」`);
  } catch {
    ElMessage.error("切换失败");
    loadAll();
  }
}

// ===== 行内切换公开状态 =====
async function togglePublic(tool: ToolOut, val: boolean) {
  try {
    await updateTool(tool.id, { is_public: val });
    ElMessage.success(val ? `「${tool.name}」已公开` : `「${tool.name}」已隐藏`);
  } catch {
    ElMessage.error("操作失败");
    loadAll();
  }
}

// ===== 编辑弹窗 =====
const dialogVisible = ref(false);
const editing = ref<ToolOut | null>(null);
const form = ref({
  name: "", slug: "", description: "", category: "",
  tool_type: "model", sort_order: 0,
});

function openEdit(tool: ToolOut) {
  editing.value = tool;
  form.value = {
    name: tool.name,
    slug: tool.slug,
    description: tool.description || "",
    category: tool.category || "",
    tool_type: tool.tool_type || "model",
    sort_order: tool.sort_order ?? 0,
  };
  dialogVisible.value = true;
}

async function saveEdit() {
  if (!form.value.name.trim()) { ElMessage.warning("请输入工具名称"); return; }
  if (!editing.value) return;
  try {
    await updateTool(editing.value.id, { ...form.value });
    ElMessage.success("保存成功");
    dialogVisible.value = false;
    loadAll();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    ElMessage.error(msg || "保存失败");
  }
}

async function handleDelete(tool: ToolOut) {
  try {
    await ElMessageBox.confirm(
      `确认删除工具「${tool.name}」？该操作不可恢复。`,
      "删除工具",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
    );
    await deleteTool(tool.id);
    ElMessage.success("已删除");
    loadAll();
  } catch { /* cancel */ }
}

onMounted(() => { if (auth.isAdmin()) loadAll(); });
</script>

<template>
  <div class="admin-tools-page" v-if="auth.isAdmin()">
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon"><Icon name="tool" :size="26" /></div>
          <h1>工具管理</h1>
        </div>
        <p class="page-header-sub">调整工具分类标签 · 排序 · 公开状态</p>
      </div>
      <div class="header-right">
        <el-button size="small" plain @click="newCatVisible = true">
          <Icon name="plus" :size="14" style="margin-right:5px" /> 新增分类
        </el-button>
        <el-button size="small" plain type="primary" @click="loadAll">
          <Icon name="refresh" :size="14" style="margin-right:5px" /> 刷新
        </el-button>
      </div>
    </div>

    <!-- 分类标签一览 -->
    <div class="cat-chips" v-if="categories.length">
      <span class="chip-static">可用分类：</span>
      <span v-for="c in categories" :key="c.id" class="chip">{{ c.name }}</span>
      <span class="chip-tip">分类在「分类管理 → 常用工具」中维护</span>
    </div>

    <div class="tools-table" v-loading="loading">
      <table>
        <thead>
          <tr>
            <th style="width:44px">ID</th>
            <th>工具名称</th>
            <th>标识</th>
            <th>分类标签</th>
            <th>类型</th>
            <th>排序</th>
            <th>公开</th>
            <th style="width:130px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tools" :key="t.id">
            <td>{{ t.id }}</td>
            <td class="name-cell">
              <b>{{ t.name }}</b>
              <p class="desc">{{ t.description || "-" }}</p>
            </td>
            <td><code>{{ t.slug }}</code></td>
            <td>
              <el-select
                :model-value="t.category"
                size="small"
                placeholder="未分类"
                clearable
                style="width: 150px"
                @change="(val: string) => changeCategory(t, val || '')"
              >
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.name" />
              </el-select>
            </td>
            <td><span class="type-tag">{{ TYPE_LABEL[t.tool_type] || t.tool_type }}</span></td>
            <td>{{ t.sort_order }}</td>
            <td>
              <el-switch
                :model-value="t.is_public"
                size="small"
                @change="(val: boolean) => togglePublic(t, val)"
              />
            </td>
            <td class="action-cell">
              <el-button size="small" @click="openEdit(t)">编辑</el-button>
              <el-button size="small" type="danger" @click="handleDelete(t)">删除</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <el-empty v-if="!loading && tools.length === 0" description="暂无工具" />
    </div>

    <!-- 新增分类快捷弹窗 -->
    <el-dialog v-model="newCatVisible" title="新增工具分类" width="420px">
      <el-form @submit.prevent>
        <el-form-item label="分类名称">
          <el-input v-model="newCatName" placeholder="如：废气监测" @keyup.enter="addCategoryQuick" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newCatVisible = false">取消</el-button>
        <el-button type="primary" @click="addCategoryQuick">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="`编辑工具：${editing?.name || ''}`" width="500px">
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="标识">
          <el-input v-model="form.slug" placeholder="URL 路径标识，如 atmospheric-stability" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" placeholder="未分类" clearable style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.tool_type" style="width: 100%">
            <el-option label="计算器" value="calculator" />
            <el-option label="换算器" value="converter" />
            <el-option label="模型" value="model" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" :max="999" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-tools-page { max-width: 1100px; margin: 0 auto; padding-bottom: 40px; }
.header-right { display: flex; gap: 8px; }

.cat-chips {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 14px; font-size: 13px; color: var(--text-light);
}
.chip {
  padding: 3px 12px; border-radius: 20px; font-size: 12.5px; font-weight: 600;
  background: rgba(37, 99, 235, 0.08); color: var(--primary);
}
.chip-static { font-weight: 600; }
.chip-tip { font-size: 12px; opacity: 0.65; }

.tools-table {
  background: var(--card-bg); border-radius: var(--radius);
  box-shadow: var(--shadow); overflow-x: auto; border: 1px solid var(--card-border);
}
.tools-table table { width: 100%; border-collapse: collapse; }
.tools-table th {
  background: rgba(37, 99, 235, 0.04); padding: 12px 14px; text-align: left;
  font-size: 13px; font-weight: 600; color: var(--text-light);
  border-bottom: 1px solid var(--card-border); white-space: nowrap;
}
.tools-table td {
  padding: 12px 14px; border-bottom: 1px solid var(--card-border);
  font-size: 14px; color: var(--text); vertical-align: middle;
}
.tools-table tr:last-child td { border-bottom: none; }
.name-cell b { font-weight: 600; }
.name-cell .desc { margin: 3px 0 0; font-size: 12px; color: var(--text-light); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tools-table code { font-size: 12px; color: var(--primary); background: rgba(37, 99, 235, 0.07); padding: 2px 8px; border-radius: 4px; }
.type-tag { font-size: 12px; color: var(--text-light); }
.action-cell { white-space: nowrap; }

@media (max-width: 768px) {
  .admin-tools-page :deep(.page-header-row) { flex-wrap: wrap; }
  .name-cell .desc { display: none; }
}
</style>
