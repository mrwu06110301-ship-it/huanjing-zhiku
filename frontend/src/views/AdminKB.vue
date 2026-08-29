<script setup lang="ts">
/** AI 知识库管理 — 状态概览 / 定时计划 / 历史更新记录 / 手动触发更新 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import Icon from "@/components/Icon.vue";
import {
  getKBStatus, getKBHistory, triggerKBRebuild, getKBRunning,
  type KBStatus, type KBRun,
} from "@/api/kb";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const status = ref<KBStatus | null>(null);
const history = ref<KBRun[]>([]);
const loading = ref(false);
const triggering = ref(false);
const running = ref(false);
let pollTimer: number | null = null;

const statsCards = computed(() => {
  if (!status.value) return [];
  return [
    { icon: "layers", label: "知识切片", value: formatNum(status.value.chunks), sub: "kb_chunks" },
    { icon: "database", label: "检索索引", value: formatNum(status.value.fts), sub: "kb_fts (FTS5)" },
    { icon: "doc", label: "PDF 文件", value: formatNum(status.value.pdf_files), sub: "标准库已入库" },
    {
      icon: "clock",
      label: "最近更新",
      value: status.value.last_run ? shortTime(status.value.last_run.finished_at || status.value.last_run.started_at) : "—",
      sub: status.value.last_run ? statusLabel(status.value.last_run) : "暂无记录",
    },
  ];
});

function formatNum(n: number): string {
  return n.toLocaleString("zh-CN");
}

function shortTime(s: string | null): string {
  if (!s) return "—";
  return s.substring(5, 16); // MM-DD HH:mm
}

function statusLabel(r: KBRun): string {
  if (r.status === "running") return "进行中";
  if (r.status === "success") return `成功 · 写入 ${r.chunks_changed ?? 0} 条`;
  if (r.status === "failed") return "失败";
  return r.status;
}

async function loadAll() {
  loading.value = true;
  try {
    const [s, h] = await Promise.all([getKBStatus(), getKBHistory()]);
    status.value = s.data;
    history.value = h.data || [];
    running.value = !!s.data.lock_held || s.data.last_run?.status === "running";
  } catch {
    ElMessage.error("获取知识库状态失败");
  } finally {
    loading.value = false;
  }
}

async function checkRunning() {
  try {
    const res = await getKBRunning();
    const now = res.data.running;
    if (running.value && !now) {
      // 从运行中变为空闲 → 刷新数据
      ElMessage.success("知识库更新完成");
      loadAll();
    }
    running.value = now;
  } catch { /* 忽略轮询错误 */ }
}

async function onTrigger() {
  try {
    await ElMessageBox.confirm(
      "将增量更新 AI 知识库（覆盖论坛文章、法规标准、视频、工具、维保 FAQ、留言、关于作者全部内容源；新增/变更内容重新索引，未变更的 PDF 自动跳过，通常几分钟内完成）。确定执行？",
      "手动更新知识库",
      { confirmButtonText: "立即更新", cancelButtonText: "取消", type: "info" }
    );
  } catch { return; }

  triggering.value = true;
  try {
    await triggerKBRebuild();
    ElMessage.success("已触发更新，后台执行中");
    running.value = true;
    // 启动轮询（15s 一次，增量任务通常几分钟）
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(checkRunning, 15000);
    loadAll();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    ElMessage.error(msg || "触发失败");
  } finally {
    triggering.value = false;
  }
}

onMounted(() => {
  if (auth.isAdmin()) {
    loadAll();
    // 页面打开时若恰有任务在跑，自动进入轮询
    checkRunning().then(() => {
      if (running.value && !pollTimer) {
        pollTimer = window.setInterval(checkRunning, 15000);
      }
    });
  }
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="admin-kb-page" v-if="auth.isAdmin()">
    <div class="page-header page-header-row">
      <div class="header-left">
        <div class="page-header-main">
          <div class="page-title-icon">
            <Icon name="robot" :size="26" />
          </div>
          <h1>AI 知识库管理</h1>
        </div>
        <p class="page-header-sub">AI 助手 RAG 知识库 · 索引状态 · 定时更新 · 手动学习</p>
      </div>
      <el-button
        type="primary"
        :loading="triggering || running"
        @click="onTrigger"
      >
        <Icon :name="running ? 'refresh' : 'lightning'" :size="15" style="margin-right:6px" />
        {{ running ? "更新进行中..." : "立即更新学习" }}
      </el-button>
    </div>

    <div v-loading="loading">
      <!-- 状态卡片 -->
      <div class="stat-grid">
        <div v-for="c in statsCards" :key="c.label" class="stat-card">
          <div class="stat-icon"><Icon :name="c.icon" :size="20" /></div>
          <div class="stat-body">
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}<span class="stat-sub"> · {{ c.sub }}</span></div>
          </div>
        </div>
      </div>

      <!-- 运行横幅 -->
      <div v-if="running" class="run-banner">
        <Icon name="refresh" :size="16" class="spin" />
        知识库更新正在进行中（增量模式，全程伴热 PDF 自动跳过），完成后自动刷新记录。
      </div>

      <div class="panels">
        <!-- 定时更新计划 -->
        <div class="panel">
          <div class="panel-title">
            <Icon name="calendar" :size="17" />
            定时更新计划
            <span class="panel-badge on">已启用</span>
          </div>
          <div class="schedule-body" v-if="status">
            <div class="schedule-main">
              <Icon name="clock" :size="28" class="schedule-icon" />
              <div>
                <div class="schedule-desc">{{ status.schedule.description }}</div>
                <div class="schedule-cron">crontab: <code>{{ status.schedule.cron }}</code></div>
              </div>
            </div>
            <div class="schedule-detail">
              <div class="detail-row"><span>执行命令</span><code>{{ status.schedule.command }}</code></div>
              <div class="detail-row"><span>运行日志</span><code>{{ status.schedule.log_file }}</code></div>
              <div class="detail-row"><span>构建锁</span>
                <span v-if="status.lock_held" class="lock-tag held">占用中（{{ shortTime(status.lock_since) }} 起，2h 自动过期）</span>
                <span v-else class="lock-tag free">空闲</span>
              </div>
            </div>
            <div class="schedule-note">
              <b>增量机制</b>：论坛文章 / 视频 / 工具 / 常见问题(FAQ) / 留言 / 关于作者逐条比对内容哈希，变更才重写切片；
              法规标准按文件指纹（修改时间+大小）跳过未变更 PDF，新增/变更的标准自动解析全文入库；
              已下架或删除的内容同步清除索引，构建期间加锁防止并发重复执行。
            </div>
          </div>
        </div>

        <!-- 最近一次运行 -->
        <div class="panel">
          <div class="panel-title">
            <Icon name="trendUp" :size="17" />
            最近一次更新
          </div>
          <template v-if="status?.last_run">
            <div class="last-run">
              <div class="lr-row">
                <span>开始时间</span><b>{{ status.last_run.started_at }}</b>
              </div>
              <div class="lr-row">
                <span>完成时间</span><b>{{ status.last_run.finished_at || "—" }}</b>
              </div>
              <div class="lr-row">
                <span>模式 / 来源</span><b>{{ status.last_run.mode }} · {{ status.last_run.trigger_type === 'manual' ? '手动触发' : '定时任务' }}</b>
              </div>
              <div class="lr-row">
                <span>结果</span>
                <span :class="['status-tag', status.last_run.status]">{{ statusLabel(status.last_run) }}</span>
              </div>
              <div class="lr-row" v-if="status.last_run.message">
                <span>详情</span><b class="lr-msg">{{ status.last_run.message }}</b>
              </div>
            </div>
          </template>
          <el-empty v-else description="暂无运行记录" :image-size="60" />
        </div>
      </div>

      <!-- 历史更新记录 -->
      <div class="panel history-panel">
        <div class="panel-title">
          <Icon name="doc" :size="17" />
          历史更新记录
          <span class="panel-badge plain">{{ history.length }} 条</span>
        </div>
        <div class="history-table" v-loading="loading">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>开始时间</th>
                <th>完成时间</th>
                <th>模式</th>
                <th>触发来源</th>
                <th>状态</th>
                <th>写入切片</th>
                <th>知识总量</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in history" :key="r.id">
                <td>{{ r.id }}</td>
                <td>{{ r.started_at }}</td>
                <td>{{ r.finished_at || "—" }}</td>
                <td>{{ r.mode }}</td>
                <td>
                  <span :class="['trigger-tag', r.trigger_type]">
                    {{ r.trigger_type === 'manual' ? '手动' : '定时' }}
                  </span>
                </td>
                <td><span :class="['status-tag', r.status]">{{ r.status === 'success' ? '成功' : r.status === 'running' ? '进行中' : '失败' }}</span></td>
                <td>{{ r.chunks_changed ?? "—" }}</td>
                <td>{{ r.total_chunks != null ? formatNum(r.total_chunks) : "—" }}</td>
                <td class="msg-cell" :title="r.message || ''">{{ r.message || "—" }}</td>
              </tr>
            </tbody>
          </table>
          <el-empty v-if="!loading && history.length === 0" description="暂无历史记录，点击右上角「立即更新学习」体验" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-kb-page { max-width: 1200px; margin: 0 auto; padding-bottom: 40px; }

/* 状态卡片 */
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px;
}
.stat-card {
  background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius);
  padding: 18px; display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow);
}
.stat-icon {
  width: 42px; height: 42px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(37,99,235,0.12), rgba(6,182,212,0.12));
  color: var(--primary); display: flex; align-items: center; justify-content: center;
}
.stat-body { min-width: 0; }
.stat-value { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.2; white-space: nowrap; }
.stat-label { font-size: 13px; color: var(--text-light); margin-top: 2px; }
.stat-sub { font-size: 11px; opacity: 0.7; }

/* 运行横幅 */
.run-banner {
  display: flex; align-items: center; gap: 10px;
  background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.25);
  color: var(--primary); border-radius: var(--radius); padding: 12px 16px;
  font-size: 13px; margin-bottom: 20px;
}
.spin { animation: kb-spin 1.2s linear infinite; }
@keyframes kb-spin { to { transform: rotate(360deg); } }

/* 双栏面板 */
.panels { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin-bottom: 14px; }
.panel {
  background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 20px;
}
.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 16px;
}
.panel-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; margin-left: auto;
}
.panel-badge.on { background: rgba(16,185,129,0.12); color: #059669; }
.panel-badge.plain { background: rgba(37,99,235,0.08); color: var(--primary); }

/* 定时计划 */
.schedule-main { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.schedule-icon { color: var(--primary); flex-shrink: 0; }
.schedule-desc { font-size: 16px; font-weight: 700; color: var(--text); }
.schedule-cron { font-size: 12px; color: var(--text-light); margin-top: 3px; }
.schedule-cron code { background: rgba(37,99,235,0.07); padding: 1px 6px; border-radius: 4px; }
.schedule-detail {
  border-top: 1px dashed var(--card-border); padding-top: 14px;
  display: flex; flex-direction: column; gap: 9px;
}
.detail-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.detail-row > span:first-child { color: var(--text-light); flex-shrink: 0; width: 58px; }
.detail-row code {
  background: var(--card-border); opacity: 0.9; padding: 2px 8px; border-radius: 4px;
  font-size: 12px; word-break: break-all;
}
.lock-tag { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 20px; }
.lock-tag.free { background: rgba(16,185,129,0.12); color: #059669; }
.lock-tag.held { background: rgba(245,158,11,0.14); color: #d97706; }
.schedule-note {
  margin-top: 14px; font-size: 12px; color: var(--text-light); line-height: 1.7;
  background: rgba(37,99,235,0.04); border-radius: 8px; padding: 10px 12px;
}

/* 最近运行 */
.last-run { display: flex; flex-direction: column; gap: 11px; }
.lr-row { display: flex; gap: 10px; font-size: 13px; align-items: baseline; }
.lr-row > span:first-child { color: var(--text-light); flex-shrink: 0; width: 72px; }
.lr-row b { font-weight: 600; color: var(--text); word-break: break-all; }
.lr-msg { font-weight: 400 !important; font-size: 12px; color: var(--text-light); }

/* 状态标签 */
.status-tag {
  display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
}
.status-tag.success { background: rgba(16,185,129,0.12); color: #059669; }
.status-tag.running { background: rgba(37,99,235,0.1); color: var(--primary); }
.status-tag.failed { background: rgba(239,68,68,0.1); color: #dc2626; }
.trigger-tag { font-size: 12px; color: var(--text-light); }
.trigger-tag.manual { color: var(--primary); font-weight: 600; }

/* 历史表格 */
.history-panel { margin-top: 0; }
.history-table {
  overflow-x: auto; border: 1px solid var(--card-border); border-radius: 10px;
}
.history-table table { width: 100%; border-collapse: collapse; }
.history-table th {
  background: rgba(37,99,235,0.04); padding: 11px 14px; text-align: left;
  font-size: 12px; font-weight: 600; color: var(--text-light);
  border-bottom: 1px solid var(--card-border); white-space: nowrap;
}
.history-table td {
  padding: 11px 14px; border-bottom: 1px solid var(--card-border);
  font-size: 13px; color: var(--text); white-space: nowrap;
}
.history-table tr:last-child td { border-bottom: none; }
.msg-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }

/* 移动端 */
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { grid-template-columns: 1fr; }
  .admin-kb-page :deep(.page-header-row) { padding: 24px 0 16px; flex-wrap: wrap; }
}
</style>
