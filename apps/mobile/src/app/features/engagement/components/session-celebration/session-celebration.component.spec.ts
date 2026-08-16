import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { SessionCelebration } from '../../domain/engagement-domain';
import { SessionCelebrationComponent } from './session-celebration.component';

function celebration(): SessionCelebration {
  return {
    celebrationId: 'session-complete:session-1', sessionId: 'session-1',
    titleKey: 'review.summary.sessionComplete', reviewedWords: 20,
    dailyProgress: { current: 20, target: 20, goalComplete: true, completedDuringSession: true },
    streak: { current: 14, state: 'safe' },
    rewards: { pointsEarnedInSession: 35, dailyGoalBonus: 10, totalLearningPoints: 120 },
    earnedMasteryCount: 1, intensity: 'goal_completed',
  };
}

describe('SessionCelebrationComponent', () => {
  let fixture: ComponentFixture<SessionCelebrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionCelebrationComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { review: {
      summary: { sessionComplete: 'Session complete' },
      engagement: {
        wordsStudied: '{{count}} words studied', dailyGoalComplete: 'Daily goal complete',
        dayStreak: '{{count}}-day streak', sessionPoints: '+{{count}} Learning Points this session',
        dailyGoalBonus: '+{{count}} Learning Points goal bonus', totalLearningPoints: '{{count}} total Learning Points',
      },
    } });
    translate.use('en');
    fixture = TestBed.createComponent(SessionCelebrationComponent);
    fixture.componentRef.setInput('celebration', celebration());
  });

  test('renders all earned facts in a static presentation', () => {
    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('20');
    expect(fixture.nativeElement.textContent).toContain('14');
    expect(fixture.nativeElement.textContent).toContain('35');
    expect(fixture.nativeElement.querySelector('.session-celebration--animate')).toBeNull();
  });

  test('enables the restrained goal animation only when requested', () => {
    fixture.componentRef.setInput('animate', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-celebration--animate')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.session-celebration__sparkles span')).toHaveLength(4);
  });
});
