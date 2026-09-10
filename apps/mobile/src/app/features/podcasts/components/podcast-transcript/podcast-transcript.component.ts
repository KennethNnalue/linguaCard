import {
  AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output,
} from '@angular/core';
import type { PodcastEpisodePlayer } from '@lingua-card/shared/domain';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, playCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'lc-podcast-transcript',
  standalone: true,
  imports: [IonButton, IonIcon, IonItem, IonLabel, IonList, TranslatePipe],
  templateUrl: './podcast-transcript.component.html',
  styleUrl: './podcast-transcript.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastTranscriptComponent implements AfterViewInit {
  readonly episode = input.required<PodcastEpisodePlayer>();
  readonly currentTurnId = input<string | null>(null);
  readonly dismissed = output<void>();
  readonly turnSelected = output<number>();
  readonly speakerNames = computed(() => new Map(
    this.episode().speakers.map(speaker => [speaker.id, speaker.name]),
  ));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    addIcons({ closeOutline, playCircleOutline });
  }

  ngAfterViewInit(): void {
    this.host.nativeElement.querySelector<HTMLElement>('ion-button')?.focus();
  }
}
