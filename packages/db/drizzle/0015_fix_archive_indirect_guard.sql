CREATE OR REPLACE FUNCTION prevent_closed_episode_indirect_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_key text; episode_key text; current_status text;
BEGIN
  IF TG_ARGV[0] = 'content' THEN
    IF TG_OP = 'DELETE' THEN parent_key := OLD.content_id;
    ELSE parent_key := NEW.content_id; END IF;
    SELECT episode_id INTO episode_key FROM episode_contents WHERE id = parent_key;
  ELSE
    IF TG_OP = 'DELETE' THEN parent_key := OLD.form_id;
    ELSE parent_key := NEW.form_id; END IF;
    SELECT episode_id INTO episode_key FROM feedback_forms WHERE id = parent_key;
  END IF;
  SELECT status INTO current_status FROM episodes WHERE id = episode_key FOR SHARE;
  IF current_status = 'cloture' THEN
    RAISE EXCEPTION 'EPISODE_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
