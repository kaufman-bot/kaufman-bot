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
  ConversationMessage,
  MockBotService,
  MockBotStreamEvent,
} from '../mock-bot.service';

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
                  <span class="time">{{ formatTime(msg.createdAt) }}</span>
                </div>
              }
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
              <button type="submit" [disabled]="sending() || !replyText.trim()">
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
        width: 300px;
        border-right: 1px solid #ddd;
        overflow-y: auto;
        padding-right: 1rem;
      }
      .conversations-panel h2 {
        font-size: 1.1rem;
        margin: 0 0 0.5rem;
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
      .time {
        font-size: 0.7rem;
        opacity: 0.6;
        align-self: flex-end;
      }
      .reply-form {
        display: flex;
        gap: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #ddd;
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
    `,
  ],
})
export class MockBotComponent implements OnInit, OnDestroy, AfterViewChecked {
  mockBotService = inject(MockBotService);

  replyText = '';
  sending = signal(false);

  messagesContainer =
    viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private streamSub: Subscription | null = null;
  private shouldScroll = true;

  ngOnInit(): void {
    // Load conversations
    this.mockBotService.loadConversations().subscribe((convs) => {
      this.mockBotService.conversations.set(convs);
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

  onSendReply(): void {
    const userId = this.mockBotService.selectedUserId();
    const content = this.replyText.trim();
    if (!userId || !content || this.sending()) return;

    this.sending.set(true);
    this.mockBotService.sendReply(userId, content).subscribe({
      next: (msg) => {
        if (msg) {
          const current = this.mockBotService.messages();
          if (!current.find((m) => m.id === msg.id)) {
            this.mockBotService.messages.set([...current, msg]);
          }
        }
        this.replyText = '';
        this.sending.set(false);
        this.shouldScroll = true;
        // Refresh conversations list
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

  private handleStreamEvent(event: MockBotStreamEvent): void {
    // If this event is for the currently selected conversation, add it
    const selectedUserId = this.mockBotService.selectedUserId();
    if (selectedUserId && event.userId === selectedUserId) {
      const newMsg: ConversationMessage = {
        id: event.messageId,
        conversationId: event.conversationId,
        senderRole: event.senderRole,
        content: event.content,
        readAt: null,
        createdAt: event.createdAt,
      };

      const current = this.mockBotService.messages();
      if (!current.find((m) => m.id === newMsg.id)) {
        this.mockBotService.messages.set([...current, newMsg]);
        this.shouldScroll = true;
      }
    }

    // Refresh conversations list for unread count updates
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
