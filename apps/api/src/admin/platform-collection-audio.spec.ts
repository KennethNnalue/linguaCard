import {platformCollectionAudioRequests} from './platform-collection-audio';

describe('platformCollectionAudioRequests', () => {
  it('only requests persisted target-language audio', () => {
    const requests = platformCollectionAudioRequests([{
      article: 'die',
      displayText: 'Nachricht',
      translation: 'Message / News',
      targetLang: 'de-DE',
      nativeLang: 'en',
      examples: [{id: 'example-1', target: 'Hast du meine Nachricht gelesen?', native: 'Did you read my message?'}],
    }]);

    expect(requests).toEqual([
      {text: 'die Nachricht', language: 'de-DE'},
      {text: 'Hast du meine Nachricht gelesen?', language: 'de-DE'},
    ]);
  });
});
