<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-title>
        <router-link to="/" style="color: inherit; text-decoration: none;">
          GAMES
        </router-link>
      </v-app-bar-title>

      <v-spacer />

      <v-btn variant="text" to="/" :active="false">Home</v-btn>
      <v-btn variant="text" to="/breakout" :active="false">Breakout</v-btn>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
