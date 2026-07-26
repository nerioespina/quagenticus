CREATE TABLE app_user (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    email           citext NOT NULL,
    password        text,                      -- bcrypt vía pgcrypto; NULL si solo SSO
    display_name    text NOT NULL,
    avatar_url      text,
    is_account_admin boolean NOT NULL DEFAULT false,
    locale          text NOT NULL DEFAULT 'es',
    timezone        text NOT NULL DEFAULT 'UTC',
    status          user_status NOT NULL DEFAULT 'pending',
    last_login_at   timestamptz,
    preferences     jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    creator_id      uuid,
    UNIQUE (account_id, email)
);
