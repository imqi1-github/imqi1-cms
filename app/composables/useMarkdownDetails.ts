import { onMounted } from "vue";

export function useMarkdownDetails() {
  onMounted(() => {
    // 查找所有折叠容器
    const wrappers = document.querySelectorAll(".markdown-details-wrapper");

    wrappers.forEach(wrapper => {
      const summary = wrapper.getAttribute("data-summary") || "点击展开/收起";
      const content = wrapper.innerHTML;

      // 创建新的容器元素
      const detailsContainer = document.createElement("div");
      detailsContainer.className = "markdown-details-container";
      detailsContainer.innerHTML = `
        <div class="markdown-details my-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            class="markdown-details-summary w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
            <span class="font-medium text-slate-900 dark:text-slate-100">${summary}</span>
            <span class="transform transition-transform duration-200 text-slate-500 dark:text-slate-400 text-[10px]">
              ▼
            </span>
          </button>
          <div class="markdown-details-content px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 hidden">
            ${content}
          </div>
        </div>
      `;

      // 替换原容器
      wrapper.replaceWith(detailsContainer);

      // 添加点击事件
      const button = detailsContainer.querySelector(".markdown-details-summary");
      const contentDiv = detailsContainer.querySelector(".markdown-details-content");
      const arrow = button?.querySelector(".transform");

      button?.addEventListener("click", () => {
        const isHidden = contentDiv?.classList.contains("hidden");
        if (isHidden) {
          contentDiv?.classList.remove("hidden");
          arrow?.classList.add("rotate-180");
        } else {
          contentDiv?.classList.add("hidden");
          arrow?.classList.remove("rotate-180");
        }
      });
    });
  });
}
