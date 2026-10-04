-- Funnel: bounded server-validated metadata only; legacy/unattributed rows stay explicit.
-- Edit dates together. Baseline dates below precede journey instrumentation.
SELECT CASE WHEN metadata ? 'experimentVersion' THEN coalesce(metadata->>'placement','unattributed') ELSE 'unattributed' END AS placement,
 CASE WHEN metadata ? 'experimentVersion' THEN coalesce(metadata->>'policyVersion','unattributed') ELSE 'unattributed' END AS policy,
 CASE WHEN metadata ? 'experimentVersion' THEN coalesce(metadata->>'discoveryLevel','unknown') ELSE 'unknown' END AS discovery_level,
 CASE WHEN metadata ? 'experimentVersion' THEN coalesce(metadata->>'cohort','unassigned') ELSE 'unassigned' END AS cohort,
 CASE WHEN metadata ? 'experimentVersion' THEN coalesce(metadata->>'experimentVersion','baseline-legacy') ELSE 'baseline-legacy' END AS experiment,
 coalesce(metadata->>'assisted','false') AS assisted,
 count(*) FILTER(WHERE name='recommendation_impression') AS impressions,
 count(*) FILTER(WHERE name='recommendation_selected') AS selections,
 count(*) FILTER(WHERE name='playback_started') AS actual_starts,
 count(*) FILTER(WHERE name='meaningful_listening') AS authoritative_meaningful,
 count(*) FILTER(WHERE name='completed') AS authoritative_completions,
 count(DISTINCT ("userId",metadata->>'journeyId',metadata->>'localDate'))
   FILTER(WHERE name='journey_listening_day' AND metadata->>'meaningful'='true') AS qualified_journey_days
FROM podcast_events WHERE "createdAt">=timestamptz '2026-09-28 00:00:00+00'
 AND "createdAt"<timestamptz '2026-10-05 00:00:00+00'
GROUP BY 1,2,3,4,5,6 ORDER BY 1,2,3,4,5,6;

-- Frozen weekly primary: committed reviewers with meaningful listening on >=2 distinct local days.
-- Meaningful = >=30 seconds of unique audio within a journey/day, or full duration if shorter.
-- Configured timezone; invalid/missing -> UTC. Daily ranges use server receipt local date.
WITH params AS (SELECT date '2026-09-28' AS week_start, date '2026-10-05' AS week_end),
 timezones AS (
 SELECT u.id AS user_id,coalesce(tz.name,'UTC') AS timezone
 FROM users u LEFT JOIN user_settings settings ON settings.user_id=u.id
 LEFT JOIN pg_timezone_names tz ON tz.name=settings.timezone
 ), reviewers AS (
 SELECT DISTINCT r."userId" FROM review_commits r JOIN timezones t ON t.user_id=r."userId" CROSS JOIN params p
 WHERE (r."reviewedAt" AT TIME ZONE t.timezone)::date>=p.week_start
 AND (r."reviewedAt" AT TIME ZONE t.timezone)::date<p.week_end
 ), listening AS (
 SELECT e."userId",count(DISTINCT e.metadata->>'localDate') AS days
 FROM podcast_events e CROSS JOIN params p WHERE e.name='journey_listening_day' AND e.metadata->>'meaningful'='true'
 AND (e.metadata->>'localDate')::date>=p.week_start AND (e.metadata->>'localDate')::date<p.week_end GROUP BY 1
 )
SELECT coalesce(a.cohort,'unassigned') AS cohort,coalesce(a."experimentVersion",'baseline-legacy') AS experiment,
 count(*) AS committed_reviewers,count(*) FILTER(WHERE l.days>=2) AS reviewers_with_two_listening_days,
 CASE WHEN EXISTS(SELECT 1 FROM listening) THEN round(100.0*count(*) FILTER(WHERE l.days>=2)/nullif(count(*),0),2) ELSE NULL END AS percent
FROM reviewers r LEFT JOIN listening l ON l."userId"=r."userId"
LEFT JOIN podcast_recommendation_assignments a ON a."userId"=r."userId" AND a."experimentVersion"='vocabulary-v2-baseline'
GROUP BY 1,2;

-- Seven-day return: require the full observation window; exclude immature users.
WITH first_listen AS (
 SELECT "userId",min((metadata->>'localDate')::date) AS first_day FROM podcast_events
 WHERE name='journey_listening_day' AND metadata->>'meaningful'='true' GROUP BY 1
), eligible AS (
 SELECT * FROM first_listen WHERE first_day<=current_date-7
)
SELECT count(*) AS mature_listeners,count(*) FILTER(WHERE EXISTS(
 SELECT 1 FROM podcast_events e WHERE e."userId"=eligible."userId" AND e.name='journey_listening_day'
 AND e.metadata->>'meaningful'='true' AND (e.metadata->>'localDate')::date>eligible.first_day
 AND (e.metadata->>'localDate')::date<=eligible.first_day+7)) AS returned_within_seven_days
FROM eligible;
