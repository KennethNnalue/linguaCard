import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { ReviewStore } from '../store/review.store';
import { ReviewPlayerService } from './review-player.service';
import { ReviewPrefsService } from './review-prefs.service';

describe('ReviewPlayerService launch', () => {
  it('starts a planned session with the exact ordered card ids', async () => {
    const startSessionForCards = jest.fn().mockResolvedValue({kind: 'nothing_eligible'});
    const create = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        ReviewPlayerService,
        {provide: ModalController, useValue: {create}},
        {provide: ReviewStore, useValue: {startSessionForCards}},
        {provide: Router, useValue: {}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip'}},
      ],
    });
    const service = TestBed.inject(ReviewPlayerService);
    const cardIds = ['card-b', 'card-a'];

    await expect(service.openPlanned(cardIds, {kind: 'daily'})).resolves.toBe(false);

    expect(startSessionForCards).toHaveBeenCalledWith({kind: 'daily'}, cardIds);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not start or present an empty planned session', async () => {
    const startSessionForCards = jest.fn();
    const create = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        ReviewPlayerService,
        {provide: ModalController, useValue: {create}},
        {provide: ReviewStore, useValue: {startSessionForCards}},
        {provide: Router, useValue: {}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip'}},
      ],
    });
    const service = TestBed.inject(ReviewPlayerService);

    await expect(service.openPlanned([], {kind: 'daily'})).resolves.toBe(false);

    expect(startSessionForCards).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps the current page visible until session preparation finishes', async () => {
    let finishStart: (result: {kind: 'nothing_eligible'}) => void = () => undefined;
    const startResult = new Promise<{kind: 'nothing_eligible'}>(resolve => {
      finishStart = resolve;
    });
    const create = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        ReviewPlayerService,
        {provide: ModalController, useValue: {create}},
        {provide: ReviewStore, useValue: {startSession: jest.fn().mockReturnValue(startResult)}},
        {provide: Router, useValue: {}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip'}},
      ],
    });
    const service = TestBed.inject(ReviewPlayerService);

    const opening = service.openSource({kind: 'daily'}, 20);

    expect(service.isLaunching()).toBe(true);
    expect(create).not.toHaveBeenCalled();

    finishStart({kind: 'nothing_eligible'});
    await expect(opening).resolves.toBe(false);

    expect(create).not.toHaveBeenCalled();
    expect(service.isLaunching()).toBe(false);
  });

  it('does not focus the iOS typing bridge while session preparation is pending', async () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {configurable: true, value: 'iPhone'});
    let finishStart: (result: {kind: 'started'}) => void = () => undefined;
    const startResult = new Promise<{kind: 'started'}>(resolve => {
      finishStart = resolve;
    });
    const typingInput = document.createElement('input');
    typingInput.className = 'ft-input';
    const modalElement = document.createElement('div');
    modalElement.append(typingInput);
    const modal = Object.assign(modalElement, {
      focusTrap: false,
      present: jest.fn().mockResolvedValue(undefined),
      onWillDismiss: jest.fn().mockResolvedValue({data: {completed: false}}),
    });
    const create = jest.fn().mockImplementation(async () => {
      expect(document.querySelector('.lc-ios-keyboard-focus-bridge')).not.toBeNull();
      return modal;
    });
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        ReviewPlayerService,
        {provide: ModalController, useValue: {create}},
        {provide: ReviewStore, useValue: {startSession: jest.fn().mockReturnValue(startResult)}},
        {provide: Router, useValue: {navigate: jest.fn()}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'type'}},
      ],
    });
    const service = TestBed.inject(ReviewPlayerService);

    const opening = service.openSource({kind: 'daily'}, 20);

    expect(document.querySelector('.lc-ios-keyboard-focus-bridge')).toBeNull();
    expect(create).not.toHaveBeenCalled();

    finishStart({kind: 'started'});
    await expect(opening).resolves.toBe(false);

    expect(create).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lc-ios-keyboard-focus-bridge')).toBeNull();
    scrollTo.mockRestore();
    Object.defineProperty(navigator, 'userAgent', {configurable: true, value: originalUserAgent});
  });

  it('covers the document safe area while the native review player is open', async () => {
    const isNativePlatform = jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const modalElement = document.createElement('div');
    const modal = Object.assign(modalElement, {
      present: jest.fn().mockImplementation(async () => {
        expect(document.documentElement.classList.contains('lc-review-player-open')).toBe(true);
        expect(document.body.classList.contains('lc-review-player-open')).toBe(true);
      }),
      onWillDismiss: jest.fn().mockResolvedValue({data: {completed: false}}),
    });
    TestBed.configureTestingModule({
      providers: [
        ReviewPlayerService,
        {provide: ModalController, useValue: {create: jest.fn().mockResolvedValue(modal)}},
        {provide: ReviewStore, useValue: {startSession: jest.fn().mockResolvedValue({kind: 'started'})}},
        {provide: Router, useValue: {navigate: jest.fn()}},
        {provide: ReviewPrefsService, useValue: {mode: () => 'flip'}},
      ],
    });

    try {
      await expect(TestBed.inject(ReviewPlayerService).openSource({kind: 'daily'}, 20)).resolves.toBe(false);

      expect(document.documentElement.classList.contains('lc-review-player-open')).toBe(false);
      expect(document.body.classList.contains('lc-review-player-open')).toBe(false);
    } finally {
      isNativePlatform.mockRestore();
    }
  });
});
