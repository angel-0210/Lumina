-- Migration 0007: Update process_audit_log to safely check profiles existence before inserting audit_logs.
-- Prevents Foreign Key constraint violation 23503 when v_user_id is not yet in public.profiles.

CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_action audit_action;
    v_old JSONB := NULL;
    v_new JSONB := NULL;
    v_entity_id UUID;
BEGIN
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert'::audit_action;
        v_new := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update'::audit_action;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete'::audit_action;
        v_old := to_jsonb(OLD);
        v_entity_id := OLD.id;
    END IF;

    IF v_user_id IS NULL THEN
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            IF TG_TABLE_NAME = 'profiles' THEN
                v_user_id := NEW.id;
            ELSIF TG_TABLE_NAME IN ('documents', 'learning_sessions', 'assessment_sessions') THEN
                v_user_id := NEW.user_id;
            END IF;
        ELSE
            IF TG_TABLE_NAME = 'profiles' THEN
                v_user_id := OLD.id;
            ELSIF TG_TABLE_NAME IN ('documents', 'learning_sessions', 'assessment_sessions') THEN
                v_user_id := OLD.user_id;
            END IF;
        END IF;
    END IF;

    IF v_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
            v_user_id := NULL;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_state, new_state)
    VALUES (v_user_id, v_action, TG_TABLE_NAME, v_entity_id, v_old, v_new);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
