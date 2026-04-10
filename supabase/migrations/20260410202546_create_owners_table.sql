/*
  # Create owners table

  ## Purpose
  Stores a list of named owners for an organization. Owners can be assigned
  to specific field boundaries for financial attribution of production data.

  ## New Tables
  - `owners`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK → auth.users, cascade delete) — the app user who manages this owner
    - `org_id` (text) — John Deere organization ID this owner belongs to
    - `name` (text) — owner display name
    - `notes` (text, nullable) — optional notes
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled; authenticated users can only access their own owner records
*/

CREATE TABLE IF NOT EXISTS owners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      text NOT NULL,
  name        text NOT NULL,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own owners"
  ON owners FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own owners"
  ON owners FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own owners"
  ON owners FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own owners"
  ON owners FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS owners_user_id_idx ON owners(user_id);
CREATE INDEX IF NOT EXISTS owners_org_id_idx ON owners(org_id);
