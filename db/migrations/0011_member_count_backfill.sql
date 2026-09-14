-- member_count was never maintained.
UPDATE requirement r
   SET member_count = (SELECT count(*) FROM requirement_member m WHERE m.document_id = r.document_id);
