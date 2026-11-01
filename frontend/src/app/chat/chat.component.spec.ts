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
import { of, Subject } from 'rxjs';
import { ChatMessage, ChatService, ChatStreamEvent } from '../chat.service';
import { ChatComponent } from './chat.component';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;
  let chatService: ChatService;
  let httpMock: HttpTestingController;

  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      conversationId: 'conv1',
      senderRole: 'USER',
      content: 'Hello',
      readAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: '2',
      conversationId: 'conv1',
      senderRole: 'BOT',
      content: 'Hi there!',
      readAt: null,
      createdAt: '2026-01-01T00:01:00Z',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [ChatService, provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    chatService = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Clean up any pending HTTP requests
    try {
      const reqs = httpMock.match(() => true);
      reqs.forEach((r) => r.flush([]));
    } catch {
      // No pending requests
    }
    httpMock.verify();
    chatService.disconnectStream();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load history on init', () => {
    fixture.detectChanges(); // triggers ngOnInit

    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush(mockMessages);

    expect(chatService.messages().length).toBe(2);
    expect(chatService.messages()[0].content).toBe('Hello');
  });

  it('should render messages from history', fakeAsync(() => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush(mockMessages);
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const messageElements = compiled.querySelectorAll('.message');
    expect(messageElements.length).toBe(2);

    // First message is USER
    expect(messageElements[0].classList.contains('user')).toBe(true);
    expect(messageElements[0].querySelector('.content')?.textContent).toContain(
      'Hello',
    );

    // Second message is BOT
    expect(messageElements[1].classList.contains('bot')).toBe(true);
    expect(messageElements[1].querySelector('.content')?.textContent).toContain(
      'Hi there!',
    );
  }));

  it('should show empty message when no history', fakeAsync(() => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush([]);
    tick();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty')).toBeTruthy();
  }));

  it('should send message and clear input', fakeAsync(() => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush(mockMessages);
    tick();
    fixture.detectChanges();

    component.inputText = '  New message  ';
    component.onSend();

    const sendReq = httpMock.expectOne('/api/v1/chat/messages');
    expect(sendReq.request.method).toBe('POST');
    expect(sendReq.request.body).toEqual({ content: 'New message' });

    const sentMsg: ChatMessage = {
      id: '3',
      conversationId: 'conv1',
      senderRole: 'USER',
      content: 'New message',
      readAt: null,
      createdAt: '2026-01-01T00:02:00Z',
    };
    sendReq.flush(sentMsg, { status: 201, statusText: 'Created' });
    tick();

    expect(component.inputText).toBe('');
    expect(component.sending()).toBe(false);
  }));

  it('should not send empty message', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/chat/messages').flush(mockMessages);

    component.inputText = '   ';
    component.onSend();

    // No POST request should be made
    httpMock.expectNone('/api/v1/chat/messages');
  });

  it('should add SSE stream event to messages', fakeAsync(() => {
    // Use a Subject so we control when the SSE event is emitted
    const streamSubject = new Subject<ChatStreamEvent>();
    jest
      .spyOn(chatService, 'connectStream')
      .mockReturnValue(streamSubject.asObservable());

    fixture.detectChanges();

    // Flush history first
    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush(mockMessages);
    tick();
    fixture.detectChanges();

    expect(chatService.messages().length).toBe(2);

    // Now emit SSE event
    const streamEvent: ChatStreamEvent = {
      messageId: 'sse-1',
      conversationId: 'conv1',
      senderRole: 'BOT',
      content: 'Bot reply via SSE',
      createdAt: '2026-01-01T00:03:00Z',
    };
    streamSubject.next(streamEvent);
    tick();
    fixture.detectChanges();

    // The SSE event should have been added
    expect(chatService.messages().length).toBe(3);
    expect(chatService.messages()[2].content).toBe('Bot reply via SSE');
    expect(chatService.messages()[2].senderRole).toBe('BOT');
  }));

  it('should not duplicate messages from SSE', fakeAsync(() => {
    // Start with one message
    const existingMsg = mockMessages[0];
    jest.spyOn(chatService, 'connectStream').mockReturnValue(
      of({
        messageId: existingMsg.id, // Same ID as existing
        conversationId: 'conv1',
        senderRole: 'USER',
        content: existingMsg.content,
        createdAt: existingMsg.createdAt,
      }),
    );

    fixture.detectChanges();
    const req = httpMock.expectOne('/api/v1/chat/messages');
    req.flush([existingMsg]);
    tick();
    fixture.detectChanges();

    // Should still be 1, not 2
    expect(chatService.messages().length).toBe(1);
  }));

  it('should format time correctly', () => {
    const formatted = component.formatTime('2026-01-01T12:30:45Z');
    expect(formatted).toBeTruthy();
    // The exact format depends on locale, but it should contain digits
    expect(formatted).toMatch(/\d/);
  });

  it('should handle formatTime with invalid date', () => {
    const formatted = component.formatTime('invalid');
    expect(formatted).toBe('');
  });
});
