-- Canonical projection used by every requirement endpoint.
DROP VIEW IF EXISTS v_requirement;
CREATE VIEW v_requirement AS
SELECT r.document_id AS id, d.space_id, r.account_id, d.ref_key, d.title, d.body_md, d.version,
       r.tracker_id, t.key AS tracker_key, t.name AS tracker_name, t.icon AS tracker_icon,
       r.status_id, ws.key AS status_key, ws.name AS status_name, ws.color AS status_color,
       ws.is_closed AS status_is_closed, ws.is_agent_claimable AS status_is_agent_claimable,
       r.priority_id, pr.key AS priority_key, pr.name AS priority_name, pr.color AS priority_color, pr.weight AS priority_weight,
       r.category_id, r.milestone_id, r.parent_id, r.reporter_id,
       rep.display_name AS reporter_name,
       r.lead_user_id, r.board_position, r.readiness_score, r.readiness_report,
       r.done_ratio, r.estimated_hours, r.spent_hours,
       r.start_date, r.due_date, r.resolution, r.closed_at,
       r.claimed_by_agent_id, r.claim_expires_at, ag.name AS claimed_by_agent_name,
       r.member_count, d.creator_agent_id,
       r.created_at, r.updated_at
  FROM requirement r
  JOIN document d         ON d.id = r.document_id
  JOIN tracker t          ON t.id = r.tracker_id
  JOIN workflow_status ws ON ws.id = r.status_id
  JOIN priority pr        ON pr.id = r.priority_id
  LEFT JOIN app_user rep  ON rep.id = r.reporter_id
  LEFT JOIN agent ag      ON ag.id = r.claimed_by_agent_id
 WHERE NOT d.is_archived;
