import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, isResponse } from "../_shared/auth.ts";
import {
  getUserConnection,
} from "../_shared/john-deere.ts";
import {
  convertBoundaryToGeoJSON,
  JdBoundary,
} from "../_shared/boundaries.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const authResult = await getAuthenticatedUser(req);
    if (isResponse(authResult)) return authResult;
    const { user, supabase } = authResult;

    const connection = await getUserConnection(supabase, user.id);
    if (!connection) {
      return errorResponse("No John Deere connection found", 404);
    }

    const orgId = connection.selected_org_id;
    if (!orgId) {
      return errorResponse("No organization selected", 400);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── Owner CRUD ────────────────────────────────────────────────────────────

    if (action === "get-owners") {
      const { data, error } = await supabase
        .from("owners")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .order("name");
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ owners: data || [] });
    }

    if (action === "create-owner" && req.method === "POST") {
      const body = await req.json();
      const { name, notes } = body;
      if (!name?.trim()) return errorResponse("Owner name is required", 400);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("owners")
        .insert({ user_id: user.id, org_id: orgId, name: name.trim(), notes: notes || null, created_at: now, updated_at: now })
        .select()
        .maybeSingle();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ owner: data });
    }

    if (action === "update-owner" && req.method === "POST") {
      const body = await req.json();
      const { ownerId, name, notes } = body;
      if (!ownerId) return errorResponse("Missing ownerId", 400);
      if (!name?.trim()) return errorResponse("Owner name is required", 400);
      const { data, error } = await supabase
        .from("owners")
        .update({ name: name.trim(), notes: notes ?? null, updated_at: new Date().toISOString() })
        .eq("id", ownerId)
        .eq("user_id", user.id)
        .select()
        .maybeSingle();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ owner: data });
    }

    if (action === "delete-owner" && req.method === "POST") {
      const body = await req.json();
      const { ownerId } = body;
      if (!ownerId) return errorResponse("Missing ownerId", 400);
      await supabase.from("field_owner_boundaries").delete().eq("owner_id", ownerId).eq("user_id", user.id);
      const { error } = await supabase.from("owners").delete().eq("id", ownerId).eq("user_id", user.id);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    // ── Boundaries ────────────────────────────────────────────────────────────

    if (action === "get-boundaries") {
      const fieldId = url.searchParams.get("fieldId");
      if (!fieldId) return errorResponse("Missing fieldId", 400);

      const { data: storedField } = await supabase
        .from("fields")
        .select("raw_response, id")
        .eq("user_id", user.id)
        .eq("jd_field_id", fieldId)
        .maybeSingle();

      if (!storedField) return errorResponse("Field not found", 404);

      const rawBoundaries: JdBoundary[] = storedField.raw_response?.boundaries || [];
      const boundaries = rawBoundaries.map((b: JdBoundary) => ({
        id: b.id,
        name: b.name || null,
        active: b.active,
        area: b.area || null,
        geojson: convertBoundaryToGeoJSON(b),
      }));

      return jsonResponse({ boundaries, fieldDbId: storedField.id });
    }

    // ── Owner Boundary Assignments ────────────────────────────────────────────

    if (action === "assign-boundary" && req.method === "POST") {
      const body = await req.json();
      const { fieldId, boundaryId, ownerId, ownerName, boundaryGeojson, areaValue, areaUnit } = body;

      if (!fieldId || !boundaryId || !ownerId) {
        return errorResponse("Missing required fields: fieldId, boundaryId, ownerId", 400);
      }

      const { data: storedField } = await supabase
        .from("fields")
        .select("id")
        .eq("user_id", user.id)
        .eq("jd_field_id", fieldId)
        .maybeSingle();

      if (!storedField) return errorResponse("Field not found", 404);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("field_owner_boundaries")
        .upsert({
          user_id: user.id,
          field_id: storedField.id,
          jd_field_id: fieldId,
          jd_boundary_id: boundaryId,
          owner_id: ownerId,
          owner_name: ownerName || null,
          boundary_geojson: boundaryGeojson || null,
          area_value: areaValue || null,
          area_unit: areaUnit || null,
          updated_at: now,
        }, { onConflict: "field_id,owner_id" });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true, data });
    }

    if (action === "get-owner-boundaries") {
      const fieldId = url.searchParams.get("fieldId");
      if (!fieldId) return errorResponse("Missing fieldId", 400);

      const { data, error } = await supabase
        .from("field_owner_boundaries")
        .select("*")
        .eq("user_id", user.id)
        .eq("jd_field_id", fieldId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ ownerBoundaries: data || [] });
    }

    if (action === "remove-owner-boundary" && req.method === "POST") {
      const body = await req.json();
      const { fieldId, ownerId } = body;
      if (!fieldId || !ownerId) return errorResponse("Missing fieldId or ownerId", 400);

      const { data: storedField } = await supabase
        .from("fields")
        .select("id")
        .eq("user_id", user.id)
        .eq("jd_field_id", fieldId)
        .maybeSingle();

      if (!storedField) return errorResponse("Field not found", 404);

      const { error } = await supabase
        .from("field_owner_boundaries")
        .delete()
        .eq("field_id", storedField.id)
        .eq("owner_id", ownerId)
        .eq("user_id", user.id);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    if (action === "get-all-owner-boundaries") {
      const { data, error } = await supabase
        .from("field_owner_boundaries")
        .select("*, fields(name, org_id)")
        .eq("user_id", user.id);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ ownerBoundaries: data || [] });
    }

    return errorResponse("Unknown action", 400);
  } catch (error) {
    console.error("[boundary-assignment] Error:", error);
    return errorResponse(error.message, 500);
  }
});
