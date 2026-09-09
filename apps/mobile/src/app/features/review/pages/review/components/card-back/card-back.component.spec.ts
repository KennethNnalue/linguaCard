import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MOCK_CARDS } from '@lingua-card/shared/testing';

import { CardBackComponent } from './card-back.component';

describe('CardBackComponent scroll affordance', () => {
  let component: CardBackComponent;
  let fixture: ComponentFixture<CardBackComponent>;
  let scrollContainer: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardBackComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardBackComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('card', MOCK_CARDS[0]);
    fixture.detectChanges();
    scrollContainer = fixture.nativeElement.querySelector('.cb-card');
  });

  it('shows a cue while review details remain below the visible card area', () => {
    Object.defineProperties(scrollContainer, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    scrollContainer.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.showScrollCue()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.cb-scroll-cue'),
    ).not.toBeNull();
  });

  it('hides the cue when the user reaches the bottom', () => {
    Object.defineProperties(scrollContainer, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 400, writable: true },
    });

    scrollContainer.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.showScrollCue()).toBe(false);
    expect(fixture.nativeElement.querySelector('.cb-scroll-cue')).toBeNull();
  });
});
