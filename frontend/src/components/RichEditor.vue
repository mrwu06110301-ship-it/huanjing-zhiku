<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { createEditor, createToolbar } from "@wangeditor/editor";
import type { IDomEditor } from "@wangeditor/editor";
import { uploadImage } from "@/api/upload";
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

// 监听内容变化，编辑器创建后同步到编辑器
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

          // 自动提取摘要（前80个字）
          const text = editor.getText().trim();
          if (text.length > 0) {
            const summary = text.substring(0, 80).replace(/\n/g, " ");
            emit("autoSummary", summary);
          }
        },
      },
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

// 一键排版 —— 安全正则方式，图片只加内联样式不包裹 div
function formatArticle() {
  const editor = editorRef.value;
  if (!editor) return;

  let html = editor.getHtml();

  // 1. 段首空两格（仅纯段落，不含已有样式和 class 的）
  html = html.replace(
    /<p(?![^>]*style=)(?![^>]*class=)/gi,
    '<p style="text-indent:2em;margin-bottom:16px;line-height:1.9;font-size:16px;color:#333"'
  );

  // 2. 图片美化 —— 只修改 <img> 标签的内联样式，不包裹 div，不删除图片
  //    用 display:block + margin:auto 实现居中，避免破坏编辑器结构
  html = html.replace(
    /<img([^>]*?)style="([^"]*)"/gi,
    '<img$1style="$2;max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);display:block;margin:20px auto"'
  );
  // 没有 style 属性的 img 标签
  html = html.replace(
    /<img((?![^>]*style=)[^>]*?)>/gi,
    '<img$1 style="max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);display:block;margin:20px auto">'
  );

  // 3. 各级标题优化
  html = html.replace(
    /<h1([^>]*)>/gi,
    '<h1$1 style="font-size:26px;font-weight:800;text-align:center;margin:32px 0 20px;color:#1a1a1a;border-bottom:3px solid #00ccaa;padding-bottom:14px;letter-spacing:1px">'
  );
  html = html.replace(
    /<h2([^>]*)>/gi,
    '<h2$1 style="font-size:20px;font-weight:700;margin:28px 0 14px;padding-left:14px;color:#1a1a1a;border-left:4px solid #00ccaa;line-height:1.5">'
  );
  html = html.replace(
    /<h3([^>]*)>/gi,
    '<h3$1 style="font-size:17px;font-weight:700;margin:20px 0 10px;color:#2c3e50;display:flex;align-items:center;gap:6px">'
  );
  html = html.replace(
    /<h4([^>]*)>/gi,
    '<h4$1 style="font-size:15px;font-weight:600;margin:16px 0 8px;color:#555;font-style:italic;padding-left:8px;border-left:2px solid #ddd">'
  );

  // 4. 引用块
  html = html.replace(
    /<blockquote([^>]*)>/gi,
    '<blockquote$1 style="border-left:4px solid #00ccaa;padding:14px 18px;background:#f0faf6;margin:16px 0;border-radius:0 8px 8px 0;color:#555;font-size:15px;line-height:1.8">'
  );

  // 5. 列表
  html = html.replace(
    /<li([^>]*)>/gi,
    '<li$1 style="margin-bottom:8px;line-height:1.8;font-size:16px;color:#333">'
  );

  // 6. 代码块
  html = html.replace(
    /<pre([^>]*)>/gi,
    '<pre$1 style="background:#1e293b;color:#e2e8f0;padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.6;margin:16px 0">'
  );

  // 7. 表格美化
  html = html.replace(
    /<table([^>]*)>/gi,
    '<table$1 style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">'
  );
  html = html.replace(
    /<th([^>]*)>/gi,
    '<th$1 style="background:#f0f4f8;padding:10px 14px;border:1px solid #dde3ed;text-align:left;font-weight:600;color:#333">'
  );
  html = html.replace(
    /<td([^>]*)>/gi,
    '<td$1 style="padding:9px 14px;border:1px solid #e8ecf2;color:#444">'
  );

  // 8. 分隔线
  html = html.replace(
    /<hr\s*\/?>/gi,
    '<hr style="border:none;height:1px;background:linear-gradient(to right,transparent,#00ccaa,transparent);margin:24px 0">'
  );

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
      <button class="btn-format" @click="formatArticle" title="一键排版：自动设置段落、标题、图片样式">
        ✨ 一键排版
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
  justify-content: flex-end;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #dcdfe6;
  flex-shrink: 0;
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
</style>
