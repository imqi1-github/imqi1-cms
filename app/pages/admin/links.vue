<script setup lang="ts">
import type { CsrfResponse } from "~/types/apis/admin/categories";
import type { LinkItem } from "~/types/apis/admin/links";

const toast = useToast();
const { confirm } = useConfirm();
const loading = ref(true);
const links = ref<LinkItem[]>([]);
const showAddModal = ref(false);
const showEditModal = ref(false);
const newLink = ref({ name: "", link: "", desc: "", avatar: "" });
const editingLink = ref<LinkItem | null>(null);
const editLinkForm = ref({ name: "", link: "", desc: "", avatar: "" });
const csrfToken = ref("");

async function fetchLinks() {
  loading.value = true;
  try {
    const csrfRes = await $fetch<CsrfResponse>("/api/csrf/token", { credentials: "include" });
    if (csrfRes?.data?.token) csrfToken.value = csrfRes.data.token;
    links.value = await $fetch<LinkItem[]>("/api/admin/links");
  } catch (error) {
    console.error("获取友情链接失败:", error);
    links.value = [];
  } finally {
    loading.value = false;
  }
}

async function addLink() {
  try {
    await $fetch("/api/admin/links", {
      method: "POST",
      body: { ...newLink.value, csrfToken: csrfToken.value },
    });
    newLink.value = { name: "", link: "", desc: "", avatar: "" };
    showAddModal.value = false;
    toast.success({
      message: "添加成功",
    });
    await fetchLinks();
  } catch (error) {
    console.error("添加失败:", error);
    toast.error({
      message: "添加失败",
    });
  }
}

async function toggleEnabled(link: LinkItem) {
  try {
    await $fetch(`/api/admin/links/${link.id}/toggle`, {
      method: "PATCH",
      body: { csrfToken: csrfToken.value },
    });
    toast.success({
      message: link.enabled ? "已禁用" : "已启用",
    });
    await fetchLinks();
  } catch (error) {
    console.error("操作失败:", error);
    toast.error({
      message: "操作失败",
    });
  }
}

function openEditModal(link: LinkItem) {
  editingLink.value = link;
  editLinkForm.value = {
    name: link.name || "",
    link: link.link || "",
    desc: link.desc || "",
    avatar: link.avatar || "",
  };
  showEditModal.value = true;
}

async function saveEdit() {
  if (!editingLink.value) return;
  try {
    await $fetch(`/api/admin/links/${editingLink.value.id}`, {
      method: "PATCH",
      body: { ...editLinkForm.value, csrfToken: csrfToken.value },
    });
    showEditModal.value = false;
    toast.success({
      message: "更新成功",
    });
    await fetchLinks();
  } catch (error) {
    console.error("更新失败:", error);
    toast.error({
      message: "更新失败",
    });
  }
}

async function deleteLink(id: number) {
  const confirmed = await confirm({
    title: "删除友链",
    description: "确定要删除这个链接吗？",
    variant: "destructive",
    confirmText: "确认删除",
    icon: "lucide:trash-2",
  });
  if (confirmed) {
    try {
      await $fetch(`/api/admin/links/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken.value },
      });
      toast.success({
        message: "删除成功",
      });
      await fetchLinks();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error({
        message: "删除失败",
      });
    }
  }
}

async function approveModification(link: LinkItem, approve: boolean) {
  const action = approve ? "批准" : "拒绝";
  const confirmed = approve
    ? await confirm({
        title: "批准友链修改",
        description: `确定要批准此修改吗？\n\n原友链"${link.originalLink?.name}"将被更新为新信息。`,
        confirmText: "确认批准",
        icon: "lucide:check",
      })
    : await confirm({
        title: "拒绝友链修改",
        description: "确定要拒绝此修改申请吗？",
        variant: "destructive",
        confirmText: "确认拒绝",
        icon: "lucide:x",
      });

  if (confirmed) {
    try {
      await $fetch(`/api/admin/links/${link.id}/approve-modification`, {
        method: "PATCH",
        body: { action: approve ? "approve" : "reject", csrfToken: csrfToken.value },
      });
      toast.success({
        message: approve ? "已批准修改" : "已拒绝修改",
      });
      await fetchLinks();
    } catch (error) {
      console.error(`${action}失败:`, error);
      toast.error({
        message: `${action}失败`,
      });
    }
  }
}

onMounted(() => {
  fetchLinks();
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">友情链接</h2>
        <p class="text-sm text-muted-foreground mt-1">管理友情链接</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        添加链接
      </Button>
    </div>

    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>链接</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>状态</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell>
                <div class="flex items-center gap-3">
                  <div class="size-8 bg-muted rounded-full animate-pulse" />
                  <div class="h-4 bg-muted rounded w-24 animate-pulse" />
                </div>
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-36 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-48 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-6 bg-muted rounded w-12 animate-pulse" />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <div class="h-8 bg-muted rounded w-12 animate-pulse" />
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                  <div class="size-8 bg-muted rounded-lg animate-pulse" />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- 数据列表 - 桌面端表格 -->
      <Table v-else class="hidden lg:table">
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>链接</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>状态</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="link in links" :key="link.id" :class="{ 'bg-amber-50 dark:bg-amber-950/20': link.isModification }">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="size-8">
                  <AvatarImage v-if="link.avatar" :src="link.avatar" />
                  <AvatarFallback>{{ link.name?.charAt(0) || "?" }}</AvatarFallback>
                </Avatar>
                <div class="flex flex-col">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ link.name }}</span>
                    <Badge v-if="link.isModification" variant="outline" class="text-xs"> 修改申请 </Badge>
                  </div>
                  <div v-if="link.isModification && link.originalLink" class="text-xs text-muted-foreground">替代: {{ link.originalLink.name }}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <a :href="link.link" target="_blank" class="text-primary hover:underline truncate block max-w-50">
                {{ link.link }}
              </a>
              <div v-if="link.isModification && link.originalLink" class="text-xs text-muted-foreground mt-1">
                原链接: {{ link.originalLink.link }}
              </div>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ link.desc || "-" }}</TableCell>
            <TableCell>
              <div class="flex items-center gap-2">
                <Badge :variant="link.enabled ? 'default' : 'secondary'">
                  {{ link.enabled ? "启用" : "禁用" }}
                </Badge>
                <Badge v-if="link.isModification" variant="secondary" class="text-xs">
                  {{ link.modificationStatus === "pending" ? "待审核" : link.modificationStatus === "approved" ? "已批准" : "已拒绝" }}
                </Badge>
              </div>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <template v-if="link.isModification && link.modificationStatus === 'pending'">
                  <Button variant="outline" size="sm" class="text-green-600 hover:text-green-700" @click="approveModification(link, true)">
                    <Icon name="lucide:check" class="size-4 mr-1" />
                    批准
                  </Button>
                  <Button variant="outline" size="sm" class="text-red-600 hover:text-red-700" @click="approveModification(link, false)">
                    <Icon name="lucide:x" class="size-4 mr-1" />
                    拒绝
                  </Button>
                </template>
                <template v-else>
                  <Button variant="outline" size="sm" @click="toggleEnabled(link)">
                    {{ link.enabled ? "禁用" : "启用" }}
                  </Button>
                  <Button variant="ghost" size="icon" class="size-8" @click="openEditModal(link)">
                    <Icon name="lucide:pencil" class="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteLink(link.id)">
                    <Icon name="lucide:trash-2" class="size-4" />
                  </Button>
                </template>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 加载状态 - 移动端卡片 -->
      <div v-if="loading" class="p-4 lg:hidden space-y-4">
        <div v-for="i in 5" :key="i" class="border rounded-lg p-4 space-y-3">
          <div class="flex items-center gap-3">
            <div class="size-8 bg-muted rounded-full animate-pulse" />
            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
          </div>
          <div class="space-y-2">
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div class="h-4 bg-muted rounded w-1/2 animate-pulse" />
          </div>
          <div class="flex gap-2">
            <div class="h-8 bg-muted rounded w-12 animate-pulse" />
            <div class="size-8 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="p-4 lg:hidden space-y-4">
        <div
          v-for="link in links"
          :key="link.id"
          :class="{ 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800': link.isModification }"
          class="border rounded-lg p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Avatar class="size-8">
              <AvatarImage v-if="link.avatar" :src="link.avatar" />
              <AvatarFallback class="text-xs">{{ link.name?.charAt(0) || "?" }}</AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-base truncate">{{ link.name }}</h3>
                <Badge v-if="link.isModification" variant="outline" class="text-xs"> 修改申请 </Badge>
              </div>
              <a :href="link.link" target="_blank" class="text-xs text-primary hover:underline truncate block">
                {{ link.link }}
              </a>
              <div v-if="link.isModification && link.originalLink" class="text-xs text-muted-foreground">替代: {{ link.originalLink.name }}</div>
            </div>
          </div>

          <p class="text-sm text-muted-foreground">{{ link.desc || "暂无描述" }}</p>

          <div class="flex items-center gap-2 flex-wrap">
            <Badge :variant="link.enabled ? 'default' : 'secondary'" class="text-xs">
              {{ link.enabled ? "启用" : "禁用" }}
            </Badge>
            <Badge v-if="link.isModification" variant="secondary" class="text-xs">
              {{ link.modificationStatus === "pending" ? "待审核" : link.modificationStatus === "approved" ? "已批准" : "已拒绝" }}
            </Badge>
          </div>

          <div class="flex items-center justify-end pt-2 border-t gap-1">
            <template v-if="link.isModification && link.modificationStatus === 'pending'">
              <Button variant="outline" size="sm" class="text-green-600 hover:text-green-700" @click="approveModification(link, true)">
                <Icon name="lucide:check" class="size-4 mr-1" />
                批准
              </Button>
              <Button variant="outline" size="sm" class="text-red-600 hover:text-red-700" @click="approveModification(link, false)">
                <Icon name="lucide:x" class="size-4 mr-1" />
                拒绝
              </Button>
            </template>
            <template v-else>
              <Button variant="outline" size="sm" @click="toggleEnabled(link)">
                {{ link.enabled ? "禁用" : "启用" }}
              </Button>
              <Button variant="ghost" size="icon" class="size-8" @click="openEditModal(link)">
                <Icon name="lucide:pencil" class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteLink(link.id)">
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </template>
          </div>
        </div>
      </div>

      <div v-if="links.length === 0 && !loading" class="text-center py-12">
        <Icon name="lucide:link" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无友情链接</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          添加第一个链接
        </Button>
      </div>
    </Card>

    <!-- 添加链接弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加友情链接</DialogTitle>
          <DialogDescription>添加一个新的友情链接</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addLink">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="linkName">名称</Label>
              <Input id="linkName" v-model="newLink.name" placeholder="网站名称" required />
            </div>
            <div class="space-y-2">
              <Label for="linkUrl">链接</Label>
              <Input id="linkUrl" v-model="newLink.link" type="url" placeholder="https://example.com" required />
            </div>
            <div class="space-y-2">
              <Label for="linkDesc">描述</Label>
              <Input id="linkDesc" v-model="newLink.desc" placeholder="网站描述" />
            </div>
            <div class="space-y-2">
              <Label for="linkAvatar">头像 URL</Label>
              <Input id="linkAvatar" v-model="newLink.avatar" type="url" placeholder="https://example.com/avatar.png" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showAddModal = false"> 取消 </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- 编辑链接弹窗 -->
    <Dialog v-model:open="showEditModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑友情链接</DialogTitle>
          <DialogDescription>修改友情链接信息</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="saveEdit">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="editLinkName">名称</Label>
              <Input id="editLinkName" v-model="editLinkForm.name" placeholder="网站名称" required />
            </div>
            <div class="space-y-2">
              <Label for="editLinkUrl">链接</Label>
              <Input id="editLinkUrl" v-model="editLinkForm.link" type="url" placeholder="https://example.com" required />
            </div>
            <div class="space-y-2">
              <Label for="editLinkDesc">描述</Label>
              <Input id="editLinkDesc" v-model="editLinkForm.desc" placeholder="网站描述" />
            </div>
            <div class="space-y-2">
              <Label for="editLinkAvatar">头像 URL</Label>
              <Input id="editLinkAvatar" v-model="editLinkForm.avatar" type="url" placeholder="https://example.com/avatar.png" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showEditModal = false"> 取消 </Button>
            <Button type="submit">
              <Icon name="lucide:save" class="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
