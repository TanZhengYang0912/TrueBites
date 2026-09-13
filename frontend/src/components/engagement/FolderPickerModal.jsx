import { useState } from "react";
import { X, FolderPlus } from "lucide-react";
import { FOLDER_NAME_MAX_LENGTH, FOLDER_NAME_ILLEGAL_CHARS_MESSAGE, sanitizeFolderNameInput } from "../../lib/folderName";

export default function FolderPickerModal({ vendorName, folders, onClose, onSave, onCreateFolder }) {
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(null); // folder id currently saving, or "new"
  const [error, setError] = useState("");

  const customFolders = folders.filter((f) => !f.is_default);

  const handleNameChange = (e) => {
    const { value, hadIllegalChars } = sanitizeFolderNameInput(e.target.value);
    setNewFolderName(value);
    setError(hadIllegalChars ? FOLDER_NAME_ILLEGAL_CHARS_MESSAGE : "");
  };

  const handleSave = async (folderId) => {
    setSaving(folderId || "default");
    setError("");
    try {
      await onSave(folderId);
    } catch (e) {
      setError(e.message);
      setSaving(null);
    }
  };

  const handleCreate = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setError("Folder name is required.");
      return;
    }
    const exists = folders.some((f) => f.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError("A folder with this name already exists.");
      return;
    }
    setSaving("new");
    setError("");
    try {
      await onCreateFolder(name);
    } catch (e) {
      setError(e.message);
      setSaving(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-dvh w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-h-[88dvh] sm:max-w-[340px] sm:rounded-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="m-0 font-display text-[17px] text-forest">Save to folder</h3>
          <button onClick={onClose} aria-label="Close" className="grid size-11 place-items-center text-muted">
            <X size={18} />
          </button>
        </div>
        {vendorName && <div className="mb-3 break-words text-[12.5px] text-muted">{vendorName}</div>}

        <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
          <button
            onClick={() => handleSave(null)}
            disabled={saving !== null}
            className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-sand bg-chalk px-3 text-left text-[13.5px] font-semibold text-forest disabled:opacity-60"
          >
            <span>Save without folder</span>
            {saving === "default" && <span className="text-[11.5px] font-normal text-muted">Saving…</span>}
          </button>
          {customFolders.map((f) => (
            <button
              key={f.id}
              onClick={() => handleSave(f.id)}
              disabled={saving !== null}
              className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-sand bg-white px-3 text-left text-[13.5px] text-forest disabled:opacity-60"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              {saving === f.id && <span className="shrink-0 text-[11.5px] text-muted">Saving…</span>}
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-sand pt-3">
          {creating ? (
            <div className="flex min-w-0 gap-1.5">
              <input
                autoFocus
                value={newFolderName}
                onChange={handleNameChange}
                placeholder="Folder name"
                maxLength={FOLDER_NAME_MAX_LENGTH}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-sand px-3 text-[13.5px] outline-none focus:border-forest"
              />
              <button
                onClick={handleCreate}
                disabled={saving !== null}
                className="min-h-11 shrink-0 rounded-lg bg-forest px-4 text-[13px] text-white disabled:opacity-60"
              >
                {saving === "new" ? "…" : "Create"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-terracotta"
            >
              <FolderPlus size={15} /> New folder
            </button>
          )}
        </div>

        {error && <div className="mt-2.5 text-[12.5px] text-[#c0392b]">{error}</div>}
      </div>
    </div>
  );
}
