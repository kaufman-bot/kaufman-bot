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
      buttons: null,
      readAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'msg2',
      conversationId: 'conv1',
      senderRole: 'BOT',
      content: 'Hi there!',
      buttons: null,
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

    // Every test triggers ngOnInit which lists presets; default to an
    // empty list so the panel starts clean. Individual tests override
    // this spy when they need a preset in the response.
    jest.spyOn(mockBotService, 'listPresets').mockReturnValue(of([]));
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
      buttons: null,
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

  describe('button composer', () => {
    /** Boot the component and select the first conversation. */
    function openConversation(): void {
      jest
        .spyOn(mockBotService, 'connectStream')
        .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());
      fixture.detectChanges();
      httpMock
        .expectOne('/api/v1/mock-bot/conversations')
        .flush(mockConversations);
      tick();
      component.onSelectConversation('user1');
      httpMock
        .expectOne('/api/v1/mock-bot/conversations/user1/messages')
        .flush([]);
      httpMock
        .expectOne('/api/v1/mock-bot/conversations')
        .flush(mockConversations);
      tick();
      fixture.detectChanges();
    }

    it('add-button extends the working area with a blank slot', fakeAsync(() => {
      openConversation();

      component.onAddButton();
      component.onAddButton();

      expect(component.draftButtons().length).toBe(2);
      expect(component.draftButtons()[0]).toEqual({
        title: '',
        callbackData: '',
      });
    }));

    it('edit-button mutates only the targeted field', fakeAsync(() => {
      openConversation();
      component.onAddButton();

      component.onEditButton(0, 'title', 'Yes');
      component.onEditButton(0, 'callbackData', 'yes');

      expect(component.draftButtons()[0]).toEqual({
        title: 'Yes',
        callbackData: 'yes',
      });
    }));

    it('remove-button drops that slot', fakeAsync(() => {
      openConversation();
      component.onAddButton();
      component.onAddButton();
      component.onEditButton(1, 'title', 'X');

      component.onRemoveButton(0);

      expect(component.draftButtons().length).toBe(1);
      expect(component.draftButtons()[0].title).toBe('X');
    }));

    it('onSendReply attaches a trimmed working set to the POST body', fakeAsync(() => {
      openConversation();
      component.onAddButton();
      component.onEditButton(0, 'title', '  Yes  ');
      component.onEditButton(0, 'callbackData', '  yes  ');
      component.replyText = 'Choose';

      component.onSendReply();

      const replyReq = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      expect(replyReq.request.body).toEqual({
        content: 'Choose',
        buttons: [{ title: 'Yes', callbackData: 'yes' }],
      });

      replyReq.flush(
        {
          id: 'sent',
          conversationId: 'conv1',
          senderRole: 'BOT',
          content: 'Choose',
          buttons: [{ title: 'Yes', callbackData: 'yes' }],
          readAt: null,
          createdAt: '2026-01-01T00:05:00Z',
        } satisfies ConversationMessage,
        { status: 201, statusText: 'Created' },
      );
      tick();

      httpMock
        .expectOne('/api/v1/mock-bot/conversations')
        .flush(mockConversations);
      tick();

      // Composer is cleared after a successful send so the operator does
      // not accidentally resend the same keyboard.
      expect(component.draftButtons()).toEqual([]);
    }));

    it('onSendReply allows a buttons-only payload (empty content)', fakeAsync(() => {
      openConversation();
      component.onAddButton();
      component.onEditButton(0, 'title', 'Confirm');
      component.onEditButton(0, 'callbackData', 'confirm');
      component.replyText = '';

      expect(component.canReply()).toBe(true);
      component.onSendReply();

      const replyReq = httpMock.expectOne(
        '/api/v1/mock-bot/conversations/user1/messages',
      );
      expect(replyReq.request.body).toEqual({
        content: '',
        buttons: [{ title: 'Confirm', callbackData: 'confirm' }],
      });
      replyReq.flush({ id: 'x' }, { status: 201, statusText: 'Created' });
      tick();
      httpMock
        .expectOne('/api/v1/mock-bot/conversations')
        .flush(mockConversations);
      tick();
    }));

    it('canReply is false when both text and buttons are blank', fakeAsync(() => {
      openConversation();
      component.replyText = '   ';
      expect(component.canReply()).toBe(false);

      component.onAddButton(); // blank slot
      expect(component.canReply()).toBe(false);
    }));
  });

  describe('preset panel', () => {
    const samplePreset = {
      id: 'p1',
      name: 'Yes/No',
      buttons: [
        { title: 'Yes', callbackData: 'yes' },
        { title: 'No', callbackData: 'no' },
      ],
      ownerId: 'admin-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    function loadWithPreset(): void {
      jest
        .spyOn(mockBotService, 'connectStream')
        .mockReturnValue(new Subject<MockBotStreamEvent>().asObservable());
      jest
        .spyOn(mockBotService, 'listPresets')
        .mockReturnValue(of([samplePreset]));

      fixture.detectChanges();
      httpMock
        .expectOne('/api/v1/mock-bot/conversations')
        .flush(mockConversations);
      tick();
      fixture.detectChanges();
    }

    it('renders every caller-owned preset in the panel', fakeAsync(() => {
      loadWithPreset();

      const compiled = fixture.nativeElement as HTMLElement;
      const items = compiled.querySelectorAll('.preset-item');
      expect(items.length).toBe(1);
      const nameInput =
        items[0].querySelector<HTMLInputElement>('.preset-name');
      expect(nameInput?.value).toBe('Yes/No');
      const chips = items[0].querySelectorAll('.preset-chip');
      expect(chips.length).toBe(2);
      expect(chips[0].textContent?.trim()).toBe('Yes');
    }));

    it('onLoadPreset copies the preset buttons into the working area', fakeAsync(() => {
      loadWithPreset();
      expect(component.draftButtons().length).toBe(0);

      component.onLoadPreset(samplePreset);

      expect(component.draftButtons()).toEqual([
        { title: 'Yes', callbackData: 'yes' },
        { title: 'No', callbackData: 'no' },
      ]);
    }));

    it('onDeletePreset calls DELETE and removes it from the list', fakeAsync(() => {
      loadWithPreset();
      expect(mockBotService.presets().length).toBe(1);

      component.onDeletePreset('p1');

      const req = httpMock.expectOne('/api/v1/mock-bot/presets/p1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      tick();

      expect(mockBotService.presets().length).toBe(0);
    }));

    it('onRenamePreset PATCHes the row and updates the local list', fakeAsync(() => {
      loadWithPreset();

      component.onRenamePreset('p1', 'Renamed');

      const req = httpMock.expectOne('/api/v1/mock-bot/presets/p1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Renamed' });
      req.flush({ ...samplePreset, name: 'Renamed' });
      tick();

      expect(mockBotService.presets()[0].name).toBe('Renamed');
    }));

    it('onSaveAsPreset posts the current working area as a new preset', fakeAsync(() => {
      loadWithPreset();
      const promptSpy = jest
        .spyOn(window, 'prompt')
        .mockReturnValue('My new preset');
      component.onAddButton();
      component.onEditButton(0, 'title', 'Hi');
      component.onEditButton(0, 'callbackData', 'hi');

      component.onSaveAsPreset();

      expect(promptSpy).toHaveBeenCalled();
      const req = httpMock.expectOne('/api/v1/mock-bot/presets');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'My new preset',
        buttons: [{ title: 'Hi', callbackData: 'hi' }],
      });
      req.flush(
        {
          id: 'p-new',
          name: 'My new preset',
          buttons: [{ title: 'Hi', callbackData: 'hi' }],
          ownerId: 'admin-1',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        { status: 201, statusText: 'Created' },
      );
      tick();

      expect(mockBotService.presets().length).toBe(2);
      expect(mockBotService.presets()[0].name).toBe('My new preset');
      promptSpy.mockRestore();
    }));

    it('onLoadPreset marks the working area as bound to that preset', fakeAsync(() => {
      loadWithPreset();

      component.onLoadPreset(samplePreset);

      expect(component.loadedPresetId()).toBe('p1');

      component.onClearDraft();

      expect(component.loadedPresetId()).toBeNull();
    }));

    it('onUpdateLoadedPreset PATCHes buttons back into the loaded preset', fakeAsync(() => {
      loadWithPreset();
      component.onLoadPreset(samplePreset);
      component.onEditButton(0, 'title', 'Yep');

      component.onUpdateLoadedPreset();

      const req = httpMock.expectOne('/api/v1/mock-bot/presets/p1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        buttons: [
          { title: 'Yep', callbackData: 'yes' },
          { title: 'No', callbackData: 'no' },
        ],
      });
      req.flush({
        ...samplePreset,
        buttons: [
          { title: 'Yep', callbackData: 'yes' },
          { title: 'No', callbackData: 'no' },
        ],
      });
      tick();

      expect(mockBotService.presets()[0].buttons[0].title).toBe('Yep');
    }));

    it('Сохранить изменения button appears only after loading a preset', fakeAsync(() => {
      loadWithPreset();
      component.onSelectConversation('user1');
      httpMock
        .expectOne('/api/v1/mock-bot/conversations/user1/messages')
        .flush([]);
      tick();
      component.onAddButton();
      component.onEditButton(0, 'title', 'Hi');
      component.onEditButton(0, 'callbackData', 'hi');
      fixture.detectChanges();

      let compiled = fixture.nativeElement as HTMLElement;
      expect(
        Array.from(compiled.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Сохранить изменения',
        ),
      ).toBeUndefined();

      component.onLoadPreset(samplePreset);
      fixture.detectChanges();
      compiled = fixture.nativeElement as HTMLElement;
      const saveBtn = Array.from(compiled.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Сохранить изменения',
      );
      expect(saveBtn).toBeDefined();
    }));
  });
});
