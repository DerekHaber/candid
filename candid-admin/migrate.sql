-- Run this on the Lightsail PostgreSQL server:
-- sudo -u postgres psql -d candid -f migrate.sql

-- Add banned_at to users (for soft-ban support)
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Add display_name if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Ensure reports table exists with a primary key
CREATE TABLE IF NOT EXISTS reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reported_photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Ensure blocks table exists
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
