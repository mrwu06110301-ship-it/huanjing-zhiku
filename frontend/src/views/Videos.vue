<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getVideos, getRecommendedVideos, checkUploadPermission, type VideoOut } from "@/api/video";
import { getCarousel, type CarouselSlide } from "@/api/carousel";
import { getCategories } from "@/api/category";
import type { CategoryOut } from "@/types";
import Icon from "@/components/Icon.vue";

const router = useRouter();
const auth = useAuthStore();
const featured = ref<CarouselSlide[]>([]);
const recommended = ref<VideoOut[]>([]);
const allVideos = ref<VideoOut[]>([]);
const loading = ref(false);
const canUpload = ref(false);
const currentSlide = ref(0);
const searchQuery = ref("");
const videoCategories = ref<CategoryOut[]>([]);
const selectedCategoryId = ref<number | null>(null);
let slideTimer: ReturnType<typeof setInterval> | null = null;

const filteredVideos = computed(() => {
  let list = allVideos.value;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(v =>
      v.title.toLowerCase().includes(q) || (v.description || "").toLowerCase().includes(q)
    );
  }
  if (selectedCategoryId.value) {
    list = list.filter(v => v.category_id === selectedCategoryId.value);
  }
  return list;
});

onMounted(async () => {
  await Promise.all([loadCarousel(), loadRecommended(), loadAll(), loadCategories()]);
  if (auth.isLoggedIn()) {
    try {
      const res = await checkUploadPermission();
      canUpload.value = res.data.can_upload;
    } catch { /* ignore */ }
  }
  startSlide();
});

onUnmounted(() => { if (slideTimer) clearInterval(slideTimer); });

async function loadCarousel() {
  try {
    const res = await getCarousel();
    featured.value = res.data;
  } catch { /* ignore */ }
}
async function loadRecommended() {
  try {
    const res = await getRecommendedVideos();
    recommended.value = res.data;
  } catch { /* ignore */ }
}
async function loadAll() {
  loading.value = true;
  try {
    const res = await getVideos({ page: 1, page_size: 50 });
    allVideos.value = res.data.items || [];
  } finally { loading.value = false; }
}
async function loadCategories() {
  try {
    const res = await getCategories("video");
    videoCategories.value = res.data || [];
  } catch { /* ignore */ }
}

function nextSlide() {
  if (featured.value.length > 0)
    currentSlide.value = (currentSlide.value + 1) % featured.value.length;
}
function prevSlide() {
  if (featured.value.length > 0)
    currentSlide.value = (currentSlide.value - 1 + featured.value.length) % featured.value.length;
}
function goToSlide(i: number) { currentSlide.value = i; }
function startSlide() { slideTimer = setInterval(nextSlide, 4000); }
function pauseSlide() { if (slideTimer) clearInterval(slideTimer); }
function resumeSlide() { startSlide(); }
function goVideo(id: number) { router.push(`/videos/${id}`); }
function goSlide(s: CarouselSlide) {
  if (s.link_video_id) router.push(`/videos/${s.link_video_id}`);
}
function goUpload() { router.push("/video/upload"); }
function selectCategory(id: number | null) {
  selectedCategoryId.value = selectedCategoryId.value === id ? null : id;
}
function typeLabel(t: string) {
  const map: Record<string, string> = { popularization: "科普", demo: "实操", discussion: "探讨" };
  return map[t] || t;
}
function tagColor(v: any) {
  if (v.category_color) return v.category_color;
  const colorMap: Record<string, string> = { popularization: "#00b8d9", demo: "#ff6b00", discussion: "#5b7cfa" };
  return colorMap[v.video_type] || "#00b8d9";
}
</script>

<template>
  <div class="videos-page">
    <!-- 页面标题 -->
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="video" :size="26" />
          </div>
          <h1>视频中心</h1>
        </div>
        <p class="page-header-sub">科普知识、实操演示与技术探讨</p>
      </div>
      <div class="header-actions">
        <div class="search-wrap">
          <Icon name="search" :size="15" class="search-ic" />
          <input v-model="searchQuery" placeholder="搜索视频..." class="search-input" />
        </div>
        <button v-if="canUpload" class="btn-upload" @click="goUpload">
          <Icon name="upload" :size="15" />
          <span>上传视频</span>
        </button>
      </div>
    </div>

    <!-- 主区域：左轮播 + 右推荐 -->
    <div class="top-row">
      <!-- 左：轮播 -->
      <div v-if="featured.length > 0" class="carousel-section" @mouseenter="pauseSlide" @mouseleave="resumeSlide">
        <div class="carousel-wrap">
          <div class="carousel-inner" :style="{ transform: `translateX(-${currentSlide * 100}%)` }">
            <div v-for="v in featured" :key="v.id" class="carousel-slide" @click="goSlide(v)">
              <div class="slide-bg" :style="{ backgroundImage: `url(${v.image_url || ''})` }"></div>
              <div class="slide-overlay"></div>
              <div class="slide-info">
                <h2 class="slide-title">{{ v.title }}</h2>
              </div>
            </div>
          </div>
          <button class="car-btn prev" @click.stop="prevSlide"><Icon name="chevronLeft" :size="22" /></button>
          <button class="car-btn next" @click.stop="nextSlide"><Icon name="chevronRight" :size="22" /></button>
          <div class="car-dots">
            <span v-for="(_, i) in featured" :key="i" :class="['dot', { active: i === currentSlide }]" @click="goToSlide(i)"></span>
          </div>
        </div>
      </div>

      <!-- 右：推荐视频 -->
      <div v-if="recommended.length > 0" class="recommend-section">
        <h3 class="section-title"><Icon name="flame" :size="17" /> 推荐视频</h3>
        <div class="recommend-list">
          <div v-for="(v, i) in recommended.slice(0, 5)" :key="v.id" class="recommend-item" @click="goVideo(v.id)">
            <span class="rec-rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <div class="rec-cover">
              <img :src="v.cover_image || '/placeholder.jpg'" :alt="v.title" />
            </div>
            <div class="rec-info">
              <span class="rec-title">{{ v.title }}</span>
              <span class="rec-views">{{ v.view_count || 0 }}次播放</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 全部视频 -->
    <div class="all-section">
      <div class="all-header">
        <h3 class="section-title"><Icon name="grid" :size="17" /> 全部视频 ({{ filteredVideos.length }})</h3>
        <div v-if="videoCategories.length > 0" class="cat-pills category-filter">
          <span
            :class="['cat-pill', { active: selectedCategoryId === null }]"
            @click="selectCategory(null)"
          >全部</span>
          <span
            v-for="cat in videoCategories"
            :key="cat.id"
            :class="['cat-pill', { active: selectedCategoryId === cat.id }]"
            :style="{ '--cat-color': cat.color || '#2563eb' }"
            @click="selectCategory(cat.id)"
          >
            <span v-if="cat.color" class="cat-dot" :style="{ backgroundColor: cat.color }"></span>
            {{ cat.name }}
          </span>
        </div>
      </div>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="filteredVideos.length === 0" class="empty">暂无视频</div>
      <div v-else class="video-grid">
        <div v-for="v in filteredVideos" :key="v.id" class="video-card" @click="goVideo(v.id)">
          <div class="card-cover">
            <img :src="v.cover_image || '/placeholder.jpg'" :alt="v.title" />
            <span v-if="v.duration" class="card-duration">{{ v.duration }}</span>
            <span v-if="v.category_name || v.video_type" class="card-tag" :style="{ background: tagColor(v) }">{{ v.category_name || typeLabel(v.video_type) }}</span>
          </div>
          <div class="card-info">
            <h4 class="card-title">{{ v.title }}</h4>
            <div class="card-meta">
              <span class="meta-author">
                <img v-if="v.author_avatar" :src="v.author_avatar" alt="" class="meta-avatar" />
                <Icon v-else name="user" :size="12" />
                <span class="meta-name">{{ v.author_name || '未知' }}</span>
              </span>
              <span class="meta-dot">·</span>
              <span class="meta-views"><Icon name="eye" :size="12" /> {{ v.view_count || 0 }}次播放</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.videos-page { max-width: 1200px; margin: 0 auto; }

/* 页面标题 */
.page-header { padding: 40px 0 24px; }
.header-actions { display: flex; align-items: center; gap: 12px; }

/* 搜索 */
.search-wrap {
  position: relative; display: flex; align-items: center;
}
.search-ic { position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; }
.search-input {
  padding: 8px 14px 8px 36px; border: 1px solid var(--border); border-radius: 20px;
  font-size: 13px; outline: none; width: 180px; transition: all 0.25s var(--ease); background: var(--white);
}
.search-input:focus { border-color: var(--primary); width: 220px; box-shadow: 0 0 0 3px var(--primary-glow); }

/* 上传按钮 */
.btn-upload {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 20px; background: var(--gradient-primary);
  color: #fff; border: none; border-radius: 10px; cursor: pointer;
  font-size: 14px; font-weight: 600; transition: all 0.25s var(--ease);
  box-shadow: 0 2px 12px var(--primary-glow);
}
.btn-upload:hover { transform: translateY(-1px); box-shadow: 0 4px 20px var(--primary-glow); }

/* 顶部行 */
.top-row {
  display: flex; gap: 20px; margin-bottom: 32px;
  height: 460px;
}

/* 左轮播 */
.carousel-section { flex: 2; min-width: 0; height: 100%; display: flex; }
.carousel-wrap {
  position: relative; overflow: hidden; border-radius: var(--radius-lg);
  flex: 1; height: 100%;
}
.carousel-inner { display: flex; transition: transform 0.5s var(--ease); height: 100%; }
.carousel-slide { min-width: 100%; height: 100%; position: relative; cursor: pointer; overflow: hidden; }
.slide-bg {
  width: 100%; height: 100%;
  background-size: cover; background-position: center;
  transition: transform 0.4s var(--ease);
}
.carousel-slide:hover .slide-bg { transform: scale(1.05); }
.slide-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(6, 10, 20, 0.9) 0%, rgba(6, 10, 20, 0.3) 50%, transparent 100%);
}
.slide-info {
  position: absolute; bottom: 0; left: 0; right: 0; padding: 24px 28px; color: #fff;
}
.slide-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }

.car-btn {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(6, 10, 20, 0.5); color: #fff; border: 1px solid rgba(255,255,255,0.15);
  backdrop-filter: blur(8px); cursor: pointer; opacity: 0; transition: all 0.25s var(--ease); z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.carousel-wrap:hover .car-btn { opacity: 1; }
.car-btn.prev { left: 12px; }
.car-btn.next { right: 12px; }
.car-btn:hover { background: rgba(6, 10, 20, 0.7); border-color: var(--accent); color: var(--accent); }

.car-dots { position: absolute; bottom: 14px; right: 28px; display: flex; gap: 6px; z-index: 2; }
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.3s var(--ease);
}
.dot.active { background: var(--accent); width: 24px; border-radius: 4px; box-shadow: 0 0 8px rgba(0, 230, 168, 0.4); }

/* 右推荐 */
.recommend-section {
  flex: 1; min-width: 0; height: 100%;
  display: flex; flex-direction: column;
  background: var(--white); border-radius: var(--radius-lg); padding: 20px;
  box-shadow: var(--shadow); border: 1px solid var(--border-light);
}
.section-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }

.recommend-list {
  display: flex; flex-direction: column; gap: 8px;
  flex: 1; overflow-y: auto;
}
.recommend-item {
  display: flex; gap: 12px; align-items: center;
  padding: 8px 10px; border-radius: 10px; cursor: pointer; transition: all 0.2s var(--ease);
}
.recommend-item:hover { background: var(--bg); }

.rec-rank {
  width: 24px; text-align: center; font-weight: 700; font-size: 15px; color: var(--text-muted); flex-shrink: 0;
}
.rec-rank.top { color: #ff6b00; }

.rec-cover {
  width: 110px; height: 68px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: var(--bg);
}
.rec-cover img { width: 100%; height: 100%; object-fit: cover; }

.rec-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rec-title {
  font-size: 13px; font-weight: 600; color: var(--text);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;
}
.rec-views { font-size: 12px; color: var(--text-muted); }

/* 全部视频 */
.all-section { margin-top: 12px; }
.loading, .empty { text-align: center; padding: 48px 0; color: var(--text-muted); font-size: 15px; }

.all-header {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 20px; flex-wrap: wrap;
}
/* cat-pill 统一样式已全局定义于 App.vue */
.category-filter { flex: 1; }

/* 视频网格 */
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}
.video-card {
  cursor: pointer; border-radius: var(--radius-lg); overflow: hidden;
  background: var(--white); box-shadow: var(--shadow); transition: all 0.3s var(--ease);
  border: 1px solid var(--border-light);
}
.video-card:hover {
  transform: translateY(-4px); box-shadow: var(--shadow-lg);
  border-color: rgba(0, 184, 217, 0.2);
}

.card-cover { position: relative; padding-top: 56.25%; overflow: hidden; background: var(--bg); }
.card-cover img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s var(--ease); }
.video-card:hover .card-cover img { transform: scale(1.05); }
.card-duration {
  position: absolute; bottom: 6px; right: 6px;
  background: rgba(6, 10, 20, 0.75); color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 11px;
  backdrop-filter: blur(4px);
}
.card-tag {
  position: absolute; top: 8px; left: 8px;
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #fff;
}
.card-info { padding: 14px 16px; }
.card-title {
  font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  line-height: 1.5;
}
.card-meta { font-size: 12px; color: var(--text-muted); display: flex; gap: 4px; align-items: center; }
.meta-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.meta-author { display: flex; align-items: center; gap: 4px; min-width: 0; } /* min-width:0 允许子元素收缩截断 */
.meta-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; /* 作者名超长省略号 */
}
.card-meta span { display: flex; align-items: center; gap: 2px; }
.meta-dot { color: var(--border); flex-shrink: 0; }
.meta-views { flex-shrink: 0; white-space: nowrap; } /* 播放次数整体不换行不折断 */

@media (max-width: 768px) {
  .page-header { padding: 24px 0 16px; flex-wrap: wrap; }
  .header-actions { flex-wrap: wrap; }
  .top-row { flex-direction: column; height: auto; }
  .carousel-section { height: 240px; }
  .recommend-section { height: auto; }
  .videos-page { padding: 0 12px; }
  .video-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .slide-title { font-size: 18px; }
  .search-input { width: 140px; }
  .search-input:focus { width: 160px; }
}
</style>
