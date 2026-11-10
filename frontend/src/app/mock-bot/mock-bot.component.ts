import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ButtonPreset,
  ConversationMessage,
  KeyboardButton,
  MockBotService,
  MockBotStreamEvent,
} from '../mock-bot.service';

/**
 * Operator console for the mock bot. Beyond the plain conversation list
 * and text-reply flow it now exposes:
 *
 *   - an inline-keyboard composer that accumulates `{ title, callbackData }`
 *     buttons in a working area, edits them in place and attaches them to
 *     the next reply. The panel mirrors the backend rules (1..12 buttons,
 *     title ≤64 chars, callbackData ≤256 chars) so a submit only fires
 *     when the payload would pass server-side validation;
 *   - a preset panel that lists the ADMIN's own saved button sets, loads
 *     one into the working area, saves the current working area as a new
 *     preset, saves edits back into the loaded preset, renames an existing
 *     one, and deletes a preset;
 *   - read-only rendering of `msg.buttons` on BOT messages plus plain
 *     rendering of `USER` `kind=BUTTON` callbacks. The console deliberately
 *     does NOT filter those clicks out — an operator must see every press.
 */
@Component({
  selector: 'app-mock-bot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mock-bot-container">
      <header class="mock-bot-header">
        <h1>Мок-сервер бота</h1>
        <span class="status" [class.connected]="mockBotService.connected()">
          {{ mockBotService.connected() ? 'Подключено' : 'Отключено' }}
        </span>
      </header>

      <div class="main-layout">
        <!-- Conversation list sidebar -->
        <aside class="conversations-panel">
          <h2>Диалоги</h2>
          @if (mockBotService.conversations().length === 0) {
            <p class="empty">Нет диалогов</p>
          }
          @for (conv of mockBotService.conversations(); track conv.id) {
            <div
              class="conversation-item"
              [class.active]="mockBotService.selectedUserId() === conv.userId"
              (click)="onSelectConversation(conv.userId)"
            >
              <div class="conv-header">
                <span class="conv-email">{{ conv.userEmail }}</span>
                @if (conv.unreadCount > 0) {
                  <span class="unread-badge">{{ conv.unreadCount }}</span>
                }
              </div>
              @if (conv.lastMessage) {
                <div class="conv-preview">
                  <span class="conv-sender">
                    {{
                      conv.lastMessageSenderRole === 'USER'
                        ? 'Пользователь'
                        : 'Бот'
                    }}:
                  </span>
                  {{ conv.lastMessage }}
                </div>
              }
              @if (conv.lastMessageAt) {
                <div class="conv-time">
                  {{ formatTime(conv.lastMessageAt) }}
                </div>
              }
            </div>
          }

          <h2 class="presets-title">Пресеты кнопок</h2>
          <div class="presets-panel">
            @if (mockBotService.presets().length === 0) {
              <p class="empty">Нет сохранённых пресетов</p>
            }
            @for (preset of mockBotService.presets(); track preset.id) {
              <div class="preset-item">
                <div class="preset-header">
                  <input
                    type="text"
                    class="preset-name"
                    [value]="preset.name"
                    (change)="onRenamePreset(preset.id, presetNameInput.value)"
                    #presetNameInput
                    [disabled]="presetBusy()"
                  />
                </div>
                <div class="preset-buttons">
                  @for (btn of preset.buttons; track btn.callbackData) {
                    <span class="preset-chip">{{ btn.title }}</span>
                  }
                </div>
                <div class="preset-actions">
                  <button
                    type="button"
                    class="link"
                    (click)="onLoadPreset(preset)"
                    [disabled]="presetBusy()"
                  >
                    Загрузить
                  </button>
                  <button
                    type="button"
                    class="link danger"
                    (click)="onDeletePreset(preset.id)"
                    [disabled]="presetBusy()"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            }
          </div>
        </aside>

        <!-- Message view -->
        <section class="messages-panel">
          @if (!mockBotService.selectedUserId()) {
            <div class="no-selection">
              <p>Выберите диалог слева</p>
            </div>
          } @else {
            <div class="messages-header">
              <h3>{{ getCurrentUserEmail() }}</h3>
            </div>

            <div class="messages" #messagesContainer>
              @if (mockBotService.messages().length === 0) {
                <p class="empty">Нет сообщений</p>
              }
              @for (msg of mockBotService.messages(); track msg.id) {
                <div
                  class="message"
                  [class.user]="msg.senderRole === 'USER'"
                  [class.bot]="msg.senderRole === 'BOT'"
                >
                  <span class="sender">
                    {{ msg.senderRole === 'USER' ? 'Пользователь' : 'Бот' }}
                  </span>
                  <span class="content">{{ msg.content }}</span>
                  @if (
                    msg.senderRole === 'BOT' &&
                    msg.buttons &&
                    msg.buttons.length
                  ) {
                    <div class="keyboard">
                      @for (btn of msg.buttons; track btn.callbackData) {
                        <span class="keyboard-chip">{{ btn.title }}</span>
                      }
                    </div>
                  }
                  <span class="time">{{ formatTime(msg.createdAt) }}</span>
                </div>
              }
            </div>

            <!-- Button composer (working area) -->
            <div class="composer">
              <div class="composer-header">
                <span class="composer-title">Кнопки ответа</span>
                <span class="composer-hint">
                  {{ draftButtons().length }}/12
                </span>
              </div>

              @for (btn of draftButtons(); track idx; let idx = $index) {
                <div class="draft-row">
                  <input
                    type="text"
                    class="draft-title"
                    placeholder="Текст кнопки"
                    [ngModel]="btn.title"
                    (ngModelChange)="onEditButton(idx, 'title', $event)"
                    maxlength="64"
                  />
                  <input
                    type="text"
                    class="draft-callback"
                    placeholder="callback_data"
                    [ngModel]="btn.callbackData"
                    (ngModelChange)="onEditButton(idx, 'callbackData', $event)"
                    maxlength="256"
                  />
                  <button
                    type="button"
                    class="link danger"
                    (click)="onRemoveButton(idx)"
                  >
                    Удалить
                  </button>
                </div>
              }

              <div class="composer-actions">
                <button
                  type="button"
                  class="link"
                  (click)="onAddButton()"
                  [disabled]="draftButtons().length >= 12"
                >
                  + Добавить кнопку
                </button>
                @if (draftButtons().length > 0) {
                  @if (loadedPresetId()) {
                    <button
                      type="button"
                      class="link primary"
                      (click)="onUpdateLoadedPreset()"
                      [disabled]="presetBusy()"
                    >
                      Сохранить изменения
                    </button>
                  }
                  <button
                    type="button"
                    class="link"
                    (click)="onSaveAsPreset()"
                    [disabled]="presetBusy()"
                  >
                    Сохранить как пресет…
                  </button>
                  <button type="button" class="link" (click)="onClearDraft()">
                    Очистить
                  </button>
                }
              </div>
            </div>

            <form class="reply-form" (ngSubmit)="onSendReply()">
              <input
                type="text"
                [(ngModel)]="replyText"
                name="reply"
                placeholder="Ответить от имени бота..."
                [disabled]="sending()"
                autocomplete="off"
              />
              <button type="submit" [disabled]="sending() || !canReply()">
                {{ sending() ? 'Отправка...' : 'Ответить' }}
              </button>
            </form>
          }
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      .mock-bot-container {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 120px);
        max-width: 1200px;
        margin: 0 auto;
        padding: 1rem;
      }
      .mock-bot-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #ddd;
        padding-bottom: 0.5rem;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
        color: #333;
      }
      .status {
        font-size: 0.85rem;
        color: #999;
      }
      .status.connected {
        color: #2e7d32;
      }
      .main-layout {
        display: flex;
        flex: 1;
        overflow: hidden;
        gap: 1rem;
        padding-top: 1rem;
      }
      .conversations-panel {
        width: 320px;
        border-right: 1px solid #ddd;
        overflow-y: auto;
        padding-right: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .conversations-panel h2 {
        font-size: 1.1rem;
        margin: 0 0 0.5rem;
      }
      .presets-title {
        margin-top: 1rem !important;
        border-top: 1px dashed #ddd;
        padding-top: 0.75rem;
      }
      .empty {
        color: #999;
        text-align: center;
        padding: 1rem;
      }
      .conversation-item {
        padding: 0.75rem;
        border: 1px solid #eee;
        border-radius: 8px;
        margin-bottom: 0.5rem;
        cursor: pointer;
        transition: background 0.2s;
      }
      .conversation-item:hover {
        background: #f5f5f5;
      }
      .conversation-item.active {
        background: #e3f2fd;
        border-color: #1976d2;
      }
      .conv-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .conv-email {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .unread-badge {
        background: #1976d2;
        color: white;
        border-radius: 10px;
        padding: 0.1rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .conv-preview {
        font-size: 0.85rem;
        color: #666;
        margin-top: 0.25rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .conv-sender {
        font-weight: 500;
      }
      .conv-time {
        font-size: 0.75rem;
        color: #999;
        margin-top: 0.25rem;
      }
      .messages-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .no-selection {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: #999;
      }
      .messages-header h3 {
        margin: 0 0 0.5rem;
        font-size: 1rem;
      }
      .messages {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.5rem 0;
      }
      .message {
        max-width: 70%;
        padding: 0.5rem 0.75rem;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .message.user {
        align-self: flex-start;
        background: #f0f0f0;
        color: #333;
      }
      .message.bot {
        align-self: flex-end;
        background: #1976d2;
        color: white;
      }
      .sender {
        font-size: 0.75rem;
        opacity: 0.8;
      }
      .content {
        word-break: break-word;
      }
      .keyboard {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.35rem;
      }
      .keyboard-chip {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        background: rgba(255, 255, 255, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 6px;
        font-size: 0.8rem;
      }
      .time {
        font-size: 0.7rem;
        opacity: 0.6;
        align-self: flex-end;
      }
      .composer {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
        margin-top: 0.5rem;
        background: #fafafa;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .composer-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        color: #666;
      }
      .composer-title {
        font-weight: 600;
      }
      .draft-row {
        display: flex;
        gap: 0.4rem;
        align-items: center;
      }
      .draft-row input {
        flex: 1;
        padding: 0.35rem 0.5rem;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 0.85rem;
      }
      .draft-title {
        max-width: 40%;
      }
      .draft-callback {
        max-width: 40%;
      }
      .composer-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .link {
        background: none;
        border: none;
        color: #1976d2;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        font-size: 0.85rem;
        text-decoration: underline;
      }
      .link.danger {
        color: #c62828;
      }
      .link.primary {
        color: #1565c0;
        font-weight: 600;
      }
      .link:disabled {
        color: #999;
        cursor: not-allowed;
      }
      .reply-form {
        display: flex;
        gap: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #ddd;
        margin-top: 0.5rem;
      }
      .reply-form input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid #ccc;
        border-radius: 8px;
        font-size: 1rem;
      }
      .reply-form button {
        padding: 0.75rem 1.5rem;
        background: #2e7d32;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
      }
      .reply-form button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .preset-item {
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 0.5rem 0.6rem;
        margin-bottom: 0.4rem;
        background: white;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .preset-name {
        width: 100%;
        padding: 0.25rem 0.4rem;
        border: 1px solid transparent;
        border-radius: 4px;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .preset-name:hover,
      .preset-name:focus {
        border-color: #ccc;
        outline: none;
      }
      .preset-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
      }
      .preset-chip {
        padding: 0.1rem 0.4rem;
        background: #e3f2fd;
        color: #1976d2;
        border-radius: 4px;
        font-size: 0.75rem;
      }
      .preset-actions {
        display: flex;
        gap: 0.5rem;
      }
    `,
  ],
})
export class MockBotComponent implements OnInit, OnDestroy, AfterViewChecked {
  mockBotService = inject(MockBotService);

  replyText = '';
  sending = signal(false);
  /** Working area — the button set that will be attached to the next reply. */
  draftButtons = signal<KeyboardButton[]>([]);
  /** Guards against double-submit on preset mutations while a call is in flight. */
  presetBusy = signal(false);
  /**
   * Id of the preset the working area was loaded from (or last "Save as…"
   * created). When set, the composer shows "Сохранить изменения" so the
   * operator can persist the edited button set back into that preset
   * instead of only creating a fresh one. Cleared on `onClearDraft` and on
   * conversation reload so a stale id never leaks across contexts.
   */
  loadedPresetId = signal<string | null>(null);

  messagesContainer =
    viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private streamSub: Subscription | null = null;
  private shouldScroll = true;

  ngOnInit(): void {
    // Load conversations
    this.mockBotService.loadConversations().subscribe((convs) => {
      this.mockBotService.conversations.set(convs);
    });
    // Load presets owned by this operator. Errors already resolve to []
    // inside the service, so the panel just stays empty.
    this.mockBotService.listPresets().subscribe((presets) => {
      this.mockBotService.presets.set(presets);
    });

    // Connect to SSE stream
    this.streamSub = this.mockBotService.connectStream().subscribe({
      next: (event) => this.handleStreamEvent(event),
    });
  }

  ngOnDestroy(): void {
    this.streamSub?.unsubscribe();
    this.mockBotService.disconnectStream();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  onSelectConversation(userId: string): void {
    this.mockBotService.selectConversation(userId);
    this.shouldScroll = true;
    // Refresh conversations list to update unread counts
    this.mockBotService.loadConversations().subscribe((convs) => {
      this.mockBotService.conversations.set(convs);
    });
  }

  /**
   * Reply is allowed only when there is either non-blank text or at least
   * one non-blank button (both title and callbackData). Mirrors the
   * backend `replyAsBot` contract so the console never fires a request
   * that would 400 on the server.
   */
  canReply(): boolean {
    if (this.replyText.trim().length > 0) return true;
    return this.hasValidDraft();
  }

  private hasValidDraft(): boolean {
    const draft = this.draftButtons();
    if (draft.length === 0) return false;
    return draft.every(
      (b) => b.title.trim().length > 0 && b.callbackData.trim().length > 0,
    );
  }

  onSendReply(): void {
    const userId = this.mockBotService.selectedUserId();
    if (!userId || this.sending() || !this.canReply()) return;

    const content = this.replyText.trim();
    const buttons = this.hasValidDraft()
      ? this.draftButtons().map((b) => ({
          title: b.title.trim(),
          callbackData: b.callbackData.trim(),
        }))
      : undefined;

    this.sending.set(true);
    this.mockBotService.sendReply(userId, content, buttons).subscribe({
      next: (msg) => {
        if (msg) {
          const current = this.mockBotService.messages();
          if (!current.find((m) => m.id === msg.id)) {
            this.mockBotService.messages.set([...current, msg]);
          }
        }
        this.replyText = '';
        this.draftButtons.set([]);
        this.sending.set(false);
        this.shouldScroll = true;
        this.mockBotService.loadConversations().subscribe((convs) => {
          this.mockBotService.conversations.set(convs);
        });
      },
      error: () => {
        this.sending.set(false);
      },
    });
  }

  getCurrentUserEmail(): string {
    const userId = this.mockBotService.selectedUserId();
    if (!userId) return '';
    const conv = this.mockBotService
      .conversations()
      .find((c) => c.userId === userId);
    return conv?.userEmail ?? userId;
  }

  formatTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  /** Composer: adds an empty slot to the working area. */
  onAddButton(): void {
    if (this.draftButtons().length >= 12) return;
    this.draftButtons.update((list) => [
      ...list,
      { title: '', callbackData: '' },
    ]);
  }

  /** Composer: two-way bind one field of a working-area button. */
  onEditButton(
    index: number,
    field: 'title' | 'callbackData',
    value: string,
  ): void {
    this.draftButtons.update((list) => {
      const clone = [...list];
      if (!clone[index]) return list;
      clone[index] = { ...clone[index], [field]: value };
      return clone;
    });
  }

  /** Composer: removes one working-area button. */
  onRemoveButton(index: number): void {
    this.draftButtons.update((list) => list.filter((_, i) => i !== index));
  }

  /** Composer: clears the working area entirely. */
  onClearDraft(): void {
    this.draftButtons.set([]);
    this.loadedPresetId.set(null);
  }

  /** Preset panel: copy the preset's buttons into the working area. */
  onLoadPreset(preset: ButtonPreset): void {
    this.draftButtons.set(
      preset.buttons.map((b) => ({
        title: b.title,
        callbackData: b.callbackData,
      })),
    );
    this.loadedPresetId.set(preset.id);
  }

  /**
   * Preset panel: persists the current working area as a new preset. The
   * name is asked inline via `prompt()` — this keeps the console usable
   * without a separate dialog component while still forcing the operator
   * to think about the intent. Nothing is sent when the working area is
   * invalid or the operator cancels.
   */
  onSaveAsPreset(): void {
    if (!this.hasValidDraft()) return;
    const raw =
      typeof window !== 'undefined' ? window.prompt('Имя пресета') : null;
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;

    const buttons = this.draftButtons().map((b) => ({
      title: b.title.trim(),
      callbackData: b.callbackData.trim(),
    }));
    this.presetBusy.set(true);
    this.mockBotService.createPreset(name, buttons).subscribe((preset) => {
      this.presetBusy.set(false);
      if (preset) {
        this.mockBotService.presets.update((list) => [preset, ...list]);
        this.loadedPresetId.set(preset.id);
      }
    });
  }

  /**
   * Composer: writes the working-area button set back into the preset it
   * was loaded from (PATCH with `buttons` only — the name is unchanged and
   * therefore omitted). Reuses the validated trimmed buttons; a subsequent
   * edit can be saved again because the working area still matches that
   * preset.
   */
  onUpdateLoadedPreset(): void {
    const id = this.loadedPresetId();
    if (!id || !this.hasValidDraft()) return;

    const buttons = this.draftButtons().map((b) => ({
      title: b.title.trim(),
      callbackData: b.callbackData.trim(),
    }));
    this.presetBusy.set(true);
    this.mockBotService.updatePreset(id, { buttons }).subscribe((updated) => {
      this.presetBusy.set(false);
      if (updated) {
        this.mockBotService.presets.update((list) =>
          list.map((p) => (p.id === updated.id ? updated : p)),
        );
      }
    });
  }

  /** Preset panel: rename an existing preset (blur or Enter triggers). */
  onRenamePreset(id: string, rawName: string): void {
    const name = rawName.trim();
    const current = this.mockBotService.presets().find((p) => p.id === id);
    if (!current || current.name === name || !name) return;

    this.presetBusy.set(true);
    this.mockBotService.updatePreset(id, { name }).subscribe((updated) => {
      this.presetBusy.set(false);
      if (updated) {
        this.mockBotService.presets.update((list) =>
          list.map((p) => (p.id === updated.id ? updated : p)),
        );
      }
    });
  }

  /** Preset panel: delete a preset. Sent messages keep their buttons. */
  onDeletePreset(id: string): void {
    this.presetBusy.set(true);
    this.mockBotService.deletePreset(id).subscribe((ok) => {
      this.presetBusy.set(false);
      if (ok) {
        this.mockBotService.presets.update((list) =>
          list.filter((p) => p.id !== id),
        );
      }
    });
  }

  private handleStreamEvent(event: MockBotStreamEvent): void {
    const selectedUserId = this.mockBotService.selectedUserId();
    if (selectedUserId && event.userId === selectedUserId) {
      const newMsg: ConversationMessage = {
        id: event.messageId,
        conversationId: event.conversationId,
        senderRole: event.senderRole,
        content: event.content,
        buttons: event.buttons ?? null,
        readAt: null,
        createdAt: event.createdAt,
      };

      const current = this.mockBotService.messages();
      if (!current.find((m) => m.id === newMsg.id)) {
        this.mockBotService.messages.set([...current, newMsg]);
        this.shouldScroll = true;
      }
    }

    this.mockBotService.loadConversations().subscribe((convs) => {
      this.mockBotService.conversations.set(convs);
    });
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer();
    if (el) {
      el.nativeElement.scrollTop = el.nativeElement.scrollHeight;
    }
  }
}
