const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });

// Track rooms and clients
const rooms = new Map(); // Map<RoomCode, Map<PlayerId, Transform>>
const clients = new Map(); // Map<WebSocket, { id, room }>

wss.on('connection', (ws) => {
  const playerId = 'player_' + Math.random().toString(36).substring(2, 9);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'join') {
        // Assign player to room
        const roomCode = data.room;
        clients.set(ws, { id: playerId, room: roomCode });
        
        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, new Map());
        }
        
        ws.send(JSON.stringify({ type: 'init', id: playerId, room: roomCode }));
      } 
      else if (data.type === 'update') {
        const clientInfo = clients.get(ws);
        if (!clientInfo) return;
        
        const { id, room } = clientInfo;
        const roomState = rooms.get(room);
        roomState.set(id, data.transform);
        
        // Broadcast only to clients in the SAME room
        const gameState = Array.from(roomState.entries()).map(([pid, transform]) => ({
          id: pid,
          transform
        }));

        wss.clients.forEach((client) => {
          if (client.readyState === 1 && clients.get(client)?.room === room) {
            client.send(JSON.stringify({ type: 'state', players: gameState }));
          }
        });
      }
    } catch (e) {
      console.error('WebSocket Error:', e);
    }
  });

  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      const { id, room } = clientInfo;
      const roomState = rooms.get(room);
      if (roomState) {
        roomState.delete(id);
        // Clean up empty rooms
        if (roomState.size === 0) rooms.delete(room);
      }
      clients.delete(ws);
    }
  });
});

console.log('Room-based multiplayer server running on ws://localhost:8080');