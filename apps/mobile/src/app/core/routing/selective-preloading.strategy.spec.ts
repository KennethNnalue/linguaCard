import { Route } from '@angular/router';
import { of } from 'rxjs';
import { SelectivePreloadingStrategy } from './selective-preloading.strategy';

describe('SelectivePreloadingStrategy', () => {
  const strategy = new SelectivePreloadingStrategy();

  it('does not load an unmarked route', () => {
    const load = jest.fn(() => of('loaded'));

    strategy.preload({}, load).subscribe();

    expect(load).not.toHaveBeenCalled();
  });

  it('loads a marked route after the startup delay', () => {
    jest.useFakeTimers();
    const route: Route = { path: 'vault', data: { preload: true } };
    const load = jest.fn(() => of('loaded'));

    strategy.preload(route, load).subscribe();
    jest.advanceTimersByTime(1_499);
    expect(load).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
