import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import type { StoryKeyword, StorySentence } from '@lingua-card/shared/domain';
import { findKeywordExample, KeywordsTabComponent } from './keywords-tab.component';

describe('KeywordsTabComponent', () => {
  let fixture: ComponentFixture<KeywordsTabComponent>;

  const keyword: StoryKeyword = {
    cardId: null,
    german: 'der Klimawandel',
    germanBase: 'Klimawandel',
    translation: 'climate change',
    article: 'der',
    wordType: 'noun',
    level: 'B1',
  };
  const sentence: StorySentence = {
    index: 0,
    german: 'Der Klimawandel betrifft uns alle.',
    native: 'Climate change affects us all.',
    vocabWordIds: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeywordsTabComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(KeywordsTabComponent);
    fixture.componentRef.setInput('keywords', [keyword]);
    fixture.componentRef.setInput('sentences', [sentence]);
  });

  it('renders a colour-coded article and the matching bilingual story sentence', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.badge--der')?.textContent.trim()).toBe('der');
    expect(fixture.nativeElement.querySelector('.ss-kw-example')?.textContent.trim()).toBe(sentence.german);
    expect(fixture.nativeElement.querySelector('.ss-kw-example-native')?.textContent.trim()).toBe(sentence.native);
  });

  it('emits the word and usage sentence from the audio action', () => {
    const playAudio = jest.spyOn(fixture.componentInstance.playAudio, 'emit');
    const wordClick = jest.spyOn(fixture.componentInstance.wordClick, 'emit');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.ss-kw-audio').click();

    expect(playAudio).toHaveBeenCalledWith({ keyword, example: sentence });
    expect(wordClick).not.toHaveBeenCalled();
  });

  it('finds an example for a separable verb used in an inflected form', () => {
    const separableVerb: StoryKeyword = {
      ...keyword,
      german: 'aufstehen',
      germanBase: 'aufstehen',
      article: null,
      wordType: 'verb',
    };
    const usage: StorySentence = {
      ...sentence,
      german: 'Jeden Morgen stehe ich um sieben Uhr auf.',
    };

    expect(findKeywordExample(separableVerb, [usage])).toBe(usage);
  });
});
