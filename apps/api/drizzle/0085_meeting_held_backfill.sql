-- 0085 - data only: mark held the past meetings the retired end-of-time job closed.
--
-- Before 0083 a meeting carried no held mark; when its slot ran out a job opened
-- an empty comm record on a `'meeting'` thread (external id = meeting id) instead.
-- Those meetings now sit at `held_at` NULL and read `scheduled` for ever. The
-- job's footprint is a debrief with `booked` false - a comm opened at booking
-- under 0084 carries `true` - so that, plus an end already past, is the proof it
-- was held. A meeting with no thread had no job run on it and is left as it is.
--
-- `held_at` = the booked end, `meetingEndOf`'s formula; a NULL duration (rows
-- before 0050) ends at `at`. `held_at IS NULL` keeps a re-run a no-op and never
-- overwrites a mark a person set. Hand-written for 0047's reason.
UPDATE "sales"."meeting" m
   SET "held_at" = m."at" + COALESCE(m."duration_minutes", 0) * interval '1 minute'
 WHERE m."held_at" IS NULL
   AND m."at" + COALESCE(m."duration_minutes", 0) * interval '1 minute' <= now()
   AND EXISTS (
         SELECT 1
           FROM "comms"."thread" t
           JOIN "comms"."debrief" d ON d."thread_id" = t."id"
          WHERE t."channel" = 'meeting'
            AND t."external_id" = m."id"::text
            AND d."booked" = false
       );
