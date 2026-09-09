import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideTranslateService} from '@ngx-translate/core';
import {MOCK_CARDS} from '@lingua-card/shared/testing';

import {WordRowComponent} from './word-row.component';

describe('WordRowComponent', () => {
  let fixture: ComponentFixture<WordRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordRowComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(WordRowComponent);
    fixture.componentRef.setInput('card', MOCK_CARDS[0]);
  });

  it('renders the card article with its article-specific colour class', () => {
    fixture.detectChanges();

    const article = fixture.nativeElement.querySelector('.badge');

    expect(article?.textContent.trim()).toBe('die');
    expect(article?.classList.contains('badge--die')).toBe(true);
  });

  it('emits pronunciation separately from opening the card', () => {
    const playAudio = jest.spyOn(fixture.componentInstance.playAudio, 'emit');
    const rowClick = jest.spyOn(fixture.componentInstance.rowClick, 'emit');
    fixture.componentRef.setInput('showAudio', true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.audio-button').click();

    expect(playAudio).toHaveBeenCalledWith();
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('emits row selection from the main card action', () => {
    const rowClick = jest.spyOn(fixture.componentInstance.rowClick, 'emit');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.row-main').click();

    expect(rowClick).toHaveBeenCalledWith();
  });
});
