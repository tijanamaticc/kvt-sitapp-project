import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStoreService } from '../../../core/services/chat-store.service';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-chat-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chat-profile-page.component.html',
  styleUrls: ['./chat-profile-page.component.css']
})
export class ChatProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly chat = inject(ChatStoreService);
  readonly currentUser = this.auth.currentUser;
  readonly defaultAvatar =
    'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23e7f8ef%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2238%22 r%3D%2230%22 fill%3D%22%2325d366%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2262%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';
  readonly avatarPreview = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly saveMessage = signal('');
  readonly passwordMessage = signal('');

  readonly profileForm = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    bio: [''],
    status: [''],
    avatarUrl: ['']
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  });

  constructor() {
    const current = this.currentUser();
    if (current) {
      this.profileForm.patchValue({
        firstName: current.profile.firstName ?? '',
        lastName: current.profile.lastName ?? '',
        username: current.username,
        email: current.email,
        phone: current.phone,
        bio: current.profile.bio ?? '',
        status: current.profile.status ?? '',
        avatarUrl: current.profile.avatarUrl ?? ''
      });
      this.avatarPreview.set(current.profile.avatarUrl || this.defaultAvatar);
    }

    this.chat.initialize(this.auth.users());
  }

  get avatarSrc(): string {
    return this.avatarPreview() || this.defaultAvatar;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.avatarPreview.set(String(reader.result));
      this.selectedFile.set(file);
    };
    reader.readAsDataURL(file);
  }

  async saveProfile(): Promise<void> {
    this.saveMessage.set('');
    const current = this.currentUser();
    if (!current || this.profileForm.invalid) {
      this.saveMessage.set('Popuni obavezna polja.');
      return;
    }

    const nextUser: User = {
      ...current,
      username: this.profileForm.value.username ?? current.username,
      email: this.profileForm.value.email ?? current.email,
      phone: this.profileForm.value.phone ?? current.phone,
      profile: {
        ...current.profile,
        firstName: this.profileForm.value.firstName ?? '',
        lastName: this.profileForm.value.lastName ?? '',
        displayName: `${this.profileForm.value.firstName ?? ''} ${this.profileForm.value.lastName ?? ''}`.trim() || current.profile.displayName,
        bio: this.profileForm.value.bio ?? '',
        status: this.profileForm.value.status ?? '',
        avatarUrl: this.avatarPreview() || current.profile.avatarUrl || null
      }
    };

    const serverUser = await this.auth.saveProfileToServer(nextUser);
    this.auth.updateCurrentUser(serverUser || nextUser);
    this.saveMessage.set('Profil je sačuvan.');
  }

  async changePassword(): Promise<void> {
    this.passwordMessage.set('');
    if (this.passwordForm.invalid) {
      this.passwordMessage.set('Unesi trenutnu i novu lozinku.');
      return;
    }

    const currentPassword = this.passwordForm.value.currentPassword ?? '';
    const newPassword = this.passwordForm.value.newPassword ?? '';
    const confirmPassword = this.passwordForm.value.confirmPassword ?? '';
    if (newPassword !== confirmPassword) {
      this.passwordMessage.set('Nova lozinka i potvrda nisu iste.');
      return;
    }

    const ok = await this.auth.changePassword(currentPassword, newPassword);
    if (!ok) {
      this.passwordMessage.set('Trenutna lozinka nije ispravna.');
      return;
    }

    await this.auth.saveProfileToServer({
      ...(this.currentUser() as User),
      password: newPassword
    });

    this.passwordForm.reset();
    this.passwordMessage.set('Lozinka je promenjena.');
  }
}
