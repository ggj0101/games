<script setup lang="ts">
import { computed } from 'vue'

import { GAMES } from '@/data/games'

const readyGames = computed(() => GAMES.filter((g) => g.status === 'ready'))
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-title>
        <router-link to="/" style="color: inherit; text-decoration: none;">
          GAMES
        </router-link>
      </v-app-bar-title>

      <v-spacer />

      <v-btn variant="text" to="/" :active="false" prepend-icon="mdi-home">Home</v-btn>

      <v-menu>
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" prepend-icon="mdi-gamepad">Games</v-btn>
        </template>

        <v-list density="comfortable" min-width="240">
          <v-list-item v-for="g in readyGames" :key="g.key" :to="g.to">
            <template #prepend>
              <v-icon :icon="g.icon" />
            </template>
            <v-list-item-title>{{ g.title }}</v-list-item-title>
            <v-list-item-subtitle class="text-medium-emphasis">{{ g.minutes ? `${g.minutes}m` : '' }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
