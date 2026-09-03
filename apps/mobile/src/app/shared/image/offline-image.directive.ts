import { Directive, ElementRef, inject, input } from '@angular/core';
import { effect } from '@angular/core';
import { OfflineImageCacheService } from './offline-image-cache.service';

@Directive({
  selector: 'img[lcOfflineSrc]',
  standalone: true,
})
export class OfflineImageDirective {
  readonly lcOfflineSrc = input<string | null | undefined>(null);

  private readonly element = inject(ElementRef<HTMLImageElement>).nativeElement;
  private readonly cache = inject(OfflineImageCacheService);
  private generation = 0;

  constructor() {
    effect(() => {
      const remoteUrl = this.lcOfflineSrc();
      const generation = ++this.generation;
      this.element.removeAttribute('src');
      void this.cache.resolve(remoteUrl).then(resolvedUrl => {
        if (generation !== this.generation) return;
        if (resolvedUrl) this.element.src = resolvedUrl;
      });
    });
  }
}
