"use client";

import { useId, useRef, useState } from "react";
import { Camera, UploadCloud, UserRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

export function ProfilePhotoEditor({ source, disabled, onChoose, onRemove }: {
  source: string | null; disabled: boolean; onChoose: (file: File) => void; onRemove: () => void;
}) {
  const { t } = useLanguage();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return <div className="users-photo-editor">
    <span className={"field-label block text-[length:12px] font-semibold mb-[8px]"}>{t("usersPhoto")}</span>
    <label htmlFor={id} className={"users-photo-dropzone relative flex items-center gap-[22px] p-[20px] [border:1px_dashed_var(--input)] rounded-[var(--radius)] bg-[var(--background)] cursor-pointer [transition:border-color_.15s,_background_.15s] [&:hover]:[border-color:var(--primary)] [&:hover]:bg-[var(--primary-soft)] [&[data-dragging='true']]:[border-color:var(--primary)] [&[data-dragging='true']]:bg-[var(--primary-soft)] [&:focus-within]:[outline:2px_solid_var(--ring)] [&:focus-within]:[outline-offset:3px] [&[data-disabled='true']]:cursor-wait [&[data-disabled='true']]:opacity-[.6] max-[600px]:gap-[14px] max-[600px]:p-[15px]"} data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault(); setDragging(false);
        const file = event.dataTransfer.files[0];
        if (!disabled && file) onChoose(file);
      }}>
      <input ref={input} id={id} className={"users-file-input absolute w-[1px] h-[1px] overflow-hidden [clip-path:inset(50%)]"} type="file" disabled={disabled}
        accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(file);
          event.target.value = "";
        }} />
      <span className={"users-upload-avatar relative flex items-center justify-center w-[80px] h-[80px] shrink-0 rounded-[50%] bg-[var(--accent)] text-[color:var(--primary)] [&_>_img]:w-full [&_>_img]:h-full [&_>_img]:rounded-[inherit] [&_>_img]:object-cover"}>
        {source ? <img src={source} alt={t("usersPhoto")} /> : <UserRound size={34} aria-hidden="true" />}
        <span className={"users-camera-mark absolute bottom-[-1px] end-[-1px] flex items-center justify-center w-[25px] h-[25px] [border:2px_solid_var(--card)] rounded-[50%] bg-[var(--primary)] text-[color:var(--primary-foreground)]"}><Camera size={13} aria-hidden="true" /></span>
      </span>
      <span className={"users-upload-copy flex flex-col gap-[7px] [&_strong]:flex [&_strong]:items-center [&_strong]:gap-[8px] [&_strong]:text-[length:12px] [&_>_span]:text-[length:10px] [&_>_span]:text-[color:var(--muted-foreground)] [&_>_span]:leading-[1.7] [&_.users-upload-browse]:text-[color:var(--primary)] [&_.users-upload-browse]:font-semibold"}><strong><UploadCloud size={17} aria-hidden="true" />{t("usersDropPhoto")}</strong>
        <span>{t("usersPhotoHint")}</span><span className="users-upload-browse">{t("usersChoosePhoto")}</span>
      </span>
    </label>
    {source && <Button variant="ghost" size="small" disabled={disabled} onClick={() => {
      if (input.current) input.current.value = "";
      onRemove();
    }}>{t("usersRemovePhoto")}</Button>}
  </div>;
}
