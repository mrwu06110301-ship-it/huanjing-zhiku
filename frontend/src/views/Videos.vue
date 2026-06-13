<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getVideos } from "@/api/video";
import { getCategories } from "@/api/category";
import type { VideoOut, CategoryOut } from "@/types";

const router = useRouter();
const videos = ref<VideoOut[]>([]);
const categories = ref<CategoryOut[]>([]);
const activeType = ref("");
const loading = ref(false);

const typeTabs = [
  { label: "全部", value: "" },
  { label: "知识科普", value: "popularization" },
  { label: "实操演示", value: "demo" },
  { label: "技术探讨", value: "discussion" },
];

async function loadVideos() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 20 };
    if (activeType.value) {
      params.video_type = activeType.value;
    }
    const res = await getVideos(params as any);
    videos.value = res.data.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const catRes = await getCategories("video");
  categories.value = catRes.data;
  loadVideos();
});

function switchType(type: string) {
  activeType.value = type;
  loadVideos();
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>🎬 学习视频</h1>
      <p>知识科普、实操演示、技术探讨</p>
    </div>

    <div class="category-tabs">
      <span
        v-for="tab in typeTabs"
        :key="tab.value"
        :class="['tab', { active: activeType === tab.value }]"
        @click="switchType(tab.value)"
      >{{ tab.label }}</span>
    </div>

    <div v-loading="loading" class="video-grid">
      <div
        v-for="v in videos"
        :key="v.id"
        class="video-card"
        @click="router.push(`/article/${v.id}`)"
      >
        <div class="video-cover">
          <span class="play-icon">▶</span>
          <span v-if="v.duration" class="duration">{{ v.duration }}</span>
        </div>
        <div class="video-info">
          <h3>{{ v.title }}</h3>
          <p>{{ v.description }}</p>
          <div class="video-meta">
            <span>{{ v.author_name }}</span>
            <span>👁 {{ v.view_count }}</span>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && videos.length === 0" description="暂无视频" />
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; }
.page-header { text-align: center; padding: 40px 0 24px; }
.page-header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.page-header p { color: var(--text-light); font-size: 15px; }

.category-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
.tab { padding: 8px 20px; border-radius: 20px; cursor: pointer; font-size: 14px; background: var(--white); border: 1px solid var(--border); transition: all 0.2s; }
.tab:hover { border-color: var(--primary); color: var(--primary); }
.tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
.video-card { background: var(--white); border-radius: var(--radius); overflow: hidden; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow); }
.video-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.12); }
.video-cover { height: 180px; background: linear-gradient(135deg, #0a1628, #0d2847); display: flex; align-items: center; justify-content: center; position: relative; }
.play-icon { font-size: 48px; color: rgba(255,255,255,0.8); }
.duration { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.video-info { padding: 16px; }
.video-info h3 { font-size: 15px; margin-bottom: 6px; line-height: 1.4; }
.video-info p { font-size: 13px; color: var(--text-light); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.video-meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: var(--text-light); }
</style>
