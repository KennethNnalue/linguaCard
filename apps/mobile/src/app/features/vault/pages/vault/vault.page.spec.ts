import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { signal } from '@angular/core';

import { VaultPage } from './vault.page';
import { VaultV2Store } from '../../store/vault-v2.store';

const vaultStoreStub = {
  vault: signal(null), learningItems: signal([]), isVaultLoading: signal(false),
  isLearningItemsLoading: signal(false), loadActiveVault: jest.fn(),
};

describe('VaultPage', () => {
  let component: VaultPage;
  let fixture: ComponentFixture<VaultPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [VaultPage],
      providers: [provideIonicAngular(), provideRouter([]), { provide: VaultV2Store, useValue: vaultStoreStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
