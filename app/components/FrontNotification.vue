<script setup lang="ts">
interface Notification {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

const notifications = ref<Notification[]>([]);

// 显示通知
const show = (message: string, type: "success" | "error" | "info" = "info") => {
  const id = Date.now().toString();
  notifications.value.push({ id, message, type });

  // 5秒后自动移除
  setTimeout(() => {
    remove(id);
  }, 5000);
};

// 移除通知
const remove = (id: string) => {
  const index = notifications.value.findIndex(n => n.id === id);
  if (index > -1) {
    notifications.value.splice(index, 1);
  }
};

// 监听自定义事件
onMounted(() => {
  window.addEventListener("front-notification", ((e: CustomEvent) => {
    show(e.detail.message, e.detail.type);
  }) as EventListener);
});

onUnmounted(() => {
  window.removeEventListener("front-notification", (() => {}) as EventListener);
});

// 图标映射
const icons = {
  success: "ri:checkbox-circle-fill",
  error: "ri:close-circle-fill",
  info: "ri:information-fill",
};

// 颜色映射
const colors = {
  success: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300",
  error: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
  info: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
};

const iconColors = {
  success: "text-green-500 dark:text-green-400",
  error: "text-red-500 dark:text-red-400",
  info: "text-blue-500 dark:text-blue-400",
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed font-serif bottom-5 left-5 z-10001 flex flex-col gap-2 pointer-events-none">
      <TransitionGroup
        name="notification"
        tag="div"
        class="flex flex-col gap-2">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="[
            'pointer-events-auto min-w-75 max-w-md p-4 rounded-lg border shadow-lg flex items-start gap-3',
            colors[notification.type]
          ]"
        >
          <Icon :name="icons[notification.type]" :class="['size-5 shrink-0 mt-0.5', iconColors[notification.type]]" />
          <p class="text-sm font-medium flex-1">{{ notification.message }}</p>
          <button
            @click="remove(notification.id)"
            class="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <Icon name="ri:close-line" class="size-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* 进入动画 */
.notification-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.notification-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 1, 1);
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(-100%) scale(0.9);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.95);
}

/* 列表移动动画 */
.notification-move,
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-leave-active {
  position: absolute;
  width: 100%;
}
</style>
