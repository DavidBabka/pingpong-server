const http = require('http');
const { Server } = require('socket.io');

// ——— HTTP + Socket.IO setup ———
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Socket.IO server');
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ——— Controller/Client maps ———
const controllers = new Map(); // socketId → { id, name, available, posY }
const clientControllerMap = new Map(); // clientSocketId → controllerSocketId
const controllerClientMap = new Map(); // controllerSocketId → clientSocketId

// ——— Ping Pong Game Config & State ———
const GAME_CONFIG = {
  width: 600,
  height: 400,
  paddleWidth: 10,
  paddleHeight: 80,
  ballRadius: 10,
  maxScore: 10,
  ballSpeed: 3
};

let smoothingFactor = 0.1;
let scaleFactor = 20;

let gameState = {
  ballX: GAME_CONFIG.width / 2,
  ballY: GAME_CONFIG.height / 2,
  ballSpeedX: GAME_CONFIG.ballSpeed,
  ballSpeedY: GAME_CONFIG.ballSpeed,
  paddles: {
    left: GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2,
    right: GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2
  },
  score: {
    left: 0,
    right: 0
  },
  running: false
};

const activeGameClients = [];
const playerSides = new Map();

function getActiveGameClients() {
  return activeGameClients.filter(s => s.connected);
}

function resetBall() {
  gameState.ballX = GAME_CONFIG.width / 2;
  gameState.ballY = GAME_CONFIG.height / 2;
  gameState.ballSpeedX = (Math.random() > 0.5 ? 1 : -1) * GAME_CONFIG.ballSpeed;
  gameState.ballSpeedY = (Math.random() > 0.5 ? 1 : -1) * GAME_CONFIG.ballSpeed;
}

function resetPaddles() {
  const center = GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2;
  gameState.paddles.left = center;
  gameState.paddles.right = center;
}

function broadcastGameState() {
  io.to('game').emit('game-state', {
    ...gameState,
    config: GAME_CONFIG
  });
}

// near the top, after getActiveGameClients(), resetPaddles(), etc.
function removePlayer(socket) {
  const idx = activeGameClients.findIndex(s => s.id === socket.id);
  if (idx === -1) return;

  activeGameClients.splice(idx, 1);
  playerSides.delete(socket.id);

  // if that was the last one, fully reset
  if (getActiveGameClients().length === 0) {
    gameState.running = false;
    resetPaddles();
    gameState.score.left = 0;
    gameState.score.right = 0;
    playerSides.clear();
  }

  // broadcastGameState();
}

// ——— Game Loop (runs on server) ———
setInterval(() => {
  if (!gameState.running || activeGameClients.length < 2) return;

  gameState.ballX += gameState.ballSpeedX;
  gameState.ballY += gameState.ballSpeedY;

  // Wall bounce
  if (
    gameState.ballY - GAME_CONFIG.ballRadius <= 0 ||
    gameState.ballY + GAME_CONFIG.ballRadius >= GAME_CONFIG.height
  ) {
    gameState.ballSpeedY *= -1;
  }

  // Paddle collisions
  // Left
  if (
    gameState.ballX - GAME_CONFIG.ballRadius <= GAME_CONFIG.paddleWidth &&
    gameState.ballY >= gameState.paddles.left &&
    gameState.ballY <= gameState.paddles.left + GAME_CONFIG.paddleHeight
  ) {
    gameState.ballSpeedX *= -1;
    gameState.ballX = GAME_CONFIG.paddleWidth + GAME_CONFIG.ballRadius;
  }

  // Right
  if (
    gameState.ballX + GAME_CONFIG.ballRadius >= GAME_CONFIG.width - GAME_CONFIG.paddleWidth &&
    gameState.ballY >= gameState.paddles.right &&
    gameState.ballY <= gameState.paddles.right + GAME_CONFIG.paddleHeight
  ) {
    gameState.ballSpeedX *= -1;
    gameState.ballX = GAME_CONFIG.width - GAME_CONFIG.paddleWidth - GAME_CONFIG.ballRadius;
  }

  // Scoring
  if (gameState.ballX < 0) {
    gameState.score.right++;
    resetBall();
  } else if (gameState.ballX > GAME_CONFIG.width) {
    gameState.score.left++;
    resetBall();
  }

  if (
    gameState.score.left >= GAME_CONFIG.maxScore ||
    gameState.score.right >= GAME_CONFIG.maxScore
  ) {
    gameState.running = false;
  }

  broadcastGameState();
}, 1000 / 60);

// ——— Connection & event handlers ———
io.on('connection', socket => {
  console.log('A new connection has been made, socket ID:', socket.id);

  // — Registration: clients & controllers —
  socket.on('register', data => {
    console.log('Registration data:', data);

    if (data.role === 'client') {
      socket.join('clients');
      socket.join(socket.id);
      console.log(`Client registered: socket ID ${socket.id}`);
      const available = Array.from(controllers.values()).filter(c => c.available);
      socket.emit('availableControllers', available);
    }

    if (data.role === 'controller') {
      controllers.set(socket.id, { id: socket.id, name: data.name, available: true, posY: 0.5, smoothX: 0, smoothY: 0, deltaX: 0, deltaY: 0 });
      console.log(`Controller registered: ${data.name} with socket ID ${socket.id}`);
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
    }
  });

  // ——— Ping Pong Game Setup ———
  socket.on('start', () => {
    if (!activeGameClients.includes(socket)) {
      if (activeGameClients.length >= 2) {
        socket.emit('full');
        return;
      }
      activeGameClients.push(socket);
    }

    const clients = getActiveGameClients();
    const side = clients.length === 1 ? 'left' : 'right';
    playerSides.set(socket.id, side);
    socket.join('game');

    if (clients.length === 1) {
      socket.emit('player-assign', { side });
      socket.emit('waiting');
    } else if (clients.length === 2) {
      clients[0].emit('player-assign', { side: 'left' });
      clients[1].emit('player-assign', { side: 'right' });
      gameState.running = true;
      gameState.score.left = 0;
      gameState.score.right = 0;
      resetBall();
      resetPaddles();
      broadcastGameState();
    }
  });

  socket.on('leave', () => {
    removePlayer(socket);
  });

  // — Paddle movement input —
  socket.on('paddle-move', data => {
    const side = playerSides.get(socket.id);
    if (side && gameState.paddles[side] !== undefined) {
      gameState.paddles[side] = Math.max(
        0,
        Math.min(
          GAME_CONFIG.height - GAME_CONFIG.paddleHeight,
          data.y
        )
      );
    }
  });

  // — Controller selection/deselection —
  socket.on('selectController', controllerId => {
    const ctrl = controllers.get(controllerId);
    if (ctrl && ctrl.available) {
      ctrl.available = false;
      controllers.set(controllerId, ctrl);
      clientControllerMap.set(socket.id, controllerId);
      controllerClientMap.set(controllerId, socket.id);
      console.log(`Controller ${ctrl.name} (${controllerId}) has been selected by client ${socket.id}`);
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
      socket.join(controllerId);
    }
  });

  socket.on('deselectController', controllerId => {
    const ctrl = controllers.get(controllerId);
    if (ctrl) {
      ctrl.available = true;
      controllers.set(controllerId, ctrl);
      clientControllerMap.delete(socket.id);
      controllerClientMap.delete(controllerId);
      console.log(`Client ${socket.id} has deselected controller ${controllerId}`);
      io.to(socket.id).emit('controllerDeselected', { controllerId });
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
    }
  });

  // — Forward messages from controller to client —
  socket.on('messageFromController', (message) => {
    const controllerId = socket.id;
    const clientId = controllerClientMap.get(controllerId);
    if (!clientId) return;
    if (activeGameClients.length == 2) {
      const side = playerSides.get(clientId);
      if (!side || gameState.paddles[side] === undefined) return;

      // 1) get this controller's own state object
      const ctrl = controllers.get(controllerId);
      if (!ctrl) return;

      // 2) destructure incoming payload
      const { x_acc, default_pos1 } = message.payload;

      // 3) update smoothing on the controller object
      ctrl.smoothX = smoothingFactor * x_acc + (1 - smoothingFactor) * ctrl.smoothX;

      // 4) compute deltas on that same object
      ctrl.deltaX = (ctrl.smoothX - default_pos1) * scaleFactor;

      // 5) move the paddle by this controller's deltaY
      const newY = gameState.paddles[side] - ctrl.deltaX;
      gameState.paddles[side] = Math.max(
        0,
        Math.min(GAME_CONFIG.height - GAME_CONFIG.paddleHeight, newY)
      );
    }
    if (clientId) {
      console.log(`Forwarding message from controller ${socket.id} to client ${clientId}:`, message);
      io.emit('controllerMessage', { payload: message });
    }
  });


  // — Disconnect handler (controllers + ping pong players) —
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);

    // — Remove from ping pong game —
    const gameIndex = activeGameClients.findIndex(s => s.id === socket.id);
    if (gameIndex !== -1) {
      activeGameClients.splice(gameIndex, 1);
      playerSides.delete(socket.id);
      gameState.running = false;
      gameState.score.left = 0;
      gameState.score.right = 0;
      playerSides.clear();
      broadcastGameState();
    }

    // — Controller logic —
    const clientId = controllerClientMap.get(socket.id);
    if (clientId) {
      io.to(clientId).emit('controllerDisconnected', { controllerId: socket.id });
      const ctrl = controllers.get(socket.id);
      if (ctrl) ctrl.available = true;
      controllers.set(socket.id, ctrl);
      controllerClientMap.delete(socket.id);
      clientControllerMap.delete(clientId);
      io.to('clients').emit('availableControllers', Array.from(controllers.values()).filter(c => c.available));
    }

    const controllerId = clientControllerMap.get(socket.id);
    if (controllerId) {
      const ctrl = controllers.get(controllerId);
      if (ctrl) ctrl.available = true;
      controllers.set(controllerId, ctrl);
      clientControllerMap.delete(socket.id);
      controllerClientMap.delete(controllerId);
      io.to('clients').emit('availableControllers', Array.from(controllers.values()).filter(c => c.available));
    }

    if (controllers.has(socket.id)) {
      controllers.delete(socket.id);
      io.to('clients').emit('availableControllers', Array.from(controllers.values()).filter(c => c.available));
    }
  });
});

// — Start server —
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
