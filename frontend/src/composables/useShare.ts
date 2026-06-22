import { ElMessage } from "element-plus";

/**
 * 分享功能 — 直接复制标题+链接到剪贴板
 */
export function useShare() {
  const pageUrl = () => window.location.href;

  function share(itemTitle?: string, desc?: string) {
    const url = pageUrl();
    const fullText = itemTitle
      ? `${itemTitle}${desc ? '\n' + desc : ''}\n${url}`
      : url;

    try {
      const textarea = document.createElement("textarea");
      textarea.value = fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      ElMessage.success("复制成功！标题和链接已复制到剪贴板");
    } catch {
      ElMessage.warning("复制失败，请手动复制链接");
    }
  }

  return { share };
}
