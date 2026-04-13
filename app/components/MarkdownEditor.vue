<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  postId?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'attachment-updated': []
}>()

const toast = useToast()
const textareaRef = ref<HTMLTextAreaElement>()
const uploading = ref(false)

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

// 处理粘贴事件 - 支持粘贴上传图片
const handlePaste = async (event: ClipboardEvent) => {
  const textarea = textareaRef.value
  if (!textarea) return

  const items = event.clipboardData?.items
  if (!items) return

  // 检查是否有图片
  const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
  if (imageItems.length === 0) return

  // 阻止默认粘贴行为
  event.preventDefault()

  // 检查是否有 postId
  if (!props.postId) {
    toast.error({
      message: '请先保存文章',
      description: '需要先保存文章后才能粘贴上传图片',
    })
    return
  }

  uploading.value = true

  try {
    // 获取光标位置
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = props.modelValue

    // 在光标位置插入上传占位符
    const placeholders: string[] = []
    const insertPositions: number[] = []

    for (let i = 0; i < imageItems.length; i++) {
      const placeholder = `![上传中${i + 1}](uploading...)`
      placeholders.push(placeholder)
      insertPositions.push(start + i)
    }

    // 先插入所有占位符
    let newText = text
    let offset = 0
    placeholders.forEach((placeholder, index) => {
      const pos = start + offset
      newText = newText.slice(0, pos) + placeholder + '\n' + newText.slice(pos)
      offset += placeholder.length + 1
    })

    emit('update:modelValue', newText)

    // 逐个上传图片
    for (let i = 0; i < imageItems.length; i++) {
      const item = imageItems[i]
      const file = item.getAsFile()

      if (!file) continue

      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await $fetch(`/api/attachments/upload?cid=${props.postId}`, {
          method: 'POST',
          body: formData,
        }) as any

        if (res?.success) {
          // 替换占位符为实际的图片链接
          const placeholder = placeholders[i]
          const imageMarkdown = `![${res.data.name}](${res.data.url})`

          // 更新文本，替换占位符
          const currentText = props.modelValue
          const updatedText = currentText.replace(placeholder, imageMarkdown)
          emit('update:modelValue', updatedText)

          // 通知父组件刷新附件列表
          emit('attachment-updated')

          toast.success({
            message: '图片上传成功',
            description: file.name,
          })
        }
      } catch (error) {
        // 上传失败，移除占位符
        const placeholder = placeholders[i]
        const currentText = props.modelValue
        const updatedText = currentText.replace(placeholder + '\n', '')
        emit('update:modelValue', updatedText)

        toast.error({
          message: '图片上传失败',
          description: file.name,
        })
      }
    }
  } finally {
    uploading.value = false
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
  details: () => insertMarkdown(':::details 标题\n', '\n:::\n', '折叠内容'),
  video: () => insertMarkdown(':::video 视频URL\n', '\n:::', ''),
  success: () => insertMarkdown(':::callout success\n', '\n:::\n', '成功消息'),
  warning: () => insertMarkdown(':::callout warning\n', '\n:::\n', '警告消息'),
  error: () => insertMarkdown(':::callout error\n', '\n:::\n', '错误消息'),
  info: () => insertMarkdown(':::callout info\n', '\n:::\n', '信息消息'),
  tooltip: () => insertMarkdown(':::tooltip 解释文本\n', '\n:::', '文本'),
  card: () => insertMarkdown(':::card https://example.com | 标题 | 描述文本 | https://example.com/image.jpg\n', '\n:::', ''),
  swiper: () => insertMarkdown(':::swiper\nhttps://example.com/image1.jpg | 图片标题1\nhttps://example.com/image2.jpg | 图片标题2\nhttps://example.com/image3.jpg | 图片标题3\n:::', ''),
  githubRepo: () => insertMarkdown(':::repo https://github.com/owner/repo\n:::', ''),
  giteeRepo: () => insertMarkdown(':::repo https://gitee.com/owner/repo\n:::', ''),
  musicAuto: () => insertMarkdown(':::music auto https://music.163.com/song?id=347230\n:::', ''),
  musicSong: () => insertMarkdown(':::music song netease 347230\n:::', ''),
  musicPlaylist: () => insertMarkdown(':::music playlist netease 3778678\n:::', ''),
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

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 折叠 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="折叠"
        @click="actions.details"
      >
        <Icon name="lucide:chevrons-up-down" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 视频 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="视频"
        @click="actions.video"
      >
        <Icon name="lucide:video" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 成功提示框 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8 text-green-600 dark:text-green-400"
        title="成功提示框"
        @click="actions.success"
      >
        <Icon name="lucide:check-circle" class="size-4" />
      </Button>

      <!-- 警告提示框 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8 text-yellow-600 dark:text-yellow-400"
        title="警告提示框"
        @click="actions.warning"
      >
        <Icon name="lucide:alert-triangle" class="size-4" />
      </Button>

      <!-- 错误提示框 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8 text-red-600 dark:text-red-400"
        title="错误提示框"
        @click="actions.error"
      >
        <Icon name="lucide:x-circle" class="size-4" />
      </Button>

      <!-- 信息提示框 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8 text-blue-600 dark:text-blue-400"
        title="信息提示框"
        @click="actions.info"
      >
        <Icon name="lucide:info" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 悬浮解释 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="悬浮解释"
        @click="actions.tooltip"
      >
        <Icon name="lucide:help-circle" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 卡片 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="链接卡片"
        @click="actions.card"
      >
        <Icon name="lucide:layout-template" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 轮播图 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="轮播图"
        @click="actions.swiper"
      >
        <Icon name="lucide:images" class="size-4" />
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- GitHub 仓库 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="GitHub 仓库"
        @click="actions.githubRepo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="size-4">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </Button>

      <!-- Gitee 仓库 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="Gitee 仓库"
        @click="actions.giteeRepo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="size-4 text-red-600 dark:text-red-400">
          <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.037a.594.594 0 0 1-.592-.593v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"/>
        </svg>
      </Button>

      <Separator orientation="vertical" class="h-6 mx-1" />

      <!-- 音乐自动识别 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="音乐自动识别"
        @click="actions.musicAuto"
      >
        <Icon name="lucide:disc-3" class="size-4" />
      </Button>

      <!-- 音乐单曲 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="音乐单曲"
        @click="actions.musicSong"
      >
        <Icon name="lucide:music-4" class="size-4" />
      </Button>

      <!-- 音乐列表 -->
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        title="音乐列表"
        @click="actions.musicPlaylist"
      >
        <Icon name="lucide:list-music" class="size-4" />
      </Button>

      <!-- 上传状态指示 -->
      <div v-if="uploading" class="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        <Icon name="lucide:loader-2" class="size-4 animate-spin" />
        <span>上传中...</span>
      </div>
    </div>

    <!-- 文本输入区 -->
    <textarea
      ref="textareaRef"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @paste="handlePaste"
      class="flex-1 w-full p-4 resize-none outline-none font-mono text-sm bg-background"
      placeholder="开始编写你的 Markdown 文章...&#10;&#10;提示：可以直接粘贴图片，会自动上传并插入"
    />
  </div>
</template>

<style scoped>
.markdown-editor {
  min-height: min(800px, calc(100vh - 200px));
}
</style>
