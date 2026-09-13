export class MultiplayerManager {
  constructor(scene, createCarMeshCallback) {
    this.scene = scene;
    this.createCarMesh = createCarMeshCallback;
    this.remotePlayers = new Map();
    this.localId = null;
    this.roomCode = null;
    this.socket = null;
  }

  connect(url, requestedRoomCode) {
    this.socket = new WebSocket(url);
    
    // If no code is provided, generate a random 4-letter host code
    this.roomCode = requestedRoomCode || Math.random().toString(36).substring(2, 6).toUpperCase();

    this.socket.onopen = () => {
      // Send join request as soon as socket opens
      this.socket.send(JSON.stringify({ type: 'join', room: this.roomCode }));
      console.log(`Connected to Room: ${this.roomCode}`);
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'init') {
        this.localId = data.id;
        // Optional: Show the code in the UI for the host to share
        const hudTopLeft = document.getElementById('hud-topleft');
        if (hudTopLeft && !document.getElementById('hud-room-display')) {
          const roomDiv = document.createElement('div');
          roomDiv.id = 'hud-room-display';
          roomDiv.style = 'margin-top:8px; font-family:var(--f1-mono); color:#00e5ff; font-weight:800; font-size:1.2rem;';
          roomDiv.innerText = `ROOM CODE: ${this.roomCode}`;
          hudTopLeft.appendChild(roomDiv);
        }
      } else if (data.type === 'state') {
        this.updateRemotePlayers(data.players);
      }
    };
  }

  sendUpdate(position, rotation) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.localId) {
      this.socket.send(JSON.stringify({
        type: 'update',
        transform: { x: position.x, y: position.y, z: position.z, rotY: rotation.y }
      }));
    }
  }

  updateRemotePlayers(playersData) {
    playersData.forEach(({ id, transform }) => {
      if (id === this.localId) return;

      if (!this.remotePlayers.has(id)) {
        const carMesh = this.createCarMesh();
        this.scene.add(carMesh);
        this.remotePlayers.set(id, carMesh);
      }

      const mesh = this.remotePlayers.get(id);
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.rotation.y = transform.rotY;
    });

    const activeIds = new Set(playersData.map(p => p.id));
    this.remotePlayers.forEach((mesh, id) => {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.remotePlayers.delete(id);
      }
    });
  }
}