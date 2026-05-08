import {Component, computed, Input, signal} from '@angular/core';
import {MasteryLevel} from "../../../core/models/mock-data";

@Component({
  selector: 'app-mastery-dot',
  templateUrl: './mastery-dot.component.html',
  styleUrls: ['./mastery-dot.component.scss'],
})
export class MasteryDotComponent {

  private _level = signal<MasteryLevel>(0);
  @Input() set level(val: MasteryLevel) {
    this._level.set(val);
  }

  dotClass = computed(() => `lc-mastery-dot--${this._level()}`);

}
