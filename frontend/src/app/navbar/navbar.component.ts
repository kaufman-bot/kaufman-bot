import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="navbar-brand">
        <a routerLink="/" class="brand-link">
          <span class="brand-icon">🤖</span>
          <span class="brand-text">Kaufman Bot</span>
        </a>
      </div>

      <div class="navbar-links">
        <a
          *ngIf="session.isAuthenticated()"
          routerLink="/chat"
          routerLinkActive="active"
        >
          Чат с ботом
        </a>

        <a
          *ngIf="session.isAdmin()"
          routerLink="/mock-bot"
          routerLinkActive="active"
        >
          Мок-сервер
        </a>

        <a
          *ngIf="session.isAdmin()"
          routerLink="/telegram-bots"
          routerLinkActive="active"
        >
          Телеграм-боты
        </a>

        <button
          *ngIf="session.isTelegramTarget()"
          class="btn-launch-tg"
          type="button"
          (click)="onLaunchTelegram()"
        >
          Запустить телеграм бота
        </button>
      </div>

      <div class="navbar-actions">
        <ng-container *ngIf="session.isAuthenticated(); else loginLink">
          <span class="user-email">{{ session.profile()?.user?.email }}</span>
          <button class="btn-logout" type="button" (click)="onLogout()">
            Выход
          </button>
        </ng-container>
        <ng-template #loginLink>
          <a routerLink="/login" class="btn-login">Вход</a>
        </ng-template>
      </div>
    </nav>
  `,
  styles: [
    `
      .navbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1.5rem;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        color: #e2e8f0;
        font-family:
          'Inter',
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          Helvetica,
          Arial,
          sans-serif;
      }

      .navbar-brand {
        display: flex;
        align-items: center;
      }

      .brand-link {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        text-decoration: none;
        color: #38bdf8;
        font-weight: 600;
        font-size: 1.1rem;
        transition: opacity 0.2s;
      }

      .brand-link:hover {
        opacity: 0.9;
      }

      .brand-icon {
        font-size: 1.5rem;
      }

      .navbar-links {
        display: flex;
        gap: 1.5rem;
        align-items: center;
      }

      .navbar-links a {
        color: #e2e8f0;
        text-decoration: none;
        font-weight: 500;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .navbar-links a:hover {
        background: #334155;
      }

      .navbar-links a.active {
        background: #38bdf8;
        color: #0f172a;
      }

      .navbar-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .user-email {
        color: #94a3b8;
        font-size: 0.875rem;
      }

      .btn-logout {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #e2e8f0;
        background: transparent;
        border: 1px solid #334155;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-logout:hover {
        background: #334155;
      }

      .btn-login {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #0f172a;
        background: #38bdf8;
        border: none;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
      }

      .btn-login:hover {
        background: #0ea5e9;
      }

      .btn-launch-tg {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #fff;
        background: #2aabee;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .btn-launch-tg:hover {
        background: #229ed9;
      }
    `,
  ],
})
export class NavbarComponent {
  session = inject(SessionService);

  onLogout(): void {
    this.session.logout();
  }

  onLaunchTelegram(): void {
    this.session.launchTelegram();
  }
}
