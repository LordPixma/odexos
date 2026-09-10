import { useState, type FormEvent } from "react";
import {
  useCreateMember,
  useDeleteMember,
  useMembers,
  useUpdateMember,
} from "../lib/queries";
import { useAuth } from "../lib/auth";
import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageLoader,
  Select,
} from "../components/ui";
import { EditIcon, PlusIcon, TrashIcon } from "../components/icons";
import { ApiError } from "../lib/api";
import type { Member, Role } from "@shared/types";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  adult: "Adult",
  child: "Child",
  member: "Member",
};

const SWATCHES = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

interface FormState {
  name: string;
  email: string;
  password: string;
  role: Role;
  color: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    email: "",
    password: "",
    role: "adult",
    color: SWATCHES[0],
  };
}

export default function MembersPage() {
  const { auth } = useAuth();
  const { data: members, isLoading } = useMembers();
  const canManage = auth?.member.role === "owner" || auth?.member.role === "adult";
  const isOwner = auth?.member.role === "owner";

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const create = useCreateMember();
  const update = useUpdateMember();
  const remove = useDeleteMember();
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
  function openEdit(m: Member) {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email,
      password: "",
      role: m.role,
      color: m.color,
    });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (editing) {
      update.mutate(
        { id: editing.id, name: form.name, color: form.color, role: form.role },
        onDone,
      );
    } else {
      create.mutate(
        {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          color: form.color,
        },
        onDone,
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Family
          </h1>
          <p className="text-sm text-slate-500">
            Everyone who can sign in to {auth?.family.name || "your family portal"}.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <PlusIcon /> Add member
          </Button>
        )}
      </div>

      {isLoading || !members ? (
        <PageLoader />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => {
            const isSelf = m.id === auth?.member.id;
            const canEdit = canManage || isSelf;
            return (
              <Card key={m.id} className="flex items-center gap-4 p-5">
                <Avatar name={m.name} color={m.color} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">
                      {m.name}
                    </span>
                    {isSelf && (
                      <span className="chip bg-slate-100 text-slate-500">You</span>
                    )}
                  </div>
                  <div className="truncate text-sm text-slate-500">{m.email}</div>
                  <span
                    className="chip mt-1"
                    style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                  >
                    {ROLE_LABELS[m.role]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <button
                      onClick={() => openEdit(m)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {isOwner && !isSelf && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from the family?`))
                          remove.mutate(m.id);
                      }}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit member" : "Add family member"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jane"
              required
            />
          </Field>
          {!editing && (
            <>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@example.com"
                  required
                />
              </Field>
              <Field label="Temporary password" hint="At least 8 characters — they can change it later.">
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  required
                />
              </Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                disabled={editing ? !isOwner : false}
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </Select>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2 pt-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition ${
                      form.color === c ? "ring-slate-400" : "ring-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>

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
              {editing ? "Save changes" : "Add member"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
