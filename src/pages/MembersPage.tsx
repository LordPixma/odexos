import { useState, type FormEvent } from "react";
import {
  useCreateMember,
  useDeleteMember,
  useMembers,
  useResendInvite,
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
  PageHeader,
  PageLoader,
  Select,
} from "../components/ui";
import { EditIcon, PlusIcon, TrashIcon, UsersIcon } from "../components/icons";
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

const PENDING_COLOR = "#e0930f";

interface FormState {
  name: string;
  email: string;
  role: Role;
  color: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    email: "",
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
  const [notice, setNotice] = useState<string | null>(null);

  const create = useCreateMember();
  const update = useUpdateMember();
  const remove = useDeleteMember();
  const resend = useResendInvite();
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
    setForm({ name: m.name, email: m.email, role: m.role, color: m.color });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function inviteNotice(name: string, emailSent: boolean, verb = "sent") {
    setNotice(
      emailSent
        ? `Invite ${verb} to ${name}. They'll get an email with a link to set their password.`
        : `${name}'s invite was created, but the email couldn't be sent right now. Use “Resend” to try again.`,
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (editing) {
      update.mutate(
        { id: editing.id, name: form.name, color: form.color, role: form.role },
        { onSuccess: () => setModalOpen(false) },
      );
    } else {
      create.mutate(
        { name: form.name, email: form.email, role: form.role, color: form.color },
        {
          onSuccess: (res) => {
            setModalOpen(false);
            inviteNotice(form.name, res.emailSent);
          },
        },
      );
    }
  }

  function doResend(m: Member) {
    setNotice(null);
    resend.mutate(m.id, {
      onSuccess: (res) => inviteNotice(m.name, res.emailSent, "resent"),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<UsersIcon />}
        tint="#0f8a5f"
        title="Family"
        subtitle={`Everyone who can sign in to ${auth?.family.name || "your family portal"}.`}
        action={
          canManage && (
            <Button onClick={openCreate}>
              <PlusIcon /> Invite member
            </Button>
          )
        }
      />

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-500/25 bg-brand-500/15 px-4 py-3 text-sm text-brand-200">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 text-brand-300 hover:text-brand-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading || !members ? (
        <PageLoader />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => {
            const isSelf = m.id === auth?.member.id;
            const isPending = m.status === "invited";
            const canEdit = canManage || isSelf;
            return (
              <Card key={m.id} className="flex items-center gap-4 p-5">
                <Avatar name={m.name} color={m.color} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-white">
                      {m.name}
                    </span>
                    {isSelf && (
                      <span className="chip bg-white/[0.06] text-slate-400">You</span>
                    )}
                  </div>
                  <div className="truncate text-sm text-slate-400">{m.email}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className="chip"
                      style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                    >
                      {ROLE_LABELS[m.role]}
                    </span>
                    {isPending && (
                      <span
                        className="chip"
                        style={{
                          backgroundColor: `${PENDING_COLOR}1a`,
                          color: PENDING_COLOR,
                        }}
                      >
                        Pending invite
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isPending && canManage && (
                    <button
                      onClick={() => doResend(m)}
                      disabled={resend.isPending}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/150/15 disabled:opacity-50"
                    >
                      Resend
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => openEdit(m)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
                      aria-label="Edit"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {isPending
                    ? canManage && (
                        <button
                          onClick={() => {
                            if (confirm(`Revoke the invite for ${m.name}?`))
                              remove.mutate(m.id);
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                          aria-label="Revoke invite"
                        >
                          <TrashIcon />
                        </button>
                      )
                    : isOwner &&
                      !isSelf && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${m.name} from the family?`))
                              remove.mutate(m.id);
                          }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
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
        title={editing ? "Edit member" : "Invite family member"}
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
            <Field
              label="Email"
              hint="We'll email them a link to set their own password and join."
            >
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
                required
              />
            </Field>
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
              {editing
                ? "Save changes"
                : create.isPending
                  ? "Sending…"
                  : "Send invite"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
