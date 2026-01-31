<script setup lang="ts">
import ColorBalloonPopCanvas from '@/games/color-balloon-pop/ColorBalloonPopCanvas.vue'
</script>

<template>
  <v-container class="py-8">
    <v-row class="mb-4" align="center">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold">彩色氣球爆爆樂（Color Balloon Pop）</h1>
        <p class="text-body-2 text-medium-emphasis">
          看到「目標顏色」→ 只點同色氣球把它爆掉！點錯會扣心，60 秒挑戰高分與連擊。
        </p>
      </v-col>
    </v-row>

    <v-card rounded="lg" variant="tonal" class="pa-4">
      <ColorBalloonPopCanvas />
    </v-card>
  </v-container>
</template>
