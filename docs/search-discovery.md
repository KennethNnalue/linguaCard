# Search discovery for Lingua Card

## Implemented architecture

The Vercel web build generates static public HTML after compiling the Angular app. `/` is the English homepage, `/de/` is its German equivalent. Vocabulary, flashcards and listening each have a paired German/English page. The app remains at `/review`, `/auth/*` and its existing feature URLs; Capacitor builds continue to use the Angular index.

`npm run build:web` includes `scripts/build-seo-pages.mjs`. `npm run build:seo` regenerates only the marketing pages in an existing `www` build. Public pages have canonical URLs, reciprocal hreflang, descriptions, social metadata and WebSite/WebPage structured data. The app shell has `noindex` because account and private study pages are not public search landing pages. Robots allows crawling so crawlers can see noindex. No fabricated ratings, download counts or store links are included.

Vercel rewrites only known app paths to the SPA. Unmatched requests use normal static-file/404 handling. The service worker only handles app navigations, preventing it from replacing marketing pages or unknown URLs with the app shell. PWA installations start at `/review`.

The marketing pages are intentionally not precached by the Angular service worker. Existing installed clients may use their previous navigation rules until the new worker activates.

## Release and Search Console

1. Build with the existing deployment API_URL and other environment settings. Do not deploy an unresolved API URL placeholder.
2. Preview `/`, `/de/`, every URL in `/sitemap.xml`, `/robots.txt`, `/auth/login`, `/review`, legal pages, assets and a nonexistent URL on Vercel. Unknown URLs must return HTTP 404; app routes must continue working.
3. Verify a domain property for `lingua-card.app` in Google Search Console using the domain owner's DNS access.
4. Submit `https://lingua-card.app/sitemap.xml` and inspect the homepage and each public page. Confirm the rendered content, selected canonical and indexing eligibility.
5. Check Page Indexing and Performance weekly. Track `Lingua Card`, `LinguaCard`, German vocabulary/flashcard/listening queries, countries and languages. Track registrations and first completed learning sessions as conversion outcomes; configure analytics separately with the product's privacy requirements.
6. Link to the official website consistently from owned profiles and future store listings. Seek relevant editorial links and teacher recommendations.

Google indexing and rankings are not guaranteed. Do not use Google's restricted Indexing API for ordinary learning pages, buy links/reviews, or create near-identical country pages.

## Content roadmap

Maintain useful examples on public pages. Expand vocabulary pages with article/plural/usage examples and genuinely useful exercises. Add CEFR-level pages only after verifying sufficient available learning content at each advertised level. Do not claim examination certification, official Goethe/telc affiliation, or full offline support without verifying those claims. Native client projects exist, but their presence does not mean published store listings exist.

## Market priorities (research 14 October 2026)

Germany is the primary market specified by the owner. Start with German and English landing pages for learners living in Germany. Country and UI language are separate: beginner learners in Germany may search in their first language.

India is the first suggested international test market: DAAD's 2025 report identifies almost 59,000 Indian students in Germany in winter 2024/25, the largest international group. This is a demand proxy, not app search volume.
https://www.daad.de/en/press-releases/erneut-hohe-zahl-an-internationalen-studierenden-in-deutschland/

Goethe's 2025 trend analysis names Egypt, India, Kenya and Colombia as markets with growing demand connected to working, training and studying in Germany. Test English acquisition in India/Kenya, then Arabic for Egypt and Spanish for Colombia, subject to product language support. The research did not publish a worldwide learner total because country data coverage varied.
https://www.goethe.de/de/m/uun/prs/pma/p25/26859595.html

Poland is an established candidate for later Polish localisation; its large learner base is supported by the older 2020 survey, not a fresh 2026 ranking.
https://www.goethe.de/en/uun/pub/akt/22048609.html

Validate market expansion with Search Console impressions, keyword research, acquisition conversion and retention before investing in full localisation. These recommendations are not measured keyword-volume rankings.

## Future store metadata drafts

Only use descriptions of features verified in the release submitted to each store. Do not claim the app is published until it is available.

English title, both stores (25 characters): `Lingua Card: Learn German`
German title, both stores (27 characters): `Lingua Card: Deutsch lernen`

Google Play English short description:
`Learn German vocabulary with flashcards, spaced repetition and listening.`
German short description:
`Deutsche Vokabeln lernen: Karteikarten, Spaced Repetition und Hörübungen.`

Apple English subtitle (22 characters): `Vocabulary & Listening`
Apple German subtitle (25 characters): `Vokabeln und Hörverstehen`
Apple English keyword draft (avoid repeating words from name/subtitle):
`flashcards,spaced repetition,words,reading,podcast,study,practice`
Apple German keyword draft:
`Karteikarten,Spaced Repetition,Wortschatz,Podcast,Geschichten,üben`

The English keyword field must be revised if subtitle wording changes. Education is the likely primary category; confirm against the release. Do not include competitor names or irrelevant keywords.

First three screenshot concepts: real vocabulary card and review; real podcast preparation/player; real story reader. Use actual release screens, clearly readable captions and localised copy. Test screenshot conversion after launch; screenshots do not substitute for useful functionality and retention.

Google Play: title 30 characters, short description 80, full description 4,000.
https://support.google.com/googleplay/android-developer/answer/9859152?hl=en
Apple: name/subtitle 30 characters each, keyword field 100. Promotional text does not affect search ranking.
https://developer.apple.com/app-store/product-page/

Android/iOS Capacitor projects already exist in this repository. Verify release readiness, privacy disclosures, payment requirements and signing in the existing native workflow. Apple requires functionality beyond a repackaged website:
https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
