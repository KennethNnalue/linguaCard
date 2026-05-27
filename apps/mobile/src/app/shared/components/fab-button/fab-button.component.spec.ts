import {ComponentFixture, TestBed, waitForAsync} from '@angular/core/testing';

import {FabButtonComponent} from './fab-button.component';

describe('FabButtonComponent', () => {
  let component: FabButtonComponent;
  let fixture: ComponentFixture<FabButtonComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [FabButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FabButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
