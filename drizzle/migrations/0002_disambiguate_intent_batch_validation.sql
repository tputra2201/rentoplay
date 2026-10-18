CREATE OR REPLACE FUNCTION public.validate_store_intent_batch(_records jsonb) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_records) AS entries(value) GROUP BY entries.value->>'kind', entries.value->>'entity_id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Antrean berisi entitas ganda.'; END IF;
  FOR item IN SELECT entries.value FROM jsonb_array_elements(_records) AS entries(value) LOOP
    IF jsonb_typeof(item->'payload') IS DISTINCT FROM 'object' OR jsonb_typeof(item->'base') NOT IN ('object','null') OR jsonb_typeof(item->'deleted') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Bentuk perubahan tidak sah.'; END IF;
    IF item->>'kind' NOT IN ('settings','station','menu','payment','package','customer','booking','promotion','point','history','void_record','cafe_table','playing_card','card_entry','card_backup','cash_category','cash_group','cash_entry','shift','business_day','log_entry','addon_rental') THEN RAISE EXCEPTION 'Jenis data tidak dikenal.'; END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_store_intent_batch(jsonb) FROM PUBLIC, anon, authenticated;