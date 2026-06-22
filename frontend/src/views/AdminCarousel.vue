<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getAdminCarousel, createCarousel, updateCarousel, deleteCarousel, type CarouselSlide } from "@/api/carousel";
import { uploadImage } from "@/api/upload";
import { getVideos, type VideoOut } from "@/api/video";
import { ElMessage } from "element-plus";

const slides = ref<CarouselSlide[]>([]);
const videos = ref<VideoOut[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editing = ref<CarouselSlide | null>(null);

const form = ref({
  image_url: "",
  title: "",
  link_video_id: null as number | null,
  sort_order: 0,
  is_active: true,
});

onMounted(async () => {
  await Promise.all([loadSlides(), loadVideos()]);
});

async function loadSlides() {
  loading.value = true;
  try {
    const res = await getAdminCarousel();
    slides.value = res.data;
  } catch { ElMessage.error("加载失败"); }
  finally { loading.value = false; }
}

async function loadVideos() {
  try {
    const res = await getVideos({ page: 1, page_size: 50 });
    videos.value = res.data.items || [];
  } catch { /* ignore */ }
}

function openCreate() {
  editing.value = null;
  form.value = { image_url: "", title: "", link_video_id: null, sort_order: 0, is_active: true };
  showForm.value = true;
}

function openEdit(s: CarouselSlide) {
  editing.value = s;
  form.value = {
    image_url: s.image_url, title: s.title,
    link_video_id: s.link_video_id, sort_order: s.sort_order, is_active: s.is_active,
  };
  showForm.value = true;
}

async function handleImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const res = await uploadImage(input.files[0]);
    form.value.image_url = res.data.url;
    ElMessage.success("图片上传成功");
  } catch { ElMessage.error("上传失败"); }
}

async function save() {
  if (!form.value.image_url) { ElMessage.warning("请上传轮播图片"); return; }
  try {
    if (editing.value) {
      await updateCarousel(editing.value.id, { ...form.value });
      ElMessage.success("已更新");
    } else {
      await createCarousel({ ...form.value });
      ElMessage.success("已创建");
    }
    showForm.value = false;
    loadSlides();
  } catch { ElMessage.error("保存失败"); }
}

async function handleDelete(id: number) {
  try {
    await deleteCarousel(id);
    ElMessage.success("已删除");
    loadSlides();
  } catch { ElMessage.error("删除失败"); }
}

function getVideoTitle(id: number | null) {
  if (!id) return "";
  const v = videos.value.find(v => v.id === id);
  return v ? v.title : "(视频已删除)";
}
</script>

<template>
  <div class="admin-carousel-page">
    <div class="page-header">
      <h1>🎠 轮播图管理</h1>
      <p>管理视频主页顶部轮播图，支持图片上传、视频关联</p>
      <el-button type="primary" @click="openCreate" style="margin-top:12px">＋ 添加轮播图</el-button>
    </div>

    <!-- 添加/编辑表单 -->
    <el-dialog v-model="showForm" :title="editing ? '编辑轮播图' : '添加轮播图'" width="500px">
      <el-form label-position="top">
        <el-form-item label="轮播图片" required>
          <div class="img-upload">
            <div v-if="form.image_url" class="img-preview">
              <img :src="form.image_url" alt="轮播图" />
            </div>
            <label class="upload-btn">
              📁 {{ form.image_url ? '更换图片' : '上传图片' }}
              <input type="file" accept="image/*" hidden @change="handleImageUpload" />
            </label>
          </div>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="轮播图标题（选填）" />
        </el-form-item>
        <el-form-item label="关联视频">
          <el-select v-model="form.link_video_id" placeholder="选择关联视频" clearable filterable style="width:100%">
            <el-option v-for="v in videos" :key="v.id" :label="v.title" :value="v.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="排序（数字越小越靠前）">
              <el-input-number v-model="form.sort_order" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用">
              <el-switch v-model="form.is_active" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 列表 -->
    <div v-loading="loading" class="slide-list">
      <div v-for="s in slides" :key="s.id" class="slide-card">
        <div class="slide-img">
          <img :src="s.image_url" :alt="s.title" />
          <span v-if="!s.is_active" class="slide-inactive">已禁用</span>
        </div>
        <div class="slide-info">
          <h4>{{ s.title || '(无标题)' }}</h4>
          <p v-if="s.link_video_id" class="slide-link">→ {{ getVideoTitle(s.link_video_id) }}</p>
          <p v-else class="slide-link none">未关联视频</p>
          <span class="slide-order">排序: {{ s.sort_order }}</span>
        </div>
        <div class="slide-actions">
          <el-button size="small" @click="openEdit(s)">✏️ 编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(s.id)">🗑️ 删除</el-button>
        </div>
      </div>
      <el-empty v-if="!loading && slides.length === 0" description="暂无轮播图" />
    </div>
  </div>
</template>

<style scoped>
.admin-carousel-page { max-width: 900px; margin: 0 auto; padding: 24px 0; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.page-header p { color: #888; font-size: 14px; }

.img-upload { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.img-preview { width: 240px; height: 135px; border-radius: 8px; overflow: hidden; border: 1px solid #eee; }
.img-preview img { width: 100%; height: 100%; object-fit: cover; }
.upload-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 8px 16px; border: 1px solid #dcdfe6; border-radius: 8px;
  cursor: pointer; font-size: 14px; color: #666; transition: all 0.2s;
}
.upload-btn:hover { border-color: #00ccaa; color: #00ccaa; }

.slide-list { display: flex; flex-direction: column; gap: 12px; }
.slide-card {
  display: flex; gap: 16px; align-items: center;
  background: #fff; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}
.slide-img {
  position: relative; width: 200px; height: 112px;
  border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #f0f0f0;
}
.slide-img img { width: 100%; height: 100%; object-fit: cover; }
.slide-inactive {
  position: absolute; top: 4px; right: 4px;
  background: rgba(0,0,0,0.6); color: #fff; padding: 2px 8px;
  border-radius: 4px; font-size: 11px;
}
.slide-info { flex: 1; min-width: 0; }
.slide-info h4 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.slide-link { font-size: 13px; color: #00aa88; }
.slide-link.none { color: #bbb; }
.slide-order { font-size: 12px; color: #999; }
.slide-actions { display: flex; gap: 8px; flex-shrink: 0; }
</style>
