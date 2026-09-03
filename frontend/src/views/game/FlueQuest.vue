<template>
  <div class="fq-wrap">
    <!-- ===== 阶段：任务地图（入口） ===== -->
    <div v-if="stage === 'map'" class="fq-mapstage">
      <FlueQuestMap :stars="progress.stars" :best-score="progress.best" @select="onMapSelect" @reset="resetProgress" />
      <div class="fq-map-actions">
        <button class="fq-next ghost" @click="$emit('exit')">
          <Icon name="arrowLeft" :size="14" /> 返回场景
        </button>
        <button class="fq-next" @click="onMapSelect('prologue')">
          从头开始完整流程 ▸
        </button>
      </div>
      <div v-if="progress.best > 0" class="fq-map-best">🏅 历史最佳：{{ progress.best }} 分</div>
    </div>

    <template v-else>
    <!-- 顶部：进度条 -->
    <div class="fq-topbar">
      <button class="fq-back" @click="stage = 'map'">
        <Icon name="arrowLeft" :size="14" /> 地图
      </button>
      <button class="fq-back" @click="$emit('exit')">
        <Icon name="close" :size="13" /> 退出
      </button>
      <div class="fq-progress">
        <div v-for="s in stages" :key="s.key" class="fq-pseg" :class="{ done: stageIdxOf(stage) > stageIdxOf(s.key), cur: stage === s.key }">
          {{ s.label }}
        </div>
      </div>
      <div class="fq-scorechip">得分 <b>{{ totalScore }}</b></div>
    </div>

    <!-- ===== 通用：剧情面板（序章/各关开场与收尾） ===== -->
    <div v-if="mode === 'story'" class="fq-panel story-panel">
      <FlueSceneArt :scene="storyStepArt" class="fq-story-art">
        {{ storyStepLabel }}
      </FlueSceneArt>
      <div class="fq-dialog">
        <img :src="heroAvatar" class="fq-hero" alt="主角" />
        <div class="fq-bubble">
          <div class="fq-bubble-name">监测员 · 小吴</div>
          <div class="fq-storytext">{{ curStep.text }}</div>
        </div>
      </div>
      <div v-if="curStep.choices" class="fq-choices">
        <button v-for="c in curStep.choices" :key="c.label" class="fq-choice"
                :class="{ right: storyRevealed && c.correct, wrong: storyRevealed && pickedWrong === c.label }"
                :disabled="storyRevealed"
                @click="pickStepChoice(c)">
          {{ c.label }}
        </button>
      </div>
      <transition name="fq-fade">
        <div v-if="stepFeedback" class="fq-feedback" :class="{ good: storyGood }">{{ stepFeedback }}</div>
      </transition>
      <button v-if="stepAdvanceable" class="fq-next" @click="advanceStoryStep">
        {{ storyNextLabel }} ▸
      </button>
    </div>

    <!-- ===== 第一关 · 测前准备：流程排序 + 检漏判断 ===== -->
    <div v-else-if="stage === 'level1' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第一关 · 测前准备</h3>
        <p>{{ l1.phase === "order" ? "把检漏校准流程按正确顺序排出来（点击卡片依次加入队列）" : "答对两道现场判断题" }}</p>
      </div>
      <FlueSceneArt scene="port" class="fq-lv-art">打开采样孔——热浪扑面，第一步永远是准备与检漏</FlueSceneArt>

      <template v-if="l1.phase === 'order'">
        <div class="fq-orderlane">
          <div class="fq-orderlane-title">你的操作顺序</div>
          <div class="fq-orderqueue">
            <span v-if="!l1.queue.length" class="fq-orderhint">点击下方卡片加入…</span>
            <button v-for="(id, i) in l1.queue" :key="id" class="fq-ordercard" :class="{ bad: l1.checked && l1.queue[i] !== LEVEL1_PREP.order[i] }" @click="l1.checked || l1.queue.splice(i, 1)">
              <b>{{ i + 1 }}</b> {{ stepLabel(LEVEL1_PREP.steps, id) }}
            </button>
          </div>
        </div>
        <div class="fq-orderpool">
          <div class="fq-orderlane-title">待排列步骤</div>
          <button v-for="id in pool" :key="id" class="fq-ordercard ghost" @click="!l1.checked && l1.queue.push(id)">
            {{ stepLabel(LEVEL1_PREP.steps, id) }}
          </button>
        </div>
        <button class="fq-next" :disabled="l1.queue.length !== LEVEL1_PREP.order.length || l1.checked" @click="checkL1Order">
          提交顺序 ▸
        </button>
        <div v-if="l1.checked" class="fq-orderwhy">
          <div v-for="st in LEVEL1_PREP.steps" :key="st.id" class="fq-whyrow">
            <b>{{ LEVEL1_PREP.order.indexOf(st.id) + 1 }}. {{ st.label }}</b><span>{{ st.why }}</span>
          </div>
        </div>
        <button v-if="l1.checked" class="fq-next" @click="l1.phase = 'leak'">进入检漏判断 ▸</button>
      </template>

      <template v-else>
        <div class="fq-quizbox" v-for="(q, qi) in LEVEL1_PREP.leakChecks" :key="qi">
          <div class="fq-quiztitle">{{ q.q }}</div>
          <div class="fq-colopts">
            <button v-for="(o, oi) in q.options" :key="oi" class="fq-choice"
                    :class="{ right: l1.leakRevealed[qi] && oi === q.correct, wrong: l1.leakRevealed[qi] && l1.leakPick[qi] === oi && oi !== q.correct }"
                    :disabled="l1.leakRevealed[qi]" @click="pickLeak(qi, oi)">
              {{ o }}
            </button>
          </div>
          <div v-if="l1.leakRevealed[qi]" class="fq-feedback" :class="{ good: l1.leakPick[qi] === q.correct }">{{ q.explain }}</div>
        </div>
        <button v-if="l1.leakAllDone" class="fq-next" @click="finishLevel1">完成测前准备 ▸</button>
      </template>
    </div>

    <!-- ===== 第二关 · 排气参数 ===== -->
    <div v-else-if="stage === 'level2' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第二关 · 排气参数测定</h3>
        <p>温度 · 流速 · 氧含量 · 含湿量——折算浓度的四块基石</p>
      </div>
      <FlueSceneArt scene="port" class="fq-lv-art">T = 96℃ · Δp 动压 · Xsw = 6.5% · O2 = 12.6%</FlueSceneArt>
      <div class="fq-quizbox" v-for="q in LEVEL2_PARAMS" :key="q.id">
        <div class="fq-quiztitle">{{ q.scene }}</div>
        <div class="fq-storytext" style="font-size:14px">{{ q.text }}</div>
        <div class="fq-colopts">
          <button v-for="(o, oi) in q.options" :key="oi" class="fq-choice"
                  :class="{ right: l2.revealed[q.id] && o.correct, wrong: l2.revealed[q.id] && l2.pick[q.id] === oi && !o.correct }"
                  :disabled="l2.revealed[q.id]" @click="pickParam(q, oi)">
            {{ o.label }}
          </button>
        </div>
        <div v-if="l2.revealed[q.id]" class="fq-feedback" :class="{ good: l2.pick[q.id] === q.options.findIndex(o => o.correct) }">
          {{ q.options[l2.pick[q.id]]?.feedback }}
        </div>
      </div>
      <div v-if="l2.allDone" class="fq-nextrow">
        <button class="fq-next" @click="finishLevel2">参数齐了，去布点 ▸</button>
      </div>
    </div>

    <!-- ===== 第三关 · 布点采样 ===== -->
    <div v-else-if="stage === 'level3' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第三关 · 断面布点</h3>
        <p>竖直圆形烟道 D=1.2m——点击断面，把测点布在等面积环中心线上</p>
      </div>
      <FlueSceneArt scene="level1" class="fq-lv-art">圆形烟道分 3 个等面积环，两条互相垂直的采样孔线</FlueSceneArt>
      <div class="fq-l1body">
        <div class="fq-canvasbox">
          <canvas ref="l3Canvas" :width="cnvW" :height="cnvH" @click="onL3Click"></canvas>
          <div v-if="l3.result === null" class="fq-canvas-tip">点击烟道断面内应布设<b>测点</b>的位置</div>
        </div>
        <div class="fq-l1side">
          <div class="fq-param" v-for="p in l3.params" :key="p.label">
            <span>{{ p.label }}</span><b>{{ p.value }}</b>
          </div>
          <div class="fq-l1stats">已布 {{ l3.picks.length }} 点</div>
          <button class="fq-next" :disabled="!l3.picks.length" @click="gradeL3">布点完成，提交 ▸</button>
        </div>
      </div>
      <transition name="fq-fade">
        <div v-if="l3.result" class="fq-feedback" :class="{ good: l3.result.score >= 160 }">
          {{ l3.result.text }}
        </div>
      </transition>
    </div>

    <!-- ===== 第四关 · 等速跟踪 ===== -->
    <div v-else-if="stage === 'level4' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第四关 · 等速采样挑战</h3>
        <p>拖动流量阀，让<b>采样流量</b>始终跟踪<b>等速目标流量</b>（相对误差 ≤ ±10%）</p>
      </div>
      <FlueSceneArt scene="level3" class="fq-lv-art">烟气流速随锅炉负荷波动——盯住目标曲线，小步微调</FlueSceneArt>
      <div class="fq-l3body">
        <div class="fq-gaugebox">
          <canvas ref="l4Canvas" :width="cnvW" :height="240"></canvas>
          <div class="fq-l3read">
            <div class="fq-gauge">
              <label>流速 <b>{{ l4.velocity.toFixed(1) }}</b> m/s</label>
              <label>目标流量 <b>{{ l4.targetFlow.toFixed(1) }}</b> L/min</label>
            </div>
            <div class="fq-gauge big">
              <label>当前流量 <b :class="{ danger: !l4.inTol }">{{ l4.userFlow.toFixed(1) }}</b> L/min</label>
              <label>偏差 <b :class="{ danger: !l4.inTol }">{{ l4.devPct > 0 ? '+' : '' }}{{ l4.devPct.toFixed(1) }}</b> %</label>
            </div>
            <div class="fq-timer">⏱ {{ Math.max(0, LEVEL_ISO.durationSec - l4.elapsed).toFixed(0) }} s</div>
          </div>
        </div>
        <div class="fq-l3ctrl">
          <input type="range" min="0" max="50" step="0.1" v-model.number="l4.userFlow" :disabled="!l4.running" />
          <button v-if="!l4.running && !l4.done" class="fq-next" @click="startL4">开始采样 ▸</button>
        </div>
      </div>
      <transition name="fq-fade">
        <div v-if="l4.done" class="fq-feedback" :class="{ good: l4.score >= 140 }">
          {{ l4.doneText }}
        </div>
      </transition>
    </div>

    <!-- ===== 第五关 · 颗粒物称量 ===== -->
    <div v-else-if="stage === 'level5' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第五关 · 颗粒物称量判定</h3>
        <p>{{ l5.phase === "order" ? "把 HJ 836 称量流程按顺序排出来" : "判定这些样品/场景是否合规" }}</p>
      </div>
      <FlueSceneArt scene="level2" class="fq-lv-art">恒温恒湿天平室——0.01mg 天平，称的是规则的重量</FlueSceneArt>

      <template v-if="l5.phase === 'order'">
        <div class="fq-orderlane">
          <div class="fq-orderlane-title">你的称量流程</div>
          <div class="fq-orderqueue">
            <span v-if="!l5.queue.length" class="fq-orderhint">点击下方卡片加入…</span>
            <button v-for="(id, i) in l5.queue" :key="id" class="fq-ordercard" :class="{ bad: l5.checked && l5.queue[i] !== LEVEL4_WEIGH.order[i] }" @click="l5.checked || l5.queue.splice(i, 1)">
              <b>{{ i + 1 }}</b> {{ stepLabel(LEVEL4_WEIGH.steps, id) }}
            </button>
          </div>
        </div>
        <div class="fq-orderpool">
          <div class="fq-orderlane-title">待排列步骤</div>
          <button v-for="id in l5pool" :key="id" class="fq-ordercard ghost" @click="!l5.checked && l5.queue.push(id)">
            {{ stepLabel(LEVEL4_WEIGH.steps, id) }}
          </button>
        </div>
        <button class="fq-next" :disabled="l5.queue.length !== LEVEL4_WEIGH.order.length || l5.checked" @click="checkL5Order">
          提交流程 ▸
        </button>
        <div v-if="l5.checked" class="fq-orderwhy">
          <div v-for="st in LEVEL4_WEIGH.steps" :key="st.id" class="fq-whyrow">
            <b>{{ LEVEL4_WEIGH.order.indexOf(st.id) + 1 }}. {{ st.label }}</b><span>{{ st.why }}</span>
          </div>
        </div>
        <button v-if="l5.checked" class="fq-next" @click="l5.phase = 'judge'">进入样品判定 ▸</button>
      </template>

      <template v-else>
        <div class="fq-quizbox" v-for="(j, ji) in LEVEL4_WEIGH.judge" :key="ji">
          <div class="fq-quiztitle">{{ j.q }}</div>
          <div class="fq-colopts">
            <button v-for="o in j.options" :key="o.label" class="fq-choice"
                    :class="{ right: l5.judgeRevealed[ji] && o.correct, wrong: l5.judgeRevealed[ji] && l5.judgePick[ji] === o.label && !o.correct }"
                    :disabled="l5.judgeRevealed[ji]" @click="pickJudge(ji, o)">
              {{ o.label }}
            </button>
          </div>
          <div v-if="l5.judgeRevealed[ji]" class="fq-feedback" :class="{ good: l5.judgeRight[ji] }">
            {{ j.options.find(o => o.label === l5.judgePick[ji])?.feedback }}
          </div>
        </div>
        <button v-if="l5.judgeAllDone" class="fq-next" @click="finishLevel5">样品判定完毕 ▸</button>
      </template>
    </div>

    <!-- ===== 第六关 · 质控报告 ===== -->
    <div v-else-if="stage === 'level6' && mode === 'play'" class="fq-panel">
      <div class="fq-lvhead">
        <h3>第六关 · 质控与报告</h3>
        <p>{{ l6.phase === "calc" ? "按 GB/T 16157 式(21)(20) 完成折算计算" : "报告评审：找出三处不合规表述" }}</p>
      </div>
      <FlueSceneArt scene="office" class="fq-lv-art">回到办公室——数据变成报告前的最后一道关</FlueSceneArt>

      <template v-if="l6.phase === 'calc'">
        <div class="fq-params">
          <div class="fq-param" v-for="g in LEVEL6_CALC.given" :key="g.label">
            <span>{{ g.label }}</span><b>{{ g.value }}</b>
          </div>
        </div>
        <div class="fq-blankrow" v-for="b in LEVEL6_CALC.blanks" :key="b.id">
          <label>{{ b.label }}</label>
          <div class="fq-blankinput">
            <input type="number" step="0.1" v-model.number="l6.answers[b.id]" :disabled="l6.calcChecked" />
            <span>{{ b.unit }}</span>
          </div>
          <span v-if="l6.calcChecked" class="fq-blankverdict" :class="blankOk(b) ? 'ok' : 'no'">
            {{ blankOk(b) ? "✓" : "✗ " + b.hint }}
          </span>
        </div>
        <button class="fq-next" :disabled="!bothFilled || l6.calcChecked" @click="checkL6Calc">提交计算 ▸</button>
        <button v-if="l6.calcChecked" class="fq-next" @click="l6.phase = 'report'">进入报告评审 ▸</button>
      </template>

      <template v-else>
        <div class="fq-quiztitle">点击报告中<b style="color:#f87171">不合规</b>的表述（共 3 处）</div>
        <div class="fq-report">
          <button v-for="line in l6.lines" :key="line.id" class="fq-reportline"
                  :class="{
                    err: l6.reportRevealed && line.why,
                    okline: l6.reportRevealed && !line.why,
                    marked: l6.marked.includes(line.id) && !l6.reportRevealed
                  }"
                  :disabled="l6.reportRevealed"
                  @click="toggleMark(line.id)">
            {{ line.text }}
          </button>
        </div>
        <button class="fq-next" :disabled="l6.marked.length !== 3 || l6.reportRevealed" @click="revealReport">
          确认三处问题 ▸
        </button>
        <div v-if="l6.reportRevealed" class="fq-orderwhy">
          <div v-for="line in l6.lines" :key="line.id" class="fq-whyrow" v-show="line.why">
            <b>「{{ line.text }}」</b><span>{{ line.why }}</span>
          </div>
        </div>
        <button v-if="l6.reportRevealed" class="fq-next" @click="finishLevel6">提交报告 ▸</button>
      </template>
    </div>

    <!-- ===== 阶段：结算 ===== -->
    <div v-else-if="stage === 'result'" class="fq-panel result-panel">
      <div class="fq-resultstars">{{ starsText }}</div>
      <div class="fq-resultscore">{{ totalScore }} <small>/ {{ TOTAL_MAX }}</small></div>
      <div class="fq-bestline">
        🏅 历史最佳 {{ bestScoreShown }}
        <span v-if="newRecord" class="fq-newrec">NEW!</span>
      </div>
      <div class="fq-breakdown">
        <div v-for="m in STAGE_META" :key="m" class="fq-brow"><span>{{ m.title }}</span><b>{{ breakdown[m] ?? 0 }}</b></div>
      </div>
      <div class="fq-knowledge">
        <div class="fq-ktit">📖 知识回顾</div>
        <ul>
          <li v-for="k in knowledgeRecap" :key="k">{{ k }}</li>
        </ul>
      </div>
      <div class="fq-actions">
        <button class="fq-next ghost" @click="restart(false)">再测一次</button>
        <button v-if="!scoreSubmitted" class="fq-next" :disabled="submitting" @click="submitScore">
          {{ submitting ? '提交中…' : '提交成绩上榜' }}
        </button>
        <div v-else class="fq-submitted">✓ 成绩已上榜</div>
      </div>
      <div v-if="board.length" class="fq-board">
        <div class="fq-ktit">🏆 烟气探秘 · 排行榜</div>
        <div class="fq-brow" v-for="(row, i) in board" :key="row.id">
          <span>{{ i + 1 }}. {{ row.nickname || row.username }}</span><b>{{ row.score }}</b>
        </div>
      </div>
      <div class="fq-actions" style="margin-top: 16px;">
        <button class="fq-next ghost" @click="stage = 'map'">◂ 回任务地图</button>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onBeforeUnmount, nextTick, watch } from "vue";
import { ElMessage } from "element-plus";
import axios from "axios";
import Icon from "@/components/Icon.vue";
import FlueQuestMap from "./FlueQuestMap.vue";
import FlueSceneArt from "./FlueSceneArt.vue";
import heroAvatar from "@/assets/game/hero-avatar.webp";
import {
  CIRC_COEFFS, STORY_SCENE_META, PROLOGUE, LEVEL1_PREP, LEVEL2_PARAMS,
  LEVEL4_WEIGH, LEVEL6_CALC, STAGE_META, TOTAL_MAX, LEVEL_ISO,
  planCircular, flowAt,
  type StoryStep,
} from "./flue-quest-data";

const emit = defineEmits<{ (e: "exit"): void }>();

type Stage = "map" | "prologue" | "level1" | "level2" | "level3" | "level4" | "level5" | "level6" | "result";
type Mode = "story" | "play";
const stages = [
  { key: "prologue", label: "序章" },
  { key: "level1", label: "准备" },
  { key: "level2", label: "参数" },
  { key: "level3", label: "布点" },
  { key: "level4", label: "等速" },
  { key: "level5", label: "称量" },
  { key: "level6", label: "报告" },
] as const;
function stageIdxOf(s: Stage): number {
  const i = stages.findIndex((x) => x.key === s);
  return i < 0 ? -1 : i;
}

const stage = ref<Stage>("map");
const mode = ref<Mode>("story");

/* ---------------- 进度记忆（localStorage，v2 key） ---------------- */
const PROGRESS_KEY = "flue-quest-progress-v2";
type Progress = { stars: Record<string, number>; best: number; cleared: boolean };
const progress = ref<Progress>({ stars: {}, best: 0, cleared: false });

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      progress.value = { stars: p.stars || {}, best: p.best || 0, cleared: !!p.cleared };
    }
  } catch { /* 损坏则重置 */ }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress.value)); } catch { /* 忽略 */ }
}
loadProgress();

/* ---------------- 分数账本 ---------------- */
const scores = reactive<Record<string, number>>({
  prologue: 0, level1: 0, level2: 0, level3: 0, level4: 0, level5: 0, level6: 0,
});
const breakdown = computed(() => ({ ...scores }));
const totalScore = computed(() => Object.values(scores).reduce((a, b) => a + b, 0));

/** 通用星级：得分/满分比例 → 3/2/1 星 */
function ratioStars(stageKey: string, ratio: number): number {
  const st = ratio >= 0.85 ? 3 : ratio >= 0.65 ? 2 : ratio >= 0.4 ? 1 : 0;
  progress.value.stars[stageKey] = Math.max(progress.value.stars[stageKey] ?? 0, st);
  saveProgress();
  return st;
}

/* ---------------- 地图入口 ---------------- */
function onMapSelect(key: string) {
  if (key === "result") {
    stage.value = "result";
    loadBoard();
    return;
  }
  enterStage(key as Stage);
}

/** 进入某关：先播剧情开场（若有），再进玩法 */
function enterStage(s: Stage) {
  // 重置本关状态
  if (s === "prologue") resetPrologue();
  if (s === "level1") resetL1();
  if (s === "level2") resetL2();
  if (s === "level3") resetL3();
  if (s === "level4") resetL4();
  if (s === "level5") resetL5();
  if (s === "level6") resetL6();

  stage.value = s;
  const opening = OPENINGS[s];
  if (opening && opening.length) {
    mode.value = "story";
    storyIdx.value = 0;
    afterStory = AFTER_STORY[s] || null;
    stepFeedback.value = "";
    storyRevealed.value = false;
    storyGood.value = false;
    pickedWrong.value = "";
  } else {
    mode.value = "play";
  }
}

/* ---------------- 剧情引擎（序章+各关开场复用） ---------------- */
const storyIdx = ref(0);
const stepFeedback = ref("");
const storyGood = ref(false);
const storyRevealed = ref(false);
const pickedWrong = ref("");
let afterStory: (() => void) | null = null;

const OPENINGS: Partial<Record<Stage, StoryStep[]>> = {
  prologue: PROLOGUE,
  level2: LEVEL2_OPENING,
  level5: LEVEL5_OPENING,
  level6: LEVEL6_OPENING,
};
const AFTER_STORY: Partial<Record<Stage, () => void>> = {};
function goPlay() { mode.value = "play"; }

const LEVEL2_OPENING: StoryStep[] = [
  {
    art: "port",
    text: "平台风很大。开测前师傅交代：参数测不准，后面折算浓度全是空中楼阁。先从哪个开始？",
    choices: [
      { label: "按顺序来：温度 → 流速 → O2 → 含湿量，逐项读数记录", correct: true, feedback: "正确！参数之间有依赖：流速计算要用烟温，流量折算要用含湿量。按序测定、逐项复核，是参数环节的基本功。" },
      { label: "哪台仪器先预热好就先测哪个", feedback: "可以并行预热，但读数与记录要按项复核——参数环节最忌讳张冠李戴。" },
    ],
  },
];
const LEVEL5_OPENING: StoryStep[] = [
  {
    art: "level2",
    text: "滤膜采样头已带回实验室。天平室恒温 23℃、湿度 50%。称量之前，这批采样头还差最后一步——",
    choices: [
      { label: "在同等恒温恒湿条件下再平衡至少 24h", correct: true, feedback: "正确！HJ 836 8.2.3：采样后应烘烤（105~110℃、1h）干燥冷却后，在与采样前相同的恒温恒湿条件下平衡至少 24h 再称量。" },
      { label: "直接上秤，时间紧", feedback: "没平衡就称，水分差异能带来零点几毫克误差——比颗粒物增量还大，样品直接作废。" },
    ],
  },
];
const LEVEL6_OPENING: StoryStep[] = [
  {
    art: "office",
    text: "三天期限，明天交报告。所有原始记录摊在桌上——先折算，再评审。燃煤锅炉排放标准规定 α=1.7，实测 O2 10.5%。第一件事：",
    choices: [
      { label: "算实测过量空气系数 α′，把实测浓度折算到 α=1.7", correct: true, feedback: "正确！GB/T 16157 / HJ/T 397 第12章：燃煤锅炉实测浓度必须折算到规定过量空气系数下再与限值比较。" },
      { label: "实测浓度直接和限值比", feedback: "不折算直接比，等于跟标准玩文字游戏——评审第一枪就毙。" },
    ],
  },
];

const curStep = computed<StoryStep>(() => {
  const arr = OPENINGS[stage.value as Stage] || [];
  return arr[Math.min(storyIdx.value, arr.length - 1)];
});
const storyStepArt = computed(() => {
  const arr = OPENINGS[stage.value as Stage] || [];
  const a = arr[storyIdx.value]?.art;
  return a || (stage.value === "prologue" ? "office" : "port");
});
const storyStepLabel = computed(() => {
  const meta = STORY_SCENE_META[stage.value];
  return meta ? meta.title : "";
});
const storyNextLabel = computed(() => {
  const arr = OPENINGS[stage.value as Stage] || [];
  return storyIdx.value < arr.length - 1 ? "继续" : stage.value === "prologue" ? "开始第一关" : "开始挑战";
});
const stepAdvanceable = computed(() => {
  const step = curStep.value;
  if (step.choices && !storyRevealed.value) return false;
  return !!stepFeedback.value || !step.choices;
});

function pickStepChoice(c: { correct?: boolean; feedback: string }) {
  if (storyRevealed.value) return;
  storyRevealed.value = true;
  storyGood.value = !!c.correct;
  pickedWrong.value = c.correct ? "" : c.label;
  stepFeedback.value = c.feedback;
  if (c.correct) scores[stage.value === "prologue" ? "prologue" : (stage.value as string)] += 25;
  if (stage.value === "prologue") {
    // 序章正确选择计 25 分，收尾在 finishPrologue
  }
}
function advanceStoryStep() {
  stepFeedback.value = "";
  storyRevealed.value = false;
  pickedWrong.value = "";
  const arr = OPENINGS[stage.value as Stage] || [];
  if (storyIdx.value < arr.length - 1) {
    storyIdx.value++;
    return;
  }
  if (stage.value === "prologue") {
    finishPrologue();
    return;
  }
  goPlay();
  if (stage.value === "level3") nextTick(initL3);
  if (stage.value === "level4") nextTick(drawL4);
}

function finishPrologue() {
  ratioStars("prologue", scores.prologue / (STAGE_META.prologue?.max ?? 100));
  stage.value = "level1";
  mode.value = "play";
}

/* ---------------- 通用排序工具 ---------------- */
function stepLabel(steps: { id: string; label: string }[], id: string): string {
  return steps.find((s) => s.id === id)?.label || id;
}

/* ---------------- 第一关 · 测前准备 ---------------- */
const l1 = reactive({
  phase: "order" as "order" | "leak",
  queue: [] as string[],
  checked: false,
  orderWrong: 0,
  leakPick: {} as Record<number, number>,
  leakRevealed: {} as Record<number, boolean>,
});
const leakAllDone = computed(() => LEVEL1_PREP.leakChecks.every((_, i) => l1.leakRevealed[i]));
const pool = computed(() => LEVEL1_PREP.steps.map((s) => s.id).filter((id) => !l1.queue.includes(id)));

function resetL1() {
  l1.phase = "order"; l1.queue = []; l1.checked = false; l1.orderWrong = 0;
  l1.leakPick = {}; l1.leakRevealed = {};
  scores.level1 = 0;
}

function checkL1Order() {
  l1.checked = true;
  let right = 0;
  LEVEL1_PREP.order.forEach((id, i) => { if (l1.queue[i] === id) right++; });
  l1.orderWrong = LEVEL1_PREP.order.length - right;
}

function pickLeak(qi: number, oi: number) {
  if (l1.leakRevealed[qi]) return;
  l1.leakPick[qi] = oi;
  l1.leakRevealed[qi] = true;
  if (oi === LEVEL1_PREP.leakChecks[qi].correct) scores.level1 += 25;
}

function finishLevel1() {
  const orderScore = Math.max(0, 50 - l1.orderWrong * 12);
  scores.level1 += orderScore;
  ratioStars("level1", scores.level1 / (STAGE_META.level1?.max ?? 150));
  enterStage("level2");
}

/* ---------------- 第二关 · 排气参数 ---------------- */
const l2 = reactive({
  pick: {} as Record<string, number>,
  revealed: {} as Record<string, boolean>,
});
const l2allDone = computed(() => LEVEL2_PARAMS.every((q) => l2.revealed[q.id]));

function resetL2() {
  l2.pick = {}; l2.revealed = {};
  scores.level2 = 0;
}

function pickParam(q: (typeof LEVEL2_PARAMS)[number], oi: number) {
  if (l2.revealed[q.id]) return;
  l2.pick[q.id] = oi;
  l2.revealed[q.id] = true;
  if (q.options[oi].correct) scores.level2 += 50;
  if (LEVEL2_PARAMS.every((qq) => l2.revealed[qq.id])) {
    ratioStars("level2", scores.level2 / (STAGE_META.level2?.max ?? 200));
  }
}

function finishLevel2() {
  enterStage("level3");
}

/* ---------------- 第三关 · 布点 ---------------- */
const cnvW = 560, cnvH = 380;
const l3Canvas = ref<HTMLCanvasElement | null>(null);
const l3 = reactive({
  params: [
    { label: "烟道形式", value: "圆形 · 竖直" },
    { label: "内径 D", value: "1.2 m" },
    { label: "采样孔", value: "2 个（互相垂直）" },
  ] as { label: string; value: string }[],
  plan: null as ReturnType<typeof planCircular> | null,
  picks: [] as { x: number; y: number }[],
  result: null as { score: number; text: string } | null,
});

function resetL3() {
  scores.level3 = 0;
  l3.picks = [];
  l3.result = null;
  nextTick(initL3);
}

function initL3() {
  l3.plan = planCircular(1.2);
  l3.picks = [];
  l3.result = null;
  drawL3();
}

function l3Geom() {
  const cx = cnvW / 2, cy = cnvH / 2;
  const R = Math.min(cnvW, cnvH) / 2 - 60;
  return { cx, cy, R };
}

function drawL3() {
  const cv = l3Canvas.value; if (!cv) return;
  const ctx = cv.getContext("2d")!;
  const { cx, cy, R } = l3Geom();
  ctx.clearRect(0, 0, cnvW, cnvH);
  const bg = ctx.createLinearGradient(0, 0, 0, cnvH);
  bg.addColorStop(0, "#0e1626"); bg.addColorStop(1, "#0a101c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cnvW, cnvH);

  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const dg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  dg.addColorStop(0, "#182338"); dg.addColorStop(1, "#101a2c");
  ctx.fillStyle = dg; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#3d4f78"; ctx.stroke();

  if (!l3.plan) return;

  ctx.setLineDash([6, 5]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(120,150,210,.4)";
  for (let k = 1; k < l3.plan.rings; k++) {
    const r = R * Math.sqrt(k / l3.plan.rings);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(96,165,250,.25)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

  for (const p of l3.picks) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#78350f"; ctx.stroke();
  }
}

function onL3Click(e: MouseEvent) {
  if (l3.result || !l3.plan) return;
  const cv = l3Canvas.value!; const rect = cv.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * cnvW;
  const y = ((e.clientY - rect.top) / rect.height) * cnvH;
  const { cx, cy, R } = l3Geom();
  if (Math.hypot(x - cx, y - cy) > R) return;
  if (l3.picks.some((p) => Math.hypot(p.x - x, p.y - y) < 14)) return;
  l3.picks.push({ x, y });
  drawL3();
}

function gradeL3() {
  const { cx, cy, R } = l3Geom();
  const plan = l3.plan!;
  const ideal: { x: number; y: number }[] = [];
  const angles = plan.holes === 1 ? [0] : plan.holes === 2 ? [0, Math.PI / 2] : [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const coeffs = CIRC_COEFFS[plan.rings] || [0.5];
  for (const a of angles) {
    for (const c of coeffs) {
      const t = 2 * c - 1;
      ideal.push({ x: cx + t * R * Math.cos(a), y: cy + t * R * Math.sin(a) });
    }
  }
  const used = new Set<number>();
  let hit = 0;
  const tolPx = R * 0.09;
  for (const p of l3.picks) {
    let bi = -1, bd = Infinity;
    ideal.forEach((q, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi >= 0 && bd <= tolPx) { used.add(bi); hit++; }
  }
  const recall = hit / ideal.length;
  const extra = Math.max(0, l3.picks.length - hit);
  let score = Math.round(200 * recall) - extra * 10;
  score = Math.max(0, Math.min(200, score));
  scores.level3 = score;

  const n = ideal.length;
  l3.result = {
    score,
    text: score >= 170
      ? `漂亮！${n} 个标准测点命中 ${hit} 个。得分 ${score}/200（D=1.2m → 3 环 × 2 孔 × 6 点/孔）`
      : score >= 100
      ? `基本成型：${n} 个标准测点命中 ${hit} 个，多余 ${extra} 点。得分 ${score}/200。口诀：1.0≤D<2.0 → 3 环，两孔垂直，每孔 6 点。`
      : `差距较大：标准布点 ${n} 个，命中 ${hit} 个。得分 ${score}/200。先定环数，测点落在各环等面积中心线与直径的交点。`,
  };
  ratioStars("level3", score / 200);
  setTimeout(() => { enterStage("level4"); }, 1800);
}

/* ---------------- 第四关 · 等速跟踪 ---------------- */
const l4Canvas = ref<HTMLCanvasElement | null>(null);
const l4 = reactive({
  running: false, done: false,
  t: 0, elapsed: 0,
  velocity: LEVEL_ISO.baseVelocity,
  targetFlow: 0, userFlow: 20,
  inTol: true, devPct: 0,
  inTolTime: 0, totalTime: 0,
  score: 0, doneText: "",
});
let rafId = 0; let lastTs = 0;
const flowHist: { t: number; target: number; user: number }[] = [];

const dNozzle = 8;
function qrs(v: number) { return 0.047 * dNozzle * dNozzle * v * (1 - 6.5 / 100); }

function resetL4() {
  scores.level4 = 0;
  l4.running = false; l4.done = false;
  l4.t = 0; l4.elapsed = 0; l4.inTolTime = 0; l4.totalTime = 0;
  l4.score = 0; l4.doneText = "";
  flowHist.length = 0;
  nextTick(drawL4);
}

function startL4() {
  l4.running = true; l4.done = false;
  l4.t = 0; l4.elapsed = 0; l4.inTolTime = 0; l4.totalTime = 0;
  flowHist.length = 0;
  lastTs = 0;
  rafId = requestAnimationFrame(tickL4);
}

function tickL4(ts: number) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  l4.t += dt; l4.elapsed += dt;

  const v = flowAt(l4.t, LEVEL_ISO.baseVelocity);
  l4.velocity = v;
  l4.targetFlow = qrs(v);
  const dev = (l4.userFlow - l4.targetFlow) / l4.targetFlow;
  l4.devPct = dev * 100;
  l4.inTol = Math.abs(dev) <= LEVEL_ISO.tolerance;

  l4.totalTime += dt;
  if (l4.inTol) l4.inTolTime += dt;

  flowHist.push({ t: l4.t, target: l4.targetFlow, user: l4.userFlow });
  if (flowHist.length > 320) flowHist.shift();

  drawL4();

  if (l4.elapsed >= LEVEL_ISO.durationSec) { finishL4(); return; }
  rafId = requestAnimationFrame(tickL4);
}

function finishL4() {
  l4.running = false; l4.done = true;
  const ratio = l4.inTolTime / l4.totalTime;
  l4.score = Math.round(LEVEL_ISO.maxScore * ratio);
  scores.level4 = l4.score;
  ratioStars("level4", ratio);
  l4.doneText = ratio >= 0.9
    ? `教科书级操作！全程 ${(ratio * 100).toFixed(0)}% 时间保持等速（|相对误差|≤10%），得分 ${l4.score}/200`
    : ratio >= 0.7
    ? `不错的手感：${(ratio * 100).toFixed(0)}% 时间保持等速。得分 ${l4.score}/200。提示：盯住目标曲线提前微调。`
    : `等速偏差偏大：仅 ${(ratio * 100).toFixed(0)}% 时间在等速区间。得分 ${l4.score}/200。小步拖动，跟着曲线节奏走。`;
  setTimeout(() => { enterStage("level5"); }, 1800);
}

function drawL4() {
  const cv = l4Canvas.value; if (!cv) return;
  const ctx = cv.getContext("2d")!;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0e1626"); bg.addColorStop(1, "#0a101c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(90,110,160,.15)"; ctx.lineWidth = 1;
  for (let y = 1; y < 6; y++) { ctx.beginPath(); ctx.moveTo(0, (H / 6) * y); ctx.lineTo(W, (H / 6) * y); ctx.stroke(); }

  if (!flowHist.length) {
    ctx.fillStyle = "#64748b"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("点击「开始采样」，拖动下方滑条跟踪目标流量", W / 2, H / 2);
    return;
  }

  const maxV = 34, pad = 34;
  const xOf = (t: number) => pad + (t / LEVEL_ISO.durationSec) * (W - pad * 2);
  const yOf = (f: number) => H - 24 - (f / maxV) * (H - 48);

  ctx.beginPath();
  let started = false;
  for (const p of flowHist) {
    const y1 = yOf(p.target * (1 + LEVEL_ISO.tolerance));
    if (!started) { ctx.moveTo(xOf(p.t), y1); started = true; } else ctx.lineTo(xOf(p.t), y1);
  }
  for (let i = flowHist.length - 1; i >= 0; i--) {
    const p = flowHist[i];
    ctx.lineTo(xOf(p.t), yOf(p.target * (1 - LEVEL_ISO.tolerance)));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(52,211,153,.12)"; ctx.fill();

  ctx.beginPath();
  flowHist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.target); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = "#34d399"; ctx.lineWidth = 2; ctx.stroke();

  ctx.beginPath();
  flowHist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.user); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = l4.inTol ? "#60a5fa" : "#f87171"; ctx.lineWidth = 2; ctx.stroke();

  ctx.font = "12px sans-serif"; ctx.textAlign = "left";
  ctx.fillStyle = "#34d399"; ctx.fillText("● 等速目标流量", 12, 18);
  ctx.fillStyle = "#60a5fa"; ctx.fillText("● 你的采样流量", 130, 18);
  ctx.fillStyle = "#475569";
  ctx.fillText(`${maxV}`, 6, yOf(maxV) + 4); ctx.fillText("L/min", 6, H - 8);
}

/* ---------------- 第五关 · 称量判定 ---------------- */
const l5 = reactive({
  phase: "order" as "order" | "judge",
  queue: [] as string[],
  checked: false,
  orderWrong: 0,
  judgePick: {} as Record<number, string>,
  judgeRevealed: {} as Record<number, boolean>,
  judgeRight: {} as Record<number, boolean>,
});
const l5pool = computed(() => LEVEL4_WEIGH.steps.map((s) => s.id).filter((id) => !l5.queue.includes(id)));
const l5judgeAllDone = computed(() => LEVEL4_WEIGH.judge.every((_, i) => l5.judgeRevealed[i]));

function resetL5() {
  l5.phase = "order"; l5.queue = []; l5.checked = false; l5.orderWrong = 0;
  l5.judgePick = {}; l5.judgeRevealed = {}; l5.judgeRight = {};
  scores.level5 = 0;
}

function checkL5Order() {
  l5.checked = true;
  let right = 0;
  LEVEL4_WEIGH.order.forEach((id, i) => { if (l5.queue[i] === id) right++; });
  l5.orderWrong = LEVEL4_WEIGH.order.length - right;
}

function pickJudge(ji: number, o: { label: string; correct?: boolean }) {
  if (l5.judgeRevealed[ji]) return;
  l5.judgePick[ji] = o.label;
  l5.judgeRevealed[ji] = true;
  l5.judgeRight[ji] = !!o.correct;
  if (o.correct) scores.level5 += 20;
}

function finishLevel5() {
  const orderScore = Math.max(0, 40 - l5.orderWrong * 10);
  scores.level5 += orderScore;
  ratioStars("level5", scores.level5 / (STAGE_META.level5?.max ?? 100));
  enterStage("level6");
}

/* ---------------- 第六关 · 质控报告 ---------------- */
const l6 = reactive({
  phase: "calc" as "calc" | "report",
  answers: { alpha: undefined as number | undefined, cconv: undefined as number | undefined },
  calcChecked: false,
  lines: [] as { id: string; text: string; why: string }[],
  marked: [] as string[],
  reportRevealed: false,
  markedRight: 0,
});

const bothFilled = computed(() =>
  l6.answers.alpha !== undefined && !Number.isNaN(l6.answers.alpha) &&
  l6.answers.cconv !== undefined && !Number.isNaN(l6.answers.cconv)
);

function blankOk(b: (typeof LEVEL6_CALC.blanks)[number]): boolean {
  const v = l6.answers[b.id as "alpha" | "cconv"];
  return v !== undefined && Math.abs(v - b.answer) <= b.tol;
}

function resetL6() {
  l6.phase = "calc";
  l6.answers = { alpha: undefined, cconv: undefined };
  l6.calcChecked = false;
  l6.marked = []; l6.reportRevealed = false; l6.markedRight = 0;
  scores.level6 = 0;
  // 组装报告行：错行+对行，随机洗牌（确定性洗牌即可）
  const errs = LEVEL6_CALC.reportErrors.map((e) => ({ id: e.id, text: e.text, why: e.why }));
  const oks = LEVEL6_CALC.reportOk.map((t, i) => ({ id: "ok" + i, text: t, why: "" }));
  l6.lines = [...errs, ...oks];
  // 固定交错排列，避免每次变化太突兀
  l6.lines = [l6.lines[3], l6.lines[0], l6.lines[4], l6.lines[1], l6.lines[5], l6.lines[2]].filter(Boolean);
}

function checkL6Calc() {
  l6.calcChecked = true;
  LEVEL6_CALC.blanks.forEach((b) => {
    if (blankOk(b)) scores.level6 += 30;
  });
}

function toggleMark(id: string) {
  if (l6.reportRevealed) return;
  const i = l6.marked.indexOf(id);
  if (i >= 0) l6.marked.splice(i, 1);
  else if (l6.marked.length < 3) l6.marked.push(id);
}

function revealReport() {
  l6.reportRevealed = true;
  let right = 0;
  for (const id of l6.marked) {
    if (LEVEL6_CALC.reportErrors.some((e) => e.id === id)) right++;
  }
  l6.markedRight = right;
  scores.level6 += right * 13; // 最多 39 分
  ratioStars("level6", scores.level6 / (STAGE_META.level6?.max ?? 100));
}

function finishLevel6() {
  progress.value.cleared = true;
  if (totalScore.value > progress.value.best) progress.value.best = totalScore.value;
  saveProgress();
  stage.value = "result";
  mode.value = "play";
  loadBoard();
}

/* ---------------- 结算 ---------------- */
const starsText = computed(() => {
  const r = totalScore.value / TOTAL_MAX;
  return r >= 0.85 ? "★★★" : r >= 0.65 ? "★★☆" : r >= 0.4 ? "★☆☆" : "☆☆☆";
});
const bestScoreShown = computed(() => Math.max(progress.value.best, totalScore.value));
const newRecord = computed(() => progress.value.best > 0 && totalScore.value > progress.value.best);

const knowledgeRecap = computed(() => {
  const arr: string[] = [];
  if (scores.level1 < 120) arr.push("测前准备：先清扫采样孔→连气路→堵出口抽负压13kPa→1min降≤0.15kPa为不漏气→零点校准（HJ/T 397 / HJ 1131）；采样管伴热 120~160℃");
  if (scores.level2 < 160) arr.push("排气参数：温度稳定后读数且不得抽出烟道外；皮托管全压孔对气偏差≤10°、断面流速比≤3:1；测氧仪每季度用高纯氮+空气校验 20.9%；干湿球法 15L/min");
  if (scores.level3 < 170) arr.push("布点：D=1.2m 圆形烟道 → 3 等面积环 × 2 垂直采样孔 × 6 点/孔；测点在等面积中心线与直径交点（GB/T 16157 表3）");
  if (scores.level4 < 170) arr.push("等速采样：进入采样嘴气流速度与测点烟气流速相对误差 ≤10%；采样嘴背向插入、正对气流采样，防止倒吸");
  if (scores.level5 < 80) arr.push("HJ 836：称量前后恒温恒湿平衡≥24h、两次称量偏差≤0.20mg；低于全程序空白增重的样品无效；同步双样相对偏差按浓度线性放宽（25−5(C−1)%）");
  if (scores.level6 < 80) arr.push("质控报告：α′=21/(21−XO2)，C=C′·α′/α；标气须在有效期内；≤20mg/m³ 用 HJ 836；紫外法测后示值/系统误差/漂移任一超限→结果无效");
  if (!arr.length) arr.push("全对！六关规范要点都拿捏了，去现场也稳了。");
  return arr;
});

/* ---------------- 排行榜 ---------------- */
const board = ref<{ id: number; username: string; nickname: string; score: number }[]>([]);
const scoreSubmitted = ref(false);
const submitting = ref(false);

async function loadBoard() {
  try {
    const res = await axios.get("/api/game/flue-gas/board");
    board.value = res.data.slice(0, 10);
  } catch { /* 静默 */ }
}

async function submitScore() {
  submitting.value = true;
  try {
    const res = await axios.post("/api/game/flue-gas/score", { score: totalScore.value });
    if (res.data && res.data.ok === false) {
      ElMessage.error(res.data.msg || "提交失败");
      return;
    }
    scoreSubmitted.value = true;
    ElMessage.success("成绩已提交！");
    await loadBoard();
  } catch (e: any) {
    if (e?.response?.status === 401) {
      ElMessage.warning("请先登录再提交成绩");
    } else {
      ElMessage.error("提交失败，稍后再试");
    }
  } finally { submitting.value = false; }
}

/** 从结算"再测一次"回地图 */
function restart(_goStory = true) {
  stage.value = "map";
  scoreSubmitted.value = false;
}

onBeforeUnmount(() => cancelAnimationFrame(rafId));

watch(stage, (v) => {
  if (v === "level3" && mode.value === "play") nextTick(initL3);
  if (v === "level4" && mode.value === "play") nextTick(drawL4);
});
</script>

<style scoped>
.fq-wrap {
  position: relative;
  z-index: 1;
  background: rgba(13, 20, 34, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(120, 150, 210, 0.25);
  border-radius: 18px;
  padding: 20px 22px 26px;
  color: #e2e8f0;
  max-width: 980px;
  margin: 0 auto;
}

/* 顶栏 */
.fq-topbar { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.fq-back {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: 1px solid rgba(140,165,220,.35); color: #94a3b8;
  border-radius: 999px; padding: 5px 12px; font-size: 13px; cursor: pointer;
}
.fq-back:hover { color: #e2e8f0; border-color: #60a5fa; }
.fq-progress { display: flex; gap: 5px; flex: 1; flex-wrap: wrap; }
.fq-pseg {
  font-size: 12px; color: #64748b; padding: 4px 9px; border-radius: 999px;
  border: 1px solid rgba(100,116,139,.3);
}
.fq-pseg.cur { color: #93c5fd; border-color: #3b82f6; background: rgba(59,130,246,.12); }
.fq-pseg.done { color: #34d399; border-color: rgba(52,211,153,.4); }
.fq-scorechip { font-size: 13px; color: #94a3b8; }
.fq-scorechip b { color: #fbbf24; font-size: 16px; margin-left: 4px; }

/* 面板 */
.fq-panel { animation: fqFade .35s ease both; }
@keyframes fqFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* 剧情 */
.story-panel { max-width: 720px; margin: 0 auto; text-align: left; }
.fq-story-art { height: 170px; margin-bottom: 14px; }
.fq-dialog { display: flex; align-items: flex-end; gap: 14px; margin: -34px 0 12px; position: relative; z-index: 7; }
.fq-hero {
  width: 108px; height: 108px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
  border: 3px solid rgba(96, 165, 250, 0.65);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45), 0 0 0 6px rgba(37, 99, 235, 0.12);
  background: #16223d;
}
.fq-bubble {
  flex: 1; background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(120, 150, 210, 0.35);
  border-radius: 4px 14px 14px 14px;
  padding: 10px 16px 12px;
  backdrop-filter: blur(8px);
}
.fq-bubble-name { font-size: 12px; font-weight: 700; color: #93c5fd; margin-bottom: 4px; letter-spacing: 1px; }
.fq-bubble .fq-storytext { min-height: auto; font-size: 14.5px; }
.fq-storytext { font-size: 15.5px; line-height: 1.9; color: #cbd5e1; min-height: 60px; }
.fq-choices { display: flex; flex-direction: column; gap: 10px; margin: 18px 0 6px; }
.fq-choice {
  text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px;
  background: rgba(30,41,59,.6); border: 1px solid rgba(100,116,139,.4); color: #e2e8f0;
  cursor: pointer; transition: all .18s;
}
.fq-choice:hover:not(:disabled) { border-color: #60a5fa; background: rgba(59,130,246,.12); transform: translateX(4px); }
.fq-choice.right { border-color: #34d399; background: rgba(52,211,153,.12); }
.fq-choice.wrong { border-color: #f87171; background: rgba(248,113,113,.1); }
.fq-colopts { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

/* 反馈 */
.fq-feedback {
  margin-top: 14px; padding: 12px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.7;
  background: rgba(248,113,113,.1); border: 1px solid rgba(248,113,113,.35); color: #fca5a5;
}
.fq-feedback.good { background: rgba(52,211,153,.1); border-color: rgba(52,211,153,.35); color: #6ee7b7; }
.fq-fade-enter-active { transition: all .3s ease; }
.fq-fade-enter-from { opacity: 0; transform: translateY(4px); }

.fq-next {
  margin-top: 14px; padding: 10px 22px; border-radius: 999px; font-size: 14px; font-weight: 600;
  background: linear-gradient(135deg, #2563eb, #06b6d4); color: #fff; border: none; cursor: pointer;
  transition: all .18s;
}
.fq-next:disabled { opacity: .45; cursor: not-allowed; }
.fq-next:not(:disabled):hover { filter: brightness(1.12); transform: translateY(-1px); }
.fq-next.ghost { background: none; border: 1px solid rgba(140,165,220,.4); color: #94a3b8; }

/* 关卡头/插画 */
.fq-lv-art { height: 130px; margin-bottom: 14px; }
.fq-lvhead h3 { margin: 0 0 4px; font-size: 17px; color: #f1f5f9; }
.fq-lvhead p { margin: 0 0 14px; font-size: 13px; color: #94a3b8; }

/* 排序玩法 */
.fq-orderlane { margin-bottom: 12px; }
.fq-orderlane-title { font-size: 13px; color: #93c5fd; font-weight: 600; margin-bottom: 8px; }
.fq-orderqueue {
  min-height: 54px; display: flex; flex-direction: column; gap: 6px;
  background: rgba(15,23,42,.5); border: 1.5px dashed rgba(96,165,250,.4);
  border-radius: 12px; padding: 10px;
}
.fq-orderhint { color: #475569; font-size: 13px; text-align: center; padding: 8px; }
.fq-orderpool { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.fq-ordercard {
  text-align: left; padding: 9px 12px; border-radius: 10px; font-size: 13px;
  background: rgba(30,41,59,.7); border: 1px solid rgba(100,116,139,.45); color: #e2e8f0;
  cursor: pointer; transition: all .16s;
}
.fq-ordercard b { color: #fbbf24; margin-right: 6px; }
.fq-ordercard:hover { border-color: #60a5fa; }
.fq-ordercard.ghost { border-style: dashed; }
.fq-ordercard.bad { border-color: #f87171; background: rgba(248,113,113,.12); }
.fq-orderwhy { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.fq-whyrow {
  display: flex; flex-direction: column; gap: 2px; font-size: 12.5px;
  background: rgba(30,41,59,.5); border-radius: 8px; padding: 8px 12px;
}
.fq-whyrow b { color: #cbd5e1; }
.fq-whyrow span { color: #64748b; line-height: 1.6; }

/* 选择题盒 */
.fq-quizbox { margin-bottom: 22px; text-align: left; }
.fq-quiztitle { font-size: 14px; font-weight: 700; color: #93c5fd; margin-bottom: 8px; line-height: 1.7; }
.fq-params { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.fq-param {
  display: flex; justify-content: space-between; font-size: 13px; flex: 1; min-width: 140px;
  background: rgba(30,41,59,.5); border: 1px solid rgba(100,116,139,.3);
  border-radius: 8px; padding: 8px 12px; color: #94a3b8;
}
.fq-param b { color: #e2e8f0; }
.fq-nextrow { text-align: right; margin-top: 6px; }

/* 布点 */
.fq-l1body { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.fq-canvasbox { position: relative; flex-shrink: 0; }
.fq-canvasbox canvas { border-radius: 12px; cursor: crosshair; max-width: 100%; }
.fq-canvas-tip {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: rgba(226,232,240,.75); font-size: 13.5px; pointer-events: none;
  background: rgba(10,16,28,.35);
}
.fq-l1side { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 8px; }
.fq-l1stats { font-size: 13px; color: #fbbf24; }

/* 等速 */
.fq-l3body { display: flex; flex-direction: column; gap: 12px; }
.fq-gaugebox canvas { border-radius: 12px; max-width: 100%; }
.fq-l3read { display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
.fq-gauge { text-align: center; }
.fq-gauge label { display: block; font-size: 12px; color: #64748b; }
.fq-gauge b { font-size: 22px; color: #34d399; font-variant-numeric: tabular-nums; }
.fq-gauge.big b { font-size: 28px; color: #60a5fa; }
.fq-gauge b.danger { color: #f87171; }
.fq-timer { font-size: 15px; color: #fbbf24; font-variant-numeric: tabular-nums; }
.fq-l3ctrl { display: flex; gap: 14px; align-items: center; justify-content: center; }
.fq-l3ctrl input[type="range"] { width: min(420px, 80vw); accent-color: #2563eb; }

/* 计算 */
.fq-blankrow {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: rgba(30,41,59,.5); border: 1px solid rgba(100,116,139,.3);
  border-radius: 10px; padding: 10px 14px; margin-bottom: 10px;
}
.fq-blankrow label { flex: 1; min-width: 240px; font-size: 13.5px; color: #cbd5e1; }
.fq-blankinput { display: flex; align-items: center; gap: 6px; }
.fq-blankinput input {
  width: 110px; padding: 7px 10px; border-radius: 8px; font-size: 14px;
  background: rgba(15,23,42,.8); border: 1px solid rgba(100,116,139,.5); color: #f1f5f9;
}
.fq-blankinput span { font-size: 12.5px; color: #64748b; }
.fq-blankverdict { font-size: 13px; font-weight: 600; }
.fq-blankverdict.ok { color: #34d399; }
.fq-blankverdict.no { color: #f87171; }

/* 报告找错 */
.fq-report { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 4px; }
.fq-reportline {
  text-align: left; padding: 11px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.7;
  background: rgba(30,41,59,.6); border: 1.5px solid rgba(100,116,139,.4); color: #cbd5e1;
  cursor: pointer; transition: all .16s;
}
.fq-reportline:hover:not(:disabled) { border-color: #60a5fa; }
.fq-reportline.marked { border-color: #fbbf24; background: rgba(251,191,36,.1); }
.fq-reportline.err { border-color: #f87171; background: rgba(248,113,113,.12); }
.fq-reportline.okline { border-color: rgba(52,211,153,.4); }

/* 结算 */
.result-panel { text-align: center; }
.fq-resultstars { font-size: 42px; color: #fbbf24; letter-spacing: 8px; text-shadow: 0 2px 12px rgba(251,191,36,.35); }
.fq-resultscore { font-size: 34px; font-weight: 800; color: #f1f5f9; margin: 4px 0 16px; }
.fq-resultscore small { font-size: 15px; color: #64748b; font-weight: 400; }
.fq-bestline { font-size: 13.5px; color: #94a3b8; margin-bottom: 16px; }
.fq-newrec {
  display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px;
  font-size: 10.5px; font-weight: 800; letter-spacing: 1px;
  color: #fde047; background: rgba(253, 224, 71, 0.14); border: 1px solid rgba(253, 224, 71, 0.5);
  animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.fq-breakdown { max-width: 400px; margin: 0 auto 18px; display: flex; flex-direction: column; gap: 6px; }
.fq-brow {
  display: flex; justify-content: space-between; font-size: 13.5px;
  background: rgba(30,41,59,.5); border-radius: 8px; padding: 8px 14px; color: #94a3b8;
}
.fq-brow b { color: #e2e8f0; }
.fq-knowledge { max-width: 560px; margin: 0 auto 18px; text-align: left; }
.fq-ktit { font-size: 14px; font-weight: 700; color: #93c5fd; margin-bottom: 8px; }
.fq-knowledge ul { margin: 0; padding-left: 18px; color: #a5b4c8; font-size: 13px; line-height: 1.8; }
.fq-actions { display: flex; gap: 12px; justify-content: center; align-items: center; margin-bottom: 20px; }
.fq-submitted { color: #34d399; font-size: 14px; }
.fq-board { max-width: 360px; margin: 0 auto; text-align: left; }

/* 地图阶段 */
.fq-mapstage { animation: fqFade .35s ease both; }
.fq-map-actions { display: flex; gap: 12px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
.fq-map-best { text-align: center; margin-top: 12px; font-size: 13px; color: #fbbf24; }
</style>
