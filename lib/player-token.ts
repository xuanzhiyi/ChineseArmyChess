const KEY = 'junqi_player_token';

export function getPlayerToken(): string {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(KEY, token);
  }
  return token;
}
