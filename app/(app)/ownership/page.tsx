'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchOwners,
  createOwner,
  updateOwner,
  deleteOwner,
  fetchStoredFields,
  fetchFieldBoundaries,
  fetchStoredOperations,
  assignBoundaryToOwner,
  removeOwnerBoundary,
  fetchOwnerBoundaries,
} from '@/lib/john-deere-client';
import { formatArea } from '@/lib/area-utils';
import type { Owner, StoredField, FieldBoundary, StoredFieldOperation, FieldOwnerBoundary } from '@/types/john-deere';
import { Users, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Wheat, Sprout, Loader as Loader2, MapPin, Link2, Link2Off, ChartBar as BarChart3 } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function ownerColor(id: string) {
  const colors = [
    'bg-sky-500/20 text-sky-300 border-sky-500/30',
    'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'bg-rose-500/20 text-rose-300 border-rose-500/30',
    'bg-violet-500/20 text-violet-300 border-violet-500/30',
    'bg-teal-500/20 text-teal-300 border-teal-500/30',
    'bg-orange-500/20 text-orange-300 border-orange-500/30',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

// ── Owner Form Modal ─────────────────────────────────────────────────────────

function OwnerFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Owner;
  onSave: (name: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), notes.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{initial ? 'Edit Owner' : 'New Owner'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Name <span className="text-rose-400">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. John Smith"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Notes <span className="text-slate-600">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. NW quarter section owner"
              rows={2}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors resize-none"
            />
          </div>
          {err && <p className="text-xs text-rose-400">{err}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {initial ? 'Save Changes' : 'Create Owner'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Boundary Assign Modal ─────────────────────────────────────────────────────

function BoundaryAssignModal({
  field,
  owners,
  existingAssignments,
  preferredUnit,
  onAssign,
  onClose,
}: {
  field: StoredField;
  owners: Owner[];
  existingAssignments: FieldOwnerBoundary[];
  preferredUnit: string;
  onAssign: (ownerId: string, ownerName: string, boundary: FieldBoundary) => Promise<void>;
  onClose: () => void;
}) {
  const [boundaries, setBoundaries] = useState<FieldBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoundary, setSelectedBoundary] = useState<FieldBoundary | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchFieldBoundaries(field.jd_field_id)
      .then(d => setBoundaries(d.boundaries || []))
      .catch(() => setBoundaries([]))
      .finally(() => setLoading(false));
  }, [field.jd_field_id]);

  const assignedOwnerIds = new Set(existingAssignments.map(a => a.owner_id));
  const availableOwners = owners.filter(o => !assignedOwnerIds.has(o.id));

  const handleAssign = async () => {
    if (!selectedBoundary || !selectedOwner) { setErr('Select both a boundary and an owner'); return; }
    setSaving(true);
    try {
      await onAssign(selectedOwner.id, selectedOwner.name, selectedBoundary);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-white">Assign Boundary</h2>
            <p className="text-xs text-slate-400 mt-0.5">{field.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-2">Select Boundary</label>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {boundaries.length === 0 ? (
                  <p className="text-sm text-slate-500 py-3">No boundaries found in raw field data.</p>
                ) : boundaries.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBoundary(b)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${
                      selectedBoundary?.id === b.id
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-white'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b.name || `Boundary ${b.id.slice(0, 6)}`}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${b.active ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' : 'bg-white/5 border-white/[0.06] text-slate-400'}`}>
                        {b.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {b.area && (
                      <p className="text-xs text-slate-500 font-mono-data mt-0.5">
                        {formatArea(b.area.valueAsDouble, b.area.unit, preferredUnit)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Assign to Owner</label>
              {availableOwners.length === 0 ? (
                <p className="text-sm text-slate-500">All owners already have a boundary assignment for this field.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {availableOwners.map(o => (
                    <button
                      key={o.id}
                      onClick={() => setSelectedOwner(o)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all text-sm ${
                        selectedOwner?.id === o.id
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-white'
                          : 'bg-white/[0.03] border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border ${ownerColor(o.id)}`}>
                          {initials(o.name)}
                        </span>
                        <span>{o.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {err && <p className="text-xs text-rose-400">{err}</p>}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 border border-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || loading || !selectedBoundary || !selectedOwner}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Assign Boundary
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field Ownership Row ──────────────────────────────────────────────────────

function FieldOwnershipRow({
  field,
  owners,
  preferredUnit,
  onAddAssignment,
}: {
  field: StoredField;
  owners: Owner[];
  preferredUnit: string;
  onAddAssignment: (field: StoredField) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [assignments, setAssignments] = useState<FieldOwnerBoundary[]>([]);
  const [operations, setOperations] = useState<StoredFieldOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignData, opsData] = await Promise.all([
        fetchOwnerBoundaries(field.jd_field_id),
        fetchStoredOperations(field.jd_field_id),
      ]);
      setAssignments(assignData.ownerBoundaries || []);
      setOperations(opsData.operations || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [field.jd_field_id]);

  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  const handleRemove = async (ownerId: string) => {
    setRemoving(ownerId);
    try {
      await removeOwnerBoundary(field.jd_field_id, ownerId);
      setAssignments(prev => prev.filter(a => a.owner_id !== ownerId));
    } catch { /* ignore */ } finally {
      setRemoving(null);
    }
  };

  const harvestOps = operations.filter(o => o.operation_type === 'harvest');

  const totalHarvestArea = harvestOps.reduce((s, o) => s + (o.area_value || 0), 0);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className={`transition-transform duration-200 text-slate-400 ${expanded ? 'rotate-90' : ''}`}>
          <ChevronRight className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-white text-sm">{field.name}</span>
          {(field.client_name || field.farm_name) && (
            <span className="text-xs text-slate-500 ml-2">{[field.client_name, field.farm_name].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {field.boundary_area_value && (
            <span className="text-xs font-mono-data text-emerald-400">
              {formatArea(field.boundary_area_value, field.boundary_area_unit, preferredUnit)}
            </span>
          )}
          {assignments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono-data">
              {assignments.length} owner{assignments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              {assignments.length === 0 ? (
                <p className="text-sm text-slate-500 mb-3">No owner boundaries assigned yet.</p>
              ) : (
                <div className="space-y-3 mb-4">
                  {assignments.map(a => {
                    const owner = owners.find(o => o.id === a.owner_id);
                    const ownerHarvestOps = harvestOps.filter(o => {
                      if (!a.boundary_geojson || !o.area_value) return false;
                      return true;
                    });
                    const ownerAreaRatio = (a.area_value && totalHarvestArea > 0)
                      ? (a.area_value / (field.boundary_area_value || a.area_value))
                      : null;
                    const ownerYieldTotal = ownerAreaRatio != null
                      ? harvestOps.reduce((s, o) => s + (o.total_wet_mass_value || 0) * ownerAreaRatio, 0)
                      : null;
                    const ownerAvgYield = ownerAreaRatio != null && harvestOps.length > 0
                      ? harvestOps.reduce((s, o) => s + (o.avg_yield_value || 0), 0) / harvestOps.length
                      : null;

                    return (
                      <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border flex-shrink-0 ${ownerColor(a.owner_id)}`}>
                          {initials(a.owner_name || owner?.name || '?')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">{a.owner_name || owner?.name || 'Unknown Owner'}</span>
                            {a.area_value && (
                              <span className="text-xs font-mono-data text-slate-400">
                                {formatArea(a.area_value, a.area_unit, preferredUnit)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {ownerAvgYield != null && (
                              <span className="flex items-center gap-1 text-xs text-amber-400/80 font-mono-data">
                                <Wheat className="w-3 h-3" />
                                {ownerAvgYield.toFixed(1)} bu/ac avg yield
                              </span>
                            )}
                            {ownerYieldTotal != null && ownerYieldTotal > 0 && (
                              <span className="text-xs text-slate-400 font-mono-data">
                                ~{ownerYieldTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {harvestOps[0]?.total_wet_mass_unit || 'bu'} est.
                              </span>
                            )}
                            {harvestOps.length === 0 && (
                              <span className="text-xs text-slate-600">No harvest data</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemove(a.owner_id)}
                          disabled={removing === a.owner_id}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0"
                        >
                          {removing === a.owner_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Link2Off className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => onAddAssignment(field)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14] border border-emerald-500/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Assign Boundary to Owner
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function OwnershipPage() {
  const { johnDeereConnection } = useAuth();
  const preferredUnit = johnDeereConnection?.preferred_area_unit || 'ac';

  const [owners, setOwners] = useState<Owner[]>([]);
  const [fields, setFields] = useState<StoredField[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [loadingFields, setLoadingFields] = useState(true);
  const [ownerModal, setOwnerModal] = useState<{ open: boolean; editing?: Owner }>({ open: false });
  const [assignModal, setAssignModal] = useState<{ open: boolean; field?: StoredField; assignments?: FieldOwnerBoundary[] }>({ open: false });
  const [deletingOwner, setDeletingOwner] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState('');

  const loadOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      const d = await fetchOwners();
      setOwners(d.owners || []);
    } catch { /* ignore */ } finally {
      setLoadingOwners(false);
    }
  }, []);

  const loadFields = useCallback(async () => {
    setLoadingFields(true);
    try {
      const d = await fetchStoredFields();
      setFields((d.fields || []).filter((f: StoredField) => f.active_boundary));
    } catch { /* ignore */ } finally {
      setLoadingFields(false);
    }
  }, []);

  useEffect(() => {
    if (johnDeereConnection?.selected_org_id) {
      loadOwners();
      loadFields();
    }
  }, [johnDeereConnection?.selected_org_id, loadOwners, loadFields]);

  const handleSaveOwner = async (name: string, notes: string) => {
    if (ownerModal.editing) {
      await updateOwner(ownerModal.editing.id, name, notes);
    } else {
      await createOwner(name, notes);
    }
    await loadOwners();
  };

  const handleDeleteOwner = async (owner: Owner) => {
    if (!window.confirm(`Delete owner "${owner.name}"? All boundary assignments for this owner will also be removed.`)) return;
    setDeletingOwner(owner.id);
    try {
      await deleteOwner(owner.id);
      await loadOwners();
    } catch { /* ignore */ } finally {
      setDeletingOwner(null);
    }
  };

  const handleOpenAssign = async (field: StoredField) => {
    const d = await fetchOwnerBoundaries(field.jd_field_id).catch(() => ({ ownerBoundaries: [] }));
    setAssignModal({ open: true, field, assignments: d.ownerBoundaries || [] });
  };

  const handleAssign = async (ownerId: string, ownerName: string, boundary: FieldBoundary) => {
    if (!assignModal.field) return;
    await assignBoundaryToOwner({
      fieldId: assignModal.field.jd_field_id,
      boundaryId: boundary.id,
      ownerId,
      ownerName,
      boundaryGeojson: boundary.geojson,
      areaValue: boundary.area?.valueAsDouble,
      areaUnit: boundary.area?.unit,
    });
  };

  const filteredFields = fields.filter(f =>
    !fieldSearch || f.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.client_name?.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.farm_name?.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  return (
    <div className="min-h-[calc(100vh-48px)] bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Ownership</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Assign field boundaries to owners for yield and production attribution
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

          {/* ── Owners Panel ── */}
          <div className="glass rounded-2xl overflow-hidden sticky top-[64px]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-white">Owners</h2>
                {owners.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-mono-data">{owners.length}</span>
                )}
              </div>
              <button
                onClick={() => setOwnerModal({ open: true })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Owner
              </button>
            </div>

            <div className="p-3">
              {loadingOwners ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                </div>
              ) : owners.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No owners yet</p>
                  <p className="text-xs text-slate-600 mt-1">Add owners to start assigning boundaries</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {owners.map(owner => (
                    <div
                      key={owner.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border flex-shrink-0 ${ownerColor(owner.id)}`}>
                        {initials(owner.name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{owner.name}</p>
                        {owner.notes && (
                          <p className="text-xs text-slate-500 truncate">{owner.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setOwnerModal({ open: true, editing: owner })}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOwner(owner)}
                          disabled={deletingOwner === owner.id}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          {deletingOwner === owner.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Fields Panel ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                placeholder="Search fields..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
              />
              {fields.length > 0 && (
                <span className="text-xs text-slate-500 whitespace-nowrap font-mono-data">{filteredFields.length} of {fields.length}</span>
              )}
            </div>

            {loadingFields ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            ) : fields.length === 0 ? (
              <div className="text-center py-20 glass rounded-2xl">
                <MapPin className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No fields imported yet</p>
                <p className="text-sm text-slate-500 mt-1">Import fields from the Fields page first</p>
              </div>
            ) : filteredFields.length === 0 ? (
              <div className="text-center py-12 glass rounded-2xl">
                <p className="text-slate-500 text-sm">No fields match your search</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFields.map(field => (
                  <FieldOwnershipRow
                    key={field.id}
                    field={field}
                    owners={owners}
                    preferredUnit={preferredUnit}
                    onAddAssignment={handleOpenAssign}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {ownerModal.open && (
        <OwnerFormModal
          initial={ownerModal.editing}
          onSave={handleSaveOwner}
          onClose={() => setOwnerModal({ open: false })}
        />
      )}

      {assignModal.open && assignModal.field && (
        <BoundaryAssignModal
          field={assignModal.field}
          owners={owners}
          existingAssignments={assignModal.assignments || []}
          preferredUnit={preferredUnit}
          onAssign={handleAssign}
          onClose={() => setAssignModal({ open: false })}
        />
      )}
    </div>
  );
}
