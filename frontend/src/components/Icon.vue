<script setup lang="ts">
/**
 * Icon.vue — IconPark 图标包装组件（字节跳动 IconPark）
 * 按需导入，保持与旧版 API 兼容: name / size / stroke / class
 * 图标库: https://iconpark.oceanengine.com/official
 */
import { computed } from "vue";
// 按需导入（避免全库打包）
import {
  Home, Comments, Video, BookOne, Help, MessageOne, Toolkit, PeopleSafe,
  Search, User, Peoples, FolderOpen, Picture, Pic,
  Edit, Delete, Share, ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  Logout, Eyes, Download, Pin, Check, Close, HamburgerButton,
  Like, Undo, Robot,
  DocDetail, PlayOne, Calculator, Fire, Light, ChartHistogram, Spanner, Experiment, ExperimentOne,
  Plus, Lock, Globe, Info, Calendar, Time, Pencil, Helpcenter,
  TrendTwo, Layers, Filter, Rocket, Star, Mail, Phone, Send, Copy,
  Refresh, LinkTwo, EditOne, Magic, Shield, Key, Login,
  DatabaseConfig, Server, CloudStorage, Lightning,
} from "@icon-park/vue-next";

const props = withDefaults(defineProps<{
  name: string;
  size?: number | string;
  stroke?: number;
}>(), {
  size: 24,
  stroke: 4,
});

// 语义名 → IconPark 图标组件
const ICON_MAP: Record<string, unknown> = {
  // 导航
  home: Home,
  forum: Comments,
  video: Video,
  standard: BookOne,
  faq: Help,
  message: MessageOne,
  tool: Toolkit,
  about: PeopleSafe,
  search: Search,
  user: User,
  users: Peoples,
  folder: FolderOpen,
  image: Picture,
  carousel: Pic,
  // 操作
  edit: Edit,
  delete: Delete,
  share: Share,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  logout: Logout,
  eye: Eyes,
  download: Download,
  pin: Pin,
  check: Check,
  close: Close,
  menu: HamburgerButton,
  heart: Like,
  heartFill: Like,
  reply: Undo,
  robot: Robot,
  // 内容类型
  doc: DocDetail,
  play: PlayOne,
  calculator: Calculator,
  flame: Fire,
  fire: Fire,
  bulb: Light,
  chart: ChartHistogram,
  wrench: Spanner,
  beaker: Experiment,
  atom: ExperimentOne,
  // 通用
  plus: Plus,
  lock: Lock,
  globe: Globe,
  info: Info,
  calendar: Calendar,
  clock: Time,
  write: Pencil,
  question: Helpcenter,
  trendUp: TrendTwo,
  layers: Layers,
  filter: Filter,
  rocket: Rocket,
  star: Star,
  mail: Mail,
  phone: Phone,
  send: Send,
  copy: Copy,
  refresh: Refresh,
  link: LinkTwo,
  brush: EditOne,
  wand: Magic,
  admin: Shield,
  password: Key,
  login: Login,
  shield: Shield,
  database: DatabaseConfig,
  server: Server,
  cloud: CloudStorage,
  lightning: Lightning,
};

const comp = computed(() => ICON_MAP[props.name]);

const sizeStr = computed(() =>
  typeof props.size === "number" ? `${props.size}px` : props.size
);

// IconPark strokeWidth 为 0-4 刻度
const strokeWidth = computed(() => {
  if (props.stroke === undefined) return 4;
  if (props.stroke <= 1) return 2;
  if (props.stroke <= 2) return 3;
  return 4;
});
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    :size="sizeStr"
    :strokeWidth="strokeWidth"
    class="ip-icon"
  />
  <!-- 兜底: 图标缺失时显示圆点，避免空白 -->
  <span v-else class="icon-fallback" :style="{ width: sizeStr, height: sizeStr }"></span>
</template>

<style scoped>
.ip-icon {
  flex-shrink: 0;
  vertical-align: middle;
}
.icon-fallback {
  display: inline-block;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
}
</style>
