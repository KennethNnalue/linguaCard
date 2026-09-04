# Daily streak and learning engagement recommendation

Date: 2026-09-04

## Decision

Separate the daily streak from personal study goals.

- The platform streak requirement is fixed at **10 unique due-card reviews per local day**.
- Personal daily, weekly, and monthly goals remain optional planning targets. They do not determine whether the streak survives.
- Podcast, collection listening, stories, and other meaningful activities award Learning Points and complete daily quests, but do not replace the core 10-review streak requirement in the first release.
- After the core requirement is complete, show one optional rotating activity that guides the learner into podcast/listening/story features.

This keeps the streak rule stable and easy to explain while making the broader product rewarding rather than letting low-effort playback dilute the meaning of the review habit.

## Why this direction

Duolingo originally tied streaks to a user-selected daily goal, then experimentally separated the systems so one completed lesson extended the streak. Duolingo reported a 3.3% increase in day-14 retention, a 1% increase in DAU, and a 10.5% increase in daily learners with a streak after 20 days. The key lesson is not “one lesson”; it is that a streak should have one small, stable platform rule while a personal goal measures ambition separately.

Source: [Duolingo — Improving the streak](https://blog.duolingo.com/improving-the-streak/)

Duolingo now awards XP across lessons, stories, practice, and timed challenges, while the streak has its own simpler rule. It also uses varied daily quests to direct users toward valuable behaviors rather than making raw XP the only target.

Sources: [Duolingo 101](https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/), [Duolingo — Time Spent Learning Well](https://blog.duolingo.com/time-spent-learning-well/)

The wider evidence supports rewards as a useful layer, but not as the learning objective. A learning-gamification meta-analysis found positive effects on cognitive, motivational, and behavioral outcomes, while newer work highlights autonomy and competence as important design constraints. LinguaCard should therefore reward useful learning actions, provide choice after the required review, and show mastery/progress rather than optimize for point farming.

Sources: [Sailer & Homner gamification meta-analysis](https://doi.org/10.1007/s10648-019-09498-w), [Intrinsic motivation meta-analysis](https://link.springer.com/article/10.1007/s11423-023-10337-7)

## Product model

### 1. Streak: consistency

The streak answers only: **“Did I complete today’s memory practice?”**

Qualification rule:

- Review 10 distinct due cards during the learner’s local calendar day.
- Count a card once per day even if it is answered repeatedly.
- Count committed reviews across all review modes.
- If fewer than 10 cards are due, completing every available due card qualifies the day. The effective target is `min(10, due cards available at the first review of the day)` and must be snapshotted for auditability.
- If zero cards are due, offer a short system-selected retention set of up to 10 previously learned cards; completing it qualifies.
- New-card creation, passive audio playback, browsing, and importing do not qualify by themselves.

The “fewer than 10 due” rule prevents the platform from asking the impossible, while the retention set prevents an empty queue from breaking an established habit.

### 2. Personal goals: ambition

Keep user goals independent:

- Personal review targets can be 10, 20, 30, or custom.
- Weekly and monthly progress continues after the streak is already safe.
- UI language should distinguish them: **Daily review** (platform streak) versus **Your target** (personal goal).
- The goals prompt should explain that changing a personal target never makes a streak easier or harder.

### 3. Learning Points: breadth and quality

Points answer: **“How much meaningful learning did I do?”** They should be ledger-based, idempotent, capped where an action is repeatable, and weighted toward active learning.

Recommended first-release awards:

| Activity | Award | Guardrail |
|---|---:|---|
| First correct review of a distinct due card | 2 LP | Once per card/day |
| Incorrect attempt followed by successful recall | +1 LP | Once per card/day; rewards recovery |
| Complete the 10-review streak requirement | 10 LP | Once/day |
| Card reaches a new mastery level | 5 LP | Existing mastery transition only |
| Complete a podcast episode | 10 LP | At least 70% unique audio consumed; once/episode |
| Complete the podcast comprehension check | 5 LP | Pass threshold; once/episode |
| Save and later review a podcast word | 3 LP | Award on later successful review, not on save |
| Complete a collection listening session | 5 LP | At least 5 distinct cards and meaningful playback |
| Complete a story | 8 LP | Once/story |
| Pass a story quiz | 5 LP | Once/story |

Do not award points per playback second, scrub event, app open, or repeated completion. Put a daily cap on repeatable listening awards. Show the reason for each award in the activity history.

### 4. Daily quests: feature discovery

Once the streak requirement is complete, offer one rotating **Keep learning** quest. Examples:

- Listen to one recommended podcast segment and answer two checks.
- Review five words discovered in a podcast.
- Finish a collection listening session.
- Read one story containing three of today’s reviewed words.

Rules:

- Always include a choice between at least two activities so users retain autonomy.
- Prefer the next pedagogically useful action based on due cards, unfinished content, and recent feature use.
- Never let a quest encourage replay farming.
- Use contextual bridges: after review, recommend a podcast rich in those words; after a podcast, create a one-tap review set from encountered vocabulary.
- Reward quest completion with LP and progress toward a weekly chest or badge, not with streak qualification.

This cross-feature loop is the strongest opportunity for LinguaCard: **review → encounter in context → listen → retrieve again**.

## Streak Freeze design

Use automatic, pre-earned insurance:

- Inventory cap: **2**.
- Earn one freeze after **7 qualified, non-frozen streak days** since the last grant, only when inventory is below the cap.
- A missed closed day automatically consumes one available freeze; users should not have to remember to activate it.
- A frozen day preserves the streak length but does not increment it, earn LP, count toward the next freeze, or satisfy quests.
- Two consecutive missed days can consume two freezes. The next miss breaks the streak.
- Show inventory beside the streak and warn at sensible times: evening at-risk reminder, freeze-consumed notice the next day, and low-inventory notice.
- Platform outages and verified sync failures should repair affected streak days without consuming user inventory.
- Use the learner’s stored IANA timezone and record the target day on every grant/consumption transaction.

Duolingo describes freezes as insurance equipped before a missed day and reported that allowing two freezes increased active learners rather than increasing absence. Its free product supports two stored freezes, while some paid tiers offer more. LinguaCard’s earned-only approach is a better initial fit because it reinforces learning and avoids introducing a currency or pay-to-protect mechanic prematurely.

Sources: [Duolingo — How streaks build habits](https://blog.duolingo.com/how-duolingo-streak-builds-habit/), [Duolingo — Protecting streaks from site issues](https://blog.duolingo.com/protecting-streaks-from-site-issues/), [Duolingo vacation guidance](https://blog.duolingo.com/how-to-keep-your-streak-on-vacation/)

The existing LinguaCard implementation already has the recommended two-freeze inventory, seven-goal-day grant interval, automatic reconciliation, an append-only freeze ledger, and outage-compatible transaction semantics. The important change is to make qualification and freeze earning use the platform target rather than `settings.dailyGoal`.

## UX recommendation

Home should present the system in this order:

1. **Daily review: 6 of 10** — flame progress and one-tap Resume review.
2. **Your target: 6 of 20** — secondary progress, editable without affecting the flame.
3. **Keep learning** — two recommended choices, such as a podcast and a collection listen.
4. A compact LP total and freeze inventory; detailed history belongs on the progress screen.

Completion feedback should be distinct:

- At review 10: “Streak extended — 12 days” with the flame as the hero.
- At the personal goal: “Your 20-card target is complete.”
- At broader activity completion: show earned LP and the next contextual action.

Avoid a single progress ring that mixes review counts, minutes listened, stories, and quizzes. Mixed units make the streak opaque and easier to game.

## Required domain changes

Introduce a platform policy version rather than scattering the number 10:

```text
DailyStreakPolicy
  version
  requiredUniqueDueReviews = 10
  fallback = complete_available_due_then_retention_set
```

For each local day, persist:

- `streakPolicyVersion`
- `streakReviewTarget`
- `uniqueDueCardsReviewed`
- `streakQualifiedAt`
- separate personal-goal snapshot and progress

Add typed engagement events for podcast completion, comprehension checks, collection listening completion, story completion, and podcast-word retrieval. Project every reward server-side with a unique deduplication key. Client-side projections can provide instant UI feedback but must reconcile to the server ledger.

Do not retroactively recalculate historical days when the platform policy changes. The daily snapshot is the record of what the user was asked to do that day.

## Rollout and experiments

Ship in stages:

1. Separate streak qualification from personal goals and update all copy/progress UI.
2. Add the points ledger events for podcasts, listening, and stories.
3. Add post-review contextual recommendations.
4. Add rotating daily quests after enough event data exists to target them well.

Primary experiment metrics:

- D7, D14, and D30 retained learners
- percentage of active learners completing 10 reviews
- due-card backlog and recall/mastery outcomes
- podcast starts-to-70%-completion
- percentage of podcast learners who later review an encountered word
- cross-feature weekly active users

Guardrails:

- sessions consisting only of repeated/farmed actions
- notification opt-out rate
- freeze consumption and post-freeze return rate
- personal-goal completion (to ensure the easier streak does not reduce deeper practice)
- listening completion without comprehension or later retrieval

Test the fixed 10-review rule against a smaller fixed requirement only if data shows it is too demanding. Do not test variants that again bind streak survival to the user’s personal target; that would reintroduce the core product problem.

## Acceptance criteria for the streak separation

- Changing personal goals does not change today’s streak target.
- Ten distinct qualifying reviews extend the streak once per local day.
- Repeating one card cannot make ten units of progress.
- A user with fewer than ten due cards always has a valid path to qualification.
- Podcast/listening/story activity awards deduplicated LP but cannot extend the streak alone.
- A freeze is granted only from seven real qualified days, never from frozen days.
- A freeze preserves but does not increment a streak.
- Offline events reconcile idempotently and preserve their original local-day attribution.
- Historical day targets do not change when platform or personal policies change.
