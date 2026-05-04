import path from 'node:path';

export const SNAPSHOT_DIR = '/app/snapshots';
export const BACKUP_DIR = path.join(SNAPSHOT_DIR, 'backups');
export const REVIEW_CHANGESET_PATH = path.join(SNAPSHOT_DIR, 'changeset.json');
