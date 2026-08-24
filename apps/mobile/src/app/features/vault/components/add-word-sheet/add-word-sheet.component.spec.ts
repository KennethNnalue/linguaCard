import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AddWordSheetComponent } from './add-word-sheet.component';
import { VaultV2Store } from '../../store/vault-v2.store';

describe('AddWordSheetComponent', () => {
  let component: AddWordSheetComponent;
  let fixture: ComponentFixture<AddWordSheetComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AddWordSheetComponent],
      providers: [{ provide: VaultV2Store, useValue: { vault: signal(null) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddWordSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
