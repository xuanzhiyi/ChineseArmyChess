const TOKEN_KEY = 'junqi_player_token';
const USERNAME_KEY = 'junqi_username';

export function getPlayerToken(): string {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USERNAME_KEY);
}

export function saveCredentials(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearCredentials(): void {
  localStorage.removeItem(USERNAME_KEY);
  // Keep token so anonymous game history is preserved
}
