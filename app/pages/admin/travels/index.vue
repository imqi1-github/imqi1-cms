<script setup lang="ts">
const toast = useToast();
const loading = ref(true);
const travels = ref<any[]>([]);
const posts = ref<any[]>([]);
const showAddModal = ref(false);
const showEditModal = ref(false);

const defaultForm = () => ({
  name: "",
  longitude: "",
  latitude: "",
  desc: "",
  cover: "",
  cids: [] as string[],
  sort: "0",
});
const newTravel = ref(defaultForm());
const editingTravel = ref<any>(null);
const editTravelForm = ref(defaultForm());
const addPostKeyword = ref("");
const editPostKeyword = ref("");

function filterPosts(keyword: string) {
  const q = keyword.trim().toLowerCase();
  if (!q) return posts.value;
  return posts.value.filter(post => {
    const title = String(post.title || "").toLowerCase();
    const cid = String(post.cid || "");
    return title.includes(q) || cid.includes(q);
  });
}

const filteredAddPosts = computed(() => filterPosts(addPostKeyword.value));
const filteredEditPosts = computed(() => filterPosts(editPostKeyword.value));

function toggleCid(cids: string[], cid: string, checked: boolean) {
  const idx = cids.indexOf(cid);
  if (checked && idx === -1) cids.push(cid);
  else if (!checked && idx !== -1) cids.splice(idx, 1);
}

function postTitles(travel: any) {
  const list = travel.posts ?? [];
  if (!list.length) return "";
  const shown = list
    .slice(0, 2)
    .map((p: any) => p.title)
    .join("、");
  return list.length > 2 ? `${shown} 等${list.length}篇` : shown;
}

async function fetchTravels() {
  loading.value = true;
  try {
    travels.value = (await ($fetch as any)("/api/admin/travels")) as any[];
  } catch (error) {
    console.error("获取旅行地点失败:", error);
    travels.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchPosts() {
  try {
    const res = await ($fetch as any)("/api/admin/posts?pageSize=999");
    posts.value = res?.data ?? [];
  } catch (error) {
    console.error("获取文章列表失败:", error);
    posts.value = [];
  }
}

function validateCoordinates(form: ReturnType<typeof defaultForm>) {
  // 坐标字段经 type=number 输入或地图选择器写入，可能是 number 也可能是 string，统一转字符串再 trim
  const longitude = String(form.longitude ?? "").trim();
  const latitude = String(form.latitude ?? "").trim();

  if (!longitude || !latitude) {
    toast.error({ message: "请填写经纬度" });
    return false;
  }

  const lng = Number(longitude);
  const lat = Number(latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    toast.error({ message: "经纬度格式不正确" });
    return false;
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    toast.error({ message: "经纬度范围不正确" });
    return false;
  }

  return true;
}

function buildPayload(form: ReturnType<typeof defaultForm>) {
  return {
    name: form.name,
    desc: form.desc,
    cover: form.cover,
    cids: form.cids.map(Number),
    longitude: Number(form.longitude),
    latitude: Number(form.latitude),
    sort: Number(form.sort) || 0,
    enabled: true,
  };
}

async function addTravel() {
  if (!newTravel.value.name.trim()) {
    toast.error({ message: "请填写名称" });
    return;
  }
  if (!validateCoordinates(newTravel.value)) {
    return;
  }
  try {
    await $fetch("/api/admin/travels", {
      method: "POST",
      body: buildPayload(newTravel.value),
    });
    newTravel.value = defaultForm();
    addPostKeyword.value = "";
    showAddModal.value = false;
    toast.success({ message: "添加成功" });
    await fetchTravels();
  } catch (error) {
    console.error("添加失败:", error);
    toast.error({ message: "添加失败" });
  }
}

function openEditModal(travel: any) {
  editPostKeyword.value = "";
  editingTravel.value = travel;
  editTravelForm.value = {
    name: travel.name || "",
    longitude: String(travel.longitude ?? ""),
    latitude: String(travel.latitude ?? ""),
    desc: travel.desc || "",
    cover: travel.cover || "",
    cids: (travel.cids ?? []).map((c: number) => String(c)),
    sort: String(travel.sort ?? 0),
  };
  showEditModal.value = true;
}

async function saveEdit() {
  if (!editingTravel.value) return;
  if (!editTravelForm.value.name.trim()) {
    toast.error({ message: "请填写名称" });
    return;
  }
  if (!validateCoordinates(editTravelForm.value)) {
    return;
  }
  try {
    await $fetch(`/api/admin/travels/${editingTravel.value.id}`, {
      method: "PUT",
      body: buildPayload(editTravelForm.value),
    });
    showEditModal.value = false;
    toast.success({ message: "更新成功" });
    await fetchTravels();
  } catch (error) {
    console.error("更新失败:", error);
    toast.error({ message: "更新失败" });
  }
}

async function toggleEnabled(travel: any) {
  try {
    await $fetch(`/api/admin/travels/${travel.id}`, {
      method: "PUT",
      body: {
        name: travel.name,
        desc: travel.desc,
        cover: travel.cover,
        longitude: travel.longitude,
        latitude: travel.latitude,
        sort: travel.sort,
        enabled: !travel.enabled,
      },
    });
    toast.success({ message: travel.enabled ? "已禁用" : "已启用" });
    await fetchTravels();
  } catch (error) {
    console.error("操作失败:", error);
    toast.error({ message: "操作失败" });
  }
}

async function deleteTravel(id: number) {
  const confirmed = confirm("确定要删除这个旅行地点吗？");
  if (confirmed) {
    try {
      await $fetch(`/api/admin/travels/${id}`, { method: "DELETE" });
      toast.success({ message: "删除成功" });
      await fetchTravels();
    } catch (error) {
      console.error("删除失败:", error);
      toast.error({ message: "删除失败" });
    }
  }
}

function formatCoord(travel: any) {
  const lng = Number(travel.longitude);
  const lat = Number(travel.latitude);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return "-";
  return `${lng.toFixed(4)}, ${lat.toFixed(4)}`;
}

onMounted(() => {
  fetchTravels();
  fetchPosts();
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">旅行地点</h2>
        <p class="text-sm text-muted-foreground mt-1">管理旅行地图上的地点（名称、坐标、关联文章、封面）</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        添加地点
      </Button>
    </div>

    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>坐标</TableHead>
              <TableHead>关联文章</TableHead>
              <TableHead>排序</TableHead>
              <TableHead>状态</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="i in 5" :key="i">
              <TableCell><div class="h-4 bg-muted rounded w-24 animate-pulse" /></TableCell>
              <TableCell><div class="h-4 bg-muted rounded w-32 animate-pulse" /></TableCell>
              <TableCell><div class="h-4 bg-muted rounded w-36 animate-pulse" /></TableCell>
              <TableCell><div class="h-4 bg-muted rounded w-10 animate-pulse" /></TableCell>
              <TableCell><div class="h-6 bg-muted rounded w-12 animate-pulse" /></TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <div class="h-8 bg-muted rounded w-12 animate-pulse" />
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
            <TableHead>坐标</TableHead>
            <TableHead>关联文章</TableHead>
            <TableHead>排序</TableHead>
            <TableHead>状态</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="travel in travels" :key="travel.id">
            <TableCell>
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  <img v-if="travel.cover" :src="travel.cover" :alt="travel.name" class="w-full h-full object-cover" />
                  <Icon v-else name="lucide:map-pin" class="size-4 text-muted-foreground" />
                </div>
                <div class="flex flex-col">
                  <span class="font-medium">{{ travel.name }}</span>
                  <span class="text-xs text-muted-foreground">ID: {{ travel.id }}</span>
                </div>
              </div>
            </TableCell>
            <TableCell class="text-muted-foreground font-mono text-xs">{{ formatCoord(travel) }}</TableCell>
            <TableCell>
              <span v-if="(travel.posts ?? []).length" class="text-primary truncate block max-w-50" :title="postTitles(travel)">{{
                postTitles(travel)
              }}</span>
              <span v-else class="text-muted-foreground">-</span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ travel.sort ?? 0 }}</TableCell>
            <TableCell>
              <Badge :variant="travel.enabled ? 'default' : 'secondary'">
                {{ travel.enabled ? "启用" : "禁用" }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" @click="toggleEnabled(travel)">
                  {{ travel.enabled ? "禁用" : "启用" }}
                </Button>
                <Button variant="ghost" size="icon" class="size-8" @click="openEditModal(travel)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteTravel(travel.id)">
                  <Icon name="lucide:trash-2" class="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- 加载状态 - 移动端卡片 -->
      <div v-if="loading" class="p-4 lg:hidden space-y-4">
        <div v-for="i in 5" :key="i" class="border rounded-lg p-4 space-y-3">
          <div class="h-4 bg-muted rounded w-24 animate-pulse" />
          <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div class="flex gap-2">
            <div class="h-8 bg-muted rounded w-12 animate-pulse" />
            <div class="size-8 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="p-4 lg:hidden space-y-4">
        <div v-for="travel in travels" :key="travel.id" class="border rounded-lg p-4 space-y-3">
          <div class="flex items-center gap-3">
            <div class="size-8 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
              <img v-if="travel.cover" :src="travel.cover" :alt="travel.name" class="w-full h-full object-cover" />
              <Icon v-else name="lucide:map-pin" class="size-4 text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-base truncate">{{ travel.name }}</h3>
              <p class="text-xs text-muted-foreground font-mono">{{ formatCoord(travel) }}</p>
            </div>
            <Badge :variant="travel.enabled ? 'default' : 'secondary'" class="text-xs shrink-0">
              {{ travel.enabled ? "启用" : "禁用" }}
            </Badge>
          </div>

          <p v-if="(travel.posts ?? []).length" class="text-sm text-primary truncate">📄 {{ postTitles(travel) }}</p>
          <p v-if="travel.desc" class="text-sm text-muted-foreground line-clamp-2">{{ travel.desc }}</p>

          <div class="flex items-center justify-end pt-2 border-t gap-1">
            <Button variant="outline" size="sm" @click="toggleEnabled(travel)">
              {{ travel.enabled ? "禁用" : "启用" }}
            </Button>
            <Button variant="ghost" size="icon" class="size-8" @click="openEditModal(travel)">
              <Icon name="lucide:pencil" class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8 text-destructive hover:text-destructive" @click="deleteTravel(travel.id)">
              <Icon name="lucide:trash-2" class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div v-if="travels.length === 0 && !loading" class="text-center py-12">
        <Icon name="lucide:map-pin" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无旅行地点</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          添加第一个地点
        </Button>
      </div>
    </Card>

    <!-- 添加地点弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 max-w-4xl! sm:p-6">
        <DialogHeader>
          <DialogTitle>添加旅行地点</DialogTitle>
          <DialogDescription>点击地图或拖动标记选择坐标，也可以手动输入。</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addTravel">
          <div class="space-y-3 py-3 sm:space-y-4 sm:py-4">
            <div class="space-y-2">
              <Label for="travelName">名称</Label>
              <Input id="travelName" v-model="newTravel.name" placeholder="如：沈阳故宫" required />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="travelLng">经度</Label>
                <Input id="travelLng" v-model="newTravel.longitude" type="number" step="0.000001" placeholder="116.3974" required />
              </div>
              <div class="space-y-2">
                <Label for="travelLat">纬度</Label>
                <Input id="travelLat" v-model="newTravel.latitude" type="number" step="0.000001" placeholder="39.9092" required />
              </div>
            </div>
            <!-- 地图选点 + 关联文章 左右并排，降低弹窗整体高度 -->
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <Label>地图选点</Label>
                <ClientOnly>
                  <AdminTravelCoordinatePicker v-model:longitude="newTravel.longitude" v-model:latitude="newTravel.latitude" />
                  <template #fallback>
                    <div class="h-48 rounded-md bg-muted animate-pulse sm:h-72" />
                  </template>
                </ClientOnly>
              </div>
              <div class="space-y-2">
                <Label>关联文章</Label>
                <div class="rounded-md border">
                  <div class="border-b p-2">
                    <Input v-model="addPostKeyword" placeholder="搜索文章标题或 ID" class="h-8" />
                  </div>
                  <div class="max-h-44 overflow-y-auto p-2 space-y-1 sm:max-h-64">
                    <div v-if="filteredAddPosts.length === 0" class="text-sm text-muted-foreground text-center py-3">未找到相关文章</div>
                    <div v-for="p in filteredAddPosts" :key="p.cid" class="flex items-center space-x-2">
                      <Checkbox
                        :id="`add-travel-post-${p.cid}`"
                        :model-value="newTravel.cids.includes(String(p.cid))"
                        @update:model-value="(checked: any) => toggleCid(newTravel.cids, String(p.cid), !!checked)" />
                      <Label :for="`add-travel-post-${p.cid}`" class="text-sm font-normal cursor-pointer flex-1 min-w-0 truncate">
                        {{ p.title }}
                      </Label>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">已选 {{ newTravel.cids.length }} 篇，可关联多篇文章</p>
              </div>
            </div>
            <div class="space-y-2">
              <Label for="travelDesc">描述</Label>
              <Textarea id="travelDesc" v-model="newTravel.desc" placeholder="关于这个地方的只言片语" rows="3" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="travelCover">封面图 URL</Label>
                <Input id="travelCover" v-model="newTravel.cover" type="url" placeholder="https://example.com/cover.jpg" />
              </div>
              <div class="space-y-2">
                <Label for="travelSort">排序</Label>
                <Input id="travelSort" v-model="newTravel.sort" type="number" placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showAddModal = false">取消</Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- 编辑地点弹窗 -->
    <Dialog v-model:open="showEditModal">
      <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-4xl! sm:p-6">
        <DialogHeader>
          <DialogTitle>编辑旅行地点</DialogTitle>
          <DialogDescription>点击地图或拖动标记选择坐标，也可以手动输入。</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="saveEdit">
          <div class="space-y-3 py-3 sm:space-y-4 sm:py-4">
            <div class="space-y-2">
              <Label for="editTravelName">名称</Label>
              <Input id="editTravelName" v-model="editTravelForm.name" placeholder="如：沈阳故宫" required />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="editTravelLng">经度</Label>
                <Input id="editTravelLng" v-model="editTravelForm.longitude" type="number" step="0.000001" placeholder="116.3974" required />
              </div>
              <div class="space-y-2">
                <Label for="editTravelLat">纬度</Label>
                <Input id="editTravelLat" v-model="editTravelForm.latitude" type="number" step="0.000001" placeholder="39.9092" required />
              </div>
            </div>
            <!-- 地图选点 + 关联文章 左右并排，降低弹窗整体高度 -->
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <Label>地图选点</Label>
                <ClientOnly>
                  <AdminTravelCoordinatePicker v-model:longitude="editTravelForm.longitude" v-model:latitude="editTravelForm.latitude" />
                  <template #fallback>
                    <div class="h-48 rounded-md bg-muted animate-pulse sm:h-72" />
                  </template>
                </ClientOnly>
              </div>
              <div class="space-y-2">
                <Label>关联文章</Label>
                <div class="rounded-md border">
                  <div class="border-b p-2">
                    <Input v-model="editPostKeyword" placeholder="搜索文章标题或 ID" class="h-8" />
                  </div>
                  <div class="max-h-44 overflow-y-auto p-2 space-y-1 sm:max-h-64">
                    <div v-if="filteredEditPosts.length === 0" class="text-sm text-muted-foreground text-center py-3">未找到相关文章</div>
                    <div v-for="p in filteredEditPosts" :key="p.cid" class="flex items-center space-x-2">
                      <Checkbox
                        :id="`edit-travel-post-${p.cid}`"
                        :model-value="editTravelForm.cids.includes(String(p.cid))"
                        @update:model-value="(checked: any) => toggleCid(editTravelForm.cids, String(p.cid), !!checked)" />
                      <Label :for="`edit-travel-post-${p.cid}`" class="text-sm font-normal cursor-pointer flex-1 min-w-0 truncate">
                        {{ p.title }}
                      </Label>
                    </div>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">已选 {{ editTravelForm.cids.length }} 篇，可关联多篇文章</p>
              </div>
            </div>
            <div class="space-y-2">
              <Label for="editTravelDesc">描述</Label>
              <Textarea id="editTravelDesc" v-model="editTravelForm.desc" placeholder="关于这个地方的只言片语" rows="3" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="editTravelCover">封面图 URL</Label>
                <Input id="editTravelCover" v-model="editTravelForm.cover" type="url" placeholder="https://example.com/cover.jpg" />
              </div>
              <div class="space-y-2">
                <Label for="editTravelSort">排序</Label>
                <Input id="editTravelSort" v-model="editTravelForm.sort" type="number" placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showEditModal = false">取消</Button>
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
