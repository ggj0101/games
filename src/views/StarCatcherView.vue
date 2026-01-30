<script setup lang="ts">
import StarCatcherCanvas from '@/games/star-catcher/StarCatcherCanvas.vue'
</script>

<template>
  <v-container class="py-8">
    <v-row class="mb-4" align="center">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold">星星接接樂（Star Catcher）</h1>
        <p class="text-body-2 text-medium-emphasis">
          手機 Touch 小遊戲：點小星星消除；大星星可長按（可分段）磨到變小消失。固定 60 秒比總分。
        </p>
      </v-col>
    </v-row>

    <v-card rounded="lg" variant="tonal" class="pa-4">
      <StarCatcherCanvas />
    </v-card>
  </v-container>
</template>
