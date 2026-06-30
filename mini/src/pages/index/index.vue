<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <view class="flex-col-center pt-80 px-32">
    <text class="text-40 font-bold mb-32">
      imqi1 小程序
    </text>
    <text class="text-28 text-gray-500 mb-48">
      uni-app + wot-design-uni + UnoCSS
    </text>
    <wd-button
      type="primary"
      @click="count++"
    >
      点击 {{ count }}
    </wd-button>
  </view>
</template>

<style scoped lang="scss">
.flex-col-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
