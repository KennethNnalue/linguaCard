import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NavigationStart, Router, type Event as RouterEvent} from '@angular/router';
import {ModalController} from '@ionic/angular';
import {Subject} from 'rxjs';
import {AuthService} from '../../../../core/services/auth.service';
import {ShareStore} from '../../../sharing/store/share.store';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewPrefsService} from '../../services/review-prefs.service';
import {ReviewHomeStore} from '../../store/review-home.store';
import {ReviewHomePage} from './review-home.page';

describe('ReviewHomePage account menu', () => {
  let fixture: ComponentFixture<ReviewHomePage>;
  let page: ReviewHomePage;
  let routerEvents: Subject<RouterEvent>;

  beforeEach(async () => {
    routerEvents = new Subject<RouterEvent>();
    TestBed.overrideComponent(ReviewHomePage, {
      set: {
        template: '',
        imports: [],
        providers: [
          {provide: ReviewHomeStore, useValue: {refresh: jest.fn().mockResolvedValue(undefined)}},
          {provide: ReviewPlayerService, useValue: {isLaunching: signal(false)}},
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
});
