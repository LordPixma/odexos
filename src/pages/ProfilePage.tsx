import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useUpdateMember } from "../lib/queries";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  PageLoader,
  SectionHead,
  Select,
} from "../components/ui";
import { BellIcon, UsersIcon } from "../components/icons";
import AvatarPicker from "../components/AvatarPicker";
import { ApiError } from "../lib/api";
import { ROLE_LABELS } from "../lib/labels";
import DeviceCard from "../components/DeviceCard";
import { MEMBER_COLORS } from "@shared/types";


const PRONOUN_OPTIONS = ["", "she/her", "he/him", "they/them"];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-400">{hint}</span>}
      </span>
      <span
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function ProfilePage() {
  const { auth } = useAuth();
  const update = useUpdateMember();
  const me = auth?.member;

  const [form, setForm] = useState({
    name: "",
    nickname: "",
    pronouns: "",
    birthday: "",
    color: MEMBER_COLORS[0],
    notifyBudgetAlerts: true,
    notifyWeeklyDigest: true,
  });
  const [saved, setSaved] = useState(false);

  // Seed the form once the member loads (and whenever they change elsewhere).
  useEffect(() => {
    if (!me) return;
    setForm({
      name: me.name,
      nickname: me.nickname ?? "",
      pronouns: me.pronouns ?? "",
      birthday: me.birthday ?? "",
      color: me.color,
      notifyBudgetAlerts: me.notifyBudgetAlerts,
      notifyWeeklyDigest: me.notifyWeeklyDigest,
    });
  }, [me?.id, me?.avatarVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <PageLoader />;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    update.mutate(
      {
        id: me!.id,
        name: form.name,
        nickname: form.nickname || null,
        pronouns: form.pronouns || null,
        birthday: form.birthday || null,
        color: form.color,
        notifyBudgetAlerts: form.notifyBudgetAlerts,
        notifyWeeklyDigest: form.notifyWeeklyDigest,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<UsersIcon />}
        tint="#0f8a5f"
        title="My profile"
        subtitle="How you appear to the rest of the family, and what you get notified about."
      />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionHead
              icon={<UsersIcon size={18} />}
              tint="#2f74e0"
              title="Profile"
              subtitle="Photo, name and how you're referred to"
            />
            <div className="space-y-5">
              <AvatarPicker member={me} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field label="Nickname" hint="What the family actually calls you.">
                  <Input
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                    placeholder="Optional"
                    maxLength={60}
                  />
                </Field>
                <Field label="Pronouns">
                  <Select
                    value={form.pronouns}
                    onChange={(e) => setForm({ ...form, pronouns: e.target.value })}
                  >
                    {PRONOUN_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p || "Prefer not to say"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Birthday" hint="Powers birthday reminders.">
                  <Input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Your colour" hint="Used for your avatar and highlights.">
                <div className="flex flex-wrap gap-2 pt-1">
                  {MEMBER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-8 w-8 rounded-full transition ${
                        form.color === c
                          ? "ring-2 ring-white ring-offset-2 ring-offset-surface"
                          : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHead
              icon={<BellIcon size={18} />}
              tint="#d9841a"
              title="Notifications"
              subtitle="What lands in your inbox"
            />
            <div className="space-y-3">
              <Toggle
                label="Budget alerts"
                hint="Email me when a category goes over or close to its limit."
                checked={form.notifyBudgetAlerts}
                onChange={(v) => setForm({ ...form, notifyBudgetAlerts: v })}
              />
              <Toggle
                label="Weekly family digest"
                hint="Monday morning summary of the week ahead and last week's spend."
                checked={form.notifyWeeklyDigest}
                onChange={(v) => setForm({ ...form, notifyWeeklyDigest: v })}
              />
            </div>
          </Card>

          <DeviceCard />
        </div>

        {/* Account summary + save */}
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHead
              icon={<UsersIcon size={18} />}
              tint="#7c5cf5"
              title="Account"
            />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="truncate text-slate-200">{me.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt>
                <dd className="text-slate-200">{ROLE_LABELS[me.role]}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Family</dt>
                <dd className="truncate text-slate-200">{auth?.family.name}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <ErrorBanner message={(update.error as ApiError | null)?.message} />
            {saved && !update.isPending && (
              <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Profile saved.
              </div>
            )}
            <Button type="submit" className="w-full" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
