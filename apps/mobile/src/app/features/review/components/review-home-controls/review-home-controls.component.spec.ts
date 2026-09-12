import {Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideTranslateService} from '@ngx-translate/core';
import type {ReviewHomeDashboard} from '../../models/review-home.model';
import {ReviewHomeControlsComponent} from './review-home-controls.component';

const dashboard: ReviewHomeDashboard = {
  completedToday: 5,
  goal: 10,
  streak: 3,
  preferences: {mode: 'type', autoplay: 'answer_and_example'},
};

@Component({
  imports: [ReviewHomeControlsComponent],
  template: `
    <lc-review-home-controls [dashboard]="dashboard">
      <section review-home-continuation>Continue reviewing</section>
    </lc-review-home-controls>
  `,
})
class ReviewHomeControlsHostComponent {
  readonly dashboard = dashboard;
}

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
    expect(metrics[0].textContent).toContain('review.home.todayProgress');
    expect(metrics[1].textContent).toContain('review.home.streak');
  });

  it('shows goal completion without replacing the streak metric', () => {
    fixture.componentRef.setInput('dashboard', {...dashboard, completedToday: 10});
    fixture.detectChanges();

    const metrics = fixture.nativeElement.querySelectorAll('.review-home-controls__metric');
    expect(metrics[0].textContent).toContain('review.home.goalComplete');
    expect(metrics[1].textContent).toContain('review.home.streak');
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

  it('places the optional continuation between daily status and more practice', () => {
    const host = TestBed.createComponent(ReviewHomeControlsHostComponent);
    host.detectChanges();

    const sections = host.nativeElement.querySelector('.review-home-controls').children;
    expect(sections[1].classList.contains('review-home-controls__daily-status')).toBe(true);
    expect(sections[2].hasAttribute('review-home-continuation')).toBe(true);
    expect(sections[3].classList.contains('review-home-controls__more-practice')).toBe(true);
  });
});
