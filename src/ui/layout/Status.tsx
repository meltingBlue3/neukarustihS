import { useEffect } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useMusic } from "../../music/store";
import { notify, useNotice } from "../../notice";
import { IconButton } from "../common";

export function Toast() {
  const message = useNotice((s) => s.message);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => notify(""), 6500);
    return () => clearTimeout(id);
  }, [message]);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <IconButton label="关闭提示" onClick={() => notify("")}>
        <X size={17} />
      </IconButton>
    </div>
  );
}

export function ImportStatus() {
  const importing = useMusic((s) => s.importing);
  if (!importing) return null;
  return (
    <div className="import-status" role="status">
      <LoaderCircle size={16} className="spin" />
      {importing}
    </div>
  );
}
