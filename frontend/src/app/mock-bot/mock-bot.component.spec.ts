import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { Subject } from 'rxjs';
import {
  ConversationMessage,
  ConversationSummary,
  MockBotService,
  MockBotStreamEvent,
} from '../mock-bot.service';
import { MockBotComponent } from './mock-bot.component';

describe('MockBotComponent', () => {
  let component: MockBotComponent;
  let fixture: ComponentFixture<MockBotComponent>;
  let mockBotService: MockBotService;
  let httpMock: HttpTestingController;

  const mockConversations: ConversationSummary[] = [
    {
      id: 'conv1',
      userId: 'user1',
      userEmail: 'user1@test.com',
      lastMessage: 'Hello bot',
      lastMessageSenderRole: 'USER',
      lastMessageAt: '2026-01-01T00:00:00Z',
      unreadCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:05:00Z',
    },
    {
      id: 'conv2',
      userId: 'user2',
      userEmail: 'user2@test.com',
      lastMessage: 'Bot reply',
      lastMessageSenderRole: 'BOT',
      lastMessageAt: '2026-01-01T00:10:00Z',
      unreadCount: 0,
      createdAt: '2026-01-01T00:08:00Z',
      updatedAt: '2026-01-01T00:10:00Z',
    },
  ];

  const mockMessages: ConversationMessage[] = [
    {
      id: 'msg1',
      conversationId: 'conv1',
      senderRole: 'USER',
      content: 'Hello',
      readAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'msg2',
      conversationId: 'conv1',
      senderRole: 'BOT',
      content: 'Hi there!',
      readAt: '2026-01-01T00:01:00Z',
      createdAt: '2026-01-01T00:01:00Z',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MockBotComponent],
      providers: [
        MockBotService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    fixture = TestBed.createComponent(MockBotComponent);
    component = fixture.componentInstance;
    mockBotService = TestBed.inject(MockBotService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      const reqs = httpMock.match(() => true);
      reqs.forEach((r) => r.flush([]));
    } catch {
      // No pending requests
    }
    httpMock.verify();
    mockBotService.disconnectStream();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load conversations on init', fakeAsync(() => {
    // Spy on connectStream to prevent actual SSE connection
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();

    // Flush conversations list
    const convReq = httpMock.expectOne('/api/v1/mock-bot/conversations');
    convReq.flush(mockConversations);
    tick();

    expect(mockBotService.conversations().length).toBe(2);
  }));

  it('should render conversation list', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const items = compiled.querySelectorAll('.conversation-item');
    expect(items.length).toBe(2);

    // First conversation shows unread badge
    expect(items[0].querySelector('.unread-badge')?.textContent).toContain('2');
    expect(items[0].querySelector('.conv-email')?.textContent).toContain(
      'user1@test.com',
    );
  }));

  it('should select conversation and load messages', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();
    fixture.detectChanges();

    // Click on first conversation
    component.onSelectConversation('user1');

    // Should flush messages request
    const msgReq = httpMock.expectOne(
      '/api/v1/mock-bot/conversations/user1/messages',
    );
    msgReq.flush(mockMessages);
    tick();

    // Should also refresh conversations
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();

    expect(mockBotService.selectedUserId()).toBe('user1');
    expect(mockBotService.messages().length).toBe(2);
  }));

  it('should show "no selection" when no conversation is selected', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.no-selection')).toBeTruthy();
  }));

  it('should send reply and clear input', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();
    fixture.detectChanges();

    // Select a conversation first
    component.onSelectConversation('user1');
    httpMock
      .expectOne('/api/v1/mock-bot/conversations/user1/messages')
      .flush(mockMessages);
    tick();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();
    fixture.detectChanges();

    // Send reply
    component.replyText = '  Bot response  ';
    component.onSendReply();

    const replyReq = httpMock.expectOne(
      '/api/v1/mock-bot/conversations/user1/messages',
    );
    expect(replyReq.request.method).toBe('POST');
    expect(replyReq.request.body).toEqual({ content: 'Bot response' });

    const replyMsg: ConversationMessage = {
      id: 'msg3',
      conversationId: 'conv1',
      senderRole: 'BOT',
      content: 'Bot response',
      readAt: null,
      createdAt: '2026-01-01T00:05:00Z',
    };
    replyReq.flush(replyMsg, { status: 201, statusText: 'Created' });
    tick();

    // Should refresh conversations
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();

    expect(component.replyText).toBe('');
    expect(component.sending()).toBe(false);
  }));

  it('should not send empty reply', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();

    // Select conversation
    mockBotService.selectedUserId.set('user1');

    component.replyText = '   ';
    component.onSendReply();

    // No POST request should be made
    httpMock.expectNone('/api/v1/mock-bot/conversations/user1/messages');
  }));

  it('should get current user email', fakeAsync(() => {
    jest
      .spyOn(mockBotService, 'connectStream')
      .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());

    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/mock-bot/conversations')
      .flush(mockConversations);
    tick();

    mockBotService.selectedUserId.set('user1');
    expect(component.getCurrentUserEmail()).toBe('user1@test.com');

    mockBotService.selectedUserId.set('user2');
    expect(component.getCurrentUserEmail()).toBe('user2@test.com');

    mockBotService.selectedUserId.set('unknown');
    expect(component.getCurrentUserEmail()).toBe('unknown');
  }));

  it('should format time correctly', () => {
    const formatted = component.formatTime('2026-01-01T12:30:45Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/\d/);
  });

  it('should handle invalid date in formatTime', () => {
    const formatted = component.formatTime('invalid');
    expect(formatted).toBe('');
  });
});
