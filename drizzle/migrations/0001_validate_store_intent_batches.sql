CREATE OR REPLACE FUNCTION public.validate_store_intent_batch(_records jsonb) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_records) r GROUP BY r->>'kind', r->>'entity_id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Antrean berisi entitas ganda.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_records) LOOP
    IF jsonb_typeof(r->'payload') IS DISTINCT FROM 'object' OR jsonb_typeof(r->'base') NOT IN ('object','null') OR jsonb_typeof(r->'deleted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Bentuk perubahan tidak sah.'; END IF;
    IF r->>'kind' NOT IN ('settings','station','menu','payment','package','customer','booking','promotion','point','history','void_record','cafe_table','playing_card','card_entry','card_backup','cash_category','cash_group','cash_entry','shift','business_day','log_entry','addon_rental') THEN RAISE EXCEPTION 'Jenis data tidak dikenal.'; END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_store_intent_batch(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.store_apply_intents(uuid,jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, 'PERFORM pg_advisory_xact_lock', 'PERFORM public.validate_store_intent_batch(_records); PERFORM pg_advisory_xact_lock');
  EXECUTE definition;
END;
$$;