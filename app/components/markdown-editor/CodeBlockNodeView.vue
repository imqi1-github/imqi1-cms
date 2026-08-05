<script setup lang="ts">
import { computed } from "vue";
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from "@tiptap/vue-3";

const props = defineProps(nodeViewProps);

// null/undefined → 空串（input 显示占位），空串 → null（fence 输出无语言的 ``` ）。
// 纯文本输入：服务端 Shiki 支持的语言远超任何候选表，自由手输最稳，也避免原生
// datalist 在输入框右侧渲染那个去不掉的下拉箭头。
const language = computed<string>({
  get: () => (props.node.attrs.language as string | null) ?? "",
  set: (val) => {
    props.updateAttributes({ language: val.trim() || null });
  },
});
</script>

<template>
  <NodeViewWrapper as="pre" class="code-block-nodeview">
    <!--
      mousedown.stop 阻止 ProseMirror 抢焦点 / 改选区，确保点输入框能聚焦打字；
      data-node-view-wrapper 的 pre 仍匹配 .ProseMirror pre 的全局编辑态样式。
    -->
    <input
      v-model="language"
      class="lang-input"
      type="text"
      placeholder="语言"
      spellcheck="false"
      autocomplete="off"
      title="代码块高亮语言"
      @mousedown.stop
    >
    <NodeViewContent as="code" />
  </NodeViewWrapper>
</template>

<style scoped>
.code-block-nodeview {
  position: relative;
}

/* 右上角浮动的语言输入框；默认低调，hover/聚焦时更明显 */
.lang-input {
  position: absolute;
  top: 0.4em;
  right: 0.5em;
  z-index: 1;
  width: 7em;
  padding: 0.1em 0.4em;
  font-size: 0.75rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: rgb(107 114 128);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  text-align: right;
  outline: none;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.lang-input:hover {
  opacity: 1;
  background: rgb(255 255 255 / 0.7);
}
.lang-input:focus {
  opacity: 1;
  color: rgb(37 99 235);
  background: rgb(255 255 255 / 0.95);
  border-color: rgb(37 99 235);
}
:global(.dark) .lang-input:hover {
  background: rgb(0 0 0 / 0.4);
}
:global(.dark) .lang-input:focus {
  color: rgb(96 165 250);
  background: rgb(0 0 0 / 0.6);
  border-color: rgb(96 165 250);
}
</style>
