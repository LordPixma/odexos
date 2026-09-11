import { useMemo, useState, type FormEvent } from "react";
import {
  useActivities,
  useCreateActivity,
  useDeleteActivity,
  useMembers,
  useUpdateActivity,
} from "../lib/queries";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Textarea,
} from "../components/ui";
import {
  CalendarIcon,
  ClockIcon,
  EditIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { ACTIVITY_COLORS } from "../lib/labels";
import { formatTime, relativeDay, toDateTimeLocal } from "../lib/format";
import { ApiError } from "../lib/api";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  RECURRENCE_LABELS,
  RECURRENCE_RULES,
  type Activity,
  type RecurrenceRule,
} from "@shared/types";

const RECURRENCE_SHORT: Record<RecurrenceRule, string> = {
  none: "",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

interface FormState {
  title: string;
  category: string;
  memberId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
  recurrence: string;
  recurrenceUntil: string;
}

function emptyForm(): FormState {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return {
    title: "",
    category: "school_run",
    memberId: "",
    startsAt: toDateTimeLocal(now.toISOString()),
    endsAt: "",
    allDay: false,
    location: "",
    notes: "",
    recurrence: "none",
    recurrenceUntil: "",
  };
}

function fromActivity(a: Activity): FormState {
  return {
    title: a.title,
    category: a.category,
    memberId: a.memberId ?? "",
    startsAt: toDateTimeLocal(a.startsAt),
    endsAt: a.endsAt ? toDateTimeLocal(a.endsAt) : "",
    allDay: a.allDay,
    location: a.location ?? "",
    notes: a.notes ?? "",
    recurrence: a.recurrence,
    recurrenceUntil: a.recurrenceUntil ?? "",
  };
}

export default function ActivitiesPage() {
  const [showPast, setShowPast] = useState(false);
  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: activities, isLoading } = useActivities(
    showPast ? {} : { from },
  );
  const { data: members = [] } = useMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const create = useCreateActivity();
  const update = useUpdateActivity();
  const remove = useDeleteActivity();
  const error =
    (create.error as ApiError | null)?.message ??
    (update.error as ApiError | null)?.message;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    create.reset();
    update.reset();
    setModalOpen(true);
  }
  function openEdit(a: Activity) {
    setEditing(a);
    setForm(fromActivity(a));
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      category: form.category,
      memberId: form.memberId || null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      allDay: form.allDay,
      location: form.location || null,
      notes: form.notes || null,
      recurrence: form.recurrence,
      recurrenceUntil:
        form.recurrence !== "none" && form.recurrenceUntil
          ? form.recurrenceUntil
          : null,
    };
    const onDone = { onSuccess: () => setModalOpen(false) };
    // Occurrences carry the base series id in seriesId.
    if (editing)
      update.mutate({ id: editing.seriesId ?? editing.id, ...payload }, onDone);
    else create.mutate(payload, onDone);
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    for (const a of activities ?? []) {
      const key = new Date(a.startsAt).toDateString();
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [activities]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CalendarIcon />}
        tint="#2f74e0"
        title="Activities"
        subtitle="School runs, clubs, meetings and weekend plans — all in one place."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setShowPast((v) => !v)}>
              {showPast ? "Upcoming only" : "Show past"}
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon /> Add activity
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="No activities yet"
          description="Add your first school run, club or meeting to get started."
          action={<Button onClick={openCreate}>
            <PlusIcon /> Add activity
          </Button>}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">
                {relativeDay(items[0].startsAt)}
              </h2>
              <Card className="divide-y divide-slate-100">
                {items.map((a) => {
                  const color = ACTIVITY_COLORS[a.category];
                  const member = a.memberId ? memberById.get(a.memberId) : undefined;
                  return (
                    <div key={a.id} className="group flex items-center gap-3 p-4">
                      <span
                        className="h-10 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {a.title}
                          </span>
                          <span
                            className="chip"
                            style={{ backgroundColor: `${color}1a`, color }}
                          >
                            {ACTIVITY_CATEGORY_LABELS[a.category]}
                          </span>
                          {a.recurrence !== "none" && (
                            <span className="chip bg-slate-100 text-slate-500" title="Repeats">
                              ↻ {RECURRENCE_SHORT[a.recurrence]}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon />
                            {a.allDay ? "All day" : formatTime(a.startsAt)}
                            {a.endsAt && !a.allDay && ` – ${formatTime(a.endsAt)}`}
                          </span>
                          {a.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPinIcon /> {a.location}
                            </span>
                          )}
                        </div>
                      </div>
                      {member && (
                        <Avatar name={member.name} color={member.color} size={30} />
                      )}
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(a)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => {
                            const msg =
                              a.recurrence !== "none"
                                ? `Delete the whole "${a.title}" series?`
                                : `Delete "${a.title}"?`;
                            if (confirm(msg)) remove.mutate(a.seriesId ?? a.id);
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit activity" : "Add activity"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Morning school run"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {ACTIVITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ACTIVITY_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Who">
              <Select
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
              >
                <option value="">Whole family</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                required
              />
            </Field>
            <Field label="Ends (optional)">
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            All-day activity
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Repeats">
              <Select
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              >
                {RECURRENCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            {form.recurrence !== "none" && (
              <Field label="Until (optional)">
                <Input
                  type="date"
                  value={form.recurrenceUntil}
                  onChange={(e) =>
                    setForm({ ...form, recurrenceUntil: e.target.value })
                  }
                />
              </Field>
            )}
          </div>
          <Field label="Location (optional)">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="St Mary's Primary School"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Remember the PE kit"
            />
          </Field>

          <ErrorBanner message={error} />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? "Save changes" : "Add activity"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
