export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageKind = 'text';

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  status: MessageStatus;
  kind: MessageKind;
  deliveredAt?: string | null;
  readAt?: string | null;
  reactions?: MessageReaction[];
}
