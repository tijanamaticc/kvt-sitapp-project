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
  private readonly searchSignal = signal('');
  private readonly activityFilterSignal = signal<'all' | 'today' | 'week' | 'month'>('all');
  private readonly avatarFilterSignal = signal<'all' | 'with-avatar' | 'without-avatar'>('all');

  readonly conversations = computed(() => this.sortConversations(this.conversationsSignal()));
  readonly messages = computed(() => this.messagesSignal());
  readonly activeConversationId = computed(() => this.activeConversationIdSignal());
  readonly search = computed(() => this.searchSignal());
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
  readonly filteredUsers = computed(() => {
    const query = this.searchSignal().trim().toLowerCase();
    const currentUser = this.auth.currentUser();
    const userList = this.auth.users().filter((user) => user.id !== currentUser?.id);

    return userList
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
    const query = this.searchSignal().trim().toLowerCase();
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

    if (this.conversationsSignal().length === 0 || this.messagesSignal().length === 0) {
      const seeded = this.buildSeed(currentUser.id, seedUsers);
      this.conversationsSignal.set(seeded.conversations);
      this.messagesSignal.set(seeded.messages);
      this.activeConversationIdSignal.set(seeded.conversations[0]?.id ?? null);
    }

    if (!this.activeConversationIdSignal() && this.conversationsSignal().length > 0) {
      this.activeConversationIdSignal.set(this.conversationsSignal()[0].id);
    }
  }

  setSearch(query: string): void {
    this.searchSignal.set(query);
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

  startDirectConversation(partnerId: string): void {
    const currentUser = this.requireCurrentUser();
    let conversation = this.conversationsSignal().find((item) => {
      return item.kind === 'direct' && item.memberIds.includes(currentUser.id) && item.memberIds.includes(partnerId);
    });

    if (!conversation) {
      const partner = this.requireUser(partnerId);
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

    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: currentUser.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      status: 'sent',
      kind: 'text'
    };

    this.messagesSignal.update((messages) => [...messages, message]);
    this.updateConversationTouch(conversation.id, message.id);
    this.markConversationRead(conversation.id);

    if (conversation.kind === 'direct') {
      window.setTimeout(() => this.sendAutoReply(conversation.id), 900);
    }
  }

  logout(): void {
    this.auth.logout();
    this.activeConversationIdSignal.set(null);
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

  private sendAutoReply(conversationId: string): void {
    const conversation = this.conversationsSignal().find((item) => item.id === conversationId);
    const currentUser = this.auth.currentUser();
    if (!conversation || !currentUser) {
      return;
    }

    const partner = this.getConversationPartner(conversation);
    if (!partner) {
      return;
    }

    const replyTemplates = [
      'Stigla je poruka. Javljam se uskoro.',
      'Vidim poruku, odgovaram za minut.',
      'Super, hvala. Nastavljamo razgovor.'
    ];
    const reply: Message = {
      id: crypto.randomUUID(),
      conversationId,
      senderId: partner.id,
      text: replyTemplates[Math.floor(Math.random() * replyTemplates.length)],
      createdAt: new Date().toISOString(),
      status: 'read',
      kind: 'text'
    };

    this.messagesSignal.update((messages) => [...messages, reply]);
    this.updateConversationTouch(conversationId, reply.id, 1);
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
          ? { ...message, status: 'read' }
          : message
      )
    );
  }

  private updateConversationTouch(conversationId: string, messageId: string, unreadDelta = 0): void {
    this.conversationsSignal.update((conversations) =>
      conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              lastMessageId: messageId,
              unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
              updatedAt: new Date().toISOString()
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
          title: nextUser.profile.displayName,
          description: nextUser.profile.status ?? '',
          avatarSeed: nextUser.profile.avatarSeed ?? nextUser.profile.displayName
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
    const teammate = seedUsers.find((user) => user.id !== currentUserId && user.username === 'ana') ?? seedUsers.find((user) => user.id !== currentUserId) ?? null;
    const designGroupMembers = seedUsers.filter((user) => ['ana', 'marko', 'jelena'].includes(user.username)).map((user) => user.id);
    const directConversation: Conversation = {
      id: crypto.randomUUID(),
      kind: 'direct',
      title: teammate?.profile.displayName ?? 'Kontakt',
      memberIds: [currentUserId, teammate?.id ?? currentUserId],
      avatarSeed: teammate?.profile.avatarSeed ?? 'A',
      description: teammate?.profile.status ?? 'Online',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: true,
      unreadCount: 0,
      lastMessageId: null
    };

    const groupConversation: Conversation = {
      id: crypto.randomUUID(),
      kind: 'group',
      title: 'SVT grupa',
      memberIds: Array.from(new Set([currentUserId, ...designGroupMembers])),
      avatarSeed: 'SVT',
      description: 'Dogovor za projekat i raspodela zadataka',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      unreadCount: 2,
      lastMessageId: null
    };

    const seededMessages: Message[] = [
      {
        id: crypto.randomUUID(),
        conversationId: directConversation.id,
        senderId: teammate?.id ?? currentUserId,
        text: 'Hej, proveri novu verziju sitapp layout-a.',
        createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        status: 'read',
        kind: 'text'
      },
      {
        id: crypto.randomUUID(),
        conversationId: directConversation.id,
        senderId: currentUserId,
        text: 'Otvaram sad i doterujem svetlo plavu temu.',
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        status: 'read',
        kind: 'text'
      },
      {
        id: crypto.randomUUID(),
        conversationId: groupConversation.id,
        senderId: seedUsers.find((user) => user.username === 'marko')?.id ?? currentUserId,
        text: 'Dodao sam osnovni raspored komponenti.',
        createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        status: 'read',
        kind: 'text'
      },
      {
        id: crypto.randomUUID(),
        conversationId: groupConversation.id,
        senderId: seedUsers.find((user) => user.username === 'jelena')?.id ?? currentUserId,
        text: 'Fali još auth deo i profile panel.',
        createdAt: new Date(Date.now() - 1000 * 60 * 39).toISOString(),
        status: 'read',
        kind: 'text'
      }
    ];

    directConversation.lastMessageId = seededMessages[1].id;
    groupConversation.lastMessageId = seededMessages[3].id;

    return {
      conversations: [directConversation, groupConversation],
      messages: seededMessages
    };
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
}
