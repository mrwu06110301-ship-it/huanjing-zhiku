<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getFAQs, createFAQ, deleteFAQ } from "@/api/faq";
import { getCategories, createCategory } from "@/api/category";
import type { FAQOut, CategoryOut } from "@/types";
import { checkUploadPermission } from "@/api/video";
import { useAuthStore } from "@/stores/auth";
import { useShare } from "@/composables/useShare";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";

const faqs = ref<FAQOut[]>([]);
const { share } = useShare();
const auth = useAuthStore();
const categories = ref<CategoryOut[]>([]);
/** 当前筛选分类（null=全部），数据源与管理员分类管理(module=faq)一致 */
const activeCategory = ref<number | null>(null);
const searchQuery = ref("");
const loading = ref(false);
/** 是否具备新增权限（管理员或被授权上传权限的账号，与论坛/视频一致） */
const canUpload = ref(false);

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return faqs.value;
  const q = searchQuery.value.trim().toLowerCase();
  return faqs.value.filter(f =>
    f.question.toLowerCase().includes(q) || (f.answer || "").toLowerCase().includes(q)
  );
});

async function loadFAQs() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 50 };
    if (activeCategory.value) params.category_id = activeCategory.value;
    const res = await getFAQs(params as any);
    faqs.value = res.data.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const catRes = await getCategories("faq");
  categories.value = catRes.data;
  loadFAQs();
  // 检查新增权限（管理员或已授权上传的账号）
  if (auth.isLoggedIn()) {
    try {
      const res = await checkUploadPermission();
      canUpload.value = res.data.can_upload;
    } catch { /* ignore */ }
  }
});

function switchCategory(catId: number | null) {
  activeCategory.value = activeCategory.value === catId ? null : catId;
  loadFAQs();
}

// ==================== 新增 FAQ ====================
const dialogVisible = ref(false);
const submitting = ref(false);
const faqForm = ref({
  question: "",
  answer: "",
  category_id: null as number | null,
});

function openCreate() {
  faqForm.value = { question: "", answer: "", category_id: null };
  dialogVisible.value = true;
}

// ==================== 分类选项管理（有新增权限即可新增分类） ====================
const manageVisible = ref(false);
const newCatName = ref("");
const addingCat = ref(false);

function openManage() {
  newCatName.value = "";
  manageVisible.value = true;
}

/** 新增分类（自动生成 slug） */
async function addCategory() {
  const name = newCatName.value.trim();
  if (!name) { ElMessage.warning("请输入分类名称"); return; }
  if (categories.value.some(c => c.name === name)) { ElMessage.warning("该分类已存在"); return; }
  addingCat.value = true;
  try {
    const slug = `faq-${Date.now()}`;
    await createCategory({ module: "faq", name, slug });
    ElMessage.success("分类已新增");
    newCatName.value = "";
    const catRes = await getCategories("faq");
    categories.value = catRes.data;
    loadFAQs();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "新增分类失败（需管理员权限）");
  } finally {
    addingCat.value = false;
  }
}

/** 删除分类（软删除，若已被 FAQ 引用会被后端停用，同时清空引用） */
function removeCategory(cat: CategoryOut) {
  ElMessageBox.confirm(
    `确定删除分类「${cat.name}」？使用该分类的问题将变为未分类。`,
    "删除分类",
    { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
  ).then(async () => {
    try {
      const { deleteCategory } = await import("@/api/category");
      await deleteCategory(cat.id);
      ElMessage.success("分类已删除");
      if (faqForm.value.category_id === cat.id) faqForm.value.category_id = null;
      // 正在筛选被删分类时重置为全部
      if (activeCategory.value === cat.id) activeCategory.value = null;
      const catRes = await getCategories("faq");
      categories.value = catRes.data;
      loadFAQs();
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || "删除分类失败（需管理员权限）");
    }
  }).catch(() => {});
}

async function submitFAQ() {
  if (!faqForm.value.question.trim()) {
    ElMessage.warning("请填写问题描述");
    return;
  }
  submitting.value = true;
  try {
    await createFAQ({
      question: faqForm.value.question.trim(),
      answer: faqForm.value.answer.trim(),
      category_id: faqForm.value.category_id,
    });
    ElMessage.success("新增成功");
    dialogVisible.value = false;
    loadFAQs();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "新增失败，请联系管理员授权");
  } finally {
    submitting.value = false;
  }
}

function handleDelete(id: number) {
  ElMessageBox.confirm("确定删除该问题？", "删除确认", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" })
    .then(() => deleteFAQ(id))
    .then(() => { ElMessage.success("已删除"); loadFAQs(); })
    .catch(() => {});
}
</script>

<template>
  <div class="page">
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="faq" :size="26" />
          </div>
          <h1>常见问题</h1>
        </div>
        <p class="page-header-sub">现场问题、设备维护、用户答疑</p>
      </div>
      <div class="header-right">
        <el-button v-if="canUpload" type="primary" size="small" class="add-btn" @click="openCreate">
          <Icon name="plus" :size="14" style="margin-right:5px" /> 新增
        </el-button>
        <el-button plain size="small" @click="share('常见问题', '现场问题、设备维护、用户答疑')">
          <Icon name="share" :size="14" style="margin-right:6px" /> 分享
        </el-button>
      </div>
    </div>

    <div class="controls">
      <div class="cat-pills category-tabs">
        <span :class="['cat-pill', { active: activeCategory === null }]" @click="switchCategory(null)">全部</span>
        <span
          v-for="c in categories"
          :key="c.id"
          :class="['cat-pill', { active: activeCategory === c.id }]"
          @click="switchCategory(c.id)"
        >{{ c.name }}</span>
      </div>
      <div class="search-wrap">
        <Icon name="search" :size="15" class="search-ic" />
        <input v-model="searchQuery" placeholder="搜索问题..." class="local-search" />
      </div>
    </div>

    <div v-loading="loading" class="faq-list">
      <el-collapse>
        <el-collapse-item v-for="f in filtered" :key="f.id">
          <template #title>
            <span class="faq-question">{{ f.question }}</span>
            <span v-if="f.category_name" class="faq-cat-badge">{{ f.category_name }}</span>
          </template>
          <div class="faq-answer">{{ f.answer }}</div>
          <div class="faq-meta">
            <span><Icon name="user" :size="12" /> {{ f.author_name }}</span>
            <span><Icon name="clock" :size="12" /> {{ f.created_at?.substring(0, 10) }}</span>
            <span><Icon name="eye" :size="12" /> {{ f.view_count }}</span>
            <span
              v-if="auth.user?.id === (f as any).author_id || auth.isAdmin()"
              class="faq-delete"
              @click.stop="handleDelete(f.id)"
            >删除</span>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!loading && filtered.length === 0" description="暂无问题" />
    </div>

    <!-- 新增 FAQ 对话框 -->
    <el-dialog v-model="dialogVisible" title="新增问题" width="560px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="问题描述 *">
          <el-input
            v-model="faqForm.question"
            type="textarea" :rows="2" maxlength="500" show-word-limit
            placeholder="如：烟尘采样时采样嘴反向安装会出现什么现象？"
          />
        </el-form-item>
        <el-form-item label="解决办法">
          <el-input
            v-model="faqForm.answer"
            type="textarea" :rows="5" maxlength="5000" show-word-limit
            placeholder="填写问题的处理办法、排查步骤或经验总结"
          />
        </el-form-item>
        <el-form-item>
          <template #label>
            分类
            <el-link type="primary" :underline="false" style="font-size:12px;margin-left:6px" @click="openManage">
              <Icon name="filter" :size="12" style="vertical-align:-1px" /> 选项管理
            </el-link>
          </template>
          <el-select v-model="faqForm.category_id" clearable placeholder="请选择分类" style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitFAQ">提交</el-button>
      </template>
    </el-dialog>

    <!-- 分类选项管理对话框 -->
    <el-dialog v-model="manageVisible" title="分类选项管理" width="440px" destroy-on-close>
      <div class="manage-add">
        <el-input
          v-model="newCatName"
          placeholder="输入新分类名称，如：采样探头"
          maxlength="20"
          @keyup.enter="addCategory"
        />
        <el-button type="primary" :loading="addingCat" @click="addCategory">新增</el-button>
      </div>
      <div class="manage-list">
        <div v-if="categories.length === 0" class="manage-empty">暂无分类</div>
        <div v-for="c in categories" :key="c.id" class="manage-item">
          <span class="manage-name">{{ c.name }}</span>
          <el-button text type="danger" size="small" @click="removeCategory(c)">删除</el-button>
        </div>
      </div>
      <div class="manage-tip">分类与管理员「分类管理」共用同一数据源，删除后该分类下的问题将变为未分类。</div>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { padding: 40px 0 24px; }
.header-right { display: flex; gap: 10px; align-items: center; }

.controls { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
/* cat-pill 统一样式已全局定义于 App.vue */
.category-tabs { flex: 1; }

.search-wrap {
  position: relative; display: flex; align-items: center; margin-left: auto;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.local-search {
  padding: 8px 14px 8px 36px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 160px; transition: all 0.25s var(--ease); background: var(--white);
}
.local-search:focus { border-color: var(--primary); width: 200px; box-shadow: 0 0 0 3px var(--primary-glow); }

.faq-list {
  background: var(--white); border-radius: var(--radius-lg);
  padding: 8px 24px 24px; box-shadow: var(--shadow); border: 1px solid var(--border-light);
}

.faq-question {
  font-size: 16px; font-weight: 600; color: var(--text);
}
.faq-cat-badge {
  margin-left: 10px; font-size: 11.5px; font-weight: 500; color: var(--primary);
  background: rgba(37, 99, 235, 0.08); border-radius: 10px; padding: 2px 10px; flex-shrink: 0;
}

.faq-answer {
  line-height: 1.9; color: var(--text-light); font-size: 15px;
  padding: 4px 0; white-space: pre-wrap;
}

.faq-meta {
  display: flex; gap: 18px; margin-top: 14px; font-size: 12px; color: var(--text-muted);
}
.faq-meta span {
  display: flex; align-items: center; gap: 4px;
}
.faq-delete { margin-left: auto; cursor: pointer; transition: color 0.2s; }
.faq-delete:hover { color: #ef4444; }

/* 分类选项管理 */
.manage-add { display: flex; gap: 10px; margin-bottom: 14px; }
.manage-list { max-height: 260px; overflow-y: auto; }
.manage-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border-light);
  margin-bottom: 8px; background: var(--white);
}
.manage-name { font-size: 14px; color: var(--text); }
.manage-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 18px 0; }
.manage-tip { font-size: 12px; color: var(--text-muted); margin-top: 10px; line-height: 1.6; }

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; }
  .controls { flex-direction: column; align-items: stretch; }
  .search-wrap { margin-left: 0; }
  .local-search { width: 100%; }
  .faq-list { padding: 8px 16px 20px; }
}
</style>
