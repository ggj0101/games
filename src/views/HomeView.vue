<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

type Game = {
  key: string
  title: string
  description: string
  to: string
  status?: 'ready' | 'coming-soon'
}

const router = useRouter()

const games = computed<Game[]>(() => [
  {
    key: 'breakout',
    title: 'Breakout（打磚塊）',
    description: '2D 打磚塊：用擋板反彈球，清光所有磚塊。',
    to: '/breakout',
    status: 'ready'
  },
  {
    key: 'dragonball-radar',
    title: '龍珠雷達',
    description: '真實定位雷達：接近目標會拉近，抵達後顯示成功找到。',
    to: '/dragonball-radar',
    status: 'ready'
  }
])

function go(to: string) {
  router.push(to)
}
</script>

<template>
  <v-container class="py-8">
    <v-row align="center" class="mb-4">
      <v-col cols="12" md="8">
        <h1 class="text-h4 font-weight-bold">Game Select</h1>
        <p class="text-body-1 text-medium-emphasis">
          選擇一個遊戲開始。
        </p>
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="g in games" :key="g.key" cols="12" sm="6" md="4">
        <v-card rounded="lg" variant="tonal" class="h-100">
          <v-card-title class="text-h6">{{ g.title }}</v-card-title>
          <v-card-text class="text-body-2">{{ g.description }}</v-card-text>
          <v-card-actions>
            <v-btn
              color="primary"
              :disabled="g.status !== 'ready'"
              @click="go(g.to)"
            >
              Play
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
