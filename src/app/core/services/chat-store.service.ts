import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { Conversation } from '../models/conversation.model';
import { Message } from '../models/message.model';
import { User } from '../models/user.model';

const CONVERSATIONS_KEY = 'sitapp-conversations';
const MESSAGES_KEY = 'sitapp-messages';
const ACTIVE_CONVERSATION_KEY = 'sitapp-active-conversation';

@Injectable({ providedIn: 'root' })
export class ChatStoreService {
  private readonly auth = inject(AuthService);
  private readonly conversationsSignal = signal<Conversation[]>(this.readConversations());
  private readonly messagesSignal = signal<Message[]>(this.readMessages());
  private readonly activeConversationIdSignal = signal<string | null>(localStorage.getItem(ACTIVE_CONVERSATION_KEY));
  private readonly userSearchSignal = signal('');
  private readonly conversationSearchSignal = signal('');
  private readonly messageSearchSignal = signal('');
  private readonly activityFilterSignal = signal<'all' | 'today' | 'week' | 'month'>('all');
  private readonly avatarFilterSignal = signal<'all' | 'with-avatar' | 'without-avatar'>('all');

  readonly conversations = computed(() => this.sortConversations(this.conversationsSignal()));
  readonly messages = computed(() => this.messagesSignal());
  readonly activeConversationId = computed(() => this.activeConversationIdSignal());
  readonly search = computed(() => this.userSearchSignal());
  readonly userSearch = computed(() => this.userSearchSignal());
  readonly conversationSearch = computed(() => this.conversationSearchSignal());
  readonly messageSearch = computed(() => this.messageSearchSignal());
  readonly currentUser = computed(() => this.auth.currentUser());
  readonly activityFilter = computed(() => this.activityFilterSignal());
  readonly avatarFilter = computed(() => this.avatarFilterSignal());
  readonly activeConversation = computed(() => {
    const conversationId = this.activeConversationIdSignal();
    return this.conversationsSignal().find((conversation) => conversation.id === conversationId) ?? null;
  });
  readonly activeConversationMessages = computed(() => {
    const conversationId = this.activeConversationIdSignal();
    if (!conversationId) {
      return [];
    }

    return this.messagesSignal()
      .filter((message) => message.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  });
  readonly filteredMessages = computed(() => {
    const query = this.messageSearchSignal().trim().toLowerCase();
    if (!query) {
      return this.activeConversationMessages();
    }

    return this.activeConversationMessages().filter((message) => message.text.toLowerCase().includes(query));
  });
  readonly filteredConversations = computed(() => {
    const query = this.conversationSearchSignal().trim().toLowerCase();
    const activityFilter = this.activityFilterSignal();
    const currentUser = this.auth.currentUser();
    const me = currentUser ? this.getUserById(currentUser.id) : null;

    return this.sortConversations(
      this.conversationsSignal().filter((conversation) => {
        if (!currentUser || !conversation.memberIds.includes(currentUser.id)) {
          return false;
        }

        // Students should not see conversations with administrator in chat UI.
        if (me?.role !== 'admin') {
          const hasAdminMember = conversation.memberIds.some((memberId) => this.getUserById(memberId)?.role === 'admin');
          if (hasAdminMember) {
            return false;
          }
        }

        if (query && ![conversation.title, conversation.description].join(' ').toLowerCase().includes(query)) {
          return false;
        }

        const activity = conversation.lastActivityAt || conversation.updatedAt || conversation.createdAt;
        const activityTime = new Date(activity).getTime();
        const now = Date.now();
        if (activityFilter === 'today') {
          return activityTime >= now - 1000 * 60 * 60 * 24;
        }
        if (activityFilter === 'week') {
          return activityTime >= now - 1000 * 60 * 60 * 24 * 7;
        }
        if (activityFilter === 'month') {
          return activityTime >= now - 1000 * 60 * 60 * 24 * 30;
        }
        return true;
      })
    );
  });
  readonly filteredUsers = computed(() => {
    const query = this.userSearchSignal().trim().toLowerCase();
    const currentUser = this.auth.currentUser();
    const userList = this.auth.users().filter((user) => user.id !== currentUser?.id);

    return userList
      .filter((user) => (user.accountStatus || 'approved') === 'approved')
      .filter((user) => (user.accountStatus || 'approved') !== 'blocked')
      .filter((user) => user.role !== 'admin')
      .filter((user) => {
        if (!query) {
          return true;
        }

        return [user.username, user.email, user.phone, user.profile.displayName, user.profile.firstName, user.profile.lastName]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .filter((user) => {
        const activity = user.profile.lastActivityAt ? new Date(user.profile.lastActivityAt).getTime() : 0;
        const now = Date.now();
        if (this.activityFilterSignal() === 'today') {
          return activity >= now - 1000 * 60 * 60 * 24;
        }
        if (this.activityFilterSignal() === 'week') {
          return activity >= now - 1000 * 60 * 60 * 24 * 7;
        }
        if (this.activityFilterSignal() === 'month') {
          return activity >= now - 1000 * 60 * 60 * 24 * 30;
        }
        return true;
      })
      .filter((user) => {
        if (this.avatarFilterSignal() === 'with-avatar') {
          return !!user.profile.avatarUrl;
        }
        if (this.avatarFilterSignal() === 'without-avatar') {
          return !user.profile.avatarUrl;
        }
        return true;
      })
      .sort((left, right) => {
        const leftActivity = left.profile.lastActivityAt ? new Date(left.profile.lastActivityAt).getTime() : 0;
        const rightActivity = right.profile.lastActivityAt ? new Date(right.profile.lastActivityAt).getTime() : 0;
        if (rightActivity !== leftActivity) {
          return rightActivity - leftActivity;
        }

        return left.profile.displayName.localeCompare(right.profile.displayName);
      });
  });
  readonly recentSearchResults = computed(() => {
    const query = this.userSearchSignal().trim().toLowerCase();
    if (!query) {
      return [];
    }

    return this.filteredUsers().slice(0, 5);
  });

  constructor() {
    effect(() => {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(this.conversationsSignal()));
    });

    effect(() => {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(this.messagesSignal()));
    });

    effect(() => {
      const activeConversationId = this.activeConversationIdSignal();
      if (activeConversationId) {
        localStorage.setItem(ACTIVE_CONVERSATION_KEY, activeConversationId);
      } else {
        localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      }
    });
  }

  initialize(seedUsers: User[]): void {
    const currentUser = this.auth.currentUser();
    if (!currentUser) {
      return;
    }

    this.auth.bootstrap(seedUsers[0]);

    void this.auth.refreshUsersFromServer().then(() => {
      this.cleanupStateForCurrentUser();
    });

    if (this.activeConversationIdSignal() && !this.conversationsSignal().some((conversation) => conversation.id === this.activeConversationIdSignal())) {
      this.activeConversationIdSignal.set(null);
    }
  }

  setUserSearch(query: string): void {
    this.userSearchSignal.set(query);
  }

  setConversationSearch(query: string): void {
    this.conversationSearchSignal.set(query);
  }

  setMessageSearch(query: string): void {
    this.messageSearchSignal.set(query);
  }

  setActivityFilter(filter: 'all' | 'today' | 'week' | 'month'): void {
    this.activityFilterSignal.set(filter);
  }

  setAvatarFilter(filter: 'all' | 'with-avatar' | 'without-avatar'): void {
    this.avatarFilterSignal.set(filter);
  }

  setActiveConversation(conversationId: string): void {
    this.activeConversationIdSignal.set(conversationId);
    this.markConversationRead(conversationId);
  }

  clearActiveConversation(): void {
    this.activeConversationIdSignal.set(null);
    this.messageSearchSignal.set('');
  }

  startDirectConversation(partnerId: string): void {
    const currentUser = this.requireCurrentUser();
    if (partnerId === currentUser.id) {
      return;
    }

    const partner = this.requireUser(partnerId);
    if (currentUser.role !== 'admin' && partner.role === 'admin') {
      return;
    }

    let conversation = this.conversationsSignal().find((item) => {
      return item.kind === 'direct' && item.memberIds.includes(currentUser.id) && item.memberIds.includes(partnerId);
    });

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        kind: 'direct',
        title: partner.profile.displayName,
        memberIds: [currentUser.id, partner.id],
        avatarSeed: partner.profile.avatarSeed ?? partner.profile.displayName,
        description: partner.profile.status ?? '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinned: false,
        unreadCount: 0,
        lastMessageId: null
      };

      this.conversationsSignal.update((conversations) => [conversation!, ...conversations]);
    }

    if (conversation) {
      this.setActiveConversation(conversation.id);
    }
  }

  createGroup(title: string, memberIds: string[], description: string): Conversation {
    const currentUser = this.requireCurrentUser();
    const uniqueMemberIds = Array.from(new Set([currentUser.id, ...memberIds]));

    const conversation: Conversation = {
      id: crypto.randomUUID(),
      kind: 'group',
      title: title.trim(),
      memberIds: uniqueMemberIds,
      avatarSeed: title.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      unreadCount: 0,
      lastMessageId: null
    };

    this.conversationsSignal.update((conversations) => [conversation, ...conversations]);
    this.setActiveConversation(conversation.id);
    return conversation;
  }

  addMemberToGroup(conversationId: string, userId: string): void {
    this.updateGroupMembers(conversationId, (members) => Array.from(new Set([...members, userId])));
  }

  removeMemberFromGroup(conversationId: string, userId: string): void {
    this.updateGroupMembers(conversationId, (members) => members.filter((memberId) => memberId !== userId));
  }

  updateProfile(displayName: string, bio: string, status: string): void {
    const currentUser = this.requireCurrentUser();
    const nextUser: User = {
      ...currentUser,
      profile: {
        ...currentUser.profile,
        displayName: displayName.trim() || currentUser.profile.displayName,
        bio: bio.trim(),
        status: status.trim() || currentUser.profile.status,
        avatarSeed: currentUser.profile.avatarSeed
      }
    };

    this.auth.updateCurrentUser(nextUser);
    this.renameDirectConversation(nextUser);
  }

  sendMessage(text: string): void {
    const conversation = this.activeConversation();
    const currentUser = this.requireCurrentUser();
    if (!conversation || !text.trim()) {
      return;
    }

    if ((currentUser.accountStatus || 'approved') === 'blocked') {
      return;
    }

    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: currentUser.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      status: 'sent',
      kind: 'text',
      deliveredAt: null,
      readAt: null,
      reactions: []
    };

    this.messagesSignal.update((messages) => [...messages, message]);
    this.updateConversationTouch(conversation.id, message.id);
    this.scheduleDelivery(message.id);
    this.markConversationRead(conversation.id);
  }

  async sendAudioMessage(blob: Blob, durationSec: number): Promise<void> {
    const conversation = this.activeConversation();
    const currentUser = this.requireCurrentUser();
    if (!conversation || blob.size === 0) {
      return;
    }

    if ((currentUser.accountStatus || 'approved') === 'blocked') {
      return;
    }

    const dataUrl = await this.blobToDataUrl(blob);
    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: currentUser.id,
      text: 'Glasovna poruka',
      createdAt: new Date().toISOString(),
      status: 'sent',
      kind: 'audio',
      audio: {
        url: dataUrl,
        mimeType: blob.type || 'audio/webm',
        durationSec: Math.max(1, Math.round(durationSec))
      },
      deliveredAt: null,
      readAt: null,
      reactions: []
    };

    this.messagesSignal.update((messages) => [...messages, message]);
    this.updateConversationTouch(conversation.id, message.id);
    this.scheduleDelivery(message.id);
    this.markConversationRead(conversation.id);
  }

  reactToMessage(messageId: string, emoji: string): void {
    const currentUser = this.requireCurrentUser();
    this.messagesSignal.update((messages) =>
      messages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const reactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
        const existing = reactions.find((item) => item.emoji === emoji);
        if (existing) {
          if (existing.userIds.includes(currentUser.id)) {
            existing.userIds = existing.userIds.filter((userId) => userId !== currentUser.id);
            return { ...message, reactions: reactions.filter((item) => item.userIds.length > 0) };
          }

          existing.userIds = [...existing.userIds, currentUser.id];
          return { ...message, reactions };
        }

        reactions.push({ emoji, userIds: [currentUser.id] });
        return { ...message, reactions };
      })
    );
  }

  getReactionSummary(message: Message): Array<{ emoji: string; count: number }> {
    return (message.reactions || [])
      .map((reaction) => ({ emoji: reaction.emoji, count: reaction.userIds.length }))
      .filter((reaction) => reaction.count > 0);
  }

  getMessageStatusIcon(message: Message, currentUserId?: string): string {
    if (message.senderId !== currentUserId) {
      return '•';
    }

    if (message.status === 'read') {
      return '✓✓';
    }

    if (message.status === 'delivered') {
      return '✓✓';
    }

    return '✓';
  }

  getConversationUnreadCount(conversationId: string): number {
    const currentUser = this.auth.currentUser();
    if (!currentUser) {
      return 0;
    }

    return this.messagesSignal().filter((message) => {
      if (message.conversationId !== conversationId) {
        return false;
      }

      if (message.senderId === currentUser.id) {
        return false;
      }

      return !message.readAt;
    }).length;
  }

  logout(): void {
    this.auth.logout();
    this.clearActiveConversation();
  }

  getConversationMembers(conversation: Conversation): User[] {
    return this.auth.users().filter((user) => conversation.memberIds.includes(user.id));
  }

  getConversationPartner(conversation: Conversation): User | null {
    const currentUser = this.requireCurrentUser();
    const partnerId = conversation.memberIds.find((memberId) => memberId !== currentUser.id);
    return partnerId ? this.auth.users().find((user) => user.id === partnerId) ?? null : null;
  }

  getUserById(userId: string): User | null {
    return this.auth.users().find((user) => user.id === userId) ?? null;
  }

  private markConversationRead(conversationId: string): void {
    const currentUser = this.requireCurrentUser();
    this.conversationsSignal.update((conversations) =>
      conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0, updatedAt: new Date().toISOString() } : conversation
      )
    );

    this.messagesSignal.update((messages) =>
      messages.map((message) =>
        message.conversationId === conversationId && message.senderId !== currentUser.id
          ? { ...message, status: 'read', readAt: new Date().toISOString(), deliveredAt: message.deliveredAt || new Date().toISOString() }
          : message
      )
    );
  }

  private markOutgoingAsRead(conversationId: string, readerId: string): void {
    this.messagesSignal.update((messages) =>
      messages.map((message) =>
        message.conversationId === conversationId && message.senderId !== readerId
          ? { ...message, status: 'read', readAt: new Date().toISOString(), deliveredAt: message.deliveredAt || new Date().toISOString() }
          : message
      )
    );
  }

  private scheduleDelivery(messageId: string): void {
    window.setTimeout(() => {
      const deliveredAt = new Date().toISOString();
      this.messagesSignal.update((messages) =>
        messages.map((message) =>
          message.id === messageId && message.status === 'sent'
            ? { ...message, status: 'delivered', deliveredAt }
            : message
        )
      );
    }, 350);
  }

  private updateConversationTouch(conversationId: string, messageId: string, unreadDelta = 0): void {
    this.conversationsSignal.update((conversations) =>
      conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              lastMessageId: messageId,
              unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
              updatedAt: new Date().toISOString(),
              lastActivityAt: new Date().toISOString()
            }
          : conversation
      )
    );
  }

  private renameDirectConversation(nextUser: User): void {
    this.conversationsSignal.update((conversations) =>
      conversations.map((conversation) => {
        if (conversation.kind !== 'direct') {
          return conversation;
        }

        if (!conversation.memberIds.includes(nextUser.id)) {
          return conversation;
        }

        const partnerId = conversation.memberIds.find((memberId) => memberId !== nextUser.id);
        const partner = partnerId ? this.getUserById(partnerId) : null;
        if (!partner) {
          return conversation;
        }

        return {
          ...conversation,
          title: partner.profile.displayName,
          description: partner.profile.status ?? '',
          avatarSeed: partner.profile.avatarSeed ?? partner.profile.displayName,
          lastActivityAt: conversation.lastActivityAt || conversation.updatedAt
        };
      })
    );
  }

  private updateGroupMembers(conversationId: string, updater: (members: string[]) => string[]): void {
    this.conversationsSignal.update((conversations) =>
      conversations.map((conversation) => {
        if (conversation.id !== conversationId || conversation.kind !== 'group') {
          return conversation;
        }

        const members = updater(conversation.memberIds);
        return {
          ...conversation,
          memberIds: members,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  private sortConversations(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  private buildSeed(currentUserId: string, seedUsers: User[]): { conversations: Conversation[]; messages: Message[] } {
    return {
      conversations: [],
      messages: []
    };
  }

  private cleanupStateForCurrentUser(): void {
    const currentUser = this.auth.currentUser();
    if (!currentUser) {
      return;
    }

    const cleanConversations = this.conversationsSignal().filter((conversation) => {
      if (!conversation.memberIds.includes(currentUser.id)) {
        return false;
      }

      if (currentUser.role !== 'admin') {
        const hasAdminMember = conversation.memberIds.some((memberId) => this.getUserById(memberId)?.role === 'admin');
        if (hasAdminMember) {
          return false;
        }
      }

      return true;
    });

    const cleanConversationIds = new Set(cleanConversations.map((conversation) => conversation.id));
    const cleanMessages = this.messagesSignal().filter((message) => cleanConversationIds.has(message.conversationId));

    this.conversationsSignal.set(cleanConversations);
    this.messagesSignal.set(cleanMessages);

    const activeId = this.activeConversationIdSignal();
    if (activeId && !cleanConversationIds.has(activeId)) {
      this.activeConversationIdSignal.set(null);
    }
  }

  private requireCurrentUser(): User {
    const currentUser = this.auth.currentUser();
    if (!currentUser) {
      throw new Error('No current user');
    }

    return currentUser;
  }

  private requireUser(userId: string): User {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error(`Unknown user: ${userId}`);
    }

    return user;
  }

  private readConversations(): Conversation[] {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  }

  private readMessages(): Message[] {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Neuspesno citanje audio sadrzaja.'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Purge all conversations/messages except those limited to the provided usernames.
   * Keeps only conversations whose memberIds are a subset of the keep users set.
   */
  purgeConversationsExcept(keepUsernames: string[]): void {
    const users = this.auth.users();
    const keepIds = users.filter((u) => keepUsernames.includes(u.username)).map((u) => u.id);

    // Keep conversations where every member is in keepIds
    const keptConversations = this.conversationsSignal().filter((conv) => conv.memberIds.every((id) => keepIds.includes(id)));

    const keptConversationIds = new Set(keptConversations.map((c) => c.id));

    const keptMessages = this.messagesSignal().filter((m) => keptConversationIds.has(m.conversationId));

    this.conversationsSignal.set(keptConversations);
    this.messagesSignal.set(keptMessages);
    // active conversation fallback
    if (this.conversationsSignal().length === 0) {
      this.activeConversationIdSignal.set(null);
    } else if (!this.activeConversationIdSignal() || !keptConversationIds.has(this.activeConversationIdSignal()!)) {
      this.activeConversationIdSignal.set(this.conversationsSignal()[0].id);
    }
  }
}
