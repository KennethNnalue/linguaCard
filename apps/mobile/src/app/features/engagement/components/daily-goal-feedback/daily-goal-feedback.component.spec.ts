import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { engagementDayKey } from '../../domain/engagement-domain';
import { DailyGoalFeedbackComponent } from './daily-goal-feedback.component';

describe('DailyGoalFeedbackComponent', () => {
  let fixture: ComponentFixture<DailyGoalFeedbackComponent>;

  beforeEach(async () => {
    jest.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [DailyGoalFeedbackComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
    fixture = TestBed.createComponent(DailyGoalFeedbackComponent);
    fixture.componentRef.setInput('feedback', {
      kind: 'daily_goal_reached', feedbackId: 'feedback-1', dayKey: engagementDayKey('2026-08-16'),
      current: 20, target: 20, messageKey: 'review.engagement.dailyGoalComplete',
    });
    fixture.detectChanges();
  });

  afterEach(() => jest.useRealTimers());

  test('renders an accessible non-modal status', () => {
    const status = fixture.nativeElement.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  test('emits its stable identity after the display interval', () => {
    const dismissed = jest.fn<void, [string]>();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    jest.advanceTimersByTime(3_200);
    expect(dismissed).toHaveBeenCalledWith('feedback-1');
  });
});
