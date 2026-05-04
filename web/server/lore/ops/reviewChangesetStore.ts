import fs from 'fs/promises';
import path from 'path';
import { REVIEW_CHANGESET_PATH } from '../core/storagePaths';
import type { ChangesetData } from './reviewRowHelpers';

export async function getChangesetPath(): Promise<string> {
  return REVIEW_CHANGESET_PATH;
}

export async function loadChangeset(): Promise<ChangesetData> {
  try {
    const raw = await fs.readFile(await getChangesetPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.rows ? parsed : { rows: {} };
  } catch {
    return { rows: {} };
  }
}

export async function saveChangeset(data: ChangesetData): Promise<void> {
  const changesetPath = await getChangesetPath();
  await fs.mkdir(path.dirname(changesetPath), { recursive: true });
  await fs.writeFile(changesetPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function removeChangesetFile(): Promise<void> {
  try {
    await fs.unlink(await getChangesetPath());
  } catch {}
}
