import React from 'react';
import { Button, DropdownMenu, PageTitle, TextButton } from '../../../components/ui';
import { MoreHorizontal, PanelLeftOpen } from 'lucide-react';
import PriorityBadge from './PriorityBadge';
import type { BrowseData, MemoryNode } from '../useMemoryBrowserController';

interface MemoryNodeHeaderProps {
  node: MemoryNode;
  data: BrowseData;
  domain: string;
  path: string;
  isRoot: boolean;
  editing: boolean;
  moving: boolean;
  creating: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  startEditing: () => void;
  setCreating: (value: boolean) => void;
  setMoving: (value: boolean) => void;
  handleRebuildViews: () => Promise<void>;
  rebuildingViews: boolean;
  handleDelete: () => Promise<void>;
  navigateTo: (newPath: string, newDomain?: string) => void;
  t: (key: string) => string;
}

export default function MemoryNodeHeader({
  node,
  data,
  domain,
  path,
  isRoot,
  editing,
  moving,
  creating,
  sidebarOpen,
  setSidebarOpen,
  startEditing,
  setCreating,
  setMoving,
  handleRebuildViews,
  rebuildingViews,
  handleDelete,
  navigateTo,
  t,
}: MemoryNodeHeaderProps): React.JSX.Element {
  const headerBreadcrumbs = data.breadcrumbs || [];
  const titleText = path ? path.split('/').pop() || t('root') : t('root');

  return (
    <PageTitle
      eyebrow={
        <nav className="flex items-center gap-1 flex-wrap">
          <TextButton tone="blue" onClick={() => navigateTo('', domain)}>
            {t('Memory')}
          </TextButton>
          {headerBreadcrumbs.slice(1, -1).map((crumb) => (
            <React.Fragment key={crumb.path || 'root'}>
              <span className="text-txt-quaternary">/</span>
              <TextButton tone="blue" onClick={() => navigateTo(crumb.path || '')} className="max-w-[12rem] truncate">
                {crumb.label}
              </TextButton>
            </React.Fragment>
          ))}
        </nav>
      }
      title={
        <span className="inline-flex max-w-full items-start gap-3 align-top">
          <span className="block min-w-0 truncate">{titleText}</span>
          {!editing && node.priority != null && (
            <span className="mt-1 shrink-0"><PriorityBadge priority={node.priority} size="lg" /></span>
          )}
        </span>
      }
      titleText={titleText}
      truncateTitle={false}
      compact
      right={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!sidebarOpen && (
            <Button onClick={() => setSidebarOpen(true)}>
              <PanelLeftOpen size={14} /> {t('Tree')}
            </Button>
          )}
          {!editing && !moving && !creating && !node.is_virtual && (
            <>
              <Button onClick={startEditing}>
                {t('Edit')}
              </Button>
              <DropdownMenu
                items={[
                  { key: 'new', label: t('New'), onClick: () => setCreating(true) },
                  ...(!isRoot ? [{ key: 'move', label: t('Move'), onClick: () => setMoving(true) }] : []),
                  { key: 'rebuild', label: rebuildingViews ? t('Rebuilding…') : t('Rebuild'), disabled: rebuildingViews, onClick: () => void handleRebuildViews() },
                  ...(!isRoot ? [{ key: 'delete', label: t('Delete'), danger: true, onClick: () => void handleDelete() }] : []),
                ]}
              >
                <Button aria-label={t('More')}>
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenu>
            </>
          )}
        </div>
      }
    />
  );
}
