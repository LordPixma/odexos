import { useRef, useState, type ChangeEvent } from "react";
import { Button, MemberAvatar, Spinner } from "./ui";
import { useRemoveAvatar, useUploadAvatar } from "../lib/queries";
import { ApiError } from "../lib/api";
import type { Member } from "@shared/types";

/** Photos are centre-cropped and downscaled to this square before upload. */
const SIZE = 256;

/** Centre-crop to a square, downscale, and compress — keeps uploads tiny. */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();

  const webp = canvas.toDataURL("image/webp", 0.85);
  // Safari < 14 and friends fall back to JPEG.
  return webp.startsWith("data:image/webp")
    ? webp
    : canvas.toDataURL("image/jpeg", 0.85);
}

export default function AvatarPicker({
  member,
  size = 96,
}: {
  member: Member;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [error, setError] = useState<string | undefined>();
  const busy = upload.isPending || remove.isPending;
  const hasPhoto = member.avatarVersion > 0;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;
    setError(undefined);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await toSquareDataUrl(file);
      upload.mutate(
        { id: member.id, dataUrl },
        { onError: (err) => setError((err as ApiError).message) },
      );
    } catch {
      setError("Couldn't read that image — try a different one.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative">
        <MemberAvatar member={member} size={size} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
            <Spinner className="h-5 w-5" />
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {hasPhoto ? "Change photo" : "Upload photo"}
          </Button>
          {hasPhoto && (
            <Button
              type="button"
              variant="danger"
              onClick={() => remove.mutate(member.id)}
              disabled={busy}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Centre-cropped to a {SIZE}px square. JPG, PNG or WebP.
        </p>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
