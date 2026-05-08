import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ListenComponent } from './listen.component';

describe('ListenComponent', () => {
  let component: ListenComponent;
  let fixture: ComponentFixture<ListenComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ListenComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ListenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
