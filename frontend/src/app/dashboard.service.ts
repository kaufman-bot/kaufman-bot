import {
  Injectable,
  signal,
  DestroyRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// Через dev-server proxy (proxy.conf.json) — запросы /api проксируются на бэкенд.
const API_BASE = '/api';
// Backend URI versioning (see backend/src/main.ts): /api/v1/...
const API_V1 = `${API_BASE}/v1`;

export interface HealthData {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
  };
  stats: {
    users: number;
    apiKeys: number;
  };
  server: {
    hostname: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    memory: {
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPercent: number;
    };
    cpu: {
      model: string;
      cores: number;
      loadAvg: number[];
    };
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  serverTime = signal<string>('—');
  restTime = signal<string>('—');
  health = signal<HealthData | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor() {
    // SSE/EventSource and the polling loop use browser-only APIs that are
    // unavailable during server-side rendering, so only run them in the browser.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.startSse();
    this.fetchHealth();
    this.fetchRestTime();
    // refresh health & the REST time snapshot every 10s
    const id = setInterval(() => {
      this.fetchHealth();
      this.fetchRestTime();
    }, 10_000);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  private startSse() {
    const es = new EventSource(`${API_V1}/time/stream`);
    es.onmessage = (e) => {
      const { time } = JSON.parse(e.data) as { time: string };
      this.serverTime.set(new Date(time).toLocaleString());
    };
    es.onerror = () => this.serverTime.set('offline');
    this.destroyRef.onDestroy(() => es.close());
  }

  fetchRestTime() {
    // GET /time returns a JSON-encoded ISO date string, e.g. "2026-...Z".
    this.http.get<string>(`${API_V1}/time`).subscribe({
      next: (data) => this.restTime.set(new Date(data).toLocaleString()),
      error: () => this.restTime.set('нет данных'),
    });
  }

  private fetchHealth() {
    this.http.get<HealthData>(`${API_V1}/health`).subscribe({
      next: (data) => {
        this.health.set(data);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message ?? 'Failed to fetch health data');
      },
    });
  }
}
