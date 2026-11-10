import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import {
  AdminUser,
  TelegramBot,
  TelegramBotsAdminService,
} from '../telegram-bots-admin.service';
import { TelegramBotsAdminComponent } from './telegram-bots-admin.component';

const BOTS_ENDPOINT = '/api/v1/telegram/bots';
const USERS_ENDPOINT = '/api/v1/admin/users';
const TARGET_ENDPOINT = '/api/v1/admin/users/u-1/telegram-target';

function makeBot(id: string, name: string): TelegramBot {
  return {
    id,
    name,
    botToken: '123:abc',
    botUsername: `${id}_bot`,
    isActive: true,
    settings: null,
    ownerId: 'admin-1',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  };
}

function makeUser(telegramBotId: string | null): AdminUser {
  return {
    id: 'u-1',
    email: 'user1@kaufman.bot',
    role: 'USER',
    isActive: true,
    telegramBotId,
  };
}

describe('TelegramBotsAdminComponent — bot assignment row', () => {
  let fixture: ComponentFixture<TelegramBotsAdminComponent>;
  let httpMock: HttpTestingController;

  /** Loads the table with the given bots and a single user row. */
  function hydrate(telegramBotId: string | null): void {
    fixture.detectChanges(); // ngOnInit → fetchBots() + fetchUsers()

    httpMock
      .expectOne(BOTS_ENDPOINT)
      .flush([makeBot('bot-1', 'Support bot'), makeBot('bot-2', 'Ops bot')]);
    httpMock
      .expectOne(USERS_ENDPOINT)
      .flush({ items: [makeUser(telegramBotId)] });

    fixture.detectChanges();
  }

  function compiled(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function botSelect(): HTMLSelectElement {
    // The template binds `name` as a property, so it is not present as an
    // attribute — address the row's select structurally instead.
    return compiled().querySelector(
      '.users-table tbody tr select',
    ) as HTMLSelectElement;
  }

  function applyButton(): HTMLButtonElement {
    const button = Array.from(compiled().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Назначить'),
    );
    return button as HTMLButtonElement;
  }

  function rowText(): string {
    return compiled().querySelector('.users-table')?.textContent ?? '';
  }

  function pickBot(value: string): void {
    const select = botSelect();
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TelegramBotsAdminComponent],
      providers: [
        TelegramBotsAdminService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TelegramBotsAdminComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
    httpMock.verify();
  });

  it('renders the already assigned bot in the row on first load', () => {
    hydrate('bot-1');

    expect(botSelect().value).toBe('bot-1');
    expect(botSelect().selectedOptions[0]?.textContent?.trim()).toBe(
      'Support bot',
    );
  });

  it('renders the mock server option when no bot is assigned', () => {
    hydrate(null);

    expect(botSelect().value).toBe('');
    expect(botSelect().selectedOptions[0]?.textContent?.trim()).toBe(
      'Мок-сервер',
    );
  });

  it('labels the column «Телеграм бот» instead of «Цель»', () => {
    hydrate(null);

    const headers = Array.from(
      compiled().querySelectorAll('.users-table th'),
    ).map((th) => th.textContent?.trim());

    expect(headers).toContain('Телеграм бот');
    expect(headers).not.toContain('Цель');
  });

  it('does not show any "unchanged" hint on a freshly loaded table', () => {
    hydrate(null);

    expect(rowText()).not.toContain('не изменён');
  });

  it('enables «Назначить» only after the selection differs from the saved bot', () => {
    hydrate(null);

    expect(applyButton().disabled).toBe(true);

    pickBot('bot-1');

    expect(applyButton().disabled).toBe(false);
  });

  it('keeps «Сохранение…» visible while the request is in flight', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();
    fixture.detectChanges();

    expect(rowText()).toContain('Сохранение…');

    httpMock.expectOne(TARGET_ENDPOINT).flush(null);
    fixture.detectChanges();
    expect(rowText()).not.toContain('Сохранение…');
  });

  it('sends the chosen bot id in the PUT body', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();

    const request = httpMock.expectOne(TARGET_ENDPOINT);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ telegramBotId: 'bot-1' });

    request.flush(null);
    fixture.detectChanges();
  });

  it('sends null when the mock server is selected', () => {
    hydrate('bot-1');
    pickBot('');
    applyButton().click();

    const request = httpMock.expectOne(TARGET_ENDPOINT);
    expect(request.request.body).toEqual({ telegramBotId: null });

    request.flush(null);
    fixture.detectChanges();
  });

  it('shows the assigned bot in the select and disables the button after a success', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();

    httpMock.expectOne(TARGET_ENDPOINT).flush(null);
    fixture.detectChanges();

    expect(botSelect().value).toBe('bot-1');
    expect(applyButton().disabled).toBe(true);
  });

  it('confirms with «Сохранено» and never claims the bot was left unchanged', () => {
    hydrate(null);
    pickBot('bot-2');
    applyButton().click();

    httpMock.expectOne(TARGET_ENDPOINT).flush(null);
    fixture.detectChanges();

    expect(rowText()).toContain('Сохранено');
    expect(rowText()).not.toContain('не изменён');
  });

  it('clears a previous «Сохранено» as soon as the row is edited again', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();
    httpMock.expectOne(TARGET_ENDPOINT).flush(null);
    fixture.detectChanges();
    expect(rowText()).toContain('Сохранено');

    pickBot('bot-2');

    expect(rowText()).not.toContain('Сохранено');
    expect(applyButton().disabled).toBe(false);
  });

  it('keeps the selection and reports the failure when the request fails', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();

    httpMock
      .expectOne(TARGET_ENDPOINT)
      .flush(
        { statusCode: 404, message: 'Telegram bot not found' },
        { status: 404, statusText: 'Not Found' },
      );
    fixture.detectChanges();

    expect(botSelect().value).toBe('bot-1');
    expect(applyButton().disabled).toBe(false);
    expect(rowText()).toContain('Ресурс не найден');
    // The persisted value was not touched by the failed request.
    expect(
      fixture.componentInstance.service.users()[0].telegramBotId,
    ).toBeNull();
  });

  it('distinguishes an unreachable backend from a rejected key', () => {
    hydrate(null);
    pickBot('bot-1');
    applyButton().click();

    httpMock.expectOne(TARGET_ENDPOINT).error(new ErrorEvent('network error'), {
      status: 0,
      statusText: 'Unknown Error',
    });
    fixture.detectChanges();

    expect(rowText()).toContain('Сервер недоступен');
  });

  it('explains why the button is disabled after the admin reverts the choice', () => {
    hydrate('bot-1');

    pickBot('bot-2');
    pickBot('bot-1');

    expect(applyButton().disabled).toBe(true);
    expect(rowText()).toContain('Телеграм бот не изменён');
  });
});
