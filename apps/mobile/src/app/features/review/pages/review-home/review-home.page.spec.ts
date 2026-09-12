import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NavigationStart, Router, type Event as RouterEvent} from '@angular/router';
import {ModalController} from '@ionic/angular';
import {Subject} from 'rxjs';
import {AuthService} from '../../../../core/services/auth.service';
import {ShareStore} from '../../../sharing/store/share.store';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewPrefsService} from '../../services/review-prefs.service';
import {ReviewHomeStore, type ReviewHomeViewModel} from '../../store/review-home.store';
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
      streak: 7,
      continuationPlan: {
        cardIds: ['due-1', 'new-1'],
        dueCards: 1,
        newCards: 1,
        reviewCards: 1,
        estimatedMinutes: 1,
      },
    } satisfies ReviewHomeViewModel;

    await page.performPrimaryAction(viewModel);

    expect(openPlanned).toHaveBeenCalledWith(['due-1', 'new-1'], {kind: 'daily'});
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
