// Small building blocks shared across the interface.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useNotice } from "../notice";
import type { Track } from "../music/types";

const defaultArt = `${import.meta.env.BASE_URL}night-cover.webp`;

export function IconButton({
  label,
  children,
  onClick,
  active,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Cover({
  track,
  className = "",
}: {
  track?: Track;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!track?.cover) {
      setUrl(undefined);
      return;
    }
    const object = URL.createObjectURL(track.cover);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [track?.cover]);
  return (
    <img
      className={`cover ${className}`}
      src={url || defaultArt}
      alt={track ? `${track.title} 封面` : "原创夜色插画：戴着耳机的城市夜行人"}
    />
  );
}

// A modal <dialog>. The page toast sits beneath the top layer, so messages
// raised while a dialog is open show inside it.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const notice = useNotice((s) => s.message);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <section>
        <header>
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
        {notice && (
          <p className="modal-notice" aria-live="polite">
            {notice}
          </p>
        )}
      </section>
    </dialog>
  );
}
