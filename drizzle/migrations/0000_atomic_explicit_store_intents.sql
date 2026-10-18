ALTER TABLE public.store_data ADD COLUMN IF NOT EXISTS retired_session_before numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.guard_store_intent_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_start numeric; new_start numeric;
BEGIN
  IF auth.role() = 'authenticated' AND coalesce(current_setting('rentoplay.intent_write', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Versi aplikasi lama tidak boleh mengirim data. Muat ulang RenToPlay.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.kind IN ('shift', 'business_day') AND OLD.payload->>'closedAt' IS NOT NULL AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.deleted IS DISTINCT FROM OLD.deleted) THEN
      RAISE EXCEPTION 'Shift atau hari usaha yang sudah ditutup tidak boleh diubah.';
    END IF;
    IF OLD.deleted AND NOT NEW.deleted THEN
      RAISE EXCEPTION 'Data yang sudah dihapus tidak boleh dihidupkan kembali.';
    END IF;
    NEW.retired_session_before := OLD.retired_session_before;
    IF OLD.kind = 'station' THEN
      old_start := nullif(OLD.payload #>> '{session,startAt}', '')::numeric;
      new_start := nullif(NEW.payload #>> '{session,startAt}', '')::numeric;
    ELSIF OLD.kind = 'cafe_table' THEN
      old_start := nullif(OLD.payload->>'openedAt', '')::numeric;
      new_start := nullif(NEW.payload->>'openedAt', '')::numeric;
    END IF;
    IF old_start IS NOT NULL AND new_start IS DISTINCT FROM old_start THEN
      NEW.retired_session_before := greatest(OLD.retired_session_before, old_start);
    END IF;
    IF new_start IS NOT NULL AND new_start IS DISTINCT FROM old_start AND new_start <= NEW.retired_session_before THEN
      RAISE EXCEPTION 'Sesi lama sudah selesai atau VOID dan tidak boleh dikirim ulang.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_store_intent_write BEFORE INSERT OR UPDATE OR DELETE ON public.store_data FOR EACH ROW EXECUTE FUNCTION public.guard_store_intent_write();
REVOKE ALL ON FUNCTION public.guard_store_intent_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.store_apply_intents(_store_id uuid, _records jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; current_row public.store_data%ROWTYPE; returned jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.store_members WHERE user_id = auth.uid() AND store_id = _store_id) THEN
    RAISE EXCEPTION 'Akun tidak terhubung ke store ini.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_records) <> 'array' OR jsonb_array_length(_records) > 5000 THEN RAISE EXCEPTION 'Antrean tidak sah.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_store_id::text, 0));
  FOR r IN SELECT value FROM jsonb_array_elements(_records) LOOP
    IF NOT (r ? 'base') OR coalesce(r->>'transaction', '') = '' OR coalesce(r->>'entity_id', '') = '' OR coalesce(r->>'kind', '') = '' THEN RAISE EXCEPTION 'Kiriman tidak memiliki jejak aksi.'; END IF;
    SELECT * INTO current_row FROM public.store_data WHERE store_id = _store_id AND kind = r->>'kind' AND entity_id = r->>'entity_id' FOR UPDATE;
    IF FOUND THEN
      IF current_row.payload = r->'payload' AND current_row.deleted = (r->>'deleted')::boolean THEN CONTINUE; END IF;
      IF current_row.deleted OR r->'base' IS DISTINCT FROM current_row.payload THEN RETURN jsonb_build_object('accepted', false, 'records', '[]'::jsonb); END IF;
      IF current_row.kind IN ('shift','business_day') AND current_row.payload->>'closedAt' IS NOT NULL THEN RETURN jsonb_build_object('accepted', false, 'records', '[]'::jsonb); END IF;
    ELSIF r->'base' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('accepted', false, 'records', '[]'::jsonb);
    END IF;
  END LOOP;
  PERFORM set_config('rentoplay.intent_write', 'yes', true);
  FOR r IN SELECT value FROM jsonb_array_elements(_records) LOOP
    INSERT INTO public.store_data(store_id, kind, entity_id, payload, deleted)
    VALUES (_store_id, r->>'kind', r->>'entity_id', r->'payload', (r->>'deleted')::boolean)
    ON CONFLICT (store_id,kind,entity_id) DO UPDATE SET payload = excluded.payload, deleted = excluded.deleted
    WHERE store_data.payload IS DISTINCT FROM excluded.payload OR store_data.deleted IS DISTINCT FROM excluded.deleted;
    SELECT * INTO current_row FROM public.store_data WHERE store_id = _store_id AND kind = r->>'kind' AND entity_id = r->>'entity_id';
    IF current_row.payload IS DISTINCT FROM r->'payload' OR current_row.deleted IS DISTINCT FROM (r->>'deleted')::boolean THEN RAISE EXCEPTION 'Pusat menolak perubahan ini.'; END IF;
    returned := returned || jsonb_build_array(jsonb_build_object('kind', current_row.kind, 'entity_id', current_row.entity_id, 'payload', current_row.payload, 'deleted', current_row.deleted));
  END LOOP;
  PERFORM set_config('rentoplay.intent_write', '', true);
  RETURN jsonb_build_object('accepted', true, 'records', returned);
END;
$$;
REVOKE ALL ON FUNCTION public.store_apply_intents(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_apply_intents(uuid,jsonb) TO authenticated;
GRANT SELECT ON public.store_data TO authenticated;
GRANT ALL ON public.store_data TO service_role;
