import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideTranslateService} from '@ngx-translate/core';
import type {ReviewHomeDashboard} from '../../models/review-home.model';
import {ReviewHomeControlsComponent} from './review-home-controls.component';

const dashboard: ReviewHomeDashboard = {
  reviewedToday: 5,
  personalGoal: 10,
  streakTarget: 10,
  streak: 3,
  preferences: {mode: 'type', autoplay: 'answer_and_example'},
};

describe('ReviewHomeControlsComponent', () => {
  let fixture: ComponentFixture<ReviewHomeControlsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewHomeControlsComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
    fixture = TestBed.createComponent(ReviewHomeControlsComponent);
    fixture.componentRef.setInput('dashboard', dashboard);
    fixture.detectChanges();
  });

  it('keeps daily-goal progress and streak as separate metrics', () => {
    const metrics = fixture.nativeElement.querySelectorAll('.review-home-controls__metric');

    expect(metrics).toHaveLength(2);
    expect(metrics[0].textContent).toContain('review.home.personalGoalLabel');
    expect(metrics[1].textContent).toContain('review.home.streakGoalLabel');
    expect(metrics[1].textContent).toContain('review.home.streak');
    expect(fixture.nativeElement.querySelector('.review-home-controls__streak-progress')).not.toBeNull();
  });

  it('hides completed streak progress while preserving the streak count', () => {
    fixture.componentRef.setInput('dashboard', {...dashboard, reviewedToday: 10});
    fixture.detectChanges();

    const metrics = fixture.nativeElement.querySelectorAll('.review-home-controls__metric');
    expect(metrics[0].textContent).toContain('review.home.personalGoalLabel');
    expect(metrics[1].textContent).toContain('review.home.streak');
    expect(fixture.nativeElement.querySelector('.review-home-controls__streak-progress')).toBeNull();
  });

  it('places mode and audio on separate settings lines', () => {
    const details = fixture.nativeElement.querySelectorAll('.review-home-controls__settings-detail');

    expect(details).toHaveLength(2);
    expect(details[0].textContent).toContain('review.home.settings.mode');
    expect(details[0].textContent).toContain('review.mode.type');
    expect(details[1].textContent).toContain('review.audioAutoplay.title');
    expect(details[1].textContent).toContain('review.audioAutoplay.answer_and_example');
  });

  it('aligns the streak chevron using the same end slot as the other cards', () => {
    const settingsChevron = fixture.nativeElement.querySelector(
      '.review-home-controls__settings > ion-icon[slot="end"]',
    );
    const streakChevron = fixture.nativeElement.querySelector(
      '.review-home-controls__daily-status > ion-icon[slot="end"]',
    );

    expect(settingsChevron).not.toBeNull();
    expect(streakChevron).not.toBeNull();
  });

  it('emits settings, progress, and practice intents', () => {
    const settingsRequested = jest.fn<void, []>();
    const progressRequested = jest.fn<void, []>();
    const morePracticeRequested = jest.fn<void, []>();
    fixture.componentInstance.reviewSettingsRequested.subscribe(settingsRequested);
    fixture.componentInstance.progressRequested.subscribe(progressRequested);
    fixture.componentInstance.morePracticeRequested.subscribe(morePracticeRequested);

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLElement>('.review-home-controls__settings')?.click();
    element.querySelector<HTMLElement>('.review-home-controls__daily-status')?.click();
    element.querySelector<HTMLElement>('.review-home-controls__more-practice')?.click();

    expect(settingsRequested).toHaveBeenCalledTimes(1);
    expect(progressRequested).toHaveBeenCalledTimes(1);
    expect(morePracticeRequested).toHaveBeenCalledTimes(1);
  });

  it('can hide practice while preserving review settings', () => {
    fixture.componentRef.setInput('morePracticeAvailable', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.review-home-controls__settings')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.review-home-controls__more-practice')).toBeNull();
  });

  it('uses the configured personal goal and caps streak credit at the platform target', () => {
    fixture.componentRef.setInput('dashboard', {
      ...dashboard,
      reviewedToday: 32,
      personalGoal: 50,
      streakTarget: 10,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.streakReviewsCredited()).toBe(10);
    expect(fixture.nativeElement.querySelector('.review-home-controls__goals-explainer')).not.toBeNull();
  });
});
