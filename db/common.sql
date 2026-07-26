CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS unaccent;    -- slugs y búsqueda sin acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- búsqueda difusa y autocompletado
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- índices compuestos con tsvector
CREATE EXTENSION IF NOT EXISTS citext;      -- Used in app_user.email

CREATE OR REPLACE FUNCTION qg_unaccent(text) RETURNS text AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Context helpers
CREATE OR REPLACE FUNCTION qg_actor_id() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('qg.actor_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION qg_actor_type() RETURNS text AS $$
    SELECT COALESCE(NULLIF(current_setting('qg.actor_type', true), ''), 'system');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION qg_require_scope(p_scope text) RETURNS void AS $$
BEGIN
    IF current_setting('qg.scopes', true) IS NULL
       OR current_setting('qg.scopes', true) = '' THEN
        RETURN;
    END IF;
    IF NOT (p_scope = ANY (string_to_array(current_setting('qg.scopes', true), ' '))) THEN
        RAISE EXCEPTION 'Falta el scope requerido: %', p_scope USING ERRCODE = 'QG403';
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Types
DO $$ BEGIN
    CREATE TYPE actor_type AS ENUM ('user', 'agent', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('viewer', 'contributor', 'maintainer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
