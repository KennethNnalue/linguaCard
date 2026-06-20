import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import type { OnboardingLevel } from '@lingua-card/shared/domain';
import { OnboardingShellComponent } from '../../components/onboarding-shell/onboarding-shell.component';
import { OnboardingStore } from '../../store/onboarding.store';

interface LevelOption {
  value: OnboardingLevel;
  emoji: string;
  nameKey: string;
  descKey: string;
}

const LEVELS: LevelOption[] = [
  { value: 'beginner', emoji: '🌱', nameKey: 'onboarding.level.beginner', descKey: 'onboarding.level.beginnerDesc' },
  { value: 'some', emoji: '🌿', nameKey: 'onboarding.level.some', descKey: 'onboarding.level.someDesc' },
  { value: 'intermediate', emoji: '🌳', nameKey: 'onboarding.level.intermediate', descKey: 'onboarding.level.intermediateDesc' },
];

@Component({
  selector: 'lc-level',
  templateUrl: './level.page.html',
  styleUrls: ['./level.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, TranslatePipe, OnboardingShellComponent],
})
export class LevelPage {
  readonly store = inject(OnboardingStore);
  readonly levels = LEVELS;
  readonly selected = signal<OnboardingLevel | null>(this.store.level());

  select(value: OnboardingLevel): void {
    this.selected.set(value);
    this.store.setLevel(value);
  }

  onNext(): void {
    this.store.next();
  }

  onBack(): void {
    this.store.back();
  }

  onSkip(): void {
    this.store.skip();
  }
}
