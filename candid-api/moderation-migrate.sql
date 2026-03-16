-- Add moderation columns to photos.
-- Existing rows default to 'approved' so nothing is retroactively hidden.
-- New inserts explicitly set 'pending' in the route handler.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE photos ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
