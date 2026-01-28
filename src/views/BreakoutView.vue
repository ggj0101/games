<script setup lang="ts">
import BreakoutCanvas from '@/games/breakout/BreakoutCanvas.vue'
</script>

<template>
  <v-container class="py-8">
    <v-row class="mb-4" align="center">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold">Breakout（打磚塊）</h1>
        <p class="text-body-2 text-medium-emphasis">
          2D 小遊戲：反彈球、打掉所有磚塊。
        </p>
      </v-col>
    </v-row>

    <v-card rounded="lg" variant="tonal" class="pa-4">
      <BreakoutCanvas />
    </v-card>
  </v-container>
</template>
