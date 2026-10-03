# Podcast UI refinement delivery

Implemented on main following the 3 October 2026 live UI review.

## Plan comparison

| Plan item | Delivery | Verification and limits |
| --- | --- | --- |
| First-screen listening choice | Short introduction; recommendations before Continue listening; existing level scope retained | Live empty-recommendation/resume state checked. The test account has started every published episode; a populated recommendation could not be rechecked after the redesign without new eligible content. |
| Cohesive visual system | Sage actions, compact recommendation artwork without the 420px full-image switch, titles below resume artwork, visible progress bars | Production build and targeted lint passed; mobile library checked live. |
| Optional preparation | Smaller hero; Play before preview; counts and save/practise actions inside expandable preview; saved words followed by three new words; full list available on demand | Live preview expands and saved words appear first. Save/practise was not invoked because the account has an existing review session. |
| Simpler player | Smaller sans-serif sentence text, dimmer artwork, three word chips plus expansion, labelled Translation/Transcript/More, repeat and screen-awake options behind More | 27 player tests, including new settings/context/expansion behavior; live portrait playback, More panel, transcript seeking and word inspection checked. A live landscape regression was caught and fixed by restoring absolute positioning. |
| Recommendation credibility | Inspected word presents the episode sentence and translation before the vocabulary definition; context is preserved while the panel is open | Live auf panel checked against its actual sentence. Phrase/sense-aware ranking and editorial mapping remain future work: existing ranking inputs contain lexeme identity and review evidence, not validated sense or phrase annotations. No contextual word definition is fabricated. |

## Commits

- 57632bf: prioritise recommendations and unify discovery cards.
- 9648b4a: compact optional preparation.
- a733499: simpler player and contextual vocabulary panel.
- bd5364a: shorter word preview and accurate saved/new labels.
- 0485f89: landscape controls positioning and label polish.
- Final polish: consistent vocabulary-panel return button and removal of redundant control hint styles.

## Checks

Each implementation increment was built and linted before commit/push. The final podcast test run passed 8 suites / 66 tests; app TypeScript check passed. Production builds retain stylesheet size warnings, but pass the existing error budgets. The user's pre-existing .gitignore changes were left untouched.

Browser verification creates ordinary listening progress; it does not reset progress, add words or rate review cards. Production completion rewards, analytics database persistence and physical native-device behavior were not certified by this UI refinement pass. Conversion improvements require production measurement against the existing baseline.
