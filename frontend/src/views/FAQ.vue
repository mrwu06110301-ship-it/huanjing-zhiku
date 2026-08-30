<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { getFAQs, createFAQ, deleteFAQ, updateFAQ, reportFAQView, likeFAQ, getFAQComments, createFAQComment, deleteFAQComment, type FAQCommentOut } from "@/api/faq";
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
/** 手风琴模式当前展开项（同时只开一个） */
const activeNames = ref<string | number | undefined>(undefined);
/** 是否具备新增权限（管理员或被授权上传权限的账号，与论坛/视频一致） */
const canUpload = ref(false);
/** 分页状态 */
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const filtered = computed(() => {
  // 搜索已改后端 keyword 全量查询，此处直接返回列表
  return faqs.value;
});

async function loadFAQs() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: page.value, page_size: pageSize.value };
    if (activeCategory.value) params.category_id = activeCategory.value;
    if (searchQuery.value.trim()) params.keyword = searchQuery.value.trim();
    const res = await getFAQs(params as any);
    faqs.value = res.data.items || [];
    total.value = res.data.total || 0;
    // 当前页超出总页数（如删除/筛选后）回退到最后一页
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
    if (page.value > maxPage) {
      page.value = maxPage;
      loading.value = false;
      return loadFAQs();
    }
  } finally {
    loading.value = false;
  }
}

function handlePageChange(p: number) {
  page.value = p;
  loadFAQs();
  // 翻页后回到列表顶部
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 搜索输入防抖：后端全量模糊搜索（问题/答案），搜索时回到第 1 页 */
let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadFAQs();
  }, 400);
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
  page.value = 1;
  loadFAQs();
}

/** 分类徽标颜色：按分类管理里配置的 color（淡底+同色文字），未配置回退默认 */
const catColorStyle = (name: string) => {
  const cat = categories.value.find((c) => c.name === name);
  if (!cat?.color) return undefined;
  return { color: cat.color, background: hexToRgba(cat.color, 0.1) };
};

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

// ==================== 编辑 FAQ（管理员） ====================
const editVisible = ref(false);
const editSubmitting = ref(false);
const editingId = ref<number | null>(null);
const editForm = ref({
  question: "",
  answer: "",
  category_id: null as number | null,
});

function openEdit(f: FAQOut) {
  editingId.value = f.id;
  editForm.value = {
    question: f.question,
    answer: f.answer || "",
    category_id: f.category_id ?? null,
  };
  editVisible.value = true;
}

async function submitEdit() {
  if (!editingId.value) return;
  if (!editForm.value.question.trim()) {
    ElMessage.warning("请填写问题描述");
    return;
  }
  editSubmitting.value = true;
  try {
    await updateFAQ(editingId.value, {
      question: editForm.value.question.trim(),
      answer: editForm.value.answer.trim(),
      category_id: editForm.value.category_id,
    });
    ElMessage.success("已保存");
    editVisible.value = false;
    loadFAQs();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "保存失败");
  } finally {
    editSubmitting.value = false;
  }
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

// ==================== 预览计数 / 点赞 / 评论 ====================
/** 手风琴切换：展开时上报一次预览计数；收起时清空评论区 */
function handleCollapseChange(name: string | number | undefined) {
  if (name === undefined || name === null || name === "") {
    activeComments.value = null;
    return;
  }
  const faq = faqs.value.find((f) => f.id === name);
  if (faq) {
    faq.view_count += 1;
    reportFAQView(faq.id).catch(() => { /* 静默失败 */ });
  }
  activeComments.value = null;
  loadComments(name as number);
}

/** 点赞/取消点赞（未登录引导去登录） */
async function toggleLike(f: FAQOut) {
  if (!auth.isLoggedIn()) { ElMessage.warning("请先登录后点赞"); return; }
  try {
    const res = await likeFAQ(f.id);
    f.like_count = res.data.like_count;
    f.liked = res.data.liked;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "操作失败");
  }
}

/** 当前展开条目的评论区状态 */
const activeComments = ref<number | null>(null);
const commentList = ref<FAQCommentOut[]>([]);
const commentsLoading = ref(false);
const commentText = ref("");
const commentSubmitting = ref(false);
/** 展开评论区（再次点击收起） */
function toggleCommentBox(f: FAQOut) {
  if (activeComments.value === f.id) { activeComments.value = null; return; }
  activeComments.value = f.id;
  loadComments(f.id);
}

async function loadComments(faqId: number) {
  commentsLoading.value = true;
  try {
    const res = await getFAQComments(faqId);
    commentList.value = res.data.items || [];
  } catch { commentList.value = []; }
  finally { commentsLoading.value = false; }
}

async function submitComment(f: FAQOut) {
  const content = commentText.value.trim();
  if (!content) { ElMessage.warning("请输入评论内容"); return; }
  commentSubmitting.value = true;
  try {
    await createFAQComment(f.id, content);
    commentText.value = "";
    f.comment_count += 1;
    loadComments(f.id);
    ElMessage.success("评论已发表");
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "评论失败");
  } finally {
    commentSubmitting.value = false;
  }
}

async function removeComment(f: FAQOut, c: FAQCommentOut) {
  try {
    await deleteFAQComment(f.id, c.id);
    f.comment_count = Math.max(0, f.comment_count - 1);
    loadComments(f.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || "删除失败");
  }
}

function canDeleteComment(c: FAQCommentOut) {
  return auth.isAdmin() || (auth.user && c.author_id === auth.user.id);
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
        <input v-model="searchQuery" placeholder="搜索问题..." class="local-search" @input="onSearchInput" />
      </div>
    </div>

    <div v-loading="loading" class="faq-list">
      <el-collapse v-model="activeNames" accordion @change="handleCollapseChange">
        <el-collapse-item v-for="f in filtered" :key="f.id" :name="f.id">
          <template #title>
            <span class="faq-title-line">
              <span class="faq-q-badge">Q</span>
              <span class="faq-question">{{ f.question }}</span>
              <span
                v-if="f.category_name"
                class="faq-cat-badge"
                :style="catColorStyle(f.category_name)"
              >{{ f.category_name }}</span>
              <span class="faq-count-badge" title="预览次数"><Icon name="eye" :size="12" /> {{ f.view_count }}</span>
              <span class="faq-count-badge" title="评论数"><Icon name="message" :size="12" /> {{ f.comment_count || 0 }}</span>
              <span v-if="auth.isAdmin()" class="faq-edit" @click.stop="openEdit(f)">编辑</span>
            </span>
          </template>
          <div class="faq-qa-row">
            <span class="faq-a-badge">A</span>
            <div class="faq-answer">{{ f.answer || "暂无解答，欢迎有经验的同行补充。" }}</div>
          </div>
          <div class="faq-meta">
            <span><Icon name="user" :size="12" /> {{ f.author_name }}</span>
            <span><Icon name="clock" :size="12" /> {{ f.created_at?.substring(0, 10) }}</span>
            <span><Icon name="eye" :size="12" /> {{ f.view_count }}</span>
            <span
              :class="['faq-like', { liked: f.liked }]"
              @click.stop="toggleLike(f)"
            ><Icon name="like" :size="12" /> {{ f.like_count || 0 }}</span>
            <span class="faq-comment-btn" @click.stop="toggleCommentBox(f)">
              <Icon name="message" :size="12" /> {{ f.comment_count || 0 }} 条评论
            </span>
            <span
              v-if="auth.user?.id === (f as any).author_id || auth.isAdmin()"
              class="faq-delete"
              @click.stop="handleDelete(f.id)"
            >删除</span>
          </div>
          <!-- 评论区 -->
          <div v-if="activeComments === f.id" class="faq-comments">
            <div v-if="auth.isLoggedIn()" class="faq-comment-form">
              <el-input
                v-model="commentText" type="textarea" :rows="2"
                placeholder="发表你的评论..." maxlength="300" show-word-limit
              />
              <el-button type="primary" size="small" :loading="commentSubmitting" @click="submitComment(f)">发表评论</el-button>
            </div>
            <div v-else class="faq-comment-login"><router-link to="/login">登录</router-link> 后可以发表评论</div>
            <div v-if="commentsLoading" class="faq-comment-loading">加载评论...</div>
            <div v-else-if="commentList.length === 0" class="faq-comment-empty">暂无评论</div>
            <div v-else class="faq-comment-list">
              <div v-for="c in commentList" :key="c.id" class="faq-comment-item">
                <div class="faq-comment-head">
                  <strong>{{ c.author_name }}</strong>
                  <span class="faq-comment-date">{{ c.created_at?.substring(0, 16).replace("T", " ") }}</span>
                  <button v-if="canDeleteComment(c)" class="faq-comment-del" @click="removeComment(f, c)">删除</button>
                </div>
                <div class="faq-comment-content">{{ c.content }}</div>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!loading && filtered.length === 0" description="暂无问题" />
      <div v-if="total > pageSize" class="faq-pagination">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper, total"
          background
          @current-change="handlePageChange"
        />
      </div>
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
        <el-form-item label="详情或解决办法">
          <el-input
            v-model="faqForm.answer"
            type="textarea" :rows="5" maxlength="5000" show-word-limit
            placeholder="填写问题的详情说明、处理办法、排查步骤或经验总结"
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

    <!-- 编辑 FAQ 对话框（管理员） -->
    <el-dialog v-model="editVisible" title="编辑问题" width="560px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="问题描述 *">
          <el-input
            v-model="editForm.question"
            type="textarea" :rows="2" maxlength="500" show-word-limit
          />
        </el-form-item>
        <el-form-item label="详情或解决办法">
          <el-input
            v-model="editForm.answer"
            type="textarea" :rows="5" maxlength="5000" show-word-limit
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category_id" clearable placeholder="请选择分类" style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEdit">保存</el-button>
      </template>
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

/* Element Plus 折叠标题默认 height/line-height 48px，问题换行后行距巨大，放开为自适应 */
.faq-list :deep(.el-collapse-item__header) {
  height: auto; min-height: 48px; line-height: 1.6; padding: 8px 0;
}

.faq-q-badge, .faq-a-badge {
  width: 22px; height: 22px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px; font-size: 12.5px; font-weight: 800; line-height: 1;
}
.faq-q-badge { background: var(--gradient-primary); color: #fff; box-shadow: 0 2px 6px var(--primary-glow); }
.faq-a-badge { background: rgba(6, 182, 212, 0.14); color: #0891b2; margin-top: 3px; }

/* 标题行：Q 徽标 + 问题 + 分类徽标 + 编辑，同行内联 */
.faq-title-line {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; flex: 1; padding-right: 8px;
}
.faq-question {
  font-size: 16px; font-weight: 600; color: var(--text);
  line-height: 1.5;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.faq-cat-badge {
  font-size: 11px; font-weight: 500; line-height: 1;
  border-radius: 8px; padding: 3px 8px; flex-shrink: 0;
  color: var(--primary); background: rgba(37, 99, 235, 0.08);
}
.faq-edit {
  margin-left: auto; flex-shrink: 0;
  font-size: 12px; color: var(--primary); cursor: pointer;
  opacity: 0.75; transition: all 0.2s;
}
.faq-edit:hover { opacity: 1; }

/* 问答行：A 徽标 + 答案，浅底色块突出"答"的区域 */
.faq-qa-row {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-soft); border-radius: 10px;
  padding: 12px 14px; margin: 4px 0 2px;
}
.faq-answer {
  flex: 1; min-width: 0;
  line-height: 1.9; color: var(--text-light); font-size: 15px;
  white-space: pre-wrap;
}

.faq-meta {
  display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; font-size: 12px; color: var(--text-muted);
}
.faq-meta span {
  display: flex; align-items: center; gap: 4px; white-space: nowrap;
}
.faq-delete { margin-left: auto; cursor: pointer; transition: color 0.2s; }
.faq-delete:hover { color: #ef4444; }

/* 标题行计数徽标 */
.faq-count-badge {
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
  font-size: 11px; color: var(--text-muted);
  border-radius: 8px; padding: 2px 7px;
}
.faq-like { cursor: pointer; transition: color 0.2s; }
.faq-like:hover { color: #ef4444; }
.faq-like.liked { color: #ef4444; font-weight: 600; }
.faq-comment-btn { cursor: pointer; transition: color 0.2s; }
.faq-comment-btn:hover { color: var(--primary); }

/* FAQ 评论区 */
.faq-comments {
  margin-top: 12px; padding: 12px 14px;
  background: var(--bg-soft); border-radius: 10px;
}
.faq-comment-form { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.faq-comment-form .el-textarea { width: 100%; }
.faq-comment-login { text-align: center; font-size: 13px; color: var(--text-muted); padding: 6px 0; }
.faq-comment-login a { color: var(--primary); font-weight: 600; }
.faq-comment-loading, .faq-comment-empty { text-align: center; font-size: 13px; color: var(--text-muted); padding: 10px 0; }
.faq-comment-list { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.faq-comment-item { padding: 8px 0; border-bottom: 1px dashed var(--border); }
.faq-comment-item:last-child { border-bottom: none; }
.faq-comment-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 4px; }
.faq-comment-date { color: var(--text-muted); font-size: 11.5px; }
.faq-comment-del {
  margin-left: auto; background: none; border: none; color: #ef4444;
  cursor: pointer; font-size: 11.5px; opacity: 0.7;
}
.faq-comment-del:hover { opacity: 1; }
.faq-comment-content { font-size: 13.5px; color: var(--text-light); line-height: 1.7; }

/* 分页 */
.faq-pagination {
  display: flex; justify-content: center; padding: 20px 0 4px;
}

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
  .faq-list { padding: 4px 14px 20px; }
  /* 手机端问题标题允许多行（clamp 2 行），行距收紧避免松散 */
  .faq-question {
    font-size: 14.5px; white-space: normal; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .faq-title-line { gap: 8px; align-items: flex-start; }
  .faq-q-badge { margin-top: 1px; }
  .faq-list :deep(.el-collapse-item__header) { padding: 10px 0; }
  .faq-edit { display: none; }
  .faq-count-badge { display: none; }
  .faq-meta { gap: 6px 14px; margin-top: 10px; }
}
</style>
