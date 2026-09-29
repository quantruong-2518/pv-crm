-- Read-only preflight for migration 0068 (ADR 0069). Run on Neon BEFORE migrating.
-- Query 2 is the migration's blast radius: any row other than open -> LOST needs a look.

-- 1 · leads 0068 moves off `converted`
SELECT CASE WHEN l.owner_id IS NULL THEN 'new' ELSE 'nurturing' END AS lands, count(*) AS leads,
       string_agg(l.code, ' ' ORDER BY l.code) AS codes
  FROM sales.lead l
 WHERE l.state = 'converted'
   AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = l.code)
   AND EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code)
   AND NOT EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code AND o.state NOT IN ('care', 'lost'))
 GROUP BY 1;

-- 2 · journeys 0068 rewrites, before -> after (projects care->lost and the lead move)
WITH o AS (
  SELECT code, lead_code, closed_at, CASE state WHEN 'care' THEN 'lost' ELSE state END AS state FROM sales.opportunity
), l AS (
  SELECT l.code, l.workstream_code, l.exited_at,
         CASE WHEN l.state = 'converted'
                   AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = l.code)
                   AND EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code)
                   AND NOT EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code AND o.state <> 'lost')
              THEN CASE WHEN l.owner_id IS NULL THEN 'new' ELSE 'nurturing' END
              ELSE l.state END AS state
    FROM sales.lead l
), v AS (
  SELECT w2.code, w2.closed_at AS was_at, w2.close_reason AS was,
         CASE WHEN x.won THEN greatest(x.signed_at, w2.opened_at)
              WHEN x.lost_at IS NOT NULL THEN greatest(x.lost_at, w2.opened_at) END AS closed_at,
         CASE WHEN x.won THEN 'WON' WHEN x.lost_at IS NOT NULL THEN 'LOST' END AS close_reason
    FROM sales.workstream w2
    JOIN LATERAL (
      SELECT (EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = l.code)
              AND NOT EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code AND o.state = 'open'
                                AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.opportunity_code = o.code))) AS won,
             (SELECT max(k.signed_at) FROM sales.contract k WHERE k.lead_code = l.code) AS signed_at,
             CASE WHEN l.state IN ('nurturing', 'disqualified', 'new')
                       AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = l.code)
                       AND EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code)
                       AND NOT EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code AND o.state <> 'lost')
                    THEN greatest((SELECT max(o.closed_at) FROM o WHERE o.lead_code = l.code),
                                  CASE l.state WHEN 'disqualified' THEN l.exited_at END)
                  WHEN l.state = 'disqualified' AND NOT EXISTS (SELECT 1 FROM o WHERE o.lead_code = l.code)
                    THEN l.exited_at END AS lost_at
        FROM l WHERE l.workstream_code = w2.code
    ) x ON true
   WHERE w2.code IN (SELECT l.workstream_code FROM l JOIN o ON o.lead_code = l.code WHERE o.state = 'lost')
)
SELECT coalesce(was, 'open') AS before, coalesce(close_reason, 'open') AS after, count(*) AS journeys,
       string_agg(code, ' ' ORDER BY code) AS codes
  FROM v WHERE (was_at, was) IS DISTINCT FROM (closed_at, close_reason)
 GROUP BY 1, 2;

-- 3 · LR-90..94 that 0068 will skip
SELECT v.id, v.name, c.id AS clashes_with, c.list, c.name AS existing_name,
       CASE WHEN c.id = v.id THEN 'id taken' ELSE 'same name' END AS why
  FROM (VALUES ('LR-90', 'Chưa có ngân sách năm nay'), ('LR-91', 'Người liên hệ nghỉ việc'),
               ('LR-92', 'Khách chọn bên khác'), ('LR-93', 'Khách hoãn dự án'),
               ('LR-94', 'Không phải khách của mình')) AS v(id, name)
  JOIN sales.config_entry c
    ON c.id = v.id OR (c.list = 'LOSS_REASON' AND c.active AND lower(c.name) = lower(v.name));

-- 4 · contract-sign requests still waiting with no `sign.kind` (must be 0, or decided, before deploy)
SELECT id, payload->>'opportunityCode' AS opportunity, raised_by, raised_at
  FROM platform.approval
 WHERE kind = 'contract-sign' AND state = 'waiting' AND (payload->'sign'->>'kind') IS NULL;

-- 5 · unsent mail to leads going to `nurturing` (0068 does NOT hold it back)
SELECT d.aggregate_id AS lead, count(*) AS unsent
  FROM platform.email_delivery d
 WHERE d.aggregate_type = 'lead' AND d.role = 'recipient' AND d.state IN ('pending', 'sending')
   AND d.aggregate_id IN (
     SELECT l.code FROM sales.lead l
      WHERE l.state = 'converted' AND l.owner_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.lead_code = l.code)
        AND EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code)
        AND NOT EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code AND o.state NOT IN ('care', 'lost')))
 GROUP BY 1;
