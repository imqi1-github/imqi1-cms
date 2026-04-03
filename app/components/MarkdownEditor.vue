<script setup lang="ts">
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaRef = ref<HTMLTextAreaElement>()

// 插入 Markdown 语法
const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '') => {
  const textarea = textareaRef.value
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = props.modelValue

  // 有选中文本
  if (start !== end) {
    const selectedText = text.slice(start, end)
    const newText = text.slice(0, start) + prefix + selectedText + suffix + text.slice(end)
    emit('update:modelValue', newText)
    // 恢复选中状态
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, end + prefix.length)
    })
  }
  // 没有选中文本
  else {
    const insertText = prefix + placeholder + suffix
    const newText = text.slice(0, start) + insertText + text.slice(end)
    emit('update:modelValue', newText)
    // 光标移动到占位符中间
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length)
    })
  }
}

// 工具栏按钮操作
const actions = {
  bold: () => insertMarkdown('**', '**', '粗体文本'),
  italic: () => insertMarkdown('*', '*', '斜体文本'),
  strikethrough: () => insertMarkdown('~~', '~~', '删除线文本'),
  heading1: () => insertMarkdown('# ', '', '标题 1'),
  heading2: () => insertMarkdown('## ', '', '标题 2'),
  heading3: () => insertMarkdown('### ', '', '标题 3'),
  heading4: () => insertMarkdown('#### ', '', '标题 4'),
  heading5: () => insertMarkdown('##### ', '', '标题 5'),
  heading6: () => insertMarkdown('###### ', '', '标题 6'),
  quote: () => insertMarkdown('> ', '', '引用内容'),
  code: () => insertMarkdown('`', '`', '代码'),
  codeBlock: () => insertMarkdown('```\n', '\n```', '代码块'),
  link: () => insertMarkdown('[', '](url)', '链接文本'),
  image: () => insertMarkdown('![', '](url)', '图片描述'),
  ul: () => insertMarkdown('- ', '', '列表项'),
  ol: () => insertMarkdown('1. ', '', '列表项'),
  hr: () => insertMarkdown('\n---\n', '', ''),
  table: () => insertMarkdown(
    '| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |\n',
    '',
    ''
  ),
}
</script>

<template>
  <div class="markdown-editor h-full flex flex-col">
    <!-- 工具栏 -->
    <div class="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
      <!-- 粗体 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="粗体"
        @click="actions.bold"
      >
        <Icon name="lucide:bold" class="size-4" />
      </Button>

      <!-- 斜体 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="斜体"
        @click="actions.italic"
      >
        <Icon name="lucide:italic" class="size-4" />
      </Button>

      <!-- 删除线 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="删除线"
        @click="actions.strikethrough"
      >
        <Icon name="lucide:strikethrough" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 标题 1 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 1"
        @click="actions.heading1"
      >
        <span class="text-sm font-bold">H1</span>
      </Button>

      <!-- 标题 2 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 2"
        @click="actions.heading2"
      >
        <span class="text-sm font-bold">H2</span>
      </Button>

      <!-- 标题 3 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 3"
        @click="actions.heading3"
      >
        <span class="text-sm font-bold">H3</span>
      </Button>

      <!-- 标题 4 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 4"
        @click="actions.heading4"
      >
        <span class="text-sm font-bold">H4</span>
      </Button>

      <!-- 标题 5 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 5"
        @click="actions.heading5"
      >
        <span class="text-sm font-bold">H5</span>
      </Button>

      <!-- 标题 6 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="标题 6"
        @click="actions.heading6"
      >
        <span class="text-sm font-bold">H6</span>
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 引用 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="引用"
        @click="actions.quote"
      >
        <Icon name="lucide:quote" class="size-4" />
      </Button>

      <!-- 代码 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="行内代码"
        @click="actions.code"
      >
        <Icon name="lucide:code" class="size-4" />
      </Button>

      <!-- 代码块 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="代码块"
        @click="actions.codeBlock"
      >
        <Icon name="lucide:file-code" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 链接 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="链接"
        @click="actions.link"
      >
        <Icon name="lucide:link" class="size-4" />
      </Button>

      <!-- 图片 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="图片"
        @click="actions.image"
      >
        <Icon name="lucide:image" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 无序列表 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="无序列表"
        @click="actions.ul"
      >
        <Icon name="lucide:list" class="size-4" />
      </Button>

      <!-- 有序列表 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="有序列表"
        @click="actions.ol"
      >
        <Icon name="lucide:list-ordered" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 分割线 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="分割线"
        @click="actions.hr"
      >
        <Icon name="lucide:minus" class="size-4" />
      </Button>

      <!-- 表格 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="表格"
        @click="actions.table"
      >
        <Icon name="lucide:table" class="size-4" />
      </Button>
    </div>

    <!-- 文本输入区 -->
    <textarea
      ref="textareaRef"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      class="flex-1 w-full p-4 resize-none outline-none font-mono text-sm bg-background"
      placeholder="开始编写你的 Markdown 文章..."
    />
  </div>
</template>

<style scoped>
.markdown-editor {
  min-height: 500px;
}
</style>
