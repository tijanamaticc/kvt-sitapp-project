export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageKind = 'text';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  status: MessageStatus;
  kind: MessageKind;
}
