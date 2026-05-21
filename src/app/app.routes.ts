import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/services/auth.guard';
import { LoginPageComponent } from './features/auth/pages/login-page.component';
import { ChatPageComponent } from './features/chat/pages/chat-page.component';
import { AdminPageComponent } from './features/admin/pages/admin-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
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
    path: 'admin',
    component: AdminPageComponent,
    canActivate: [adminGuard]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];