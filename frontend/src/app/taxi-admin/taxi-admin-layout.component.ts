import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface SidebarItem {
  path: string;
  label: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { path: 'cities', label: 'Города' },
  { path: 'services', label: 'Услуги' },
  { path: 'departure-slots', label: 'Слоты выезда' },
  { path: 'passenger-options', label: 'Кол-во человек' },
  { path: 'drivers', label: 'Водители' },
  { path: 'prices', label: 'Цены' },
  { path: 'orders', label: 'Заказы' },
];

/**
 * Shell of the `/taxi` admin section (design D8): sidebar with the seven
 * child pages on the left, the child router outlet on the right. The section
 * itself is protected by `requireAdminGuard` in app.routes.ts.
 */
@Component({
  selector: 'app-taxi-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="taxi-admin">
      <aside class="sidebar">
        <h2>Такси</h2>
        <nav class="sidebar-nav">
          @for (item of menu; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>
      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .taxi-admin {
        display: flex;
        min-height: calc(100vh - 56px);
      }

      .sidebar {
        width: 220px;
        flex-shrink: 0;
        padding: 1.25rem;
        background: #1e293b;
        color: #e2e8f0;
      }

      .sidebar h2 {
        margin: 0 0 1rem;
        font-size: 1.1rem;
      }

      .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .sidebar-nav a {
        display: block;
        padding: 0.5rem 0.75rem;
        color: #e2e8f0;
        text-decoration: none;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .sidebar-nav a:hover {
        background: #334155;
      }

      .sidebar-nav a.active {
        background: #38bdf8;
        color: #0f172a;
        font-weight: 600;
      }

      .content {
        flex: 1;
        padding: 1.5rem;
      }
    `,
  ],
})
export class TaxiAdminLayoutComponent {
  readonly menu = SIDEBAR_ITEMS;
}
