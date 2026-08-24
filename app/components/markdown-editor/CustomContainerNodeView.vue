<script setup lang="ts">
/**
 * CustomContainer 节点的可视化 NodeView。
 *
 * 不可编辑（contenteditable=false）的占位块：展示容器图标 + 类型标签 + 截断原文，
 * 提供「编辑源码」（弹窗改 raw）与「删除」两个操作。raw 是唯一事实来源，
 * 改动后 meta/type 均由 raw 重算（meta 里 deriveContainerType 刷新图标/标签，不再单独写 type 属性）。
 */
import { computed, ref, watch } from "vue";
import { NodeViewWrapper, nodeViewProps } from "@tiptap/vue-3";

import {
  CONTAINER_META,
  UNKNOWN_CONTAINER_META,
  deriveCalloutVariant,
} from "./containerMeta";

import { deriveContainerType } from "~/utils/markdownSplit";
import type { ContainerMeta } from "~/types/markdown-editor";

const props = defineProps(nodeViewProps);

const meta = computed(() => {
  const type = deriveContainerType(props.node.attrs.raw);
  if (!type) return UNKNOWN_CONTAINER_META;
  // type 来自正则捕获，可能是 CONTAINER_META 里没有的任意标识符（用户手改坏的语法，
  // 如 `:::github`、`:::xyz`）。Record<ContainerType> 的类型断言骗过了 TS，运行时
  // 越界访问得到 undefined，会让模板里 meta.icon 抛 TypeError → NodeView 白屏崩溃。
  // 这里显式按可能为 undefined 取，未知类型一律回退兜底展示。
  return (CONTAINER_META as Record<string, ContainerMeta | undefined>)[type] ?? UNKNOWN_CONTAINER_META;
});

const calloutVariant = computed(() => deriveCalloutVariant(props.node.attrs.raw));

// callout 四种变体的强调色（图标 + 左边框）。非 callout 用默认主题色。
const variantClass = computed(() => {
  switch (calloutVariant.value) {
    case "success":
      return "text-green-600 dark:text-green-400 border-green-500/40";
    case "warning":
      return "text-yellow-600 dark:text-yellow-400 border-yellow-500/40";
    case "error":
      return "text-red-600 dark:text-red-400 border-red-500/40";
    case "info":
      return "text-blue-600 dark:text-blue-400 border-blue-500/40";
    default:
      return "text-muted-foreground border-border";
  }
});

// 原文预览：取头一两行，超长截断。
const rawPreview = computed(() => {
  const raw: string = props.node.attrs.raw;
  const firstLine = raw.split("\n")[0] ?? "";
  const lineCount = raw.split("\n").length;
  const head = firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
  return lineCount > 1 ? `${head}  （共 ${lineCount} 行）` : head;
});

// 编辑源码弹窗
const dialogOpen = ref(false);
const editingRaw = ref("");

// reka Dialog 关闭时会把焦点恢复到 .ProseMirror 内的元素，浏览器随即将编辑区滚到该焦点
// （光标在文档顶部）→ 关闭后编辑区跳到顶部，看着晕。打开时记下滚动位置，关闭后用 rAF
// （滚动发生在同一微任务，rAF 在下次绘制前回调，无可见闪烁）还原原位，save/cancel/ESC
// 三种关闭路径都覆盖，既不跳到元素也不跳到顶部。
const savedScrollTop = ref(0);

function editorScrollEl(): HTMLElement | null {
  return props.editor.view.dom.closest<HTMLElement>(".overflow-auto");
}

function openEditor() {
  editingRaw.value = props.node.attrs.raw;
  savedScrollTop.value = editorScrollEl()?.scrollTop ?? 0;
  dialogOpen.value = true;
}

watch(dialogOpen, (open) => {
  if (open) return;
  requestAnimationFrame(() => {
    const el = editorScrollEl();
    if (el) el.scrollTop = savedScrollTop.value;
  });
});

function saveEdit() {
  const next = editingRaw.value;
  props.updateAttributes({ raw: next });
  dialogOpen.value = false;
}
</script>

<template>
  <NodeViewWrapper as="div" class="my-3 not-prose">
    <div
      class="group relative flex items-start gap-3 rounded-md border-l-2 bg-muted/40 px-3 py-2 text-sm transition-colors"
      :class="[variantClass, selected ? 'ring-2 ring-ring/50' : '']"
    >
      <Icon :name="meta.icon" class="mt-0.5 size-4 shrink-0" />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ meta.label }}</span>
        </div>
        <code class="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{{ rawPreview }}</code>
      </div>

      <div class="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" class="size-7" title="编辑源码" @click="openEditor">
          <Icon name="lucide:pencil" class="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" class="size-7" title="删除" @click="deleteNode">
          <Icon name="lucide:trash-2" class="size-3.5" />
        </Button>
      </div>
    </div>

    <!-- 编辑源码弹窗 -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Icon :name="meta.icon" class="size-4" />
            <span>编辑 {{ meta.label }} 源码</span>
          </DialogTitle>
          <DialogDescription>
            直接修改原始 <code class="font-mono">:::</code> 容器语法，保存后原样写入文章。
          </DialogDescription>
        </DialogHeader>

        <Textarea
          v-model="editingRaw"
          class="min-h-[180px] font-mono text-xs"
          spellcheck="false"
        />

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button @click="saveEdit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </NodeViewWrapper>
</template>
