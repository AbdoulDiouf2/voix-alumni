CREATE FUNCTION prevent_closed_media_asset_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE episode_key text; current_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN episode_key := NEW.episode_id;
  ELSE episode_key := OLD.episode_id; END IF;
  IF episode_key IS NOT NULL THEN
    SELECT status INTO current_status FROM episodes WHERE id = episode_key FOR SHARE;
    IF current_status = 'cloture' THEN
      IF TG_OP = 'UPDATE'
         AND OLD.rights_status <> 'revoked'
         AND NEW.rights_status = 'revoked'
         AND (to_jsonb(NEW) - 'rights_status' - 'rights_evidence_ref' - 'version')
           = (to_jsonb(OLD) - 'rights_status' - 'rights_evidence_ref' - 'version') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'EPISODE_CLOSED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER media_assets_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON media_assets FOR EACH ROW EXECUTE FUNCTION prevent_closed_media_asset_change();
