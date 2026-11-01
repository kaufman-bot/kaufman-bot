import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h1>Вход в Kaufman Bot</h1>
        <p class="subtitle">Введите API-ключ для доступа к чату</p>

        <form (ngSubmit)="onSubmit()" #loginForm="ngForm">
          <div class="form-group">
            <label for="apiKey">API Key</label>
            <input
              type="text"
              id="apiKey"
              name="apiKey"
              [(ngModel)]="apiKey"
              required
              autocomplete="current-password"
              [disabled]="loading()"
              placeholder="sk-..."
            />
          </div>

          @if (error()) {
            <div class="error-message">
              {{ error() }}
            </div>
          }

          <button type="submit" [disabled]="loading() || !apiKey.trim()">
            @if (loading()) {
              Вход...
            } @else {
              Войти
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }

      .login-card {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        max-width: 400px;
        width: 100%;
      }

      h1 {
        margin: 0 0 0.5rem 0;
        color: #333;
        font-size: 1.5rem;
      }

      .subtitle {
        margin: 0 0 1.5rem 0;
        color: #666;
        font-size: 0.9rem;
      }

      .form-group {
        margin-bottom: 1rem;
      }

      label {
        display: block;
        margin-bottom: 0.5rem;
        color: #333;
        font-weight: 500;
      }

      input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
        box-sizing: border-box;
      }

      input:focus {
        outline: none;
        border-color: #667eea;
      }

      input:disabled {
        background: #f5f5f5;
        cursor: not-allowed;
      }

      .error-message {
        background: #fee;
        color: #c33;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        font-size: 0.9rem;
      }

      button {
        width: 100%;
        padding: 0.75rem;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
      }

      button:hover:not(:disabled) {
        background: #5568d3;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    `,
  ],
})
export class LoginComponent {
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  apiKey = '';
  loading = signal(false);
  error = signal<string | null>(null);

  onSubmit(): void {
    if (!this.apiKey.trim() || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.session.login(this.apiKey).subscribe({
      next: (profile) => {
        this.loading.set(false);
        if (profile) {
          // Login successful; redirect to returnUrl or appropriate home
          const returnUrl =
            this.route.snapshot.queryParams['returnUrl'] ||
            (profile.user.role === 'ADMIN' ? '/mock-bot' : '/chat');
          this.router.navigateByUrl(returnUrl);
        } else {
          this.error.set('Неверный API-ключ');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set('Ошибка входа. Попробуйте позже.');
      },
    });
  }
}
