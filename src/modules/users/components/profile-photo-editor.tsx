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
    <span className="field-label">{t("usersPhoto")}</span>
    <label htmlFor={id} className="users-photo-dropzone" data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault(); setDragging(false);
        const file = event.dataTransfer.files[0];
        if (!disabled && file) onChoose(file);
      }}>
      <input ref={input} id={id} className="users-file-input" type="file" disabled={disabled}
        accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(file);
          event.target.value = "";
        }} />
      <span className="users-upload-avatar">
        {source ? <img src={source} alt={t("usersPhoto")} /> : <UserRound size={34} aria-hidden="true" />}
        <span className="users-camera-mark"><Camera size={13} aria-hidden="true" /></span>
      </span>
      <span className="users-upload-copy"><strong><UploadCloud size={17} aria-hidden="true" />{t("usersDropPhoto")}</strong>
        <span>{t("usersPhotoHint")}</span><span className="users-upload-browse">{t("usersChoosePhoto")}</span>
      </span>
    </label>
    {source && <Button variant="ghost" size="small" disabled={disabled} onClick={() => {
      if (input.current) input.current.value = "";
      onRemove();
    }}>{t("usersRemovePhoto")}</Button>}
  </div>;
}
