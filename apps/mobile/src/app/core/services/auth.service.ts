import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarInitials: string;
  isAdmin?: boolean;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

const STORAGE_SUFFIX = environment.production ? '' : `:${environment.storageNamespace}`;
const TOKEN_KEY = `lc-token${STORAGE_SUFFIX}`;
const USER_KEY = `lc-user${STORAGE_SUFFIX}`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authUrl = `${environment.apiUrl}/auth`;

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<AuthUser | null>(this.loadStoredUser());

  readonly token = this._token.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());
  readonly isAdmin = computed(() => this._user()?.isAdmin === true);

  login(payload: LoginPayload): Observable<AuthUser> {
    return this.http.post<AuthResponse>(`${this.authUrl}/login`, payload).pipe(
      tap((res) => this.persist(res)),
      map((res) => res.user),
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  register(payload: RegisterPayload): Observable<AuthUser> {
    return this.http.post<AuthResponse>(`${this.authUrl}/register`, payload).pipe(
      tap((res) => this.persist(res)),
      map((res) => res.user),
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.authUrl}/forgot-password`, { email });
  }

  verifyPassword(password: string): Observable<boolean> {
    const user = this._user();
    if (!user) return of(false);
    return this.http
      .post<{ valid: boolean }>(`${this.authUrl}/verify-password`, {
        email: user.email,
        password,
      })
      .pipe(
        map((res) => res.valid),
        catchError(() => of(false))
      );
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.router.navigateByUrl('/auth/login');
  }

  private persist(res: AuthResponse): void {
    this._token.set(res.accessToken);
    this._user.set(res.user);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }

  private toError(httpErr: { error?: { message?: string | string[] } }): Error {
    const raw = httpErr?.error?.message;
    const msg = Array.isArray(raw) ? raw[0] : (raw ?? 'Something went wrong. Please try again.');
    return new Error(msg);
  }

  private loadStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
