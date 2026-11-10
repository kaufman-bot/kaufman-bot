import { Routes } from '@angular/router';
import {
  redirectIfAuthenticatedGuard,
  requireAdminGuard,
  requireAuthGuard,
} from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
    canActivate: [redirectIfAuthenticatedGuard],
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./chat/chat.component').then((m) => m.ChatComponent),
    canActivate: [requireAuthGuard],
  },
  {
    path: 'mock-bot',
    loadComponent: () =>
      import('./mock-bot/mock-bot.component').then((m) => m.MockBotComponent),
    canActivate: [requireAdminGuard],
  },
  {
    path: 'telegram-bots',
    loadComponent: () =>
      import('./telegram-bots-admin/telegram-bots-admin.component').then(
        (m) => m.TelegramBotsAdminComponent,
      ),
    canActivate: [requireAdminGuard],
  },
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
