export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageKind = 'text' | 'audio';

export interface AudioPayload {
  url: string;
  mimeType: string;
  durationSec: number;
}

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
  audio?: AudioPayload;
  deliveredAt?: string | null;
  readAt?: string | null;
  reactions?: MessageReaction[];
}
