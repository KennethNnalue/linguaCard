import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {CardStore} from '../../../vault/store/card.store';
import {SettingsStore} from '../../../settings/store/settings.store';
import {ReviewRoute} from '../../models/review.model';
import {LeechService} from '../../services/leech.service';
import {ReviewPlayerService} from '../../services/review-player.service';
import {MorePracticePage} from './more-practice.page';

describe('MorePracticePage', () => {
  const newCount = signal(3);
  const openSource = jest.fn().mockResolvedValue(false);
  const navigate = jest.fn().mockResolvedValue(true);

  beforeEach(() => {
    jest.clearAllMocks();
    newCount.set(3);
    TestBed.configureTestingModule({
      providers: [
        {provide: CardStore, useValue: {newCount, strugglingCount: signal(2), loadCards: jest.fn()}},
        {provide: LeechService, useValue: {leechCount: signal(1)}},
        {provide: SettingsStore, useValue: {dailyGoal: () => 20}},
        {provide: ReviewPlayerService, useValue: {openSource, isLaunching: signal(false)}},
        {provide: Router, useValue: {navigate}},
      ],
    });
  });

  it('starts a bounded new-only session', () => {
    const page = TestBed.runInInjectionContext(() => new MorePracticePage());

    page.startNewWords();

    expect(openSource).toHaveBeenCalledWith({kind: 'new-only'}, 20);
  });

  it('does not start an empty new-only session', () => {
    newCount.set(0);
    const page = TestBed.runInInjectionContext(() => new MorePracticePage());

    page.startNewWords();

    expect(openSource).not.toHaveBeenCalled();
  });

  it('routes advanced practice to the existing focused screens', () => {
    const page = TestBed.runInInjectionContext(() => new MorePracticePage());

    page.openStruggling();
    page.openLeeches();
    page.openCustom();

    expect(navigate.mock.calls).toEqual([
      [[ReviewRoute.STRUGGLING]],
      [[ReviewRoute.LEECHES]],
      [[ReviewRoute.CUSTOM]],
    ]);
  });
});
