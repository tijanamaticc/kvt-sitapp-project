export type ConversationKind = 'direct' | 'group';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  memberIds: string[];
  avatarSeed: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  unreadCount: number;
  lastMessageId: string | null;
  lastActivityAt?: string | null;
}
