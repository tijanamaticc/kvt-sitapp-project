import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css'
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');
  readonly isLoggedIn = computed(() => this.auth.isAuthenticated());

  readonly loginForm = this.fb.nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required]
  });

  readonly registerForm = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
    avatarUrl: ['']
  });

  readonly avatarPreview = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  private static readonly DEFAULT_AVATAR =
    'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23eaf8ff%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2236%22 r%3D%2230%22 fill%3D%22%237ed1ff%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2260%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';

  readonly avatarSrc = computed(() => this.avatarPreview() ?? LoginPageComponent.DEFAULT_AVATAR);

  switchMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.errorMessage.set('');
  }

  async submitLogin(): Promise<void> {
    this.errorMessage.set('');
    this.infoMessage.set('');
    const result = await this.auth.login(this.loginForm.value.identifier ?? '', this.loginForm.value.password ?? '');
    if (!result) {
      this.errorMessage.set(this.auth.lastAuthMessage() || 'Netačan identifikator ili lozinka.');
      return;
    }

    this.router.navigateByUrl(result.role === 'admin' ? '/admin' : '/chat/messages');
  }

  async submitRegister(): Promise<void> {
    this.errorMessage.set('');
    if (this.registerForm.invalid) {
      this.errorMessage.set('Popuni sva obavezna polja.');
      return;
    }
    const user = await this.auth.register({
      username: this.registerForm.value.username ?? '',
      email: this.registerForm.value.email ?? '',
      phone: this.registerForm.value.phone ?? '',
      password: this.registerForm.value.password ?? '',
      profile: {
        firstName: this.registerForm.value.firstName ?? '',
        lastName: this.registerForm.value.lastName ?? '',
        displayName: `${this.registerForm.value.firstName ?? ''} ${this.registerForm.value.lastName ?? ''}`.trim() || (this.registerForm.value.username ?? ''),
        avatarUrl: this.avatarPreview() ?? (this.registerForm.value.avatarUrl ?? null)
      }
    }, this.selectedFile());

    if (user) {
      this.mode.set('login');
      this.infoMessage.set('Zahtev za registraciju je poslat administratoru. Nakon odobrenja dobijaš mejl i možeš da se prijaviš.');
    }
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

}
