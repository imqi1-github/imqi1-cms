<script setup lang="ts">
import { ref, computed, watch } from "vue";
import MarkdownIt from "markdown-it";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// 判断是新建还是编辑
const isEdit = computed(() => !!route.query.cid);
const pageId = computed(() => (route.query.cid ? Number(route.query.cid) : null));

const loading = ref(false);
const saving = ref(false);

// 表单数据
const title = ref("");
const slug = ref("");
const content = ref("");
const desc = ref("");
const showToc = ref(false);
const status = ref(1); // 0: 草稿, 1: 已发布

// 预览
const previewHtml = ref("");
const showPreview = ref(false);

const md = new MarkdownIt({ html: true });

// 更新预览
watch([content], () => {
  if (content.value) {
    previewHtml.value = md.render(content.value);
  }
});

// 获取页面数据
const fetchPage = async () => {
  if (!pageId.value) return;

  loading.value = true;
  try {
    const res = (await $fetch(`/api/admin/posts/${pageId.value}`)) as any;
    if (res?.data) {
      const page = res.data;
      title.value = page.title || "";
      slug.value = page.slug || "";
      content.value = page.content || "";
      desc.value = page.desc || "";
      showToc.value = page.show_toc || false;
      status.value = page.status ?? 1;

      if (content.value) {
        previewHtml.value = md.render(content.value);
      }
    }
  } catch (error) {
    console.error("获取页面失败:", error);
    toast.error({
      message: "获取页面失败",
    });
  } finally {
    loading.value = false;
  }
};

// 保存页面
const savePage = async (publish = false) => {
  if (!title.value.trim()) {
    toast.error({
      message: "请输入页面标题",
    });
    return;
  }

  saving.value = true;
  try {
    const body = {
      title: title.value.trim(),
      slug: slug.value?.trim() || null,
      content: content.value,
      desc: desc.value,
      show_toc: showToc.value,
      status: publish ? 1 : status.value,
      type: 1, // 1: 页面
    };

    let res;
    if (isEdit.value && pageId.value) {
      // 更新
      res = await $fetch(`/api/admin/posts/${pageId.value}`, {
        method: "PUT",
        body,
      });
    } else {
      // 新建
      res = await $fetch("/api/admin/posts", {
        method: "POST",
        body,
      });
    }

    if (res) {
      toast.success({
        message: isEdit.value ? "页面已更新" : "页面已创建",
      });

      // 如果是新建且成功，跳转到编辑页面
      if (!isEdit.value && (res as any).data?.cid) {
        router.replace(`/admin/pages/edit?cid=${(res as any).data.cid}`);
      } else {
        // 如果是编辑模式，刷新数据
        if (isEdit.value) {
          await fetchPage();
        }
      }
    }
  } catch (error: any) {
    const message = error?.data?.message || error?.message || "保存失败";
    toast.error({
      message,
    });
  } finally {
    saving.value = false;
  }
};

// 取消
const cancel = () => {
  router.push("/admin/pages");
};

// 快捷键
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + S 保存
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    savePage();
  }
};

onMounted(() => {
  fetchPage();
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <AdminLayout>
    <div class="max-w-5xl mx-auto">
      <!-- 页面标题 -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold">{{ isEdit ? "编辑页面" : "新建页面" }}</h2>
          <p class="text-sm text-muted-foreground mt-1">创建和编辑独立页面内容</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" @click="cancel">
            <Icon name="lucide:x" class="mr-2 size-4" />
            取消
          </Button>
          <Button variant="outline" @click="showPreview = !showPreview">
            <Icon name="lucide:eye" class="mr-2 size-4" />
            {{ showPreview ? "编辑" : "预览" }}
          </Button>
          <Button variant="secondary" :disabled="saving" @click="savePage(false)">
            <Icon name="lucide:save" class="mr-2 size-4" />
            {{ saving ? "保存中..." : "保存草稿" }}
          </Button>
          <Button :disabled="saving" @click="savePage(true)">
            <Icon name="lucide:send" class="mr-2 size-4" />
            {{ saving ? "发布中..." : "发布" }}
          </Button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading && isEdit" class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p class="ml-3 text-muted-foreground">加载中...</p>
      </div>

      <!-- 编辑表单 -->
      <div v-else class="space-y-6">
        <!-- 基本信息 -->
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 标题 -->
            <div class="space-y-2">
              <Label for="page-title">页面标题 *</Label>
              <Input
                id="page-title"
                v-model="title"
                placeholder="输入页面标题"
                class="font-medium" />
            </div>

            <!-- Slug -->
            <div class="space-y-2">
              <Label for="page-slug">
                Slug
                <span class="text-muted-foreground font-normal ml-2">(访问路径，留空自动生成)</span>
              </Label>
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground">/page/</span>
                <Input
                  id="page-slug"
                  v-model="slug"
                  placeholder="page-url"
                  class="flex-1 font-mono" />
              </div>
            </div>

            <!-- 描述 -->
            <div class="space-y-2">
              <Label for="page-desc">页面描述</Label>
              <Textarea
                id="page-desc"
                v-model="desc"
                placeholder="简短描述此页面的内容"
                :rows="2" />
            </div>
          </CardContent>
        </Card>

        <!-- 编辑/预览模式 -->
        <Card v-if="!showPreview">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle>页面内容</CardTitle>
            <div class="flex items-center gap-4 text-sm text-muted-foreground">
              <Label class="flex items-center gap-2 cursor-pointer">
                <Checkbox v-model:checked="showToc" />
                显示目录
              </Label>
            </div>
          </CardHeader>
          <CardContent class="pt-4">
            <Textarea
              v-model="content"
              placeholder="支持 Markdown 语法..."
              class="min-h-[400px] font-mono text-sm" />
          </CardContent>
        </Card>

        <!-- 预览模式 -->
        <Card v-else>
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent class="pt-4">
            <div
              class="markdown-body prose prose-slate dark:prose-invert max-w-none"
              v-html="previewHtml || '<p class=\'text-muted-foreground\'>暂无内容</p>'" />
          </CardContent>
        </Card>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  font-weight: 700;
  border-bottom: 1px solid rgb(229 231 235);
  padding-bottom: 0.3em;
  margin-bottom: 0.5em;
}

.dark .markdown-body :deep(h1) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  font-weight: 700;
  border-bottom: 1px solid rgb(229 231 235);
  padding-bottom: 0.3em;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.dark .markdown-body :deep(h2) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
  font-weight: 700;
  margin-top: 1.25em;
  margin-bottom: 0.5em;
}

.markdown-body :deep(p) {
  margin: 1em 0;
}

.markdown-body :deep(a) {
  color: rgb(37 99 235);
  text-decoration: none;
}

.dark .markdown-body :deep(a) {
  color: rgb(96 165 250);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li) {
  margin: 0.5em 0;
  display: list-item;
}

.markdown-body :deep(blockquote) {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}

.dark .markdown-body :deep(blockquote) {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

.markdown-body :deep(code:not(pre code)) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dark .markdown-body :deep(code:not(pre code)) {
  background: rgb(55 65 81);
}

.markdown-body :deep(pre) {
  margin: 1em 0;
  padding: 1em;
  overflow-x: auto;
  background: rgb(246 248 250);
  border-radius: 0.5em;
}

.dark .markdown-body :deep(pre) {
  background: rgb(15 23 42);
}

.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5em;
  margin: 1em 0;
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
}

.markdown-body :deep(table th),
.markdown-body :deep(table td) {
  padding: 0.5em 1em;
  border: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(table th),
.dark .markdown-body :deep(table td) {
  border-color: rgb(55 65 81);
}

.markdown-body :deep(table th) {
  background: rgb(249 250 251);
  font-weight: 600;
}

.dark .markdown-body :deep(table th) {
  background: rgb(31 41 55);
}

.markdown-body :deep(hr) {
  margin: 2em 0;
  border: none;
  border-top: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(hr) {
  border-top-color: rgb(55 65 81);
}
</style>
