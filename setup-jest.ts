import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { Storage } from '@ionic/storage-angular';
import { provideTranslateService } from '@ngx-translate/core';
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';
import { NEVER } from 'rxjs';

setupZoneTestEnv();

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: jest.fn().mockImplementation((query: string): MediaQueryList => ({
    addEventListener: jest.fn(),
    addListener: jest.fn(),
    dispatchEvent: jest.fn().mockReturnValue(false),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
    removeListener: jest.fn(),
  })),
  writable: true,
});

const storageMock: Pick<Storage, 'create' | 'defineDriver' | 'get' | 'remove' | 'set'> = {
  create: jest.fn().mockResolvedValue(undefined),
  defineDriver: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
};

const serviceWorkerUpdateMock: Pick<SwUpdate, 'activateUpdate' | 'checkForUpdate' | 'isEnabled' | 'unrecoverable' | 'versionUpdates'> = {
  activateUpdate: jest.fn().mockResolvedValue(false),
  checkForUpdate: jest.fn().mockResolvedValue(false),
  isEnabled: false,
  unrecoverable: NEVER,
  versionUpdates: NEVER,
};

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      provideTranslateService(),
      { provide: Storage, useValue: storageMock },
      { provide: SwUpdate, useValue: serviceWorkerUpdateMock },
    ],
  });
});

afterEach(() => {
  jest.clearAllMocks();
});
