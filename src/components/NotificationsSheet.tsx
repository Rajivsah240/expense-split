import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import type { ActivityType, AppNotification } from '@shared/types';
import { formatRelative } from '../lib/format';
import { Button, EmptyState, Sheet } from './ui';

const ICON_FOR: Partial<Record<ActivityType, string>> = {
  'session.created': '🧾',
  'session.updated': '✏️',
  'session.deleted': '🗑️',
  'settlement.created': '✅',
  'settlement.deleted': '↩️',
  'member.joined': '👋',
  'member.added': '👋',
  'member.removed': '🚪',
  'member.left': '🚪',
  'group.renamed': '🏷️',
  'group.created': '🎉',
};

export function NotificationsSheet({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkRead: (ids?: string[]) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
      footer={
        notifications.length > 0 ? (
          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              block
              disabled={unreadCount === 0}
              onClick={() => void onMarkRead()}
              icon={<CheckCheck className="size-[17px]" />}
            >
              Mark all read
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void onClear()}
              className="!text-negative"
              icon={<Trash2 className="size-[17px]" />}
            >
              Clear
            </Button>
          </div>
        ) : undefined
      }
    >
      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-6" />}
          title="Nothing here yet"
          body="You'll be told when a flatmate adds an expense, edits one, or settles up."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map(notification => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => {
                  if (!notification.read) void onMarkRead([notification.id]);
                }}
                className={`flex w-full items-start gap-3 rounded-[14px] border p-3 text-left transition-colors ${
                  notification.read ? 'border-line bg-surface' : 'border-brand-line bg-brand-soft/50'
                }`}
              >
                <span className="mt-0.5 text-[17px]" aria-hidden>
                  {ICON_FOR[notification.type] ?? '🔔'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clip block text-[13.5px] font-bold leading-snug text-ink">
                    {notification.title}
                  </span>
                  {notification.body && (
                    <span className="clip mt-0.5 block text-[12.5px] leading-snug text-muted">
                      {notification.body}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] font-medium text-faint">
                    {notification.groupName} · {formatRelative(notification.createdAt)}
                  </span>
                </span>
                {!notification.read && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
