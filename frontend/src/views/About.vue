<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { getAbout, updateAbout, type AboutOut } from "@/api/about";
import { ElMessage } from "element-plus";
import RichEditor from "@/components/RichEditor.vue";

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
    <div class="about-header">
      <h1 class="about-title">👨‍💻 关于作者</h1>
      <p class="about-subtitle">了解创作者，共建知识生态</p>
    </div>

    <!-- 编辑模式 -->
    <div v-if="isEditing" class="about-card editing">
      <h3 class="section-label">📝 编辑作者介绍</h3>
      <RichEditor v-model="editContent" />

      <h3 class="section-label">🤖 自动回复设置</h3>
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
        <div class="author-content" v-html="about?.content || '<p style=color:#999;text-align:center>暂无内容，管理员可点击下方编辑</p>'"></div>

        <div v-if="auth.isAdmin()" class="edit-entry">
          <el-button type="primary" plain @click="startEdit">✏️ 编辑内容</el-button>
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

.about-header {
  text-align: center;
  margin-bottom: 32px;
}

.about-title {
  font-size: 28px;
  font-weight: 800;
  color: #1a1a1a;
  margin-bottom: 8px;
}

.about-subtitle {
  color: #888;
  font-size: 15px;
}

.about-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06);
}

.about-card.editing {
  padding: 24px;
}

.section-label {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 20px 0 12px;
}

.section-desc {
  font-size: 13px;
  color: #999;
  margin: -8px 0 10px;
}

.auto-reply-input {
  margin-bottom: 8px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.loading-state {
  text-align: center;
  color: #999;
  padding: 60px 0;
}

.author-content {
  line-height: 2;
  font-size: 16px;
  color: #333;
}

.author-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 16px auto;
  display: block;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.author-content :deep(h1),
.author-content :deep(h2),
.author-content :deep(h3) {
  margin-top: 28px;
  margin-bottom: 12px;
  color: #1a1a1a;
}

.author-content :deep(p) {
  margin-bottom: 12px;
}

.author-content :deep(blockquote) {
  border-left: 4px solid #00ccaa;
  padding: 12px 16px;
  background: #f0faf6;
  border-radius: 0 8px 8px 0;
  margin: 16px 0;
  color: #555;
}

.edit-entry {
  text-align: center;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
}
</style>
