CREATE FUNCTION prevent_closed_episode_indirect_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_key text; episode_key text; current_status text;
BEGIN
  parent_key := CASE WHEN TG_OP = 'DELETE' THEN
    CASE WHEN TG_ARGV[0] = 'content' THEN OLD.content_id ELSE OLD.form_id END
  ELSE
    CASE WHEN TG_ARGV[0] = 'content' THEN NEW.content_id ELSE NEW.form_id END
  END;
  IF TG_ARGV[0] = 'content' THEN
    SELECT episode_id INTO episode_key FROM episode_contents WHERE id = parent_key;
  ELSE
    SELECT episode_id INTO episode_key FROM feedback_forms WHERE id = parent_key;
  END IF;
  SELECT status INTO current_status FROM episodes WHERE id = episode_key FOR SHARE;
  IF current_status = 'cloture' THEN
    RAISE EXCEPTION 'EPISODE_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER content_revisions_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON content_revisions FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_indirect_change('content');
--> statement-breakpoint
CREATE TRIGGER content_publications_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON content_publications FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_indirect_change('content');
--> statement-breakpoint
CREATE TRIGGER feedback_form_versions_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON feedback_form_versions FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_indirect_change('form');
--> statement-breakpoint
CREATE TRIGGER feedback_imports_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON feedback_imports FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_indirect_change('form');
--> statement-breakpoint
CREATE TRIGGER feedback_responses_closed_insert_guard BEFORE INSERT ON feedback_responses FOR EACH ROW EXECUTE FUNCTION prevent_closed_episode_indirect_change('form');
