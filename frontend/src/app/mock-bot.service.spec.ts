import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MockBotService } from './mock-bot.service';
import { SessionService } from './session.service';

describe('MockBotService', () => {
  let service: MockBotService;
  let httpMock: HttpTestingController;
  let sessionService: SessionService;

  beforeEach(() => {
    const sessionSpy = {
      apiKey: jest.fn().mockReturnValue('admin-api-key'),
    } as unknown as SessionService;

    TestBed.configureTestingModule({
      providers: [
        MockBotService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: sessionSpy },
      ],
    });

    service = TestBed.inject(MockBotService);
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

  describe('loadConversations', () => {
    it('should fetch conversations from GET /api/v1/mock-bot/conversations', () => {
      const mockConvs = [
        {
          id: 'conv1',
          userId: 'user1',
          userEmail: 'user1@test.com',
          lastMessage: 'Hello',
          lastMessageSenderRole: 'USER' as const,
          lastMessageAt: '2026-01-01T00:00:00Z',
          unreadCount: 2,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:05:00Z',
        },
      ];

      service.loadConversations().subscribe((convs) => {
        expect(convs).toEqual(mockConvs);
        expect(convs.length).toBe(1);
      });

      const req = httpMock.expectOne('/api/v1/mock-bot/conversations');
      expect(req.request.method).toBe('GET');
      req.flush(mockConvs);
    });

    it('should return empty array on error', () => {
      service.loadConversations().subscribe((convs) => {
        expect(convs).toEqual([]);
      });

      const req = httpMock.expectOne('/api/v1/mock-bot/conversations');
      req.error(new ProgressEvent('network error'));
    });
  });

  describe('loadMessages', () => {
    it('should fetch messages for a user from GET /api/v1/mock-bot/conversations/:userId/messages', () => {
      const mockMsgs = [
        {
          id: 'msg1',
          conversationId: 'conv1',
          senderRole: 'USER' as const,
          content: 'Hello',
          readAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      service.loadMessages('user1').subscribe((msgs) => {
        expect(msgs).toEqual(mockMsgs);
      });

      const req = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockMsgs);
    });

    it('should return empty array on error', () => {
      service.loadMessages('user1').subscribe((msgs) => {
        expect(msgs).toEqual([]);
      });

      const req = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      req.error(new ProgressEvent('network error'));
    });
  });

  describe('sendReply', () => {
    it('should POST to /api/v1/mock-bot/conversations/:userId/messages', () => {
      const mockResponse = {
        id: 'reply1',
        conversationId: 'conv1',
        senderRole: 'BOT' as const,
        content: 'Bot reply',
        readAt: null,
        createdAt: '2026-01-01T00:02:00Z',
      };

      service.sendReply('user1', '  Bot reply  ').subscribe((msg) => {
        expect(msg).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ content: 'Bot reply' });
      req.flush(mockResponse, { status: 201, statusText: 'Created' });
    });

    it('should return null on error', () => {
      service.sendReply('user1', 'test').subscribe((msg) => {
        expect(msg).toBeNull();
      });

      const req = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      req.error(new ProgressEvent('network error'));
    });
  });

  describe('selectConversation', () => {
    it('should set selectedUserId and load messages', () => {
      const mockMsgs = [
        {
          id: 'msg1',
          conversationId: 'conv1',
          senderRole: 'USER' as const,
          content: 'Hello',
          readAt: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      service.selectConversation('user1');
      expect(service.selectedUserId()).toBe('user1');

      const req = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      req.flush(mockMsgs);

      expect(service.messages().length).toBe(1);
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

  describe('signals', () => {
    it('should start with empty conversations', () => {
      expect(service.conversations()).toEqual([]);
    });

    it('should start with empty messages', () => {
      expect(service.messages()).toEqual([]);
    });

    it('should start with null selectedUserId', () => {
      expect(service.selectedUserId()).toBeNull();
    });
  });
});
