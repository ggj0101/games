import { createRouter, createWebHashHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import BreakoutView from '@/views/BreakoutView.vue'

const router = createRouter({
  // Hash mode works best on GitHub Pages (static hosting) without extra rewrite rules.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/breakout', name: 'breakout', component: BreakoutView },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

export default router
