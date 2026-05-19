import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/services/auth.guard';
import { LoginPageComponent } from './features/auth/pages/login-page.component';
import { ChatPageComponent } from './features/chat/pages/chat-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
  },
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'chat',
    component: ChatPageComponent,
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: 'chat'
  }
];