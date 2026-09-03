import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable, mergeMap, timer } from 'rxjs';

const PRELOAD_DELAY_MS = 1_500;

@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] !== true) return EMPTY;
    return timer(PRELOAD_DELAY_MS).pipe(mergeMap(() => load()));
  }
}
