-- One-time: statuses created before the workflow was enforced stay reachable.
-- From now on transitions are managed in the admin UI and never re-inserted on install.
INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id)
SELECT t.id, NULL, s.id
  FROM tracker t
  JOIN workflow_status s ON s.account_id = t.account_id
 WHERE NOT EXISTS (
    SELECT 1 FROM workflow_transition wt
     WHERE wt.tracker_id = t.id AND wt.from_status_id IS NULL AND wt.to_status_id = s.id
 );
