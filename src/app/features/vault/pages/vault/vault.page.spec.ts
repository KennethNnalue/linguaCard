import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { VaultPage } from './vault.page';

describe('VaultPage', () => {
  let component: VaultPage;
  let fixture: ComponentFixture<VaultPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [VaultPage],
      providers: [provideIonicAngular(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
