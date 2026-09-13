import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useChores,
  useCompleteChore,
  useCreateChore,
  useDeleteChore,
  useMembers,
  useUndoChore,
  useUpdateChore,
} from "../lib/queries";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  MemberAvatar,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatTile,
} from "../components/ui";
import {
  BroomIcon,
  CheckIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { ApiError } from "../lib/api";
import { todayISODate } from "../lib/format";
import {
  CHORE_CADENCES,
  CHORE_CADENCE_LABELS,
  type Chore,
  type ChoreStatus,
  type Member,
} from "@shared/types";

const STATUS_STYLE: Record<ChoreStatus, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "#fb7185" },
  today: { label: "Due today", color: "#fbbf24" },
  upcoming: { label: "Upcoming", color: "#38bdf8" },
};

interface FormState {
  title: string;
  notes: string;
  assignedTo: string;
  cadence: string;
  dueDate: string;
  points: string;
  rotate: boolean;
}

function emptyForm(): FormState {
  return {
    title: "",
    notes: "",
    assignedTo: "",
    cadence: "weekly",
    dueDate: todayISODate(),
    points: "5",
    rotate: false,
  };
}

function ChoreRow({
  chore,
  member,
  onEdit,
}: {
  chore: Chore;
  member?: Member;
  onEdit: (c: Chore) => void;
}) {
  const complete = useCompleteChore();
  const undo = useUndoChore();
  const style = STATUS_STYLE[chore.status];
  const busy = complete.isPending || undo.isPending;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition ${
        chore.doneToday
          ? "border-emerald-500/25 bg-emerald-500/[0.07]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      {/* Big, kid-friendly check target */}
      <button
        onClick={() =>
          chore.doneToday
            ? undo.mutate(chore.id)
            : complete.mutate({ id: chore.id, memberId: chore.assignedTo })
        }
        disabled={busy}
        aria-label={chore.doneToday ? "Undo" : "Mark done"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition disabled:opacity-50 ${
          chore.doneToday
            ? "border-emerald-400 bg-emerald-500 text-white"
            : "border-white/20 text-transparent hover:border-brand-400 hover:bg-brand-500/15 hover:text-brand-300"
        }`}
      >
        <CheckIcon size={22} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`truncate font-medium ${
              chore.doneToday ? "text-slate-400 line-through" : "text-slate-100"
            }`}
          >
            {chore.title}
          </span>
          {chore.streak > 1 && (
            <span className="chip bg-accent-400/15 text-accent-300">
              🔥 {chore.streak}
            </span>
          )}
          {chore.points > 0 && (
            <span className="chip bg-white/[0.06] text-slate-400">
              {chore.points} pts
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span style={{ color: chore.doneToday ? undefined : style.color }}>
            {chore.doneToday ? "Done today" : style.label}
          </span>
          <span>· {CHORE_CADENCE_LABELS[chore.cadence]}</span>
          {chore.rotate && <span>· rotates</span>}
          {chore.notes && <span className="truncate">· {chore.notes}</span>}
        </div>
      </div>

      {member ? (
        <MemberAvatar member={member} size={28} />
      ) : (
        <span className="chip bg-white/[0.06] text-slate-500">Anyone</span>
      )}

      <button
        onClick={() => onEdit(chore)}
        className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
        aria-label="Edit chore"
      >
        <EditIcon />
      </button>
    </div>
  );
}

export default function ChoresPage() {
  // The Parent Centre and a child's own view link here with ?assignedTo=…
  const [params, setParams] = useSearchParams();
  const assignedTo = params.get("assignedTo") ?? "";
  const { data, isLoading } = useChores(assignedTo || undefined);
  const { data: members = [] } = useMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const create = useCreateChore();
  const update = useUpdateChore();
  const remove = useDeleteChore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Chore | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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
  function openEdit(ch: Chore) {
    setEditing(ch);
    setForm({
      title: ch.title,
      notes: ch.notes ?? "",
      assignedTo: ch.assignedTo ?? "",
      cadence: ch.cadence,
      dueDate: ch.dueDate,
      points: String(ch.points),
      rotate: ch.rotate,
    });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      notes: form.notes || null,
      assignedTo: form.assignedTo || null,
      cadence: form.cadence,
      dueDate: form.dueDate,
      points: Number(form.points || 0),
      rotate: form.rotate,
    };
    const done = { onSuccess: () => setModalOpen(false) };
    if (editing) update.mutate({ id: editing.id, ...payload }, done);
    else create.mutate(payload, done);
  }

  if (isLoading || !data) return <PageLoader />;

  const open = data.chores.filter((c) => !c.doneToday);
  const overdue = open.filter((c) => c.status === "overdue");
  const today = open.filter((c) => c.status === "today");
  const upcoming = open.filter((c) => c.status === "upcoming");
  const doneToday = data.chores.filter((c) => c.doneToday);

  const groups: [string, Chore[]][] = [
    ["Overdue", overdue],
    ["Due today", today],
    ["Done today", doneToday],
    ["Coming up", upcoming],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<BroomIcon />}
        tint="#7c5cf5"
        title="Chores"
        subtitle="Who's doing what around the house."
        action={
          <Button onClick={openCreate}>
            <PlusIcon /> New chore
          </Button>
        }
      />

      {/* A filtered board with nothing saying so reads as missing chores. */}
      {assignedTo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-sm text-slate-300">
            Showing{" "}
            <strong className="text-white">
              {members.find((m) => m.id === assignedTo)?.nickname ??
                members.find((m) => m.id === assignedTo)?.name ??
                "one member"}
            </strong>
            's chores
          </span>
          <button
            type="button"
            onClick={() => {
              params.delete("assignedTo");
              setParams(params, { replace: true });
            }}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-400 transition hover:text-brand-300"
          >
            Show everyone
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Open now"
          value={`${data.openToday}`}
          hint={data.openToday === 1 ? "chore" : "chores"}
          tint="#fbbf24"
        />
        <StatTile
          label="Done this week"
          value={`${data.doneThisWeek}`}
          tint="#34d399"
        />
        <StatTile
          label="Top scorer"
          value={
            data.scores[0]
              ? (memberById.get(data.scores[0].memberId)?.nickname ??
                memberById.get(data.scores[0].memberId)?.name.split(" ")[0] ??
                "—")
              : "—"
          }
          hint={data.scores[0] ? `${data.scores[0].points} pts` : "no points yet"}
          tint="#7c5cf5"
        />
      </div>

      {/* Weekly leaderboard */}
      {data.scores.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-white">
            This week's scoreboard
          </h2>
          <div className="flex flex-wrap gap-3">
            {data.scores.map((s) => {
              const m = memberById.get(s.memberId);
              if (!m) return null;
              return (
                <div
                  key={s.memberId}
                  className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <MemberAvatar member={m} size={28} />
                  <div className="leading-tight">
                    <div className="text-sm font-medium text-slate-100">
                      {m.nickname || m.name.split(" ")[0]}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {s.done} done · {s.points} pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.chores.length === 0 ? (
        <EmptyState
          icon="🧹"
          title="No chores yet"
          description="Add a chore, assign it to someone, and let it repeat itself."
          action={
            <Button onClick={openCreate}>
              <PlusIcon /> New chore
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {label} · {list.length}
                </h2>
                <div className="space-y-2">
                  {list.map((ch) => (
                    <ChoreRow
                      key={ch.id}
                      chore={ch}
                      member={ch.assignedTo ? memberById.get(ch.assignedTo) : undefined}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit chore" : "New chore"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Chore">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Take out the bins"
              required
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Who">
              <Select
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              >
                <option value="">Anyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname || m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Repeats">
              <Select
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value })}
              >
                {CHORE_CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {CHORE_CADENCE_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Next due">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Points" hint="Towards the weekly scoreboard.">
              <Input
                type="number"
                min={0}
                max={1000}
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Green bin on Tuesdays"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <input
              type="checkbox"
              checked={form.rotate}
              onChange={(e) => setForm({ ...form, rotate: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-transparent text-brand-500"
            />
            <span className="text-sm text-slate-200">
              Rotate to the next person after each time it's done
            </span>
          </label>

          <ErrorBanner message={error} />

          <div className="flex items-center justify-between gap-2 pt-1">
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${editing.title}"?`)) {
                    remove.mutate(editing.id, {
                      onSuccess: () => setModalOpen(false),
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-red-300 hover:underline"
              >
                <TrashIcon size={14} /> Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editing ? "Save" : "Add chore"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
