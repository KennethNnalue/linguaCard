import {Injectable} from '@angular/core';
import {Haptics, ImpactStyle, NotificationType} from '@capacitor/haptics';

/** Platform feedback kept behind the feature boundary so pages express intent only. */
@Injectable({providedIn: 'root'})
export class ReviewFeedbackService {
  reveal(): void {
    void Haptics.impact({style: ImpactStyle.Light}).catch(() => undefined);
  }

  correct(): void {
    void Haptics.notification({type: NotificationType.Success}).catch(() => undefined);
  }

  needsAttention(): void {
    void Haptics.notification({type: NotificationType.Warning}).catch(() => undefined);
  }

  ratingCommitted(): void {
    void Haptics.selectionChanged().catch(() => undefined);
  }

  sessionComplete(): void {
    void Haptics.impact({style: ImpactStyle.Medium}).catch(() => undefined);
  }
}
