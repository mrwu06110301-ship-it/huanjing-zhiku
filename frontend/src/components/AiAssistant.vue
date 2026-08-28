<script setup lang="ts">
import { ref, nextTick, onMounted } from "vue";
import { useRouter } from "vue-router";
import { marked } from "marked";
import Icon from "@/components/Icon.vue";

// marked 配置：换行+打断（流式渲染友好）
marked.setOptions({ gfm: true, breaks: true });

/** markdown → HTML（AI 输出为受控文本，先整体转义再解析标记，防注入） */
function renderMd(md: string): string {
  if (!md) return "";
  const escaped = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 转义后恢复 markdown 语法字符（marked 能识别的子集）
  const unescaped = escaped
    .replace(/&quot;/g, '"');
  return marked.parse(unescaped) as string;
}

interface Source {
  title: string;
  url: string;
  source_type: string;
  source_id: number;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  reasoning?: string;
  error?: boolean;
}

const router = useRouter();
const open = ref(false);
const enabled = ref(false);
const input = ref("");
const thinking = ref(false);
const msgs = ref<Msg[]>([]);
const bodyRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  try {
    const res = await fetch("/api/assistant/status");
    const data = await res.json();
    enabled.value = !!data.enabled;
  } catch {
    enabled.value = false;
  }
});

function toggle() {
  open.value = !open.value;
  if (open.value) scrollBottom();
}

function scrollBottom() {
  nextTick(() => {
    bodyRef.value?.scrollTo({ top: bodyRef.value.scrollHeight, behavior: "smooth" });
  });
}

/** 来源卡片点击跳转 */
function gotoSource(s: Source) {
  if (s.source_type === "article") router.push(`/article/${s.source_id}`);
  else if (s.source_type === "video") router.push(`/videos/${s.source_id}`);
  else if (s.source_type === "tool") {
    // tool url 存的是 /tools/:slug
    const u = s.url;
    if (u.startsWith("/tools/")) router.push(u);
  } else router.push("/standards");
  open.value = false;
}

function sourceLabel(t: string) {
  return { article: "文章", standard_meta: "标准", standard_pdf: "标准全文", video: "视频", tool: "工具" }[t] || "资料";
}

async function send() {
  const q = input.value.trim();
  if (!q || thinking.value) return;
  input.value = "";
  msgs.value.push({ role: "user", content: q });
  msgs.value.push({ role: "assistant", content: "" });
  // 关键：必须取数组内的响应式代理，直接持有原始对象修改不触发渲染（流式失效根因）
  const aiMsg = msgs.value[msgs.value.length - 1]!;
  thinking.value = true;
  scrollBottom();

  try {
    // 携带最近 4 条历史（不含当前）
    const history = msgs.value
      .slice(0, -2)
      .filter((m) => !m.error)
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    const resp = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history }),
    });
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(line.slice(5));
          if (evt.type === "sources") aiMsg.sources = evt.sources;
          else if (evt.type === "reasoning") aiMsg.reasoning = (aiMsg.reasoning || "") + evt.text;
          else if (evt.type === "delta") {
            aiMsg.content += evt.text;
            scrollBottom();
          } else if (evt.type === "error") {
            aiMsg.error = true;
            aiMsg.content += `\n${evt.message}`;
          }
        } catch {
          /* 忽略半包 */
        }
      }
    }
  } catch (e) {
    aiMsg.error = true;
    aiMsg.content = aiMsg.content || "网络异常，请稍后再试";
  } finally {
    thinking.value = false;
    scrollBottom();
  }
}

const QUICK_QS = ["烟气采样布点要求？", "HJ 1385 是什么标准？", "含湿量测定有哪些方法？"];
function askQuick(q: string) {
  input.value = q;
  send();
}
</script>

<template>
  <!-- 悬浮按钮 -->
  <transition name="fab-in">
    <button v-if="enabled && !open" class="ai-fab" @click="toggle" aria-label="AI助手">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" fill="currentColor" stroke="none" opacity="0.9"/>
        <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" fill="currentColor" stroke="none" opacity="0.6"/>
        <circle cx="5.5" cy="17.5" r="2" />
      </svg>
      <span class="fab-badge">AI</span>
    </button>
  </transition>

  <!-- 对话窗 -->
  <transition name="panel-in">
    <div v-if="open" class="ai-panel">
      <div class="ai-head">
        <div class="ai-head-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/>
            <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" opacity="0.6"/>
          </svg>
          <b>小吴 AI 助手</b>
          <span class="ai-sub">环境监测知识库</span>
        </div>
        <button class="ai-close" @click="toggle">✕</button>
      </div>

      <div ref="bodyRef" class="ai-body">
        <div v-if="msgs.length === 0" class="ai-welcome">
          <p>你好！我是产品小吴知识库的 AI 助手，可以回答环境监测相关问题，支持检索站内 <b>1242+ 标准</b>、技术文章和视频。</p>
          <div class="quick-qs">
            <span v-for="q in QUICK_QS" :key="q" class="quick-q" @click="askQuick(q)">{{ q }}</span>
          </div>
        </div>

        <div v-for="(m, i) in msgs" :key="i" :class="['msg-row', m.role]">
          <div class="msg-bubble">
            <div v-if="m.reasoning && thinking && !m.content" class="msg-reasoning">
              <span class="r-dot"></span> 思考中：{{ m.reasoning.slice(-60) }}
            </div>
            <!-- AI 消息：markdown 实时渲染；用户消息：纯文本 -->
            <div
              v-if="m.role === 'assistant'"
              class="msg-text md"
              v-html="renderMd(m.content)"
            ></div>
            <div v-else class="msg-text">{{ m.content }}</div>
            <span v-if="thinking && i === msgs.length - 1 && m.role === 'assistant'" class="cursor">▋</span>
            <div v-if="m.sources && m.sources.length" class="msg-sources">
              <div class="src-label">来源：</div>
              <span v-for="(s, j) in m.sources" :key="j" class="src-chip" @click="gotoSource(s)">
                <i class="src-type">{{ sourceLabel(s.source_type) }}</i>
                {{ s.title.slice(0, 26) }}{{ s.title.length > 26 ? "…" : "" }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-input">
        <input
          v-model="input"
          placeholder="输入问题，回车发送..."
          @keyup.enter="send"
          maxlength="500"
        />
        <button class="ai-send" :disabled="thinking || !input.trim()" @click="send">
          <Icon name="arrowRight" :size="16" />
        </button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* ---- 悬浮按钮 ---- */
.ai-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 2000;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
  transition: transform 0.2s var(--ease, ease), box-shadow 0.2s;
}
.ai-fab:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 10px 28px rgba(37, 99, 235, 0.5); }
.fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 10px;
  font-weight: 700;
  background: #06b6d4;
  padding: 2px 6px;
  border-radius: 8px;
  letter-spacing: 0.5px;
}

/* ---- 对话窗 ---- */
.ai-panel {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 2001;
  width: min(400px, calc(100vw - 24px));
  height: min(600px, calc(100vh - 60px));
  background: var(--white, #fff);
  border-radius: 16px;
  box-shadow: 0 12px 48px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
}
.ai-head-title { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.ai-sub { font-size: 11px; opacity: 0.75; margin-left: 2px; }
.ai-close {
  border: none; background: rgba(255,255,255,0.15); color: #fff;
  width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 13px;
  transition: background 0.2s;
}
.ai-close:hover { background: rgba(255,255,255,0.3); }

/* ---- 消息区 ---- */
.ai-body { flex: 1; overflow-y: auto; padding: 16px 14px; background: var(--bg, #f8fafc); }
.ai-welcome {
  background: var(--white, #fff);
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
  color: var(--text-light, #475569);
  line-height: 1.7;
  box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06));
}
.quick-qs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.quick-q {
  font-size: 12px; padding: 5px 10px; border-radius: 14px; cursor: pointer;
  background: var(--primary-light, #eff6ff); color: var(--primary, #2563eb);
  transition: all 0.2s;
}
.quick-q:hover { background: var(--primary, #2563eb); color: #fff; }

.msg-row { display: flex; margin-top: 12px; }
.msg-row.user { justify-content: flex-end; }
.msg-bubble {
  max-width: 86%;
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.user .msg-bubble { background: var(--primary, #2563eb); color: #fff; border-bottom-right-radius: 4px; }
.msg-row.assistant .msg-bubble { background: var(--white, #fff); color: var(--text, #1e293b); border-bottom-left-radius: 4px; box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06)); }

/* ---- markdown 渲染样式（AI 消息） ---- */
.msg-text.md :deep(p) { margin: 0 0 6px; }
.msg-text.md :deep(p:last-child) { margin-bottom: 0; }
.msg-text.md :deep(strong) { font-weight: 600; color: var(--primary, #2563eb); }
.msg-text.md :deep(ul), .msg-text.md :deep(ol) { margin: 4px 0 8px; padding-left: 18px; }
.msg-text.md :deep(li) { margin: 3px 0; }
.msg-text.md :deep(h1), .msg-text.md :deep(h2), .msg-text.md :deep(h3), .msg-text.md :deep(h4) {
  font-size: 14px; font-weight: 700; margin: 10px 0 6px; color: var(--text, #1e293b);
}
.msg-text.md :deep(h1:first-child), .msg-text.md :deep(h2:first-child), .msg-text.md :deep(h3:first-child) { margin-top: 0; }
.msg-text.md :deep(code) {
  background: var(--bg-soft, #f1f5f9); padding: 1px 5px; border-radius: 4px;
  font-size: 12px; font-family: Consolas, monospace;
}
.msg-text.md :deep(pre) {
  background: var(--dark-800, #0d1320); color: #e2e8f0; padding: 10px 12px;
  border-radius: 8px; overflow-x: auto; margin: 6px 0;
}
.msg-text.md :deep(pre code) { background: transparent; color: inherit; padding: 0; }
.msg-text.md :deep(blockquote) {
  border-left: 3px solid var(--primary, #2563eb); padding: 2px 10px; margin: 6px 0;
  color: var(--text-light, #475569); background: var(--bg, #f8fafc); border-radius: 0 6px 6px 0;
}
.msg-text.md :deep(table) { border-collapse: collapse; margin: 6px 0; font-size: 12px; width: 100%; }
.msg-text.md :deep(th), .msg-text.md :deep(td) { border: 1px solid var(--border, #e2e8f0); padding: 4px 8px; text-align: left; }
.msg-text.md :deep(th) { background: var(--bg-soft, #f1f5f9); font-weight: 600; }
.msg-text.md :deep(a) { color: var(--primary, #2563eb); text-decoration: underline; }
.msg-text.md :deep(hr) { border: none; border-top: 1px solid var(--border, #e2e8f0); margin: 8px 0; }
.msg-row.assistant .msg-bubble:has(.msg-sources) { min-width: 60%; }
.msg-reasoning {
  font-size: 11px; color: var(--text-muted, #94a3b8); margin-bottom: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.r-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--primary, #2563eb); margin-right: 4px;
  animation: blink 0.9s infinite; vertical-align: middle;
}
.cursor { animation: blink 0.9s infinite; color: var(--primary, #2563eb); }
@keyframes blink { 50% { opacity: 0; } }

/* 来源卡片 */
.msg-sources { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border, #e2e8f0); }
.src-label { font-size: 11px; color: var(--text-muted, #94a3b8); margin-bottom: 5px; }
.src-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; padding: 3px 8px; margin: 0 5px 5px 0;
  background: var(--primary-light, #eff6ff); color: var(--primary, #2563eb);
  border-radius: 6px; cursor: pointer; transition: all 0.15s;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.src-chip:hover { background: var(--primary, #2563eb); color: #fff; }
.src-type { font-style: normal; font-size: 10px; opacity: 0.7; border-right: 1px solid currentColor; padding-right: 4px; }

/* ---- 输入区 ---- */
.ai-input {
  display: flex; gap: 8px; padding: 12px;
  border-top: 1px solid var(--border, #e2e8f0); background: var(--white, #fff);
}
.ai-input input {
  flex: 1; padding: 9px 14px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 20px; font-size: 13px; outline: none; transition: border 0.2s;
}
.ai-input input:focus { border-color: var(--primary, #2563eb); }
.ai-send {
  width: 38px; height: 38px; border: none; border-radius: 50%;
  background: var(--gradient-primary, linear-gradient(135deg, #2563eb, #7c3aed));
  color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: opacity 0.2s;
}
.ai-send:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- 过渡动画 ---- */
.fab-in-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fab-in-enter-from { transform: scale(0) translateY(20px); opacity: 0; }
.panel-in-enter-active { transition: all 0.28s cubic-bezier(0.34, 1.3, 0.64, 1); }
.panel-in-enter-from { transform: translateY(24px) scale(0.96); opacity: 0; }
.panel-in-leave-active { transition: all 0.18s ease; }
.panel-in-leave-to { transform: translateY(16px) scale(0.97); opacity: 0; }

@media (max-width: 768px) {
  .ai-fab { right: 16px; bottom: 16px; width: 50px; height: 50px; }
  .ai-panel { right: 12px; bottom: 12px; height: min(560px, calc(100vh - 40px)); }
}
</style>
