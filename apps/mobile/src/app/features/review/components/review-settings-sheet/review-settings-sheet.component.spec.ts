import {TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular';
import {ReviewSettingsSheetComponent} from './review-settings-sheet.component';

describe('ReviewSettingsSheetComponent', () => {
  it('initializes values assigned through Ionic component props', () => {
    TestBed.configureTestingModule({
      providers: [{provide: ModalController, useValue: {dismiss: jest.fn()}}],
    });
    const component = TestBed.runInInjectionContext(() => new ReviewSettingsSheetComponent());
    component.initialMode = 'flip';
    component.initialAutoplay = 'answer';

    component.ngOnInit();

    expect(component.mode).toBe('flip');
    expect(component.autoplay).toBe('answer');
  });
});
