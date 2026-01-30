<script setup lang="ts">
import JellyMatchCanvas from '@/games/jelly-match/JellyMatchCanvas.vue'
</script>

<template>
  <v-container class="py-8">
    <v-row class="mb-4" align="center">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold">果凍配對（Jelly Match）</h1>
        <p class="text-body-2 text-medium-emphasis">
          點「指定顏色」的果凍就得分；點錯會扣生命。45 秒內挑戰高分與連擊！
        </p>
      </v-col>
    </v-row>

    <v-card rounded="lg" variant="tonal" class="pa-4">
      <JellyMatchCanvas />
    </v-card>
  </v-container>
</template>
