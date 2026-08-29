<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getAbout, updateAbout, type AboutOut } from "@/api/about";
import { ElMessage } from "element-plus";
import RichEditor from "@/components/RichEditor.vue";
import Icon from "@/components/Icon.vue";

const auth = useAuthStore();
const about = ref<AboutOut | null>(null);
const isEditing = ref(false);
const editContent = ref("");
const editAutoReply = ref("");
const loading = ref(false);
const saving = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const res = await getAbout();
    about.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

function startEdit() {
  if (!about.value) return;
  editContent.value = about.value.content || "";
  editAutoReply.value = about.value.auto_reply_text || "";
  isEditing.value = true;
}

async function saveAbout() {
  saving.value = true;
  try {
    const res = await updateAbout({
      content: editContent.value,
      images: "[]",
      auto_reply_text: editAutoReply.value,
    });
    about.value = res.data;
    isEditing.value = false;
    ElMessage.success("保存成功");
  } catch {
    ElMessage.error("保存失败");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="about-page">
    <!-- 页面标题 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="about" :size="28" />
          </div>
          <h1>关于作者</h1>
        </div>
        <p class="page-header-sub">了解创作者，共建知识生态</p>
      </div>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing" class="about-card editing">
      <h3 class="section-label"><Icon name="edit" :size="17" /> 编辑作者介绍</h3>
      <RichEditor v-model="editContent" />

      <h3 class="section-label"><Icon name="robot" :size="17" /> 自动回复设置</h3>
      <p class="section-desc">用户首次留言时，系统自动回复的内容</p>
      <el-input
        v-model="editAutoReply"
        placeholder="输入自动回复内容..."
        class="auto-reply-input"
      />

      <div class="edit-actions">
        <el-button @click="isEditing = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAbout">保存</el-button>
      </div>
    </div>

    <!-- 展示模式 -->
    <div v-else class="about-card">
      <div v-if="loading" class="loading-state">加载中...</div>
      <template v-else>
        <div class="author-content" v-html="about?.content || '<p style=color:var(--text-muted);text-align:center>暂无内容，管理员可点击下方编辑</p>'"></div>

        <div v-if="auth.isAdmin()" class="edit-entry">
          <el-button type="primary" plain @click="startEdit">
            <Icon name="edit" :size="15" style="margin-right:6px" /> 编辑内容
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.about-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  padding: 48px 0 32px;
}

.about-card {
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 48px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border-light);
}

.about-card.editing {
  padding: 32px;
}

.section-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 24px 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-label:first-child {
  margin-top: 0;
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: -8px 0 12px;
}

.auto-reply-input {
  margin-bottom: 8px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.loading-state {
  text-align: center;
  color: var(--text-muted);
  padding: 60px 0;
}

.author-content {
  line-height: 2;
  font-size: 16px;
  color: var(--text);
}

.author-content :deep(img) {
  max-width: 100%;
  border-radius: 10px;
  margin: 16px auto;
  display: block;
  box-shadow: var(--shadow-md);
}

.author-content :deep(h1),
.author-content :deep(h2),
.author-content :deep(h3) {
  margin-top: 32px;
  margin-bottom: 14px;
  color: var(--text);
}

.author-content :deep(p) {
  margin-bottom: 14px;
}

.author-content :deep(blockquote) {
  border-left: 4px solid var(--accent);
  padding: 14px 18px;
  background: var(--accent-light);
  border-radius: 0 10px 10px 0;
  margin: 18px 0;
  color: var(--text-light);
}

.edit-entry {
  text-align: center;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border-light);
}

@media (max-width: 768px) {
  .about-card { padding: 28px 20px; }
  .about-card.editing { padding: 20px 16px; }
  .page-header { padding: 28px 0 20px; }
}
</style>
