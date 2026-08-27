<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { createEditor, createToolbar } from "@wangeditor/editor";
import type { IDomEditor } from "@wangeditor/editor";
import { uploadImage } from "@/api/upload";
import Icon from "@/components/Icon.vue";
import "@wangeditor/editor/dist/css/style.css";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits(["update:modelValue", "autoSummary"]);

const editorRef = ref<IDomEditor>();
const editorContainerRef = ref<HTMLElement>();
const toolbarContainerRef = ref<HTMLElement>();
const isCreated = ref(false);

// 自定义图片上传
function customUpload(file: File, insertFn: (url: string, alt?: string, href?: string) => void) {
  uploadImage(file)
    .then((res) => {
      insertFn(res.data.url, "", "");
    })
    .catch(() => {
      alert("图片上传失败");
    });
}

// 自定义粘贴：保留表格等复杂内容的完整结构
function onBeforePaste(editor: IDomEditor, event: ClipboardEvent) {
  const html = event.clipboardData?.getData("text/html");
  if (html) {
    event.preventDefault();
    editor.dangerouslyInsertHtml(html);
    return false;
  }
  return true;
}

// 生成表格辅助函数
function buildTableHtml(rows: number, cols: number): string {
  let h = '<table style="width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed">';
  h += '<thead><tr>';
  for (let c = 0; c < cols; c++) {
    h += `<th style="background:#f0f4f8;padding:10px 14px;border:1px solid #d0d5e0;text-align:center;font-weight:700;color:#333;min-width:50px;vertical-align:middle">列${c + 1}</th>`;
  }
  h += '</tr></thead><tbody>';
  for (let r = 0; r < rows; r++) {
    h += '<tr>';
    for (let c = 0; c < cols; c++) {
      h += `<td style="padding:9px 14px;border:1px solid #d0d5e0;color:#444;min-width:50px;vertical-align:middle">&nbsp;</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  return h;
}

// 插入表格
function insertTable() {
  const editor = editorRef.value;
  if (!editor) return;
  const tableHtml = buildTableHtml(3, 4);
  editor.dangerouslyInsertHtml(tableHtml);
}

// 在光标处插入列的末尾新增一列（向右扩展）
function addColumnRight() {
  const editor = editorRef.value;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  let td = selection.getRangeAt(0).startContainer as HTMLElement;
  // 向上找 td 或 th
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') {
    td = td.parentElement as HTMLElement;
  }
  if (!td || !td.closest('table')) return;
  const table = td.closest('table') as HTMLTableElement;
  const rowCount = table.rows.length;
  if (rowCount === 0) return;
  const colCount = table.rows[0].cells.length;

  for (let r = 0; r < rowCount; r++) {
    const isHead = r === 0 && table.rows[0].cells[0].tagName === 'TH';
    const cell = table.rows[r].insertCell(colCount);
    cell.innerHTML = '&nbsp;';
    cell.style.cssText = 'padding:9px 14px;border:1px solid #d0d5e0;color:#444;min-width:50px;vertical-align:middle';
    if (isHead) {
      cell.style.cssText += ';background:#f0f4f8;font-weight:700;text-align:center';
      cell.style.fontWeight = '700';
    }
  }
  // 触发 onChange
  (editor as any).change();
}

// 在光标处插入行的末尾新增一行（向下扩展）
function addRowBelow() {
  const editor = editorRef.value;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  let td = selection.getRangeAt(0).startContainer as HTMLElement;
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') {
    td = td.parentElement as HTMLElement;
  }
  if (!td || !td.closest('table')) return;
  const table = td.closest('table') as HTMLTableElement;
  const colCount = table.rows[0].cells.length;
  const tbody = table.querySelector('tbody') || table;
  const newRow = document.createElement('tr');
  for (let c = 0; c < colCount; c++) {
    const cell = document.createElement('td');
    cell.innerHTML = '&nbsp;';
    cell.style.cssText = 'padding:9px 14px;border:1px solid #d0d5e0;color:#444;min-width:50px;vertical-align:middle';
    newRow.appendChild(cell);
  }
  tbody.appendChild(newRow);
  (editor as any).change();
}

// 选中单元格的垂直对齐方式
function applyVerticalAlign(align: 'top' | 'middle' | 'bottom') {
  const editor = editorRef.value;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  let node = selection.getRangeAt(0).startContainer as HTMLElement;
  while (node && node.tagName !== 'TD' && node.tagName !== 'TH') {
    node = node.parentElement as HTMLElement;
  }
  if (!node) return;
  node.style.verticalAlign = align;
  (editor as any).change();
}

// 选中单元格加粗切换
function toggleCellBold() {
  const editor = editorRef.value;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  let node = selection.getRangeAt(0).startContainer as HTMLElement;
  let cell = node;
  while (cell && cell.tagName !== 'TD' && cell.tagName !== 'TH') {
    cell = cell.parentElement as HTMLElement;
  }
  if (!cell) return;
  const span = cell.querySelector('strong, b');
  if (span) {
    const parent = span.parentNode;
    while (span.firstChild) {
      parent?.insertBefore(span.firstChild, span);
    }
    parent?.removeChild(span);
  } else {
    const childNodes = Array.from(cell.childNodes);
    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        const strong = document.createElement('strong');
        strong.style.fontWeight = '700';
        strong.textContent = child.textContent;
        cell.replaceChild(strong, child);
      }
    }
  }
  (editor as any).change();
}

function deleteTable() {
  const editor = editorRef.value;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  let node = selection.getRangeAt(0).startContainer as HTMLElement;
  const table = node.closest ? node.closest('table') : null;
  if (!table) {
    while (node && node.tagName !== 'TABLE') node = node.parentElement as HTMLElement;
    if (!node || node.tagName !== 'TABLE') return;
    node.parentElement?.removeChild(node);
  } else {
    table.parentElement?.removeChild(table);
  }
  (editor as any).change();
}

// 监听内容变化
let isSyncing = false;
watch(
  () => props.modelValue,
  (val) => {
    const editor = editorRef.value;
    if (editor && val && val !== "<p><br></p>" && !isSyncing) {
      isSyncing = true;
      editor.setHtml(val);
      nextTick(() => { isSyncing = false; });
    }
  }
);

onMounted(() => {
  nextTick(() => {
    if (!editorContainerRef.value || !toolbarContainerRef.value) return;

    const editor = createEditor({
      selector: editorContainerRef.value,
      html: props.modelValue,
      config: {
        placeholder: "请输入文章内容...",
        MENU_CONF: {
          uploadImage: {
            customUpload,
            maxFileSize: 10 * 1024 * 1024,
            allowedFileTypes: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
          },
        },
        onChange: (editor: IDomEditor) => {
          const newHtml = editor.getHtml();
          emit("update:modelValue", newHtml);

          const text = editor.getText().trim();
          if (text.length > 0) {
            const summary = text.substring(0, 80).replace(/\n/g, " ");
            emit("autoSummary", summary);
          }
        },
        customPaste: onBeforePaste,
      } as any,
    });

    editorRef.value = editor;

    createToolbar({
      editor,
      selector: toolbarContainerRef.value,
      config: {},
    });

    isCreated.value = true;
  });
});

// 一键排版
function formatArticle() {
  const editor = editorRef.value;
  if (!editor) return;

  let html = editor.getHtml();

  // 1. 段首空两格
  html = html.replace(
    /<p(?![^>]*style=)(?![^>]*class=)/gi,
    '<p style="text-indent:2em;margin-bottom:16px;line-height:1.9;font-size:16px;color:#333"'
  );

  // 2. 图片美化
  html = html.replace(
    /<img([^>]*?)style="([^"]*)"/gi,
    '<img$1style="$2;max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);display:block;margin:20px auto"'
  );
  html = html.replace(
    /<img((?![^>]*style=)[^>]*?)>/gi,
    '<img$1 style="max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);display:block;margin:20px auto">'
  );

  // 3. 各级标题
  html = html.replace(/<h1([^>]*)>/gi, '<h1$1 style="font-size:26px;font-weight:800;text-align:center;margin:32px 0 20px;color:#1a1a1a;border-bottom:3px solid #00ccaa;padding-bottom:14px;letter-spacing:1px">');
  html = html.replace(/<h2([^>]*)>/gi, '<h2$1 style="font-size:20px;font-weight:700;margin:28px 0 14px;padding-left:14px;color:#1a1a1a;border-left:4px solid #00ccaa;line-height:1.5">');
  html = html.replace(/<h3([^>]*)>/gi, '<h3$1 style="font-size:17px;font-weight:700;margin:20px 0 10px;color:#2c3e50;display:flex;align-items:center;gap:6px">');
  html = html.replace(/<h4([^>]*)>/gi, '<h4$1 style="font-size:15px;font-weight:600;margin:16px 0 8px;color:#555;font-style:italic;padding-left:8px;border-left:2px solid #ddd">');

  // 4. 引用块
  html = html.replace(/<blockquote([^>]*)>/gi, '<blockquote$1 style="border-left:4px solid #00ccaa;padding:14px 18px;background:#f0faf6;margin:16px 0;border-radius:0 8px 8px 0;color:#555;font-size:15px;line-height:1.8">');

  // 5. 列表
  html = html.replace(/<li([^>]*)>/gi, '<li$1 style="margin-bottom:8px;line-height:1.8;font-size:16px;color:#333">');

  // 6. 代码块
  html = html.replace(/<pre([^>]*)>/gi, '<pre$1 style="background:#1e293b;color:#e2e8f0;padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.6;margin:16px 0">');

  // 7. 表格美化 — 首行加粗居中，全部垂直居中
  html = html.replace(/<table([^>]*)>/gi, '<table$1 style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;table-layout:fixed"');
  html = html.replace(/<th([^>]*)>/gi, '<th$1 style="background:#f0f4f8;padding:10px 14px;border:1px solid #dde3ed;text-align:center;font-weight:700;color:#333;vertical-align:middle">');
  html = html.replace(/<td([^>]*)>/gi, '<td$1 style="padding:9px 14px;border:1px solid #e8ecf2;color:#444;min-width:50px;vertical-align:middle">');

  // 8. 分隔线
  html = html.replace(/<hr\s*\/?>/gi, '<hr style="border:none;height:1px;background:linear-gradient(to right,transparent,#00ccaa,transparent);margin:24px 0">');

  editor.setHtml(html);
}

onBeforeUnmount(() => {
  const editor = editorRef.value;
  if (editor) editor.destroy();
});
</script>

<template>
  <div class="rich-editor-wrapper">
    <div class="editor-toolbar-extra">
        <div class="table-actions">
          <span class="table-actions-label">表格</span>
          <button class="btn-table" @click="insertTable" title="插入表格（3行×4列）">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
            插入
          </button>
          <button class="btn-table" @click="addColumnRight" title="在当前表格右侧新增一列"><Icon name="plus" :size="14" /> 列</button>
          <button class="btn-table" @click="addRowBelow" title="在当前表格底部新增一行"><Icon name="plus" :size="14" /> 行</button>
          <button class="btn-table btn-table-del" @click="deleteTable" title="删除当前表格"><Icon name="delete" :size="14" /></button>
        </div>
        <div class="table-actions">
          <span class="table-actions-label">单元格</span>
          <button class="btn-table" @click="() => applyVerticalAlign('top')" title="单元格顶端对齐">⬆ 顶</button>
          <button class="btn-table btn-table-active" @click="() => applyVerticalAlign('middle')" title="单元格垂直居中">⟷ 中</button>
          <button class="btn-table" @click="() => applyVerticalAlign('bottom')" title="单元格底端对齐">⬇ 底</button>
          <button class="btn-table" @click="toggleCellBold" title="切换当前单元格加粗">𝐁 加粗</button>
        </div>
      <button class="btn-format" @click="formatArticle" title="一键排版：自动设置段落、标题、图片样式">
        <Icon name="sparkles" :size="14" /> 一键排版
      </button>
    </div>
    <div ref="toolbarContainerRef" class="editor-toolbar"></div>
    <div ref="editorContainerRef" class="editor-content"></div>
  </div>
</template>

<style scoped>
.rich-editor-wrapper {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.editor-toolbar-extra {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #dcdfe6;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.table-actions {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  align-items: center;
}

.table-actions-label {
  font-size: 11px;
  color: #999;
  margin-right: 2px;
  user-select: none;
}

.btn-table {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid #d0d5e0;
  border-radius: 5px;
  background: #fff;
  color: #555;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-table:hover {
  border-color: #00ccaa;
  color: #00aa88;
  background: #f0faf6;
}

.btn-table-del:hover {
  border-color: #e74c3c;
  color: #e74c3c;
  background: #fff5f5;
}

.btn-table-active {
  color: #00aa88;
  border-color: #00ccaa;
  background: #f0faf6;
}
.btn-table-active:hover {
  box-shadow: 0 0 0 1px #00ccaa;
}

.btn-format {
  padding: 6px 16px;
  border: 1px solid #00ccaa;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(0,204,170,0.13), rgba(0,204,170,0.06));
  color: #00aa88;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-format:hover {
  background: linear-gradient(135deg, rgba(0,204,170,0.25), rgba(0,204,170,0.13));
  box-shadow: 0 2px 8px rgba(0, 204, 170, 0.2);
}

.editor-toolbar {
  border-bottom: 1px solid #dcdfe6;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
}

.editor-content {
  min-height: 500px;
  overflow-y: auto;
  flex: 1;
}

/* 编辑器内部表格样式 */
.editor-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 14px;
  table-layout: fixed;
}
.editor-content :deep(td),
.editor-content :deep(th) {
  border: 1px solid #d0d5e0;
  padding: 9px 14px;
  min-width: 50px;
  vertical-align: middle;
}
.editor-content :deep(th) {
  background: #f0f4f8;
  font-weight: 700;
  text-align: center;
}
.editor-content :deep(p) {
  min-height: 1.4em;
}
.editor-content :deep(table + p),
.editor-content :deep(p + table) {
  margin-top: 0;
}
</style>
