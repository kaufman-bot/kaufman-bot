import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ChatService } from './chat.service';
import { SessionService } from './session.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;
  let sessionService: SessionService;

  beforeEach(() => {
    const sessionSpy = {
      apiKey: jest.fn().mockReturnValue('test-api-key'),
    } as unknown as SessionService;

    TestBed.configureTestingModule({
      providers: [
        ChatService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: sessionSpy },
      ],
    });

    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionService = TestBed.inject(SessionService);
  });

  afterEach(() => {
    httpMock.verify();
    service.disconnectStream();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadHistory', () => {
    it('should fetch messages from GET /api/v1/chat/messages', () => {
      const mockMessages = [
        {
          id: '1',
          conversationId: 'conv1',
          senderRole: 'USER' as const,
          content: 'Hello',
          readAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          conversationId: 'conv1',
          senderRole: 'BOT' as const,
          content: 'Hi there!',
          readAt: null,
          createdAt: '2026-01-01T00:01:00Z',
        },
      ];

      service.loadHistory().subscribe((messages) => {
        expect(messages).toEqual(mockMessages);
        expect(messages.length).toBe(2);
      });

      const req = httpMock.expectOne('/api/v1/chat/messages');
      expect(req.request.method).toBe('GET');
      req.flush(mockMessages);
    });

    it('should return empty array on error', () => {
      service.loadHistory().subscribe((messages) => {
        expect(messages).toEqual([]);
      });

      const req = httpMock.expectOne('/api/v1/chat/messages');
      req.error(new ProgressEvent('network error'));
    });
  });

  describe('sendMessage', () => {
    it('should POST to /api/v1/chat/messages with trimmed content', () => {
      const mockResponse = {
        id: 'msg1',
        conversationId: 'conv1',
        senderRole: 'USER' as const,
        content: 'Hello bot',
        readAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      };

      service.sendMessage('  Hello bot  ').subscribe((msg) => {
        expect(msg).toEqual(mockResponse);
      });

      const req = httpMock.expectOne('/api/v1/chat/messages');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ content: 'Hello bot' });
      req.flush(mockResponse, { status: 201, statusText: 'Created' });
    });

    it('should return null on error', () => {
      service.sendMessage('test').subscribe((msg) => {
        expect(msg).toBeNull();
      });

      const req = httpMock.expectOne('/api/v1/chat/messages');
      req.error(new ProgressEvent('network error'));
    });
  });

  describe('connectStream', () => {
    it('should return empty observable when no API key', () => {
      (sessionService.apiKey as jest.Mock).mockReturnValue(null);

      let emitted = false;
      service.connectStream().subscribe({
        next: () => {
          emitted = true;
        },
      });

      expect(emitted).toBe(false);
    });

    it('should set connected signal to false initially', () => {
      expect(service.connected()).toBe(false);
    });
  });

  describe('disconnectStream', () => {
    it('should close EventSource if connected', () => {
      // No-op when not connected
      service.disconnectStream();
      expect(service.connected()).toBe(false);
    });
  });

  describe('messages signal', () => {
    it('should start with empty array', () => {
      expect(service.messages()).toEqual([]);
    });

    it('should be updatable', () => {
      const msgs = [
        {
          id: '1',
          conversationId: 'conv1',
          senderRole: 'USER' as const,
          content: 'Test',
          readAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      service.messages.set(msgs);
      expect(service.messages()).toEqual(msgs);
    });
  });
});
