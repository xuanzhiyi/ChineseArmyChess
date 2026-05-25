import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '../types/game';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({ path: '/socket.io' });
  }
  return socket;
}
