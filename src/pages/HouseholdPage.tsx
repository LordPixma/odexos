import { useState, type FormEvent } from "react";
import {
  useAddListItem,
  useClearDone,
  useCreateList,
  useCreateMeal,
  useDeleteList,
  useDeleteListItem,
  useDeleteMeal,
  useLists,
  useMeals,
  useMembers,
  useRenameList,
  useUpdateListItem,
  useUpdateMeal,
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
} from "../components/ui";
import {
  ClipboardIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { ApiError } from "../lib/api";
import {
  LIST_TYPE_LABELS,
  LIST_TYPES,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  type ListWithItems,
  type Meal,
  type MealSlot,
} from "@shared/types";

// ---- date helpers (local) ----
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(d: Date) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return toDateStr(x);
}
function addDays(dateStr: string, n: number) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const x = new Date(y, m - 1, dd);
  x.setDate(x.getDate() + n);
  return toDateStr(x);
}
function parseDate(dateStr: string) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, dd);
}
const DOW = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAYMON = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

// =====================================================================
// Lists
// =====================================================================
function ListCard({
  list,
  members,
}: {
  list: ListWithItems;
  members: { id: string; name: string; color: string }[];
}) {
  const addItem = useAddListItem();
  const updateItem = useUpdateListItem();
  const deleteItem = useDeleteListItem();
  const clearDone = useClearDone();
  const renameList = useRenameList();
  const deleteList = useDeleteList();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const doneCount = list.items.filter((i) => i.done).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    addItem.mutate(
      { listId: list.id, text: text.trim(), assignedTo: assignee || null },
      { onSuccess: () => setText("") },
    );
  }

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{list.name}</span>
          <span className="chip bg-white/[0.06] text-slate-400">
            {LIST_TYPE_LABELS[list.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const name = prompt("Rename list", list.name);
              if (name && name.trim()) renameList.mutate({ id: list.id, name: name.trim() });
            }}
            className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
            aria-label="Rename"
          >
            <EditIcon />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${list.name}"?`)) deleteList.mutate(list.id);
            }}
            className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
            aria-label="Delete list"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1">
        {list.items.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Nothing here yet.</p>
        ) : (
          list.items.map((item) => {
            const owner = item.assignedTo ? memberById.get(item.assignedTo) : undefined;
            return (
              <div key={item.id} className="group flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() =>
                    updateItem.mutate({ id: item.id, done: !item.done })
                  }
                  className="h-4 w-4 shrink-0 rounded border-white/10 text-brand-300 focus:ring-brand-500"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    item.done ? "text-slate-500 line-through" : "text-slate-200"
                  }`}
                >
                  {item.text}
                </span>
                {owner && <Avatar name={owner.name} color={owner.color} size={20} />}
                <button
                  onClick={() => deleteItem.mutate(item.id)}
                  className="rounded p-1 text-slate-300 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  aria-label="Delete item"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an item…"
        />
        {members.length > 0 && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-sm text-slate-300"
            aria-label="Assign to"
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="secondary" disabled={addItem.isPending}>
          <PlusIcon />
        </Button>
      </form>

      {doneCount > 0 && (
        <button
          onClick={() => clearDone.mutate(list.id)}
          className="mt-2 self-start text-xs font-medium text-slate-500 hover:text-slate-300"
        >
          Clear {doneCount} done
        </button>
      )}
    </Card>
  );
}

function ListsView() {
  const { data: lists, isLoading } = useLists();
  const { data: members = [] } = useMembers();
  const createList = useCreateList();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "shopping" });

  function submit(e: FormEvent) {
    e.preventDefault();
    createList.mutate(
      { name: form.name, type: form.type },
      {
        onSuccess: () => {
          setForm({ name: "", type: "shopping" });
          setModalOpen(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <PlusIcon /> New list
        </Button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (lists ?? []).length === 0 ? (
        <EmptyState
          icon="🧺"
          title="No lists yet"
          description="Create a shopping list, a to-do list or a chore list the whole family shares."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <PlusIcon /> New list
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(lists ?? []).map((l) => (
            <ListCard key={l.id} list={l} members={members} />
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New list">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Weekly shop"
              required
              autoFocus
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {LIST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LIST_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <ErrorBanner message={(createList.error as ApiError | null)?.message} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createList.isPending}>
              Create list
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =====================================================================
// Meals
// =====================================================================
interface MealForm {
  id: string | null;
  date: string;
  slot: string;
  title: string;
  notes: string;
}

function MealsView() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const { data, isLoading } = useMeals(weekStart);
  const createMeal = useCreateMeal();
  const updateMeal = useUpdateMeal();
  const deleteMeal = useDeleteMeal();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MealForm>({
    id: null,
    date: weekStart,
    slot: "dinner",
    title: "",
    notes: "",
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const meals = data?.meals ?? [];
  const byDay = new Map<string, Meal[]>();
  for (const m of meals) {
    const arr = byDay.get(m.date) ?? [];
    arr.push(m);
    byDay.set(m.date, arr);
  }
  const slotOrder: Record<MealSlot, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
    snack: 3,
  };
  const today = toDateStr(new Date());

  function openCreate(date: string) {
    setForm({ id: null, date, slot: "dinner", title: "", notes: "" });
    createMeal.reset();
    updateMeal.reset();
    setModalOpen(true);
  }
  function openEdit(m: Meal) {
    setForm({ id: m.id, date: m.date, slot: m.slot, title: m.title, notes: m.notes ?? "" });
    createMeal.reset();
    updateMeal.reset();
    setModalOpen(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      date: form.date,
      slot: form.slot,
      title: form.title,
      notes: form.notes || null,
    };
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (form.id) updateMeal.mutate({ id: form.id, ...body }, onDone);
    else createMeal.mutate(body, onDone);
  }

  const rangeLabel = `${DAYMON.format(parseDate(weekStart))} – ${DAYMON.format(
    parseDate(addDays(weekStart, 6)),
  )}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ←
          </Button>
          <span className="text-sm font-semibold text-slate-200">{rangeLabel}</span>
          <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            →
          </Button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="ml-1 text-sm font-medium text-brand-300 hover:underline"
          >
            This week
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map((date) => {
            const dayMeals = (byDay.get(date) ?? []).sort(
              (a, b) => slotOrder[a.slot] - slotOrder[b.slot],
            );
            const isToday = date === today;
            return (
              <Card
                key={date}
                className={`flex min-h-[8rem] flex-col p-3 ${
                  isToday ? "ring-2 ring-brand-200" : ""
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {DOW.format(parseDate(date))}
                  </span>
                  <span
                    className={`text-sm font-bold ${isToday ? "text-brand-300" : "text-slate-200"}`}
                  >
                    {parseDate(date).getDate()}
                  </span>
                </div>
                <div className="flex-1 space-y-1.5">
                  {dayMeals.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openEdit(m)}
                      className="group block w-full rounded-md bg-white/[0.04] px-2 py-1 text-left hover:bg-white/10"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {MEAL_SLOT_LABELS[m.slot]}
                      </div>
                      <div className="truncate text-sm text-slate-100">{m.title}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => openCreate(date)}
                  className="mt-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-white/10 py-1 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-300"
                >
                  <PlusIcon size={14} /> Add
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Edit meal" : "Plan a meal"}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Slot">
              <Select
                value={form.slot}
                onChange={(e) => setForm({ ...form, slot: e.target.value })}
              >
                {MEAL_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {MEAL_SLOT_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Meal">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Spaghetti bolognese"
              required
              autoFocus
            />
          </Field>
          <Field label="Notes (optional)">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Double batch — freeze half"
            />
          </Field>
          <ErrorBanner
            message={
              (createMeal.error as ApiError | null)?.message ??
              (updateMeal.error as ApiError | null)?.message
            }
          />
          <div className="flex items-center justify-between gap-2">
            {form.id ? (
              <button
                type="button"
                onClick={() => {
                  if (form.id && confirm("Delete this meal?")) {
                    deleteMeal.mutate(form.id, {
                      onSuccess: () => setModalOpen(false),
                    });
                  }
                }}
                className="text-sm font-medium text-red-300 hover:underline"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMeal.isPending || updateMeal.isPending}>
                {form.id ? "Save" : "Add meal"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// =====================================================================
export default function HouseholdPage() {
  const [tab, setTab] = useState<"lists" | "meals">("lists");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardIcon />}
        tint="#7c5cf5"
        title="Household"
        subtitle="Shared lists and the week's meal plan."
      />

      <div className="inline-flex rounded-lg bg-white/[0.06] p-1 text-sm font-medium">
        {(["lists", "meals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 capitalize transition ${
              tab === t ? "bg-white/10 text-white shadow-sm" : "text-slate-400"
            }`}
          >
            {t === "lists" ? "Lists" : "Meal plan"}
          </button>
        ))}
      </div>

      {tab === "lists" ? <ListsView /> : <MealsView />}
    </div>
  );
}
