import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AddWordFormComponent } from './add-word-form.component';

describe('AddWordFormComponent', () => {
  let component: AddWordFormComponent;
  let fixture: ComponentFixture<AddWordFormComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AddWordFormComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AddWordFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
