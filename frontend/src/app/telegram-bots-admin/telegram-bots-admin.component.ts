import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminUser,
  TelegramBot,
  TelegramBotsAdminService,
} from '../telegram-bots-admin.service';

/** Bot id value that resets a user's target back to the mock server. */
const MOCK_TARGET = '';

/** Backend limits (mirror TelegramBotsService normalize* rules). */
const MAX_NAME_LENGTH = 128;
const MAX_TOKEN_LENGTH = 256;
const MAX_USERNAME_LENGTH = 64;

/**
 * Admin console for Telegram bots: CRUD of the caller-owned bots (name,
 * write-only token shown masked, arbitrary settings JSON, active toggle)
 * and per-user assignment of the bot that serves the user (own bot or the
 * mock server via `PUT /admin/users/:id/telegram-target`).
 *
 * Form fields are signals so the submit button and inline validation react
 * to every keystroke; each disabled control carries a human-readable reason.
 */
@Component({
  selector: 'app-telegram-bots-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Telegram-боты</h1>
      </header>

      <section class="panel">
        <h2>Свои боты</h2>

        @if (service.bots().length === 0 && !service.loading()) {
          <p class="empty">Нет ботов — создайте первого.</p>
        }

        <table class="bots-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Токен</th>
              <th>Username</th>
              <th>Активен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (bot of service.bots(); track bot.id) {
              <tr>
                <td>{{ bot.name }}</td>
                <td class="mono">{{ bot.botToken }}</td>
                <td>{{ bot.botUsername ?? '—' }}</td>
                <td>
                  <input
                    type="checkbox"
                    [checked]="bot.isActive"
                    (change)="onToggleActive(bot, $event)"
                  />
                </td>
                <td class="row-actions">
                  <button type="button" class="link" (click)="onEdit(bot)">
                    Редактировать
                  </button>
                  <button
                    type="button"
                    class="link danger"
                    (click)="onDelete(bot)"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>

        <div class="guide">
          <h3 class="guide-title">Как создать бота и получить токен</h3>
          <ol class="guide-steps">
            <li>
              Откройте в Telegram официальный сервис
              <span class="mono">&#64;BotFather</span> (t.me/BotFather).
            </li>
            <li>
              Отправьте команду <span class="mono">/newbot</span>, затем задайте
              отображаемое имя и username — он должен оканчиваться на
              <span class="mono">bot</span> (например,
              <span class="mono">my_support_bot</span>).
            </li>
            <li>
              В ответ &#64;BotFather выдаст токен вида
              <span class="mono">123456789:AAHabcdefghijklmnopqrstuvwxyz</span>.
              Скопируйте его <b>целиком</b> и вставьте в поле «Токен».
            </li>
            <li>
              Чтобы бот читал сообщения в группах, отключите приватность
              командой <span class="mono">/setprivacy</span> →
              <span class="mono">Turn off</span> (по желанию).
            </li>
            <li>
              Токен — это секрет. Он сохраняется как есть и больше не
              отображается полностью (в списке маскируется), поэтому храните его
              в надёжном месте.
            </li>
          </ol>
        </div>

        <form class="bot-form" (ngSubmit)="onSubmitForm()">
          <h3>{{ editingId() ? 'Редактировать бота' : 'Новый бот' }}</h3>

          <label>
            Имя <span class="req">*</span>
            <input
              type="text"
              name="name"
              maxlength="128"
              [ngModel]="formName()"
              (ngModelChange)="formName.set($event)"
              (blur)="markTouched('name')"
              [class.invalid]="showError('name') && nameError()"
            />
            @if (showError('name') && nameError()) {
              <span class="field-error">{{ nameError() }}</span>
            }
          </label>

          <label>
            Токен &#64;BotFather <span class="req">*</span>
            <input
              type="text"
              name="botToken"
              maxlength="256"
              autocomplete="off"
              [ngModel]="formToken()"
              (ngModelChange)="formToken.set($event)"
              (blur)="markTouched('token')"
              [placeholder]="
                editingId()
                  ? 'не изменять — оставить пустым'
                  : '123456789:AAH...'
              "
              [class.invalid]="showError('token') && tokenError()"
            />
            @if (editingId()) {
              <span class="hint">
                Токен маскируется при чтении; оставьте поле пустым, чтобы не
                менять секрет.
              </span>
            }
            @if (showError('token') && tokenError()) {
              <span class="field-error">{{ tokenError() }}</span>
            }
          </label>

          <label>
            Username (для deep-link)
            <input
              type="text"
              name="botUsername"
              maxlength="64"
              [ngModel]="formUsername()"
              (ngModelChange)="formUsername.set($event)"
              (blur)="markTouched('username')"
              [class.invalid]="showError('username') && usernameError()"
            />
            @if (showError('username') && usernameError()) {
              <span class="field-error">{{ usernameError() }}</span>
            }
          </label>

          <label>
            Settings (JSON)
            <textarea
              name="settings"
              rows="3"
              placeholder='{"welcome": "Hello"}'
              [ngModel]="formSettings()"
              (ngModelChange)="formSettings.set($event)"
              (blur)="markTouched('settings')"
              [class.invalid]="showError('settings') && settingsError()"
            ></textarea>
            @if (showError('settings') && settingsError()) {
              <span class="field-error">{{ settingsError() }}</span>
            }
          </label>

          @if (formError()) {
            <p class="field-error">{{ formError() }}</p>
          }

          <div class="form-actions">
            <button type="submit" [disabled]="!formValid()">
              {{
                submitting()
                  ? 'Сохранение…'
                  : editingId()
                    ? 'Сохранить'
                    : 'Создать'
              }}
            </button>
            @if (editingId()) {
              <button type="button" class="link" (click)="onCancelEdit()">
                Отмена
              </button>
            }
          </div>

          @if (!formValid()) {
            <p class="reason" role="status">
              {{ submitReason() }}
            </p>
          }
        </form>
      </section>

      <section class="panel">
        <h2>Телеграм бот для пользователей</h2>

        @if (service.users().length === 0) {
          <p class="empty">Нет пользователей.</p>
        }

        <table class="users-table">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Роль</th>
              <th>Телеграм бот</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (user of service.users(); track user.id) {
              <tr>
                <td>{{ user.email }}</td>
                <td>{{ user.role }}</td>
                <td>
                  <!--
                    No ngModel here on purpose: SelectControlValueAccessor only
                    re-selects an option for values registered through ngValue,
                    so a plain [value] option can never be written back to the
                    DOM — the row would keep showing the previous bot after a
                    successful assignment. [selected] is derived from the same
                    reactive source, so the row always renders the effective
                    choice. Backticks are forbidden inside this inline template
                    comment: they would terminate the surrounding template
                    literal.
                  -->
                  <select
                    [name]="'telegram-bot-' + user.id"
                    (change)="onSelectBot(user, $event)"
                    [disabled]="botSaving(user)"
                  >
                    <option
                      [value]="mockTarget"
                      [selected]="selectedBot(user) === mockTarget"
                    >
                      Мок-сервер
                    </option>
                    @for (bot of service.bots(); track bot.id) {
                      <option
                        [value]="bot.id"
                        [selected]="selectedBot(user) === bot.id"
                      >
                        {{ bot.name }}
                      </option>
                    }
                  </select>
                </td>
                <td class="row-actions">
                  @if (botSaving(user)) {
                    <span class="reason-inline" role="status">Сохранение…</span>
                  }
                  @if (showsSavedHint(user)) {
                    <span class="saved-inline" role="status">Сохранено</span>
                  }
                  @if (showsUnchangedHint(user)) {
                    <span class="reason-inline">Телеграм бот не изменён</span>
                  }
                  <button
                    type="button"
                    (click)="onApplyBot(user)"
                    [disabled]="!botDirty(user) || botSaving(user)"
                  >
                    Назначить
                  </button>
                  @if (botError(user)) {
                    <span class="field-error row-error">{{
                      botError(user)
                    }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
  styles: [
    `
      .page {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1rem 1.5rem 3rem;
        color: #e2e8f0;
        font-family:
          'Inter',
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          Roboto,
          sans-serif;
      }
      .page-header h1 {
        font-size: 1.5rem;
        margin: 0 0 1rem;
      }
      .panel {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 1rem 1.25rem;
        margin-bottom: 1.5rem;
      }
      .panel h2 {
        font-size: 1.1rem;
        margin: 0 0 0.75rem;
        color: #38bdf8;
      }
      .empty {
        color: #94a3b8;
        font-style: italic;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1rem;
      }
      th,
      td {
        text-align: left;
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid #334155;
        font-size: 0.9rem;
      }
      th {
        color: #94a3b8;
        font-weight: 600;
      }
      .mono {
        font-family: monospace;
        font-size: 0.85rem;
      }
      .row-actions {
        white-space: nowrap;
        text-align: right;
      }
      .link {
        background: none;
        border: none;
        color: #38bdf8;
        cursor: pointer;
        font-size: 0.85rem;
        padding: 0.2rem 0.4rem;
      }
      .link.danger {
        color: #f87171;
      }
      .link:disabled {
        color: #475569;
        cursor: default;
      }
      .guide {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin-bottom: 1.25rem;
      }
      .guide-title {
        margin: 0 0 0.5rem;
        font-size: 0.95rem;
        color: #38bdf8;
      }
      .guide-steps {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.85rem;
        color: #cbd5e1;
        line-height: 1.5;
      }
      .guide-steps li {
        margin-bottom: 0.3rem;
      }
      .bot-form label {
        display: block;
        margin-bottom: 0.75rem;
        font-size: 0.85rem;
        color: #cbd5e1;
      }
      .bot-form input,
      .bot-form textarea,
      .bot-form select {
        display: block;
        width: 100%;
        max-width: 480px;
        margin-top: 0.25rem;
        padding: 0.4rem 0.5rem;
        background: #0f172a;
        color: #e2e8f0;
        border: 1px solid #334155;
        border-radius: 6px;
      }
      .bot-form input.invalid,
      .bot-form textarea.invalid {
        border-color: #f87171;
      }
      .req {
        color: #f87171;
      }
      select {
        padding: 0.3rem 0.4rem;
        background: #0f172a;
        color: #e2e8f0;
        border: 1px solid #334155;
        border-radius: 6px;
      }
      .hint {
        display: block;
        color: #94a3b8;
        font-size: 0.75rem;
        margin-top: 0.2rem;
      }
      .field-error {
        display: block;
        color: #f87171;
        font-size: 0.78rem;
        margin-top: 0.2rem;
      }
      .reason {
        color: #fbbf24;
        font-size: 0.8rem;
        margin: 0.25rem 0 0;
      }
      .reason-inline {
        color: #94a3b8;
        font-size: 0.75rem;
        margin-right: 0.5rem;
      }
      .saved-inline {
        color: #4ade80;
        font-size: 0.75rem;
        margin-right: 0.5rem;
      }
      .row-error {
        margin-top: 0.25rem;
        text-align: left;
      }
      .form-actions button {
        padding: 0.4rem 1rem;
        font-weight: 600;
        color: #0f172a;
        background: #38bdf8;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      .form-actions button:disabled {
        background: #475569;
        color: #94a3b8;
        cursor: default;
      }
      .form-actions .link {
        background: none;
        color: #94a3b8;
      }
      .users-table .row-actions button {
        padding: 0.3rem 0.8rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #0f172a;
        background: #38bdf8;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      .users-table .row-actions button:disabled {
        background: #475569;
        color: #94a3b8;
        cursor: default;
      }
    `,
  ],
})
export class TelegramBotsAdminComponent implements OnInit {
  readonly service = inject(TelegramBotsAdminService);

  /** Bot being edited, or null when the form creates a new bot. */
  readonly editingId = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  /** Reactive form values so validation and the submit button track typing. */
  readonly formName = signal('');
  readonly formToken = signal('');
  readonly formUsername = signal('');
  readonly formSettings = signal('');

  /** Which fields the user has interacted with (controls error display). */
  private readonly touched = signal<Record<string, boolean>>({});
  private readonly submitAttempted = signal(false);

  /**
   * Per-user pending bot choice keyed by user id ('' = mock server). A signal
   * so the row's select, the «Назначить» button and the hints re-render on
   * every change instead of relying on the incidental change-detection tick.
   */
  readonly pendingTargets = signal<Record<string, string>>({});

  /** Rows whose assignment succeeded — shows «Сохранено» instead of a hint. */
  readonly savedTargets = signal<Record<string, boolean>>({});

  readonly mockTarget = MOCK_TARGET;

  // ---- per-field validators (mirror backend rules) --------------------

  readonly nameError = computed<string | null>(() => {
    const v = this.formName().trim();
    if (!v) {
      return 'Укажите имя бота (обязательное поле).';
    }
    if (v.length > MAX_NAME_LENGTH) {
      return `Имя длиннее ${MAX_NAME_LENGTH} символов.`;
    }
    return null;
  });

  readonly tokenError = computed<string | null>(() => {
    const v = this.formToken().trim();
    if (!v) {
      // Required only on create; empty token while editing keeps the secret.
      return this.editingId() === null
        ? 'Скопируйте и вставьте токен, который выдал @BotFather.'
        : null;
    }
    if (v.length > MAX_TOKEN_LENGTH) {
      return `Токен длиннее ${MAX_TOKEN_LENGTH} символов.`;
    }
    // Light sanity check that never rejects a genuine BotFather token:
    // it must be "<digits>:<secret>" without surrounding whitespace.
    if (/\s/.test(v) || !/^\d+:.+$/.test(v)) {
      return 'Похоже, токен неполный. Формат из @BotFather: цифры, двоеточие, затем секрет (без пробелов).';
    }
    return null;
  });

  readonly usernameError = computed<string | null>(() => {
    const v = this.formUsername().trim();
    if (v.length > MAX_USERNAME_LENGTH) {
      return `Username длиннее ${MAX_USERNAME_LENGTH} символов.`;
    }
    return null;
  });

  readonly settingsError = computed<string | null>(() => {
    const raw = this.formSettings().trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return 'Settings должен быть JSON-объектом, например {"welcome": "Hello"}.';
      }
      return null;
    } catch {
      return 'Некорректный JSON — проверьте кавычки и скобки.';
    }
  });

  readonly formValid = computed(
    () =>
      !this.nameError() &&
      !this.tokenError() &&
      !this.usernameError() &&
      !this.settingsError(),
  );

  /** Human-readable explanation of why the submit button is disabled. */
  readonly submitReason = computed<string | null>(() => {
    if (this.formValid()) {
      return null;
    }
    const blockers: string[] = [];
    if (this.nameError()) {
      blockers.push('имя');
    }
    if (this.tokenError()) {
      blockers.push('токен');
    }
    if (this.usernameError()) {
      blockers.push('username');
    }
    if (this.settingsError()) {
      blockers.push('settings');
    }
    return `Кнопка неактивна: проверьте — ${blockers.join(', ')}.`;
  });

  ngOnInit(): void {
    this.service.fetchBots();
    this.service.fetchUsers();
  }

  /** Show a field's error only after it was touched or a submit was tried. */
  showError(field: string): boolean {
    return this.submitAttempted() || !!this.touched()[field];
  }

  markTouched(field: string): void {
    this.touched.update((t) => ({ ...t, [field]: true }));
  }

  // ---- bot CRUD --------------------------------------------------------

  onSubmitForm(): void {
    this.submitAttempted.set(true);
    this.formError.set(null);
    if (!this.formValid()) {
      return;
    }

    const name = this.formName().trim();
    const username = this.formUsername().trim();
    const settings = this.parseSettings();
    const id = this.editingId();

    if (id) {
      const body: Parameters<TelegramBotsAdminService['updateBot']>[1] = {
        name,
        isActive: this.currentlyActive(id),
        botUsername: username || null,
        settings: settings.value,
      };
      if (this.formToken().trim()) {
        body.botToken = this.formToken().trim();
      }
      this.submitting.set(true);
      this.service.updateBot(id, body);
      this.resetForm();
      this.submitting.set(false);
      return;
    }

    this.submitting.set(true);
    this.service.createBot({
      name,
      botToken: this.formToken().trim(),
      botUsername: username || undefined,
      settings: settings.value,
    });
    this.resetForm();
    this.submitting.set(false);
  }

  onEdit(bot: TelegramBot): void {
    this.editingId.set(bot.id);
    this.formName.set(bot.name);
    this.formToken.set('');
    this.formUsername.set(bot.botUsername ?? '');
    this.formSettings.set(
      bot.settings ? JSON.stringify(bot.settings, null, 2) : '',
    );
    this.formError.set(null);
    this.submitAttempted.set(false);
    this.touched.set({});
  }

  onCancelEdit(): void {
    this.resetForm();
  }

  onDelete(bot: TelegramBot): void {
    if (!window.confirm(`Удалить бота «${bot.name}»?`)) {
      return;
    }
    if (this.editingId() === bot.id) {
      this.resetForm();
    }
    this.service.deleteBot(bot.id);
  }

  onToggleActive(bot: TelegramBot, event: Event): void {
    const isActive = (event.target as HTMLInputElement).checked;
    this.service.updateBot(bot.id, { isActive });
  }

  // ---- bot assignment ---------------------------------------------------

  /** Current effective bot choice for the user row (pending or persisted). */
  selectedBot(user: AdminUser): string {
    return this.pendingTargets()[user.id] ?? user.telegramBotId ?? MOCK_TARGET;
  }

  onSelectBot(user: AdminUser, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.pendingTargets.update((p) => ({ ...p, [user.id]: value }));
    // A new edit supersedes the previous "saved" confirmation.
    this.savedTargets.update((s) => ({ ...s, [user.id]: false }));
  }

  /** Whether the row's selection differs from the persisted bot. */
  botDirty(user: AdminUser): boolean {
    return this.selectedBot(user) !== (user.telegramBotId ?? MOCK_TARGET);
  }

  /** Whether an assignment request for this row is in flight. */
  botSaving(user: AdminUser): boolean {
    return !!this.service.savingTargets()[user.id];
  }

  /** Failure reason of the last assignment attempt for this row. */
  botError(user: AdminUser): string | null {
    return this.service.targetErrors()[user.id] ?? null;
  }

  /** True once the admin has touched this row's select. */
  botTouched(user: AdminUser): boolean {
    return this.pendingTargets()[user.id] !== undefined;
  }

  /**
   * The "nothing to apply" explanation is only meaningful after the admin has
   * actually interacted with the row (e.g. picked a bot and switched it back),
   * never on a freshly loaded table.
   */
  showsUnchangedHint(user: AdminUser): boolean {
    return (
      this.botTouched(user) && !this.botDirty(user) && !this.botSaving(user)
    );
  }

  showsSavedHint(user: AdminUser): boolean {
    return (
      !!this.savedTargets()[user.id] &&
      !this.botTouched(user) &&
      !this.botSaving(user)
    );
  }

  onApplyBot(user: AdminUser): void {
    const selected = this.selectedBot(user);
    this.service
      .setTarget(user.id, selected === MOCK_TARGET ? null : selected)
      .subscribe({
        // Only a successful response drops the pending choice; the persisted
        // value now comes from the patched `users` signal.
        next: () => {
          this.pendingTargets.update((p) => {
            const rest = { ...p };
            delete rest[user.id];
            return rest;
          });
          this.savedTargets.update((s) => ({ ...s, [user.id]: true }));
        },
        // On failure the selection stays put so the row still shows what the
        // admin wanted, the button remains enabled for a retry, and the
        // mapped reason explains why nothing was applied.
        error: () => undefined,
      });
  }

  // ---- helpers ----------------------------------------------------------

  private currentlyActive(botId: string): boolean {
    return this.service.bots().find((b) => b.id === botId)?.isActive ?? true;
  }

  private parseSettings(): {
    invalid: boolean;
    value: Record<string, unknown> | null;
  } {
    const raw = this.formSettings().trim();
    if (!raw) {
      return { invalid: false, value: null };
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return { invalid: true, value: null };
      }
      return { invalid: false, value: parsed as Record<string, unknown> };
    } catch {
      return { invalid: true, value: null };
    }
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formToken.set('');
    this.formUsername.set('');
    this.formSettings.set('');
    this.formError.set(null);
    this.submitAttempted.set(false);
    this.touched.set({});
  }
}
