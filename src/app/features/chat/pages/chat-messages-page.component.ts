import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild, ElementRef, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStoreService } from '../../../core/services/chat-store.service';

@Component({
  selector: 'app-chat-messages-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chat-messages-page.component.html',
  styleUrls: ['./chat-messages-page.component.css']
})
export class ChatMessagesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly chat = inject(ChatStoreService);
  readonly currentUser = this.auth.currentUser;
  readonly emojiPalette = ['👍', '❤️', '😂', '👏'];

  readonly conversationSearchForm = this.fb.nonNullable.group({
    query: ['']
  });

  readonly messageForm = this.fb.nonNullable.group({
    text: ['', Validators.required]
  });

  @ViewChild('messageList', { static: false }) private messageListRef?: ElementRef<HTMLElement>;
  @ViewChild('composerInput', { static: false }) private composerInputRef?: ElementRef<HTMLTextAreaElement>;

  constructor() {
    this.chat.initialize(this.auth.users());
    // Auto-scroll whenever filtered messages change
    effect(() => {
      // access the signal so the effect depends on it
      const msgs = this.chat.filteredMessages();
      // schedule scroll after DOM updates
      setTimeout(() => this.scrollToBottom(), 50);
      return msgs;
    });
  }

  selectConversation(conversationId: string): void {
    this.chat.setActiveConversation(conversationId);
  }

  sendMessage(): void {
    if (this.messageForm.invalid) {
      return;
    }

    const text = this.messageForm.value.text ?? '';
    this.chat.sendMessage(text);
    this.messageForm.reset({ text: '' });
    const composer = this.composerInputRef?.nativeElement;
    if (composer) {
      composer.style.height = '36px';
    }
    // ensure composer reset and scroll
    setTimeout(() => this.scrollToBottom(), 50);
  }

  reactToMessage(messageId: string, emoji: string): void {
    const currentUserId = this.currentUser()?.id;
    const message = this.chat.messages().find((item) => item.id === messageId);
    if (!message || !currentUserId || message.senderId === currentUserId) {
      return;
    }

    this.chat.reactToMessage(messageId, emoji);
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.sendMessage();
  }

  onComposerInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
  }

  setConversationSearch(value: string): void {
    this.chat.setConversationSearch(value);
  }

  setMessageSearch(value: string): void {
    this.chat.setMessageSearch(value);
  }

  getConversationTitle(conversationId: string): string {
    const conversation = this.chat.conversations().find((item) => item.id === conversationId);
    if (!conversation) {
      return 'Razgovor';
    }

    if (conversation.kind === 'direct') {
      return this.chat.getConversationPartner(conversation)?.profile.displayName || conversation.title || 'Razgovor';
    }

    return conversation.title || 'Razgovor';
  }

  getConversationSubtitle(conversationId: string): string {
    const conversation = this.chat.conversations().find((item) => item.id === conversationId);
    if (!conversation) {
      return '';
    }

    if (conversation.kind === 'direct') {
      return this.chat.getConversationPartner(conversation)?.profile.status || 'Direktan razgovor';
    }

    return conversation.description || (conversation.kind === 'group' ? `${conversation.memberIds.length} članova` : 'Direktan razgovor');
  }

  getConversationLastMessage(conversationId: string): string {
    const messages = this.chat.messages().filter((message) => message.conversationId === conversationId);
    return messages.length > 0 ? messages[messages.length - 1].text : 'Nema poruka';
  }

  getConversationTime(conversationId: string): string {
    const conversation = this.chat.conversations().find((item) => item.id === conversationId);
    const timestamp = conversation?.lastActivityAt || conversation?.updatedAt || conversation?.createdAt;
    return timestamp ? new Date(timestamp).toLocaleString() : '';
  }

  getConversationAvatar(conversationId: string): string {
    const conversation = this.chat.conversations().find((item) => item.id === conversationId);
    const partner = conversation && conversation.kind === 'direct' ? this.chat.getConversationPartner(conversation) : null;
    const avatar = partner?.profile.avatarUrl;
    if (avatar && avatar.startsWith('/uploads/')) {
      return `${AuthService.SERVER_ORIGIN}${avatar}`;
    }

    return avatar || 'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23e7f8ef%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2238%22 r%3D%2230%22 fill%3D%22%2325d366%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2262%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';
  }

  getMessageStatus(messageId: string): string {
    const message = this.chat.messages().find((item) => item.id === messageId);
    return message ? this.chat.getMessageStatusIcon(message, this.currentUser()?.id) : '•';
  }

  getReactionSummary(messageId: string): Array<{ emoji: string; count: number }> {
    const message = this.chat.messages().find((item) => item.id === messageId);
    return message ? this.chat.getReactionSummary(message) : [];
  }

  formatAudioDuration(seconds?: number): string {
    if (!seconds) {
      return '0:00';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private scrollToBottom(): void {
    try {
      const el = this.messageListRef?.nativeElement;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      // ignore
    }
  }
}
