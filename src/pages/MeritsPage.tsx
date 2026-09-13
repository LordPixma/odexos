import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useDeleteMerit,
  useIssueMerit,
  useMembers,
  useMeritBoard,
} from "../lib/queries";
import { useAuth } from "../lib/auth";
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
} from "../components/ui";
import { StarIcon, TrashIcon } from "../components/icons";
import { ApiError } from "../lib/api";
import { formatMoney, relativeDay } from "../lib/format";
import { isParent, type Member, type Merit } from "@shared/types";

const UP = "#34d399";
const DOWN = "#fb7185";

export default function MeritsPage() {
  const { auth } = useAuth();
  const { data: board, isLoading, error } = useMeritBoard();
  const { data: members } = useMembers();
  const issue = useIssueMerit();
  const remove = useDeleteMerit();

  const [form, setForm] = useState<{ childId: string; value: 1 | -1 } | null>(null);
  const [note, setNote] = useState("");

  const parent = auth ? isParent(auth.member.role) : false;
  const byId = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m])),
    [members],
  );
  const children = useMemo(
    () => (members ?? []).filter((m) => m.role === "child"),
    [members],
  );

  function open(childId: string, value: 1 | -1) {
    setForm({ childId, value });
    setNote("");
    issue.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    issue.mutate(
      { childId: form.childId, value: form.value, note: note.trim() },
      { onSuccess: () => setForm(null) },
    );
  }

  if (isLoading) return <PageLoader />;
  if (!board) return <ErrorBanner message={(error as Error)?.message} />;

  const target = form ? byId.get(form.childId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<StarIcon className="text-white" />}
        tint="#e0930f"
        title="Merits"
        subtitle="How the week is going, and why."
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/merits/history"
              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10 transition hover:text-white"
            >
              History
            </Link>
            {parent && (
              <Link
                to="/parents"
                className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10 transition hover:text-white"
              >
                Parent Centre
              </Link>
            )}
          </div>
        }
      />

      <ErrorBanner message={(error as Error)?.message} />

      {children.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="No children yet"
          description="Merits are for family members with the Child role."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {board.tallies.map((t) => {
            const child = byId.get(t.childId);
            if (!child) return null;
            const worthCents = t.net * board.meritValueCents;
            const canOpen = parent || auth?.member.id === t.childId;
            return (
              <Card key={t.childId} className="p-5">
                <div className="flex items-center gap-3">
                  <MemberAvatar member={child} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-base font-bold text-white">
                      {child.nickname ?? child.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t.merits} up · {t.demerits} down
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="font-display text-3xl font-bold leading-none tabular-nums"
                      style={{ color: t.net >= 0 ? UP : DOWN }}
                    >
                      {t.net > 0 ? "+" : ""}
                      {t.net}
                    </div>
                    <div className="mt-1 text-xs tabular-nums text-slate-400">
                      {worthCents < 0 ? "−" : ""}
                      {formatMoney(Math.abs(worthCents), board.currency)}
                    </div>
                  </div>
                </div>

                {parent && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => open(t.childId, 1)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold transition"
                      style={{ background: `${UP}1f`, color: UP }}
                    >
                      + Merit
                    </button>
                    <button
                      type="button"
                      onClick={() => open(t.childId, -1)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold transition"
                      style={{ background: `${DOWN}1f`, color: DOWN }}
                    >
                      − Demerit
                    </button>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-center gap-3 text-xs font-semibold">
                  <Link
                    to={`/merits/history/${t.childId}`}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    History
                  </Link>
                  {canOpen && (
                    <>
                      <span className="text-slate-700">·</span>
                      <Link
                        to={`/allowance/${t.childId}`}
                        className="text-brand-400 hover:text-brand-300"
                      >
                        Allowance
                      </Link>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold text-white">
          Recent
        </h2>
        {board.recent.length === 0 ? (
          <EmptyState icon="📋" title="Nothing issued yet" />
        ) : (
          <ul className="space-y-2">
            {board.recent.map((m) => (
              <MeritRow
                key={m.id}
                merit={m}
                child={byId.get(m.childId)}
                canRemove={parent && m.weekStart === board.weekStart}
                onRemove={() => remove.mutate(m.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={
          form?.value === 1
            ? `Merit for ${target?.nickname ?? target?.name ?? ""}`
            : `Demerit for ${target?.nickname ?? target?.name ?? ""}`
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={(issue.error as ApiError | null)?.message} />
          <Field
            label="What's it for?"
            hint="Everyone sees this, so make it worth reading back."
          >
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                form?.value === 1
                  ? "Helped with the shopping without being asked"
                  : "Left the kitchen in a state after being asked twice"
              }
              required
              maxLength={200}
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={issue.isPending}>
              {issue.isPending
                ? "Saving…"
                : form?.value === 1
                  ? "Give merit"
                  : "Give demerit"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setForm(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MeritRow({
  merit,
  child,
  canRemove,
  onRemove,
}: {
  merit: Merit;
  child?: Member;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const up = merit.value > 0;
  return (
    <li className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
        style={{ background: `${up ? UP : DOWN}1f`, color: up ? UP : DOWN }}
      >
        {up ? "+1" : "−1"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm text-slate-100">{merit.note}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {child ? (child.nickname ?? child.name) : "Someone"} ·{" "}
          {relativeDay(merit.createdAt)}
        </div>
      </div>
      {child && <MemberAvatar member={child} size={24} />}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <TrashIcon size={14} />
        </button>
      )}
    </li>
  );
}
