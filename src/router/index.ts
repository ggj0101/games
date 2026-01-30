import { createRouter, createWebHashHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import BreakoutView from '@/views/BreakoutView.vue'
import DragonballRadarView from '@/views/DragonballRadarView.vue'
import StarCatcherView from '@/views/StarCatcherView.vue'
import TomatoTimerView from '@/views/TomatoTimerView.vue'

const router = createRouter({
  // Hash mode works best on GitHub Pages (static hosting) without extra rewrite rules.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/breakout', name: 'breakout', component: BreakoutView },
    { path: '/dragonball-radar', name: 'dragonball-radar', component: DragonballRadarView },
    { path: '/star-catcher', name: 'star-catcher', component: StarCatcherView },
    { path: '/tomato-timer', name: 'tomato-timer', component: TomatoTimerView },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

export default router
