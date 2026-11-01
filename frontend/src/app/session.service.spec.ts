import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    const routerSpy = {
      navigate: jest.fn(),
    } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        SessionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);

    // Clear localStorage before each test
    localStorage.clear();

    // Flush any pending requests from constructor (validateStoredKey)
    try {
      const req = httpMock.expectOne('/api/v1/auth/me');
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
    } catch (e) {
      // No pending request, that's fine
    }
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no authentication', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBeNull();
    expect(service.profile()).toBeNull();
  });

  it('should login successfully with valid API key', () => {
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe((profile) => {
      expect(profile).toEqual(mockProfile);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.apiKey()).toBe('sk-test-key');
      expect(service.profile()).toEqual(mockProfile);
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ apiKey: 'sk-test-key' });
    req.flush(mockProfile);
  });

  it('should clear session on login failure', () => {
    service.login('sk-invalid-key').subscribe((profile) => {
      expect(profile).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.apiKey()).toBeNull();
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(
      { message: 'Invalid API key' },
      { status: 401, statusText: 'Unauthorized' },
    );
  });

  it('should logout and clear session', () => {
    // First login
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(mockProfile);

    expect(service.isAuthenticated()).toBe(true);

    // Then logout
    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBeNull();
    expect(service.profile()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should expire session and redirect to login', () => {
    // First login
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(mockProfile);

    // Then expire
    service.expire();

    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should detect admin role', () => {
    const adminProfile = {
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
        isActive: true,
      },
      apiKey: {
        id: 'key-1',
        name: 'Admin Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-admin-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(adminProfile);

    expect(service.isAdmin()).toBe(true);
  });

  it('should not be admin for USER role', () => {
    const userProfile = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER' as const,
        isActive: true,
      },
      apiKey: {
        id: 'key-1',
        name: 'User Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-user-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(userProfile);

    expect(service.isAdmin()).toBe(false);
  });
});
