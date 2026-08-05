<script setup lang="ts">
/**
 * MarkdownEditor 的格式 / 表格工具栏。
 *
 * 顶部与底部各渲染一份同一组件（同一组 props），抽出来避免 ~340 行 markup 复制两遍。
 * 表格上下文（activeFlags.table）由父组件随事务刷新，两份工具栏同步在「常规格式」与
 * 「表格行列 / 合并 / 删除」之间切换。链接 / 图片 / 插入表格弹窗仍由父组件持有
 * （actions.link/image/table 是父组件里的闭包，弹窗全局只渲染一次），工具栏本身不含弹窗。
 */
const props = withDefaults(
  defineProps<{
    actions: Record<string, () => unknown>;
    activeFlags: Record<string, boolean>;
    canUndo: boolean;
    canRedo: boolean;
    canMergeCells: boolean;
    canSplitCell: boolean;
    uploading: boolean;
    side?: "top" | "bottom";
  }>(),
  { side: "top" },
);

const rootClass = computed(() => [
  "flex shrink-0 flex-wrap items-center gap-1 bg-muted/30 p-2",
  props.side === "top" ? "border-b" : "border-t",
]);
</script>

<template>
  <div :class="rootClass">
    <!-- 光标在表格内时，整条工具栏切换为表格行列 / 合并 / 删除操作；否则显示常规格式与插入菜单 -->
    <template v-if="activeFlags.table">
      <span class="px-1 text-xs font-medium text-muted-foreground">行</span>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" title="在当前行上方插入一行" @click="actions.tableAddRowBefore">
        <Icon name="lucide:arrow-up" class="size-3.5" />
        上方
      </Button>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" title="在当前行下方插入一行" @click="actions.tableAddRowAfter">
        <Icon name="lucide:arrow-down" class="size-3.5" />
        下方
      </Button>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-destructive" title="删除当前行" @click="actions.tableDeleteRow">
        <Icon name="lucide:trash-2" class="size-3.5" />
        删行
      </Button>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <span class="px-1 text-xs font-medium text-muted-foreground">列</span>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" title="在当前列左侧插入一列" @click="actions.tableAddColumnBefore">
        <Icon name="lucide:arrow-left" class="size-3.5" />
        左侧
      </Button>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" title="在当前列右侧插入一列" @click="actions.tableAddColumnAfter">
        <Icon name="lucide:arrow-right" class="size-3.5" />
        右侧
      </Button>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-destructive" title="删除当前列" @click="actions.tableDeleteColumn">
        <Icon name="lucide:trash-2" class="size-3.5" />
        删列
      </Button>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" title="切换首行表头样式" @click="actions.tableToggleHeaderRow">
        <Icon name="lucide:table" class="size-3.5" />
        表头行
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-xs"
        :disabled="!canMergeCells"
        title="合并选中的多个单元格"
        @click="actions.tableMergeCells"
      >
        <Icon name="lucide:combine" class="size-3.5" />
        合并
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1 px-2 text-xs"
        :disabled="!canSplitCell"
        title="拆分当前单元格"
        @click="actions.tableSplitCell"
      >
        <Icon name="lucide:split" class="size-3.5" />
        拆分
      </Button>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-destructive" title="删除整个表格" @click="actions.tableDelete">
        <Icon name="lucide:trash-2" class="size-3.5" />
        删除表格
      </Button>
    </template>
    <template v-else>
    <Button
      variant="ghost"
      size="icon-sm"
      :disabled="!canUndo"
      title="撤回 (Ctrl+Z)"
      @click="actions.undo"
    >
      <Icon name="lucide:undo" class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      :disabled="!canRedo"
      title="重做 (Ctrl+Y)"
      @click="actions.redo"
    >
      <Icon name="lucide:redo" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button
      :variant="activeFlags.bold ? 'default' : 'ghost'"
      size="icon-sm"
      title="粗体"
      @click="actions.bold"
    >
      <Icon name="lucide:bold" class="size-4" />
    </Button>
    <Button
      :variant="activeFlags.italic ? 'default' : 'ghost'"
      size="icon-sm"
      title="斜体"
      @click="actions.italic"
    >
      <Icon name="lucide:italic" class="size-4" />
    </Button>
    <Button
      :variant="activeFlags.strike ? 'default' : 'ghost'"
      size="icon-sm"
      title="删除线"
      @click="actions.strikethrough"
    >
      <Icon name="lucide:strikethrough" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button
      :variant="activeFlags.h1 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 1"
      @click="actions.heading1"
    >
      <span class="text-sm font-bold">H1</span>
    </Button>
    <Button
      :variant="activeFlags.h2 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 2"
      @click="actions.heading2"
    >
      <span class="text-sm font-bold">H2</span>
    </Button>
    <Button
      :variant="activeFlags.h3 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 3"
      @click="actions.heading3"
    >
      <span class="text-sm font-bold">H3</span>
    </Button>
    <Button
      :variant="activeFlags.h4 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 4"
      @click="actions.heading4"
    >
      <span class="text-sm font-bold">H4</span>
    </Button>
    <Button
      :variant="activeFlags.h5 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 5"
      @click="actions.heading5"
    >
      <span class="text-sm font-bold">H5</span>
    </Button>
    <Button
      :variant="activeFlags.h6 ? 'default' : 'ghost'"
      size="icon-sm"
      title="标题 6"
      @click="actions.heading6"
    >
      <span class="text-sm font-bold">H6</span>
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button
      :variant="activeFlags.blockquote ? 'default' : 'ghost'"
      size="icon-sm"
      title="引用"
      @click="actions.quote"
    >
      <Icon name="lucide:quote" class="size-4" />
    </Button>
    <Button
      :variant="activeFlags.code ? 'default' : 'ghost'"
      size="icon-sm"
      title="行内代码"
      @click="actions.code"
    >
      <Icon name="lucide:code" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="代码块" @click="actions.codeBlock">
      <Icon name="lucide:file-code" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="链接" @click="actions.link">
      <Icon name="lucide:link" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="图片" @click="actions.image">
      <Icon name="lucide:image" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="实况照片" @click="actions.livePhoto">
      <Icon name="lucide:aperture" class="size-4" />
    </Button>
    <Button
      :variant="activeFlags.bulletList ? 'default' : 'ghost'"
      size="icon-sm"
      title="无序列表"
      @click="actions.ul"
    >
      <Icon name="lucide:list" class="size-4" />
    </Button>
    <Button
      :variant="activeFlags.orderedList ? 'default' : 'ghost'"
      size="icon-sm"
      title="有序列表"
      @click="actions.ol"
    >
      <Icon name="lucide:list-ordered" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="分割线" @click="actions.hr">
      <Icon name="lucide:minus" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="表格" @click="actions.table">
      <Icon name="lucide:table" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="折叠" @click="actions.details">
      <Icon name="lucide:chevrons-up-down" class="size-4" />
    </Button>
    <Separator orientation="vertical" class="mx-1 h-6" />
    <Button variant="ghost" size="icon-sm" title="视频" @click="actions.video">
      <Icon name="lucide:video" class="size-4" />
    </Button>
    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button
      variant="ghost"
      size="icon-sm"
      class="text-green-600 dark:text-green-400"
      title="成功提示框"
      @click="actions.success"
    >
      <Icon name="lucide:check-circle" class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-yellow-600 dark:text-yellow-400"
      title="警告提示框"
      @click="actions.warning"
    >
      <Icon name="lucide:alert-triangle" class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-red-600 dark:text-red-400"
      title="错误提示框"
      @click="actions.error"
    >
      <Icon name="lucide:x-circle" class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-blue-600 dark:text-blue-400"
      title="信息提示框"
      @click="actions.info"
    >
      <Icon name="lucide:info" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="链接卡片" @click="actions.card">
      <Icon name="lucide:layout-template" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="简单外链卡片" @click="actions.simpleCard">
      <Icon name="lucide:link-2" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="轮播图" @click="actions.swiper">
      <Icon name="lucide:images" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="瀑布流图片" @click="actions.waterfall">
      <Icon name="lucide:gallery-vertical" class="size-4" />
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="GitHub 仓库" @click="actions.githubRepo">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="size-4"
      >
        <path
          d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
        />
      </svg>
    </Button>
    <Button variant="ghost" size="icon-sm" title="Gitee 仓库" @click="actions.giteeRepo">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="size-4 text-red-600 dark:text-red-400"
      >
        <path
          d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.037a.594.594 0 0 1-.592-.593v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"
        />
      </svg>
    </Button>

    <Separator orientation="vertical" class="mx-1 h-6" />

    <Button variant="ghost" size="icon-sm" title="音乐自动识别" @click="actions.musicAuto">
      <Icon name="lucide:disc-3" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="音乐单曲" @click="actions.musicSong">
      <Icon name="lucide:music-4" class="size-4" />
    </Button>
    <Button variant="ghost" size="icon-sm" title="音乐列表" @click="actions.musicPlaylist">
      <Icon name="lucide:list-music" class="size-4" />
    </Button>
    </template>

    <!-- 上传中指示只在顶部工具栏显示，避免顶/底两份重复 -->
    <div v-if="uploading && side === 'top'" class="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="lucide:loader-2" class="size-4 animate-spin" />
      <span>上传中...</span>
    </div>
  </div>
</template>
