<script setup lang="ts">
import type {AcceptableValue} from "reka-ui";

import { ADMIN_PAGE_SIZE_MAX, ADMIN_PAGE_SIZE_MIN, ADMIN_PAGE_SIZE_PRESETS, clampAdminPageSize } from "#shared/constants";

const props = defineProps<{
  modelValue: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

// 「自定义」在 Select 里的哨兵值。选项值一律用字符串：reka-ui 的 SelectValue 靠值匹配取文案，
// number/string 混用会匹配不上、触发器显示空白。
const CUSTOM_OPTION = "custom";
const customMode = ref(false);
const customInput = ref("");
const customInputEl = ref<{ focus: () => void } | null>(null);

const options = computed(() => {
  const list = ADMIN_PAGE_SIZE_PRESETS.map(size => ({ value: String(size), label: `每页 ${size} 条` }));
  // 自定义值不在预设档位里时补进列表，否则 SelectValue 找不到对应项
  if (!ADMIN_PAGE_SIZE_PRESETS.includes(props.modelValue)) {
    list.splice(1, 0, { value: String(props.modelValue), label: `每页 ${props.modelValue} 条` });
  }
  list.push({ value: CUSTOM_OPTION, label: "自定义…" });
  return list;
});

const selected = computed({
  get: () => String(props.modelValue),
  set: (value: AcceptableValue) => {
    if (value === CUSTOM_OPTION) {
      startCustom();
      return;
    }
    emit("update:modelValue", clampAdminPageSize(value, props.modelValue));
  },
});

/** 进自定义态：预填当前值并聚焦，省掉「先清空再输入」 */
function startCustom() {
  customInput.value = String(props.modelValue);
  customMode.value = true;
  nextTick(() => customInputEl.value?.focus());
}

function applyCustom() {
  customMode.value = false;
  const size = clampAdminPageSize(customInput.value, props.modelValue);
  if (size !== props.modelValue) emit("update:modelValue", size);
}

function cancelCustom() {
  customMode.value = false;
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <ClientOnly v-if="!customMode">
      <Select v-model="selected">
        <SelectTrigger class="h-8 w-28" aria-label="每页显示条数">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</SelectItem>
        </SelectContent>
      </Select>
      <template #fallback>
        <div class="h-8 w-28 rounded-md border bg-muted/50" />
      </template>
    </ClientOnly>

    <template v-else>
      <Input
        ref="customInputEl"
        v-model="customInput"
        type="number"
        inputmode="numeric"
        :min="ADMIN_PAGE_SIZE_MIN"
        :max="ADMIN_PAGE_SIZE_MAX"
        class="h-8 w-16"
        :aria-label="`每页条数（${ADMIN_PAGE_SIZE_MIN}-${ADMIN_PAGE_SIZE_MAX}）`"
        @keydown.enter="applyCustom"
        @keydown.esc="cancelCustom" />
      <span class="whitespace-nowrap text-xs text-muted-foreground">{{ ADMIN_PAGE_SIZE_MIN }}-{{ ADMIN_PAGE_SIZE_MAX }} 条/页</span>
      <Button size="sm" class="h-8 px-2" @click="applyCustom">确定</Button>
      <Button variant="ghost" size="sm" class="h-8 px-2" @click="cancelCustom">取消</Button>
    </template>
  </div>
</template>
