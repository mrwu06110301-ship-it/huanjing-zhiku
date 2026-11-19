<script setup lang="ts">
/**
 * O2sPicker.vue — 基准含氧量选择器（数值 + 行业下拉组合）
 * 数值输入框与下拉分成两部分：下拉选行业带出数值（锁定），选"自定义"后数值可手输。
 */
import { ref, watch, computed } from "vue";
import { O2_BASELINES } from "@/utils/o2-baseline";

const props = defineProps<{ modelValue: number | null }>();
const emit = defineEmits<{ (e: "update:modelValue", v: number | null): void }>();

const options = O2_BASELINES.map((b) => ({ value: b.o2s, label: b.label }));

/** 下拉选中项：行业值 或 "custom" */
const selected = ref<string | number>("");
/** 是否自定义（数值可编辑） */
const isCustom = computed(() => selected.value === "custom");
/** 数值框显示值（自定义时跟随 modelValue） */
const numValue = ref<number | null>(props.modelValue);

// 初始化：若外部值匹配某行业则选中该行业，否则视为自定义
function syncFromProps() {
  const hit = options.find((o) => o.value === props.modelValue);
  if (hit) { selected.value = hit.value; numValue.value = props.modelValue; }
  else if (props.modelValue !== null) { selected.value = "custom"; numValue.value = props.modelValue; }
}
syncFromProps();

watch(() => props.modelValue, (v) => {
  const hit = options.find((o) => o.value === v);
  if (hit) { selected.value = hit.value; numValue.value = v; }
});

/** 下拉切换：行业 → 带出数值并锁定；自定义 → 解锁输入 */
function onSelect(v: string | number) {
  selected.value = v;
  if (v === "custom") {
    numValue.value = props.modelValue; // 保留当前值进入编辑
  } else {
    numValue.value = Number(v);
    emit("update:modelValue", Number(v));
  }
}

/** 自定义数值输入 */
function onNumInput(v: number | null) {
  numValue.value = v;
  if (isCustom.value) emit("update:modelValue", v);
}
</script>

<template>
  <div class="o2s-picker">
    <el-input-number
      :model-value="isCustom ? numValue : (selected !== '' ? Number(selected) : null)"
      :min="0" :max="21" :precision="1" :controls="false"
      :disabled="!isCustom"
      placeholder="选择行业"
      class="o2s-num"
      @update:model-value="onNumInput"
    />
    <el-select
      :model-value="selected"
      placeholder="行业基准"
      class="o2s-sel"
      popper-class="dark-tool-popper"
      @update:model-value="onSelect"
    >
      <el-option v-for="o in options" :key="o.value" :value="o.value" :label="`${o.label} ${o.value}%`" />
      <el-option value="custom" label="自定义" />
    </el-select>
  </div>
</template>

<style scoped>
.o2s-picker { display: flex; gap: 8px; width: 100%; }
.o2s-num { flex: 1; }
.o2s-num :deep(.el-input__inner) { font-weight: 600; color: var(--d-txt, var(--text)); }

/* 暗色工具页内：输入框与下拉深色化（跟随父容器 --d-* 变量） */
.o2s-picker :deep(.el-input__wrapper),
.o2s-picker :deep(.el-select__wrapper) {
  background: var(--d-bg, #fff);
  box-shadow: 0 0 0 1px var(--d-line, #dcdfe6) inset;
  border-radius: 9px;
}
.o2s-picker :deep(.el-select__wrapper.is-focused),
.o2s-picker :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--d-accent, #2563eb) inset, 0 0 0 3px rgba(79, 195, 247, 0.12);
}
.o2s-picker :deep(.el-input__inner),
.o2s-picker :deep(.el-select__placeholder),
.o2s-picker :deep(.el-select__selected-item) {
  color: var(--d-txt, var(--text));
}
.o2s-picker :deep(.el-input__inner::placeholder),
.o2s-picker :deep(.el-select__placeholder.is-transparent) {
  color: #3f4b59; font-size: 13px;
}
.o2s-num.is-disabled :deep(.el-input__inner) {
  background: transparent;
  color: var(--d-accent, var(--primary));
  -webkit-text-fill-color: var(--d-accent, var(--primary));
}
.o2s-sel { flex: 1; }
</style>
