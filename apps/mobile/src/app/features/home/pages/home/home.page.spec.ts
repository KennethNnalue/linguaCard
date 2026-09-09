import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { HomePage } from './home.page';
import { ReviewAudioPreparationService } from '../../../review/services/review-audio-preparation.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  const prepareSource = jest.fn();

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        {provide: ReviewAudioPreparationService, useValue: {prepareSource}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('prepares the collection selected for review', () => {
    prepareSource.mockClear();

    component.selectedCollectionId.set('collection-1');
    TestBed.tick();

    expect(prepareSource).toHaveBeenCalledWith(
      {kind: 'collection', collectionId: 'collection-1'},
      expect.any(Number),
    );
  });
});
