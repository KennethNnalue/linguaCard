import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AddWordSheetComponent } from './add-word-sheet.component';

describe('AddWordSheetComponent', () => {
  let component: AddWordSheetComponent;
  let fixture: ComponentFixture<AddWordSheetComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AddWordSheetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AddWordSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
