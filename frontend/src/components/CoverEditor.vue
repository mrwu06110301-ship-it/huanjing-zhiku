<script setup lang="ts">
import { ref } from "vue";
import { uploadImage } from "@/api/upload";
import { ElMessage } from "element-plus";
import Icon from "@/components/Icon.vue";

const props = defineProps<{ imageUrl: string }>();
const emit = defineEmits<{ saved: [url: string] }>();

const visible = ref(false);
const containerEl = ref<HTMLDivElement | null>(null);

type ElementItem = {
  id: number; type: "text" | "sticker";
  content: string; x: number; y: number;
  color: string; fontSize: number;
};
const elements = ref<ElementItem[]>([]);
let nextId = 1;

const dragging = ref<{ id: number; startX: number; startY: number; elX: number; elY: number } | null>(null);
const resizing = ref<{ id: number; startX: number; startY: number; startSize: number } | null>(null);
const textInput = ref("");
const textColor = ref("#ffffff");
const textSize = ref(32);

const colorPalette = [
  "#ffffff", "#000000", "#ff0000", "#ff6600", "#ffcc00",
  "#00cc00", "#00aaff", "#0066ff", "#9900ff", "#ff00cc",
  "#ff6699", "#00ccaa", "#336699", "#663300", "#999999",
  "#ff4444", "#44ff44", "#4444ff", "#ffff44", "#ff44ff",
];

const stickers = [
  "⭐", "🔥", "❤️", "💡", "✅", "🎯", "📌", "💪", "🚀", "🎨",
  "✨", "📢", "🎉", "🎊", "🏆", "🥇", "🎈", "🎁", "💎", "🌟",
  "🌈", "⚡", "💥", "🛡️", "🔔", "📣", "🎵", "🎶", "💯", "♻️",
  "🔬", "⚙️", "🛠️", "📐", "🧪", "📊", "📈", "🧠", "👀", "💡",
];

function selectColor(c: string) { textColor.value = c; }

function addText() {
  if (!textInput.value.trim()) return;
  elements.value.push({
    id: nextId++, type: "text",
    content: textInput.value.trim(),
    x: 60, y: 60 + (elements.value.length % 10) * 50,
    color: textColor.value, fontSize: textSize.value,
  });
  textInput.value = "";
}

function addSticker(s: string) {
  const offset = elements.value.filter(e => e.type === "sticker").length * 40;
  elements.value.push({
    id: nextId++, type: "sticker", content: s,
    x: 80 + (offset % 200), y: 100 + Math.floor(offset / 200) * 60,
    color: "#000", fontSize: 44,
  });
}

function removeElement(id: number) { elements.value = elements.value.filter(e => e.id !== id); }

function onMouseDown(e: MouseEvent, el: ElementItem) {
  if (resizing.value) return;
  dragging.value = { id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y };
}

function onResizeStart(e: MouseEvent, el: ElementItem) {
  e.stopPropagation();
  resizing.value = { id: el.id, startX: e.clientX, startY: e.clientY, startSize: el.fontSize };
}

function onMouseMove(e: MouseEvent) {
  if (resizing.value) {
    const el = elements.value.find(e => e.id === resizing.value!.id);
    if (el) {
      const dist = Math.max(e.clientX - resizing.value.startX, e.clientY - resizing.value.startY);
      el.fontSize = Math.max(12, Math.min(150, resizing.value.startSize + dist));
    }
    return;
  }
  if (!dragging.value) return;
  const el = elements.value.find(e => e.id === dragging.value!.id);
  if (el) { el.x = dragging.value.elX + e.clientX - dragging.value.startX; el.y = dragging.value.elY + e.clientY - dragging.value.startY; }
}

function onMouseUp() { dragging.value = null; resizing.value = null; }

const saving = ref(false);
async function save() {
  if (!containerEl.value) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = props.imageUrl;
  await new Promise((resolve) => { img.onload = resolve; });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 640;
  canvas.height = img.naturalHeight || 360;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / (containerEl.value!.offsetWidth || 640);
  const scaleY = canvas.height / (containerEl.value!.offsetHeight || 360);

  for (const el of elements.value) {
    const px = el.x * scaleX;
    const py = el.y * scaleY;
    if (el.type === "text") {
      ctx.font = `bold ${el.fontSize * scaleX}px sans-serif`;
      ctx.fillStyle = el.color;
      ctx.textBaseline = "top";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText(el.content, px, py);
      ctx.fillText(el.content, px, py);
    } else {
      ctx.font = `${el.fontSize * scaleX * 1.2}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(el.content, px, py);
    }
  }

  saving.value = true;
  canvas.toBlob(async (blob) => {
    if (!blob) { saving.value = false; return; }
    const file = new File([blob], "cover-edited.jpg", { type: "image/jpeg" });
    try { const res = await uploadImage(file); ElMessage.success("封面已保存"); emit("saved", res.data.url); visible.value = false; }
    catch { ElMessage.error("保存失败"); }
    finally { saving.value = false; }
  }, "image/jpeg", 0.92);
}

function open() { visible.value = true; elements.value = []; nextId = 1; }
defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="co-overlay" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div class="co-modal">
        <div class="co-header">
          <h3><Icon name="edit" :size="18" /> 封面编辑器</h3>
          <button class="co-close" @click="visible = false">&times;</button>
        </div>

        <div class="co-canvas" ref="containerEl" :style="{ backgroundImage: `url(${imageUrl})` }">
          <div
            v-for="el in elements" :key="el.id"
            class="co-el"
            :style="{ left: el.x + 'px', top: el.y + 'px', color: el.color, fontSize: el.fontSize + 'px' }"
            @mousedown="(e) => onMouseDown(e, el)"
          >
            <span class="co-el-text">{{ el.content }}</span>
            <button class="co-del" @mousedown.stop @click="removeElement(el.id)">&times;</button>
            <span class="co-resize" @mousedown="(e) => onResizeStart(e, el)">&#8600;</span>
          </div>
        </div>

        <div class="co-tools">
          <div class="co-row">
            <input v-model="textInput" placeholder="输入文字..." class="co-input" @keyup.enter="addText" />
            <select v-model.number="textSize" class="co-sel">
              <option :value="20">小</option>
              <option :value="32">中</option>
              <option :value="48">大</option>
              <option :value="64">超大</option>
            </select>
            <button class="co-btn" @click="addText"><Icon name="plus" :size="14" /> 添加</button>
          </div>

          <div class="co-row co-colors">
            <span class="co-label">颜色:</span>
            <button v-for="c in colorPalette" :key="c" :class="['co-c', { active: textColor === c }]" :style="{ background: c }" :title="c" @click="selectColor(c)"></button>
          </div>

          <div class="co-row co-stickers">
            <span class="co-label">贴纸:</span>
            <button v-for="s in stickers" :key="s" class="co-sticker" @click="addSticker(s)">{{ s }}</button>
          </div>

          <button class="co-save" :disabled="saving" @click="save">
            {{ saving ? '保存中...' : '保存封面' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.co-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.co-modal {
  background: var(--card-bg); border-radius: 16px;
  width: 100%; max-width: 800px;
  display: flex; flex-direction: column;
  max-height: 92vh; box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  border: 1px solid var(--card-border);
}
.co-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px; border-bottom: 1px solid var(--card-border);
}
.co-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
.co-close {
  width: 32px; height: 32px; border-radius: 50%; border: none;
  background: rgba(0,204,170,0.06); cursor: pointer; font-size: 16px;
  color: var(--text-light); transition: all 0.2s;
}
.co-close:hover { background: rgba(239,68,68,0.1); color: #e74c3c; }
.co-canvas {
  position: relative; aspect-ratio: 16 / 9;
  background-size: contain; background-repeat: no-repeat;
  background-position: center; background-color: #1a1a1a;
  overflow: hidden; cursor: default; min-height: 180px;
}
.co-el {
  position: absolute; cursor: move; user-select: none;
  font-weight: bold; text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  display: flex; align-items: center; gap: 2px; white-space: nowrap; line-height: 1;
}
.co-el:hover .co-del { display: flex; }
.co-el:hover .co-resize { display: flex; }
.co-el-text { pointer-events: none; }
.co-del { display: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(255,0,0,0.7); color: #fff; border: none; font-size: 10px; cursor: pointer; align-items: center; justify-content: center; }
.co-resize { display: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,204,170,0.8); color: #fff; border: none; font-size: 11px; cursor: nwse-resize; align-items: center; justify-content: center; margin-left: 2px; }
.co-tools { padding: 12px 20px 16px; border-top: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 8px; }
.co-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.co-label { font-size: 13px; color: var(--text-light); font-weight: 500; min-width: 40px; }
.co-input { padding: 7px 12px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 14px; width: 140px; outline: none; background: var(--card-bg); color: var(--text); }
.co-input:focus { border-color: var(--primary); }
.co-sel { padding: 6px 10px; border: 1px solid var(--card-border); border-radius: 8px; font-size: 13px; outline: none; background: var(--card-bg); color: var(--text); }
.co-btn { display: inline-flex; align-items: center; gap: 4px; padding: 7px 16px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card-bg); cursor: pointer; font-size: 13px; color: var(--text); transition: all 0.2s; }
.co-btn:hover { background: rgba(0,204,170,0.06); border-color: var(--primary); }
.co-colors { gap: 3px; }
.co-c { width: 24px; height: 24px; border-radius: 5px; border: 2px solid var(--card-border); cursor: pointer; padding: 0; transition: all 0.15s; }
.co-c.active { border-color: var(--text); transform: scale(1.2); box-shadow: 0 0 6px rgba(0,204,170,0.3); }
.co-c:hover { border-color: var(--primary); transform: scale(1.15); }
.co-stickers { gap: 3px; max-height: 72px; overflow-y: auto; }
.co-sticker { width: 34px; height: 34px; border: 1px solid var(--card-border); border-radius: 6px; background: var(--card-bg); cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
.co-sticker:hover { background: rgba(0,204,170,0.08); border-color: var(--primary); transform: scale(1.15); }
.co-save { padding: 10px 28px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 600; align-self: flex-end; transition: all 0.2s; }
.co-save:disabled { opacity: 0.6; cursor: not-allowed; }
.co-save:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(0,204,170,0.3); transform: translateY(-1px); }
@media (max-width: 768px) { .co-overlay { padding: 8px; } .co-input { width: 100px; } }
</style>
