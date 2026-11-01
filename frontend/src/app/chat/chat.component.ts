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
import { ChatMessage, ChatService, ChatStreamEvent } from '../chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-container">
      <header class="chat-header">
        <h1>Чат с ботом</h1>
        <span class="status" [class.connected]="chatService.connected()">
          {{ chatService.connected() ? 'Подключено' : 'Отключено' }}
        </span>
      </header>

      <div class="messages" #messagesContainer>
        @if (chatService.messages().length === 0) {
          <p class="empty">Нет сообщений. Напишите боту!</p>
        }
        @for (msg of chatService.messages(); track msg.id) {
          <div
            class="message"
            [class.user]="msg.senderRole === 'USER'"
            [class.bot]="msg.senderRole === 'BOT'"
          >
            <span class="sender">{{
              msg.senderRole === 'USER' ? 'Вы' : 'Бот'
            }}</span>
            <span class="content">{{ msg.content }}</span>
            <span class="time">{{ formatTime(msg.createdAt) }}</span>
          </div>
        }
      </div>

      <form class="input-form" (ngSubmit)="onSend()">
        <input
          type="text"
          [(ngModel)]="inputText"
          name="message"
          placeholder="Введите сообщение..."
          [disabled]="sending()"
          autocomplete="off"
        />
        <button type="submit" [disabled]="sending() || !inputText.trim()">
          {{ sending() ? 'Отправка...' : 'Отправить' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .chat-container {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 120px);
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem;
      }
      .chat-header {
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
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 1rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .empty {
        text-align: center;
        color: #999;
        margin: auto;
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
        align-self: flex-end;
        background: #1976d2;
        color: white;
      }
      .message.bot {
        align-self: flex-start;
        background: #f0f0f0;
        color: #333;
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
      .input-form {
        display: flex;
        gap: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #ddd;
      }
      .input-form input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid #ccc;
        border-radius: 8px;
        font-size: 1rem;
      }
      .input-form button {
        padding: 0.75rem 1.5rem;
        background: #1976d2;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
      }
      .input-form button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    `,
  ],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  chatService = inject(ChatService);

  inputText = '';
  sending = signal(false);

  messagesContainer =
    viewChild<ElementRef<HTMLDivElement>>('messagesContainer');
  private streamSub: Subscription | null = null;
  private shouldScroll = true;

  ngOnInit(): void {
    // Load history first
    this.chatService.loadHistory().subscribe((messages) => {
      this.chatService.messages.set(messages);
      this.scrollToBottom();
    });

    // Connect to SSE stream for real-time updates
    this.streamSub = this.chatService.connectStream().subscribe({
      next: (event) => this.handleStreamEvent(event),
    });
  }

  ngOnDestroy(): void {
    this.streamSub?.unsubscribe();
    this.chatService.disconnectStream();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  onSend(): void {
    const content = this.inputText.trim();
    if (!content || this.sending()) return;

    this.sending.set(true);
    this.chatService.sendMessage(content).subscribe({
      next: (msg) => {
        if (msg) {
          // Message already added via SSE, but ensure it's in the list
          const current = this.chatService.messages();
          if (!current.find((m) => m.id === msg.id)) {
            this.chatService.messages.set([...current, msg]);
          }
        }
        this.inputText = '';
        this.sending.set(false);
        this.shouldScroll = true;
      },
      error: () => {
        this.sending.set(false);
      },
    });
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

  private handleStreamEvent(event: ChatStreamEvent): void {
    const newMsg: ChatMessage = {
      id: event.messageId,
      conversationId: event.conversationId,
      senderRole: event.senderRole,
      content: event.content,
      readAt: null,
      createdAt: event.createdAt,
    };

    const current = this.chatService.messages();
    // Avoid duplicates
    if (!current.find((m) => m.id === newMsg.id)) {
      this.chatService.messages.set([...current, newMsg]);
      this.shouldScroll = true;
    }
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer();
    if (el) {
      el.nativeElement.scrollTop = el.nativeElement.scrollHeight;
    }
  }
}
