/*
  # Add irrigated boundary columns to fields table

  The John Deere API now exposes irrigated boundaries as separate boundary objects
  (with irrigated: true) rather than as interior rings within the active boundary.
  These columns store the irrigated boundary separately from the active boundary.

  New Columns:
    - `irrigated_boundary_geojson` (jsonb) - GeoJSON MultiPolygon of the irrigated boundary
    - `irrigated_boundary_area_value` (double precision) - area of the irrigated boundary
    - `irrigated_boundary_area_unit` (text) - unit (e.g., "ha", "ac")
    - `has_irrigated_boundary` (boolean) - quick filter flag
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'irrigated_boundary_geojson'
  ) THEN
    ALTER TABLE fields ADD COLUMN irrigated_boundary_geojson jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'irrigated_boundary_area_value'
  ) THEN
    ALTER TABLE fields ADD COLUMN irrigated_boundary_area_value double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'irrigated_boundary_area_unit'
  ) THEN
    ALTER TABLE fields ADD COLUMN irrigated_boundary_area_unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields' AND column_name = 'has_irrigated_boundary'
  ) THEN
    ALTER TABLE fields ADD COLUMN has_irrigated_boundary boolean DEFAULT false;
  END IF;
END $$;