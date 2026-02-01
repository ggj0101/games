<script setup lang="ts">
import { computed, ref } from 'vue'

import { GAMES, type GameMeta } from '@/data/games'

const query = ref('')
const selectedTags = ref<string[]>([])

const allTags = computed(() => {
  const set = new Set<string>()
  for (const g of GAMES) {
    for (const t of g.tags) set.add(t)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

function matchesQuery(g: GameMeta, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    g.title.toLowerCase().includes(s) ||
    g.description.toLowerCase().includes(s) ||
    g.tags.some((t) => t.toLowerCase().includes(s))
  )
}

function matchesTags(g: GameMeta, tags: string[]) {
  if (tags.length === 0) return true
  // AND semantics: must include all selected tags
  return tags.every((t) => g.tags.includes(t))
}

const filtered = computed(() =>
  GAMES.filter((g) => matchesQuery(g, query.value) && matchesTags(g, selectedTags.value))
)

const readyGames = computed(() => filtered.value.filter((g) => g.status === 'ready'))
const comingSoonGames = computed(() => filtered.value.filter((g) => g.status === 'coming-soon'))

const featured = computed(() => GAMES.find((g) => g.status === 'ready') ?? null)

function gradientFor(key: string) {
  const gradients: Record<string, string> = {
    breakout: 'linear-gradient(135deg, rgba(0, 229, 255, 0.20), rgba(123, 31, 162, 0.10))',
    'dragonball-radar': 'linear-gradient(135deg, rgba(255, 193, 7, 0.20), rgba(255, 82, 82, 0.10))',
    'star-catcher': 'linear-gradient(135deg, rgba(255, 235, 59, 0.18), rgba(3, 218, 198, 0.10))',
    'jelly-match': 'linear-gradient(135deg, rgba(236, 64, 122, 0.20), rgba(124, 77, 255, 0.10))',
    'color-balloon-pop': 'linear-gradient(135deg, rgba(103, 58, 183, 0.18), rgba(0, 188, 212, 0.12))',
    'tomato-timer': 'linear-gradient(135deg, rgba(244, 67, 54, 0.18), rgba(255, 152, 0, 0.10))'
  }

  return gradients[key] ?? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))'
}
</script>

<template>
  <v-container class="home py-10">
    <!-- HERO -->
    <div class="hero mb-10" rounded="xl">
      <v-row class="hero-inner" align="center">
        <v-col cols="12" md="7">
          <div class="text-overline text-medium-emphasis">GAMES</div>
          <h1 class="text-h3 text-sm-h2 font-weight-black mb-3">小遊戲入口</h1>
          <div class="text-body-1 text-medium-emphasis mb-6">
            快速開始、手機優先、即點即玩。挑一個遊戲，現在就開局。
          </div>

          <div class="mt-6 text-caption text-medium-emphasis">
            提示：行動裝置建議直覺點按操作；已全站禁用長按選取文字。
          </div>
        </v-col>

        <v-col cols="12" md="5">
          <v-sheet class="stats" rounded="xl" border>
            <div class="d-flex flex-column ga-3">
              <div class="d-flex align-center justify-space-between">
                <div class="text-caption text-medium-emphasis">Ready</div>
                <div class="text-h5 font-weight-bold">{{ GAMES.filter(g => g.status === 'ready').length }}</div>
              </div>
              <div class="d-flex align-center justify-space-between">
                <div class="text-caption text-medium-emphasis">Coming soon</div>
                <div class="text-h5 font-weight-bold">{{ GAMES.filter(g => g.status === 'coming-soon').length }}</div>
              </div>
              <v-divider />
              <div class="text-caption text-medium-emphasis">
                支援：Touch / Mouse / Keyboard（依遊戲而定）
              </div>
            </div>
          </v-sheet>
        </v-col>
      </v-row>
    </div>

    <!-- FEATURED -->
    <v-row v-if="featured" class="mb-10" align="stretch">
      <v-col cols="12">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-h6 font-weight-bold">Featured</div>
          <v-chip size="small" variant="tonal" color="primary">推薦</v-chip>
        </div>

        <v-card
          class="featured-card"
          rounded="xl"
          variant="tonal"
          :style="{ backgroundImage: gradientFor(featured.key) }"
          :to="featured.to"
          link
        >
          <v-card-text class="d-flex flex-column flex-sm-row align-start align-sm-center ga-4">
            <div class="featured-icon">
              <v-icon :icon="featured.icon" size="36" />
            </div>

            <div class="flex-1-1-auto">
              <div class="text-h5 font-weight-black mb-1">{{ featured.title }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ featured.description }}</div>
              <div class="d-flex flex-wrap ga-2 mt-3">
                <v-chip
                  v-for="t in featured.tags"
                  :key="t"
                  size="small"
                  variant="tonal"
                >
                  {{ t }}
                </v-chip>
              </div>
            </div>

            <div class="d-flex ga-2">
              <v-btn color="primary" variant="flat" :to="featured.to" @click.stop>Play</v-btn>
              <v-btn variant="text" prepend-icon="mdi-arrow-right" :to="featured.to" @click.stop>
                Open
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- BROWSE -->
    <v-row class="mb-4" align="end">
      <v-col cols="12" md="6">
        <div class="text-h6 font-weight-bold mb-2">Browse</div>
        <v-text-field
          v-model="query"
          label="Search games"
          density="comfortable"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          clearable
        />
      </v-col>

      <v-col cols="12" md="6">
        <div class="text-caption text-medium-emphasis mb-2">Filter tags (AND)</div>
        <v-chip-group v-model="selectedTags" multiple column>
          <v-chip
            v-for="t in allTags"
            :key="t"
            :value="t"
            filter
            variant="tonal"
            class="me-2 mb-2"
          >
            {{ t }}
          </v-chip>
        </v-chip-group>
      </v-col>
    </v-row>

    <v-row v-if="readyGames.length > 0" class="mb-6">
      <v-col cols="12">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-h6 font-weight-bold">Ready to play</div>
          <div class="text-caption text-medium-emphasis">{{ readyGames.length }} games</div>
        </div>
      </v-col>

      <v-col v-for="g in readyGames" :key="g.key" cols="12" sm="6" md="4" lg="3">
        <v-card
          class="game-card h-100"
          rounded="xl"
          variant="tonal"
          :to="g.to"
          link
          :style="{ backgroundImage: gradientFor(g.key) }"
        >
          <div class="cover">
            <v-icon :icon="g.icon" size="34" />
          </div>

          <v-card-item>
            <div class="d-flex align-center justify-space-between ga-2">
              <div class="text-subtitle-1 font-weight-bold">{{ g.title }}</div>
              <v-chip size="x-small" color="green" variant="flat">READY</v-chip>
            </div>
          </v-card-item>

          <v-card-text class="text-body-2 text-medium-emphasis">
            {{ g.description }}
          </v-card-text>

          <v-card-text class="pt-0">
            <div class="d-flex flex-wrap ga-2">
              <v-chip v-for="t in g.tags" :key="t" size="x-small" variant="tonal">
                {{ t }}
              </v-chip>
              <v-spacer />
              <v-chip v-if="g.minutes" size="x-small" variant="tonal" prepend-icon="mdi-timer-outline">
                {{ g.minutes }}m
              </v-chip>
              <v-chip v-if="g.age" size="x-small" variant="tonal" prepend-icon="mdi-account-child">
                {{ g.age }}
              </v-chip>
            </div>
          </v-card-text>

          <v-card-actions class="px-4 pb-4">
            <v-btn color="primary" variant="flat" :to="g.to" @click.stop>Play</v-btn>
            <v-spacer />
            <v-btn variant="text" :to="g.to" @click.stop>Details</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-if="comingSoonGames.length > 0" class="mb-6">
      <v-col cols="12">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-h6 font-weight-bold">Coming soon</div>
          <div class="text-caption text-medium-emphasis">{{ comingSoonGames.length }} games</div>
        </div>
      </v-col>

      <v-col v-for="g in comingSoonGames" :key="g.key" cols="12" sm="6" md="4" lg="3">
        <v-card class="game-card h-100" rounded="xl" variant="tonal" disabled>
          <div class="cover">
            <v-icon :icon="g.icon" size="34" />
          </div>

          <v-card-item>
            <div class="d-flex align-center justify-space-between ga-2">
              <div class="text-subtitle-1 font-weight-bold">{{ g.title }}</div>
              <v-chip size="x-small" color="grey" variant="flat">SOON</v-chip>
            </div>
          </v-card-item>

          <v-card-text class="text-body-2 text-medium-emphasis">
            {{ g.description }}
          </v-card-text>

          <v-card-text class="pt-0">
            <div class="d-flex flex-wrap ga-2">
              <v-chip v-for="t in g.tags" :key="t" size="x-small" variant="tonal">
                {{ t }}
              </v-chip>
            </div>
          </v-card-text>

          <v-card-actions class="px-4 pb-4">
            <v-btn variant="tonal" disabled>Coming soon</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-if="readyGames.length === 0 && comingSoonGames.length === 0">
      <v-col cols="12">
        <v-alert type="info" variant="tonal" rounded="xl">
          No games match your search/filters.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.home {
  user-select: none;
  -webkit-user-select: none;
}

.hero {
  position: relative;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background:
    radial-gradient(800px 400px at 10% 0%, rgba(0, 229, 255, 0.18), transparent 60%),
    radial-gradient(600px 400px at 90% 10%, rgba(124, 77, 255, 0.18), transparent 60%),
    rgba(255, 255, 255, 0.03);
}

.hero-inner {
  padding: 28px;
}

.stats {
  background: rgba(0, 0, 0, 0.20);
  padding: 18px;
}

.featured-card {
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.featured-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.game-card {
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.game-card:hover {
  transform: translateY(-2px);
}

.game-card:active {
  transform: translateY(0px) scale(0.99);
}

.cover {
  height: 88px;
  display: flex;
  align-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.20);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
