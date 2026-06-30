<script setup lang="ts">
import type {CurrentUser, UserItem} from "~/types/apis/admin/users";
import type {ApiError} from "~/types/error";

const router = useRouter();
const loading = ref(true);
const users = ref<UserItem[]>([]);
const showAddModal = ref(false);
const newUser = ref({ name: "", nickname: "", mail: "", password: "", role: 0 });
const toast = useToast();
const currentUser = ref<CurrentUser | null>(null);

// 计算是否只有一个用户
const isOnlyUser = computed(() => users.value.length <= 1);

// 判断是否可以删除用户（不是自己且不是唯一用户）
function canDeleteUser(userId: number) {
  if (isOnlyUser.value) return false;
  return !(currentUser.value && currentUser.value.uid === userId);

}

// 获取禁用删除按钮的提示信息
function getDeleteDisabledMessage(userId: number) {
  if (isOnlyUser.value) return "系统中只有一个用户，不允许删除";
  if (currentUser.value && currentUser.value.uid === userId) return "不允许删除自己的账号";
  return "";
}

async function fetchUsers() {
  loading.value = true;
  try {
    // 获取当前用户信息
    currentUser.value = await $fetch<CurrentUser>("/api/auth/me");

    users.value = await $fetch<UserItem[]>("/api/admin/users");
  } catch (error) {
    console.error("获取用户失败:", error);
    users.value = [];
  } finally {
    loading.value = false;
  }
}

async function addUser() {
  try {
    await $fetch("/api/admin/users", {
      method: "POST",
      body: newUser.value,
    });
    newUser.value = { name: "", nickname: "", mail: "", password: "", role: 0 };
    showAddModal.value = false;
    await fetchUsers();
    toast.success({
      message: "用户创建成功",
    });
  } catch (rawError: unknown) {
    const error = rawError as ApiError;
    console.error("添加失败:", error);
    // 优先读 error.data.message（后端 createError 抛出的业务错误）
    let errorMessage = "添加失败";
    if (error?.data?.message) {
      errorMessage = error.data.message;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    toast.error({
      message: errorMessage,
    });
  }
}

async function deleteUser(id: number) {
  // 检查是否可以删除
  if (!canDeleteUser(id)) {
    toast.error({
      message: getDeleteDisabledMessage(id),
    });
    return;
  }

  const confirmed = confirm("确定要删除这个用户吗？");
  if (confirmed) {
    try {
      await $fetch(
        `/api/admin/users/${id}?csrfToken=${encodeURIComponent((await $fetch("/api/csrf/token", { credentials: "include" })).data.token)}`,
        { method: "DELETE" },
      );
      await fetchUsers();
      toast.success({
        message: "用户已删除",
      });
    } catch (rawError: unknown) {
      const error = rawError as ApiError;
      console.error("删除失败:", error);

      // 提取错误信息
      let errorMessage = "删除失败";
      if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (typeof rawError === "string") {
        errorMessage = rawError;
      }

      toast.error({
        message: errorMessage,
      });
    }
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("zh-CN");
}

function getRoleBadge(role: number) {
  return role === 1 ? { label: "管理员", variant: "default" as const } : { label: "普通用户", variant: "secondary" as const };
}

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">用户管理</h2>
        <p class="text-sm text-muted-foreground mt-1">管理系统用户</p>
      </div>
      <Button @click="showAddModal = true">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        新建用户
      </Button>
    </div>

    <Card>
      <!-- 加载状态 - 桌面端表格 -->
      <div v-if="loading" class="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>创建时间</TableHead>
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
                <div class="h-6 bg-muted rounded w-16 animate-pulse" />
              </TableCell>
              <TableCell>
                <div class="h-4 bg-muted rounded w-24 animate-pulse" />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-2">
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
            <TableHead>用户名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead class="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="user in users" :key="user.uid">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="size-8">
                  <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.nickname || user.name" />
                  <AvatarFallback>{{ user.name?.charAt(0)?.toUpperCase() || "?" }}</AvatarFallback>
                </Avatar>
                <span class="font-medium">{{ user.name }}</span>
              </div>
            </TableCell>
            <TableCell>{{ user.mail }}</TableCell>
            <TableCell>
              <Badge :variant="getRoleBadge(user.role).variant">
                {{ getRoleBadge(user.role).label }}
              </Badge>
            </TableCell>
            <TableCell>{{ formatDate(user.create_time) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="icon" class="size-8" @click="router.push(`/admin/users/${user.uid}`)">
                  <Icon name="lucide:pencil" class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  :disabled="!canDeleteUser(user.uid)"
                  :title="getDeleteDisabledMessage(user.uid)"
                  @click="deleteUser(user.uid)">
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
          <div class="flex items-center gap-3">
            <div class="size-8 bg-muted rounded-full animate-pulse" />
            <div class="h-4 bg-muted rounded w-24 animate-pulse" />
          </div>
          <div class="space-y-2">
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div class="h-6 bg-muted rounded w-12 animate-pulse" />
          </div>
        </div>
      </div>

      <!-- 数据列表 - 移动端卡片 -->
      <div v-else class="p-4 lg:hidden space-y-4">
        <div v-for="user in users" :key="user.uid" class="border rounded-lg p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Avatar class="size-8">
              <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.nickname || user.name" />
              <AvatarFallback class="text-xs">{{ user.name?.charAt(0)?.toUpperCase() || "?" }}</AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-base truncate">{{ user.name }}</h3>
              <p class="text-xs text-muted-foreground truncate">{{ user.mail }}</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Badge :variant="getRoleBadge(user.role).variant">
              {{ getRoleBadge(user.role).label }}
            </Badge>
          </div>

          <div class="flex items-center justify-between pt-2 border-t">
            <span class="text-xs text-muted-foreground">{{ formatDate(user.create_time) }}</span>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon" class="size-8" @click="router.push(`/admin/users/${user.uid}`)">
                <Icon name="lucide:pencil" class="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-destructive hover:text-destructive"
                :disabled="!canDeleteUser(user.uid)"
                :title="getDeleteDisabledMessage(user.uid)"
                @click="deleteUser(user.uid)">
                <Icon name="lucide:trash-2" class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && users.length === 0" class="text-center py-12">
        <Icon name="lucide:users" class="size-12 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">暂无用户</p>
        <Button variant="outline" class="mt-4" @click="showAddModal = true">
          <Icon name="lucide:plus" class="mr-2 size-4" />
          创建第一个用户
        </Button>
      </div>
    </Card>

    <!-- 添加用户弹窗 -->
    <Dialog v-model:open="showAddModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>创建一个新的系统用户</DialogDescription>
        </DialogHeader>
        <form @submit.prevent="addUser">
          <div class="space-y-4 py-4">
            <div class="space-y-2">
              <Label for="userName">用户名</Label>
              <Input id="userName" v-model="newUser.name" placeholder="用户名" required />
            </div>
            <div class="space-y-2">
              <Label for="userNickname">昵称</Label>
              <Input id="userNickname" v-model="newUser.nickname" placeholder="显示名称" />
            </div>
            <div class="space-y-2">
              <Label for="userMail">邮箱</Label>
              <Input id="userMail" v-model="newUser.mail" type="email" placeholder="邮箱地址" required />
            </div>
            <div class="space-y-2">
              <Label for="userPassword">密码</Label>
              <Input id="userPassword" v-model="newUser.password" type="password" placeholder="密码" required />
            </div>
            <div class="space-y-2">
              <Label for="userRole">角色</Label>
              <Select v-model="newUser.role">
                <SelectTrigger id="userRole">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="0">普通用户</SelectItem>
                  <SelectItem :value="1">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showAddModal = false"> 取消 </Button>
            <Button type="submit">确定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AdminLayout>
</template>
