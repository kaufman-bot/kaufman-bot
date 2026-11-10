import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { routes } from './app.routes';
import { authInterceptor } from './auth.interceptor';
import { SessionService } from './session.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    // Put the saved API key back into the session before the first rendering,
    // so that the very first requests of a reloaded page are authorised. The
    // route guards wait for the key check itself via SessionService.whenReady().
    provideAppInitializer(() => inject(SessionService).restore()),
  ],
};
