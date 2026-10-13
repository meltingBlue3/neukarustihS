import { notify } from "../../notice";
import { Modal } from "../common";
import { closeDialog } from "../state";

export function ConfirmDialog({
  title,
  message,
  onConfirm,
}: {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Modal title={title} onClose={closeDialog}>
      <p className="confirm-text">{message}</p>
      <div className="form-footer">
        <button className="secondary" onClick={closeDialog}>
          取消
        </button>
        <button
          className="primary danger-bg"
          onClick={async () => {
            try {
              await onConfirm();
            } catch {
              notify("移除失败，请重试");
            }
          }}
        >
          确认移除
        </button>
      </div>
    </Modal>
  );
}
