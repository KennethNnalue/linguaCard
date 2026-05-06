import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ArticleBadgeComponent } from './article-badge.component';

describe('ArticleBadgeComponent', () => {
  let component: ArticleBadgeComponent;
  let fixture: ComponentFixture<ArticleBadgeComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ArticleBadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ArticleBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
