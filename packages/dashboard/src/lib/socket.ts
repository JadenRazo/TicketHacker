import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketReadyCallbacks: Array<(s: Socket) => void> = [];

function notifySocketReady(s: Socket) {
  for (const cb of socketReadyCallbacks) {
    cb(s);
  }
  socketReadyCallbacks = [];
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
  socket = io(wsUrl, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  const s = socket;
  notifySocketReady(s);

  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

function onSocketReady(callback: (s: Socket) => void) {
  if (socket) {
    callback(socket);
  } else {
    socketReadyCallbacks.push(callback);
  }
}

export function useSocket() {
  const [currentSocket, setCurrentSocket] = useState<Socket | null>(socket);
  const [isConnected, setIsConnected] = useState(socket?.connected || false);

  useEffect(() => {
    if (socket) {
      setCurrentSocket(socket);
      return;
    }

    onSocketReady((s) => {
      setCurrentSocket(s);
    });
  }, []);

  useEffect(() => {
    if (!currentSocket) return;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    setIsConnected(currentSocket.connected);

    currentSocket.on('connect', onConnect);
    currentSocket.on('disconnect', onDisconnect);

    return () => {
      currentSocket.off('connect', onConnect);
      currentSocket.off('disconnect', onDisconnect);
    };
  }, [currentSocket]);

  return { socket: currentSocket, isConnected };
}

export function useTicketRoom(ticketId: string | undefined) {
  const [viewers, setViewers] = useState<Array<{ userId: string; name: string }>>([]);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);

  useEffect(() => {
    if (!socket || !ticketId) return;

    socket.emit('ticket:join', ticketId);

    const handleViewersUpdate = (data: { viewers: Array<{ userId: string; name: string }> }) => {
      setViewers(data.viewers);
    };

    const handleTypingStart = (data: { userId: string; name: string }) => {
      setTypingUsers((prev) => {
        if (prev.find((u) => u.userId === data.userId)) return prev;
        return [...prev, data];
      });
    };

    const handleTypingStop = (data: { userId: string }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    };

    socket.on('ticket:viewers', handleViewersUpdate);
    socket.on('ticket:typing:start', handleTypingStart);
    socket.on('ticket:typing:stop', handleTypingStop);

    return () => {
      socket?.emit('ticket:leave', ticketId);
      socket?.off('ticket:viewers', handleViewersUpdate);
      socket?.off('ticket:typing:start', handleTypingStart);
      socket?.off('ticket:typing:stop', handleTypingStop);
    };
  }, [ticketId]);

  return { viewers, typingUsers };
}

// Debounced typing indicator
const typingTimeouts = new Map<string, NodeJS.Timeout>();

export function emitTyping(ticketId: string): void {
  if (!socket) return;

  socket.emit('ticket:typing:start', ticketId);

  const existingTimeout = typingTimeouts.get(ticketId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeout = setTimeout(() => {
    socket?.emit('ticket:typing:stop', ticketId);
    typingTimeouts.delete(ticketId);
  }, 2000);

  typingTimeouts.set(ticketId, timeout);
}
