import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { MasteryDotComponent } from './mastery-dot.component';

describe('MasteryDotComponent', () => {
  let component: MasteryDotComponent;
  let fixture: ComponentFixture<MasteryDotComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [MasteryDotComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MasteryDotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
