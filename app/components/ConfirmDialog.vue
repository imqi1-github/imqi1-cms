<script setup lang="ts">
import type { ConfirmState } from "~/types/composables/confirm";

/**
 * 全局确认弹窗宿主：挂在 AdminLayout 中一处即可。
 * 由 useConfirm().confirm() 驱动，Promise<boolean> 形式，
 * 样式与 admin/cache.vue 的“一键清空全部缓存”二次确认弹窗一致。
 */
const { state, answer } = useConfirm();

const open = ref(false);
// 冻结的展示快照：关闭动画期间 state 已清空，靠它保持文案可见
const display = ref<ConfirmState | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

// 弹窗生命周期跟随全局 state：非 null 打开，null 关闭
watch(state, (s) => {
  if (s) {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    display.value = s;
    open.value = true;
  } else {
    open.value = false;
    // 保留退出动画期间的文案，动画结束后再清空
    closeTimer = setTimeout(() => {
      display.value = null;
    }, 250);
  }
});

// 经遮罩/ESC 关闭（radix 把 open 置 false 但 state 仍在）→ 视为取消
watch(open, (v) => {
  if (!v && state.value !== null) {
    answer(false);
  }
});

const isDestructive = computed(() => display.value?.variant === "destructive");
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon
            v-if="display?.icon"
            :name="display.icon"
            class="size-5 shrink-0"
            :class="isDestructive ? 'text-destructive' : 'text-primary'"
          />
          {{ display?.title }}
        </DialogTitle>
        <DialogDescription v-if="display?.description" class="whitespace-pre-line">
          {{ display.description }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="answer(false)">
          {{ display?.cancelText }}
        </Button>
        <Button :variant="isDestructive ? 'destructive' : 'default'" @click="answer(true)">
          <Icon
            v-if="display?.icon && isDestructive"
            :name="display.icon"
            class="mr-2 size-4"
          />
          {{ display?.confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
