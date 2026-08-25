<script setup lang="ts">
import { Toaster as Sonner } from 'vue-sonner'

const props = withDefaults(defineProps<{
  class?: string
  richColors?: boolean
  closeButton?: boolean
  expand?: boolean
  duration?: number
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center'
}>(), {
  richColors: true,
  closeButton: true,
  expand: false,
  duration: 4000,
  position: 'bottom-right',
})
</script>

<template>
  <Sonner
    :class="props.class"
    :rich-colors="props.richColors"
    :close-button="props.closeButton"
    :expand="props.expand"
    :duration="props.duration"
    :position="props.position"
  />
</template>
