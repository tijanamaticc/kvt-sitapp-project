import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStoreService } from '../../../core/services/chat-store.service';

@Component({
  selector: 'app-chat-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './chat-shell.component.html',
  styleUrls: ['./chat-shell.component.css']
})
export class ChatShellComponent {
  private readonly auth = inject(AuthService);
  readonly chat = inject(ChatStoreService);
  private readonly router = inject(Router);
  readonly currentUser = this.auth.currentUser;
  readonly defaultAvatar =
    'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23e7f8ef%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2238%22 r%3D%2230%22 fill%3D%22%2325d366%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2262%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';

  constructor() {
    this.chat.initialize(this.auth.users());
    void this.auth.refreshUsersFromServer();
  }

  logout(): void {
    this.chat.logout();
    this.router.navigateByUrl('/login');
  }

  getUserAvatar(): string {
    const user = this.currentUser();
    const avatar = user?.profile.avatarUrl;
    if (avatar && avatar.startsWith('/uploads/')) {
      return `${AuthService.SERVER_ORIGIN}${avatar}`;
    }

    return avatar || this.defaultAvatar;
  }
}
