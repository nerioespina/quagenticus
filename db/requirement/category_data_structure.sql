CREATE TABLE category (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id          uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    name              text NOT NULL,
    slug              text NOT NULL,
    description       text,
    -- Asignación por defecto al crear un requerimiento de esta categoría
    default_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
    default_agent_id  uuid, -- REFERENCES agent(id) later
    ord               integer NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    UNIQUE (space_id, slug)
);
