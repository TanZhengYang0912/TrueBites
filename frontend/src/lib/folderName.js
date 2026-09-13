// Folder names are validated the same way in every place a user can create
// one (the inline composer on Saved and the FolderPickerModal used from Map
// and Saved). Keeping the rules here avoids the two copies drifting apart.
export const FOLDER_NAME_MAX_LENGTH = 45;

const ILLEGAL_FOLDER_NAME_CHARS = /[\\/:*?"<>|]/g;

export const FOLDER_NAME_ILLEGAL_CHARS_MESSAGE = 'Folder name cannot contain \\ / : * ? " < > |';

// Strips disallowed characters and caps the length, reporting whether any
// disallowed character was present so the caller can surface an error.
export function sanitizeFolderNameInput(raw) {
  const hadIllegalChars = ILLEGAL_FOLDER_NAME_CHARS.test(raw);
  ILLEGAL_FOLDER_NAME_CHARS.lastIndex = 0;
  const value = raw.replace(ILLEGAL_FOLDER_NAME_CHARS, "").slice(0, FOLDER_NAME_MAX_LENGTH);
  return { value, hadIllegalChars };
}
