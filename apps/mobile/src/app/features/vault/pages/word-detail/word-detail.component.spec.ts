import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WordDetailComponent } from './word-detail.component';
import { VaultV2Store } from '../../store/vault-v2.store';

describe('WordDetailComponent', () => {
  let component: WordDetailComponent;
  let fixture: ComponentFixture<WordDetailComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [WordDetailComponent],
      providers: [{ provide: VaultV2Store, useValue: { vault: signal(null) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(WordDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
