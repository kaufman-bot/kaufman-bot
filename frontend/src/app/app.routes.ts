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
    // Taxi admin section (design D8): the layout shell guards the whole
    // subtree — children inherit `canActivate`, so no per-page guards needed.
    path: 'taxi',
    loadComponent: () =>
      import('./taxi-admin/taxi-admin-layout.component').then(
        (m) => m.TaxiAdminLayoutComponent,
      ),
    canActivate: [requireAdminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'cities' },
      {
        path: 'cities',
        loadComponent: () =>
          import('./taxi-admin/cities.component').then(
            (m) => m.TaxiCitiesComponent,
          ),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./taxi-admin/services.component').then(
            (m) => m.TaxiServicesComponent,
          ),
      },
      {
        path: 'departure-slots',
        loadComponent: () =>
          import('./taxi-admin/departure-slots.component').then(
            (m) => m.TaxiDepartureSlotsComponent,
          ),
      },
      {
        path: 'passenger-options',
        loadComponent: () =>
          import('./taxi-admin/passenger-options.component').then(
            (m) => m.TaxiPassengerOptionsComponent,
          ),
      },
      {
        path: 'drivers',
        loadComponent: () =>
          import('./taxi-admin/drivers.component').then(
            (m) => m.TaxiDriversComponent,
          ),
      },
      {
        path: 'prices',
        loadComponent: () =>
          import('./taxi-admin/prices.component').then(
            (m) => m.TaxiPricesComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./taxi-admin/orders.component').then(
            (m) => m.TaxiOrdersComponent,
          ),
      },
    ],
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
