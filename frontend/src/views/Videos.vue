<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { getVideos, getRecommendedVideos, checkUploadPermission, type VideoOut } from "@/api/video";
import { getCarousel, type CarouselSlide } from "@/api/carousel";
import { getCategories } from "@/api/category";
import type { CategoryOut } from "@/types";

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
  const colorMap: Record<string, string> = { popularization: "#00ccaa", demo: "#ff6b00", discussion: "#3498db" };
  return colorMap[v.video_type] || "#00ccaa";
}
</script>

<template>
  <div class="videos-page">
    <!-- 工具栏 -->
    <div class="toolbar">
      <h3 class="page-title">📹 视频中心</h3>
      <div class="toolbar-right">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input v-model="searchQuery" placeholder="搜索视频..." class="search-input" />
        </div>
        <button v-if="canUpload" class="upload-btn" @click="goUpload">＋ 上传视频</button>
      </div>
    </div>

    <!-- 分类筛选 -->
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
          <button class="car-btn prev" @click.stop="prevSlide">‹</button>
          <button class="car-btn next" @click.stop="nextSlide">›</button>
          <div class="car-dots">
            <span v-for="(_, i) in featured" :key="i" :class="['dot', { active: i === currentSlide }]" @click="goToSlide(i)"></span>
          </div>
        </div>
      </div>

      <!-- 右：推荐视频 -->
      <div v-if="recommended.length > 0" class="recommend-section">
        <h3 class="section-title">🔥 推荐视频</h3>
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
        <h3 class="section-title" style="margin:0">📹 全部视频 ({{ filteredVideos.length }})</h3>
        <div v-if="videoCategories.length > 0" class="category-filter">
          <button
            :class="['cat-pill', { active: selectedCategoryId === null }]"
            @click="selectCategory(null)"
          >全部</button>
          <button
            v-for="cat in videoCategories"
            :key="cat.id"
            :class="['cat-pill', { active: selectedCategoryId === cat.id }]"
            :style="{
              '--cat-color': cat.color || '#00ccaa',
              borderColor: selectedCategoryId === cat.id ? (cat.color || '#00ccaa') : '#e0e0e0'
            }"
            @click="selectCategory(cat.id)"
          >
            <span v-if="cat.color" class="cat-dot" :style="{ backgroundColor: cat.color }"></span>
            {{ cat.name }}
          </button>
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
              <span>{{ v.author_name || '未知' }}</span>
              <span class="dot">·</span>
              <span>{{ v.view_count || 0 }}次播放</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.videos-page { max-width: 1200px; margin: 0 auto; }

/* 工具栏 */
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px;
}
.page-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin: 0; }
.toolbar-right {
  display: flex; align-items: center; gap: 10px;
}
.search-box {
  position: relative; display: flex; align-items: center;
}
.search-input {
  padding: 7px 12px 7px 32px;
  border: 1px solid #e0e0e0; border-radius: 18px;
  font-size: 13px; outline: none; width: 180px; transition: all 0.2s;
}
.search-input:focus { border-color: #00ccaa; width: 220px; }
.search-icon { position: absolute; left: 10px; font-size: 13px; pointer-events: none; }

/* 分类筛选 - 在全部视频标题旁 */
.all-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.category-filter {
  display: flex; flex-wrap: wrap; gap: 6px; flex: 1;
}
.cat-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 20px;
  border: 1.5px solid #e0e0e0; background: #fff;
  font-size: 13px; color: #555; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.cat-pill:hover { border-color: #00ccaa; color: #00ccaa; }
.cat-pill.active {
  background: var(--cat-color, #00ccaa);
  color: #fff; border-color: var(--cat-color, #00ccaa);
  font-weight: 600;
}
.cat-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}

.upload-btn {
  padding: 8px 20px; background: linear-gradient(135deg, #00ccaa, #00b894);
  color: #fff; border: none; border-radius: 8px; cursor: pointer;
  font-size: 14px; font-weight: 600; white-space: nowrap;
}
.upload-btn:hover { opacity: 0.9; }

/* 顶部行 — 占两排卡片高度 */
.top-row {
  display: flex; gap: 20px; margin-bottom: 28px;
  height: 480px;
}

/* 左轮播 — 占据大部分空间 */
.carousel-section { flex: 2; min-width: 0; height: 100%; display: flex; }
.carousel-wrap {
  position: relative; overflow: hidden; border-radius: 12px;
  flex: 1; height: 100%;
}
.carousel-inner { display: flex; transition: transform 0.5s ease; height: 100%; }
.carousel-slide { min-width: 100%; height: 100%; position: relative; cursor: pointer; overflow: hidden; }
.slide-bg {
  width: 100%; height: 100%;
  background-size: cover; background-position: center;
  transition: transform 0.3s;
}
.carousel-slide:hover .slide-bg { transform: scale(1.05); }
.slide-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
}
.slide-info {
  position: absolute; bottom: 0; left: 0; right: 0; padding: 24px 28px; color: #fff;
}
.slide-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; text-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.slide-desc { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.5; }

.car-btn {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.4); color: #fff; border: none;
  font-size: 24px; cursor: pointer; opacity: 0; transition: all 0.2s; z-index: 2;
}
.carousel-wrap:hover .car-btn { opacity: 1; }
.car-btn.prev { left: 12px; }
.car-btn.next { right: 12px; }
.car-btn:hover { background: rgba(0,0,0,0.6); }

.car-dots { position: absolute; bottom: 10px; right: 28px; display: flex; gap: 5px; z-index: 2; }
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.2s;
}
.dot.active { background: #00ccaa; width: 20px; border-radius: 4px; }

/* 右推荐 — 填满整个高度 */
.recommend-section {
  flex: 1; min-width: 0; height: 100%;
  display: flex; flex-direction: column;
  background: #fff; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}
.section-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 10px; }

.recommend-list {
  display: flex; flex-direction: column; gap: 6px;
  flex: 1; overflow-y: auto;
}
.recommend-item {
  display: flex; gap: 10px; align-items: center;
  padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background 0.15s;
}
.recommend-item:hover { background: #f5f8fa; }

.rec-rank {
  width: 22px; text-align: center; font-weight: 700; font-size: 14px; color: #aaa; flex-shrink: 0;
}
.rec-rank.top { color: #ff6b00; }

.rec-cover {
  width: 100px; height: 62px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #f0f0f0;
}
.rec-cover img { width: 100%; height: 100%; object-fit: cover; }

.rec-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rec-title {
  font-size: 13px; font-weight: 600; color: #333;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;
}
.rec-views { font-size: 11px; color: #999; }

/* 全部视频 */
.all-section {}
.loading, .empty { text-align: center; padding: 40px 0; color: #999; }

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.video-card {
  cursor: pointer; border-radius: 10px; overflow: hidden;
  background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: all 0.2s;
}
.video-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }

.card-cover { position: relative; padding-top: 56.25%; overflow: hidden; background: #f0f0f0; }
.card-cover img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.card-duration {
  position: absolute; bottom: 5px; right: 5px;
  background: rgba(0,0,0,0.7); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;
}
.card-tag {
  position: absolute; top: 5px; left: 5px;
  padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; color: #fff;
}
.card-info { padding: 10px 12px; }
.card-title {
  font-size: 14px; font-weight: 600; color: #333; margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-meta { font-size: 12px; color: #999; display: flex; gap: 4px; align-items: center; }
.dot { color: #ddd; }

@media (max-width: 768px) {
  .top-row { flex-direction: column; }
  .videos-page { padding: 0 12px; }
  .video-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .slide-title { font-size: 18px; }
  .slide-desc { display: none; }
}
</style>
