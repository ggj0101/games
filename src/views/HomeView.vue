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
  },
  {
    key: 'star-catcher',
    title: '星星接接樂（Star Catcher）',
    description: '手機 Touch：點小星星消除；長按大星（可分段）磨到變小消失，固定 60 秒比總分。',
    to: '/star-catcher',
    status: 'ready'
  },
  {
    key: 'tomato-timer',
    title: '番茄鐘（規劃中）',
    description: '規劃中的番茄鐘小遊戲：專注/休息節奏 + 音效 + 小成就。',
    to: '/tomato-timer',
    status: 'coming-soon'
  }
])

function go(to: string) {
  router.push(to)
}
</script>

<template>
  <v-container class="home py-8">
    <v-row class="mb-5" align="center" justify="space-between">
      <v-col cols="12" md="8">
        <div class="text-overline text-medium-emphasis">GAMES</div>
        <h1 class="text-h4 font-weight-bold mb-2">選擇遊戲</h1>
        <div class="text-body-2 text-medium-emphasis">
          手機遊玩建議：直接點按操作，避免長按選取文字。
        </div>
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="g in games" :key="g.key" cols="12" sm="6" md="4">
        <v-card
          class="game-tile h-100"
          rounded="xl"
          variant="tonal"
          :disabled="g.status !== 'ready'"
          @click="g.status === 'ready' && go(g.to)"
        >
          <v-card-item>
            <div class="d-flex align-center justify-space-between">
              <div class="text-h6 font-weight-bold">
                {{ g.title }}
              </div>
              <v-chip
                size="small"
                variant="flat"
                :color="g.status === 'ready' ? 'green' : 'grey'"
              >
                {{ g.status === 'ready' ? 'READY' : 'SOON' }}
              </v-chip>
            </div>
          </v-card-item>

          <v-card-text class="text-body-2 text-medium-emphasis">
            {{ g.description }}
          </v-card-text>

          <v-card-actions class="px-4 pb-4">
            <v-btn
              color="primary"
              variant="flat"
              :disabled="g.status !== 'ready'"
              @click.stop="go(g.to)"
            >
              Play
            </v-btn>
            <v-spacer />
            <div class="text-caption text-medium-emphasis">Tap to open</div>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.home {
  user-select: none;
  -webkit-user-select: none;
}

.game-tile {
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.game-tile:hover {
  transform: translateY(-2px);
}

.game-tile:active {
  transform: translateY(0px) scale(0.99);
}
</style>
