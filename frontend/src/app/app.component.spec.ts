import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  // DashboardService polls health every 10s via setInterval registered on the
  // component's DestroyRef — destroy the fixture so Jest has no open handles.
  let fixture: ComponentFixture<AppComponent>;

  afterEach(() => {
    fixture?.destroy();
  });

  beforeEach(async () => {
    // AppComponent injects DashboardService which requires HttpClient.
    // The testing backend swallows requests instead of hitting the network.
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'kaufman-bot' title`, () => {
    fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('kaufman-bot');
  });

  it('should render title', () => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'kaufman-bot — Dashboard',
    );
  });
});
