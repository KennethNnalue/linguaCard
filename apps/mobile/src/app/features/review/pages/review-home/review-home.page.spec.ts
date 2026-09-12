import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NavigationStart, provideRouter, Router, type Event as RouterEvent} from '@angular/router';
import {ModalController} from '@ionic/angular';
import {provideTranslateService} from '@ngx-translate/core';
import {Subject} from 'rxjs';
import {AuthService} from '../../../../core/services/auth.service';
import {ShareStore} from '../../../sharing/store/share.store';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewPrefsService} from '../../services/review-prefs.service';
import type {ReviewHomeViewModel} from '../../models/review-home.model';
import type {ReviewHomeDashboard} from '../../models/review-home.model';
import {ReviewHomeStore} from '../../store/review-home.store';
import {ReviewHomePage} from './review-home.page';

describe('ReviewHomePage account menu', () => {
  let fixture: ComponentFixture<ReviewHomePage>;
  let page: ReviewHomePage;
  let routerEvents: Subject<RouterEvent>;
  let refresh: jest.Mock;
  let openPlanned: jest.Mock;

  beforeEach(async () => {
    routerEvents = new Subject<RouterEvent>();
    refresh = jest.fn().mockResolvedValue(undefined);
    openPlanned = jest.fn().mockResolvedValue(true);
    TestBed.overrideComponent(ReviewHomePage, {
      set: {
        template: '',
        imports: [],
        providers: [
          {provide: ReviewHomeStore, useValue: {refresh}},
          {provide: ReviewPlayerService, useValue: {isLaunching: signal(false), openPlanned}},
          {provide: ReviewPrefsService, useValue: {}},
          {provide: AuthService, useValue: {currentUser: signal(null)}},
          {provide: ShareStore, useValue: {hasPending: signal(false)}},
          {provide: ModalController, useValue: {}},
          {
            provide: Router,
            useValue: {
              events: routerEvents,
              navigate: jest.fn(),
              navigateByUrl: jest.fn(),
            },
          },
        ],
      },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ReviewHomePage);
    page = fixture.componentInstance;
  });

  it('closes the account popover when navigation starts', () => {
    page.menuOpen.set(true);

    routerEvents.next(new NavigationStart(1, '/vault'));

    expect(page.menuOpen()).toBe(false);
  });

  it('starts the exact continuation plan after the daily goal is complete', async () => {
    const viewModel = {
      kind: 'complete',
      reviewedToday: 10,
      goal: 10,
      continuation: {
        kind: 'ready',
        plan: {
          cardIds: ['due-1', 'new-1'],
          dueCards: 1,
          newCards: 1,
          reviewCards: 1,
          estimatedMinutes: 1,
        },
      },
    } satisfies ReviewHomeViewModel;

    await page.performPrimaryAction(viewModel);

    expect(openPlanned).toHaveBeenCalledWith(['due-1', 'new-1'], {kind: 'daily'});
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewHomePage completed state', () => {
  it('keeps an actionable card when a refresh finds no eligible continuation cards', async () => {
    const viewModel = signal<ReviewHomeViewModel>({
      kind: 'complete',
      reviewedToday: 10,
      goal: 10,
      continuation: {
        kind: 'ready',
        plan: {
          cardIds: ['due-1'],
          dueCards: 1,
          newCards: 0,
          reviewCards: 1,
          estimatedMinutes: 1,
        },
      },
    });
    const dashboard = signal<ReviewHomeDashboard>({
      completedToday: 10,
      goal: 10,
      streak: 2,
      preferences: {mode: 'type', autoplay: 'answer_and_example'},
    });
    const navigate = jest.fn().mockResolvedValue(true);
    const refresh = jest.fn().mockResolvedValue(undefined);

    TestBed.overrideComponent(ReviewHomePage, {
      set: {
        providers: [
          {provide: ReviewHomeStore, useValue: {viewModel, dashboard, refresh}},
          {provide: ReviewPlayerService, useValue: {isLaunching: signal(false)}},
          {provide: ReviewPrefsService, useValue: {}},
          {provide: AuthService, useValue: {currentUser: signal(null)}},
          {provide: ShareStore, useValue: {hasPending: signal(false)}},
          {provide: ModalController, useValue: {}},
        ],
      },
    });
    await TestBed.configureTestingModule({
      imports: [ReviewHomePage],
      providers: [provideRouter([]), provideTranslateService()],
    }).compileComponents();
    const router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockImplementation(navigate);
    const fixture = TestBed.createComponent(ReviewHomePage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.review-home__continue')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('review.home.continueAction');

    viewModel.set({kind: 'complete', reviewedToday: 10, goal: 10, continuation: {kind: 'none'}});
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.review-home__continue') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('review.home.nothingDueSupport');
    expect(card?.textContent).toContain('review.home.morePractice');
    card?.querySelector<HTMLElement>('ion-button')?.click();
    expect(navigate).toHaveBeenCalledWith(['/review/more']);

    viewModel.set({kind: 'complete', reviewedToday: 10, goal: 10, continuation: {kind: 'error'}});
    fixture.detectChanges();

    const retryCard = fixture.nativeElement.querySelector('.review-home__continue') as HTMLElement | null;
    expect(retryCard?.textContent).toContain('review.home.errorSupport');
    expect(retryCard?.textContent).toContain('review.home.retry');
    retryCard?.querySelector<HTMLElement>('ion-button')?.click();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
