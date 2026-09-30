import { finalize, from, map, mergeMap, Observable } from 'rxjs';
import { X_API_KEY } from '../../src/constants/api-key.constants.js';
import { client as defaultClient } from '../generated/client/client.gen.js';
import {
  createClient,
  type Client,
  type Config,
} from '../generated/client/client/index.js';
import { Sdk } from '../generated/client/sdk.gen.js';
import type {
  ApiKeySecretDto,
  AuthProfileDto,
  AuthRegisterDto,
  CreateApiKeyRequestDto,
} from '../generated/client/types.gen.js';
import { messageOf, unwrap } from './api-result.js';
import { getRandomSha7 } from './utils.js';

/**
 * Address of the REAL running backend under test. Override with E2E_BASE_URL
 * (e.g. `E2E_BASE_URL=http://localhost:3001 npm run test:e2e`).
 */
export const DEFAULT_BASE_URL =
  process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

/** Password every fixture account registered through the helper gets. */
const FIXTURE_PASSWORD = 'e2e-fixture-password';

/**
 * Test-side API client (adapted from opwork test/utils/activity-helper.ts).
 *
 * Just like opwork's version it wraps the OpenAPI-generated SDK
 * (openapi-ts.config.ts → test/generated/client) instead of hand-written
 * fetch calls. opwork keeps a session/profile state in the client headers;
 * this project authenticates with API keys, so `loginByApiKey` / `logout`
 * manage the `x-api-key` header through the same `updateClientConfig()` idea.
 *
 * The helper talks to an already running backend: tests never boot the app,
 * and it is the only place where test fixtures are produced — always through
 * controller endpoints, never through Prisma or SQL.
 */
export class ActivityHelper {
  /** Generated client — used directly for calls not covered by the SDK. */
  readonly client: Client;

  /** Generated typed SDK (sdk.gen.ts). */
  readonly sdk: Sdk;

  readonly baseUrl: string;

  randomSha7 = getRandomSha7();

  /** Profile resolved by the last successful `getAuthProfile()` call. */
  authProfile: AuthProfileDto | null = null;

  private apiKey: string | null = null;

  constructor(config: Config = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.client = createClient({ ...config, baseUrl: this.baseUrl });
    this.sdk = new Sdk({ client: this.client });
    this.updateClientConfig();
  }

  get currentApiKey(): string | null {
    return this.apiKey;
  }

  /** Presents the given API key on all subsequent SDK calls. */
  loginByApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.updateClientConfig();
  }

  logout(): void {
    this.apiKey = null;
    this.authProfile = null;
    this.updateClientConfig();
  }

  /** GET /auth/me with the currently presented key (null when rejected). */
  async getAuthProfile(): Promise<AuthProfileDto | null> {
    const result = await this.sdk.authControllerMeV1();
    this.authProfile = result.data ?? null;
    return this.authProfile;
  }

  /**
   * Presents the API key and resolves the auth profile (same flow as
   * opwork's loginByApiKey). Returns null when the key is rejected.
   */
  async loginAndFetchProfile(apiKey: string): Promise<AuthProfileDto | null> {
    this.loginByApiKey(apiKey);
    const profile = await this.getAuthProfile();
    if (!profile) {
      this.apiKey = null;
      this.updateClientConfig();
    }
    return profile;
  }

  /** Presents the seeded ADMIN key and returns it. */
  loginAsAdmin(): string {
    const apiKey = ActivityHelper.adminApiKey();
    this.loginByApiKey(apiKey);
    return apiKey;
  }

  /**
   * E2E specs hit an already running backend instead of booting the app, so
   * they fail fast here with an actionable message when it is not up.
   */
  async ensureBackendRunning(): Promise<void> {
    const hint =
      `Start the backend first: "npm run start:dev" (from backend/), ` +
      `or point the suite at another port with E2E_BASE_URL.`;

    const result = await this.sdk
      .healthControllerCheckV1()
      .catch((error: unknown) => {
        throw new Error(
          `Backend is not reachable at ${this.baseUrl}. ${hint} Cause: ${String(error)}`,
          { cause: error },
        );
      });

    if (!result.response) {
      throw new Error(
        `Backend is not reachable at ${this.baseUrl}. ${hint} Cause: ${messageOf(result.error)}`,
      );
    }

    if (result.response.status !== 200) {
      throw new Error(
        `Backend at ${this.baseUrl} answered GET /health with ` +
          `${result.response.status} — the service is up but unhealthy ` +
          `(check DATABASE_URL).`,
      );
    }
  }

  /**
   * ADMIN key of the seeded account (see src/seed/seed.service.ts). It comes
   * from the environment, never from the database.
   */
  static adminApiKey(): string {
    const key = process.env['ADMIN_API_KEY'];
    if (!key) {
      throw new Error(
        'ADMIN_API_KEY is not set; the e2e suite needs it to tear down the accounts it creates',
      );
    }

    return key;
  }

  /** ISO-8601 string `ms` milliseconds away from now (negative = the past). */
  static isoFromNow(ms: number): string {
    return new Date(Date.now() + ms).toISOString();
  }

  /** POST /auth/register — the only way a test obtains an account. */
  async registerAccount(email: string): Promise<AuthRegisterDto> {
    const result = await this.sdk.authControllerRegisterV1({
      body: { email, password: FIXTURE_PASSWORD },
    });

    return unwrap(result, `POST /auth/register for ${email}`);
  }

  /** POST /api-keys with the key currently presented by this helper. */
  async issueKey(body: CreateApiKeyRequestDto): Promise<ApiKeySecretDto> {
    const result = await this.sdk.apiKeysControllerCreateV1({ body });

    return unwrap(result, `POST /api-keys (${body.name})`);
  }

  /**
   * DELETE /admin/users/:id used as teardown; needs an ADMIN session (see
   * `loginAsAdmin`). A 404 is ignored because a test may already have deleted
   * the account it asserts on.
   */
  async removeAccountAsAdmin(userId: string): Promise<void> {
    const result = await this.sdk.adminUsersControllerRemoveV1({
      path: { id: userId },
    });

    if (
      result.response &&
      result.response.status !== 404 &&
      result.response.status !== 204
    ) {
      throw new Error(
        `DELETE /admin/users/${userId} failed with ${result.response.status}: ${messageOf(result.error)}`,
      );
    }
  }

  /**
   * SSE reader built on the generated client's `client.sse.get` (opwork's
   * sse()): yields parsed `data:` payloads and aborts the stream on
   * unsubscribe.
   */
  sse<T>(...args: Parameters<typeof defaultClient.sse.get>): Observable<T> {
    const controller = new AbortController();
    const options = args[0];

    return from(
      this.client.sse.get({ ...options, signal: controller.signal }),
    ).pipe(
      mergeMap(({ stream }) => from(stream)),
      map((event) => event as T),
      finalize(() => controller.abort()),
    );
  }

  private updateClientConfig(): void {
    this.client.setConfig({
      headers: { [X_API_KEY]: this.apiKey || null },
    });
  }
}
