<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getFAQs, createFAQ, deleteFAQ } from "@/api/faq";
import { getCategories } from "@/api/category";
import type { FAQOut, CategoryOut } from "@/types";
import { useAuthStore } from "@/stores/auth";
import { useShare } from "@/composables/useShare";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";

const faqs = ref<FAQOut[]>([]);
const { share } = useShare();
const auth = useAuthStore();
const categories = ref<CategoryOut[]>([]);
const activeType = ref("");
const searchQuery = ref("");
const loading = ref(false);

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return faqs.value;
  const q = searchQuery.value.trim().toLowerCase();
  return faqs.value.filter(f =>
    f.question.toLowerCase().includes(q) || (f.answer || "").toLowerCase().includes(q)
  );
});

// 类型标签（固定四种，与管理端 faq_type 对应）
const typeTabs = [
  { label: "全部", value: "" },
  { label: "现场常见问题", value: "onsite" },
  { label: "用户提问", value: "user_question" },
  { label: "设备问题", value: "equipment" },
  { label: "维修维护指南", value: "maintenance" },
];

async function loadFAQs() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 50 };
    if (activeType.value) params.faq_type = activeType.value;
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
});

function switchType(type: string) {
  activeType.value = type;
  loadFAQs();
}

// ==================== 新增 FAQ ====================
const dialogVisible = ref(false);
const submitting = ref(false);
const faqForm = ref({
  question: "",
  answer: "",
  faq_type: "onsite",
  category_id: null as number | null,
});

const faqTypeOptions = [
  { label: "现场常见问题", value: "onsite" },
  { label: "用户提问", value: "user_question" },
  { label: "设备问题", value: "equipment" },
  { label: "维修维护指南", value: "maintenance" },
];

function openCreate() {
  faqForm.value = { question: "", answer: "", faq_type: "onsite", category_id: null };
  dialogVisible.value = true;
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
      faq_type: faqForm.value.faq_type,
      category_id: faqForm.value.category_id,
    });
    ElMessage.success("提交成功，感谢分享！");
    dialogVisible.value = false;
    loadFAQs();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "提交失败，请先登录");
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
        <el-button type="primary" size="small" class="add-btn" @click="openCreate">
          <Icon name="plus" :size="14" style="margin-right:5px" /> 我要提问
        </el-button>
        <el-button plain size="small" @click="share('常见问题', '现场问题、设备维护、用户答疑')">
          <Icon name="share" :size="14" style="margin-right:6px" /> 分享
        </el-button>
      </div>
    </div>

    <div class="controls">
      <div class="category-tabs">
        <span
          v-for="tab in typeTabs"
          :key="tab.value"
          :class="['tab', { active: activeType === tab.value }]"
          @click="switchType(tab.value)"
        >{{ tab.label }}</span>
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
      <el-empty v-if="!loading && filtered.length === 0" description="暂无问题，点击右上角「我要提问」录入" />
    </div>

    <!-- 新增 FAQ 对话框 -->
    <el-dialog v-model="dialogVisible" title="录入问题" width="560px" destroy-on-close>
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
        <div class="form-row">
          <el-form-item label="问题类型" class="grow">
            <el-select v-model="faqForm.faq_type" style="width:100%">
              <el-option v-for="t in faqTypeOptions" :key="t.value" :value="t.value" :label="t.label" />
            </el-select>
          </el-form-item>
          <el-form-item label="分类（管理员分类管理维护）" class="grow">
            <el-select v-model="faqForm.category_id" clearable placeholder="可选" style="width:100%">
              <el-option v-for="c in categories" :key="c.id" :value="c.id" :label="c.name" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitFAQ">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { padding: 40px 0 24px; }
.header-right { display: flex; gap: 10px; align-items: center; }

.controls { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.category-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tab {
  padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px;
  background: var(--white); border: 1px solid var(--border); transition: all 0.2s var(--ease);
  font-weight: 500; color: var(--text-light);
}
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--gradient-primary); color: #fff; border-color: transparent; font-weight: 600; box-shadow: 0 2px 8px var(--primary-glow); }

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

.form-row { display: flex; gap: 14px; }
.form-row .grow { flex: 1; }

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; }
  .controls { flex-direction: column; align-items: stretch; }
  .search-wrap { margin-left: 0; }
  .local-search { width: 100%; }
  .faq-list { padding: 8px 16px 20px; }
  .form-row { flex-direction: column; gap: 0; }
}
</style>
