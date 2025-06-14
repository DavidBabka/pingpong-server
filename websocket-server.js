// const http = require('http');
// const { Server } = require("socket.io");

// const server = http.createServer((req, res) => {
//     res.statusCode = 200;
//     res.setHeader('Content-Type', 'text/plain');
//     res.end('Socket.IO server');
// });

// const io = new Server(server, {
//     cors: {
//         origin: "*", // Allow all origins
//         methods: ["GET", "POST"]
//     }
// });

// // Store controller info, including unique names and availability
// const controllers = new Map();  // Map of socket ID -> { id: String, name: String, available: Boolean }
// const clientControllerMap = new Map();  // Maps clients to their controllers
// const controllerClientMap = new Map();  // Maps controllers to their clients

// // ◉–––––– NEW: PONG GAME STATE & LOOP ––––––◉
// const pongGames = new Map();  
// // Each entry: roomId → { players: { socketId: {x,y} }, ball: {...}, scores: {...}, loop: Interval }

// function updateBallPhysics(game) {
//   const { ball, players, scores } = game;
//   // move
//   ball.x += ball.vx;
//   ball.y += ball.vy;
//   // bounce top/bottom
//   if (ball.y <= 0 || ball.y >= 1) ball.vy *= -1;
//   // simple paddle collision
//   const ids = Object.keys(players);
//   if (ids.length === 2) {
//     const [leftId, rightId] = ids;
//     const left  = players[leftId];
//     const right = players[rightId];
//     const paddleW = 0.02, paddleH = 0.2;
//     // left paddle
//     if (ball.x <= left.x + paddleW && Math.abs(ball.y - left.y) <= paddleH/2) {
//       ball.vx = Math.abs(ball.vx);
//     }
//     // right paddle
//     if (ball.x >= right.x - paddleW && Math.abs(ball.y - right.y) <= paddleH/2) {
//       ball.vx = -Math.abs(ball.vx);
//     }
//   }
//   // score & reset if out of bounds
//   if (ball.x <= 0) {
//     scores.right++;
//     ball.x = ball.y = 0.5;
//   } else if (ball.x >= 1) {
//     scores.left++;
//     ball.x = ball.y = 0.5;
//   }
// }

// function startPongLoop(roomId) {
//   const game = pongGames.get(roomId);
//   if (game.loop) return;  // already running

//   game.loop = setInterval(() => {
//     updateBallPhysics(game);

//     // broadcast to everyone in that room
//     io.to(roomId).emit('updatePlayers', game.players);
//     io.to(roomId).emit('updateBall',    game.ball);
//     io.to(roomId).emit('scoreUpdate',   game.scores);
//   }, 1000/60);
// }

// io.on('connection', (socket) => {
//     console.log('A new connection has been made, socket ID:', socket.id);

//     socket.on('register', (data) => {
//         console.log(`Registration data:`, data);

//         if (data.role === 'client') {
//             socket.join('clients');
//             console.log(`Client registered: socket ID ${socket.id}`);
//             // Emit only available controllers, include the socket ID as 'id'
//             const availableControllers = Array.from(controllers.values()).filter(c => c.available);
//             socket.emit('availableControllers', availableControllers);
//         } else if (data.role === 'controller') {
//             // controllers.set(socket.id, { id: socket.id, name: data.name, available: true });
//             controllers.set(socket.id, { id: socket.id, name: data.name, available: true });
//             controllers.get(socket.id).posY = 0.5;
//             console.log(Array.from(controllers.entries()));
//             console.log(`Controller registered: ${data.name} with socket ID ${socket.id}`);
//             // Update all clients about available controllers
//             const updatedControllers = Array.from(controllers.values()).filter(c => c.available);
//             io.to('clients').emit('availableControllers', updatedControllers);
//         }
//     });

//     // 1) join the pong room (controller or viewer)
//   socket.on('joinPong', ({ roomId, role }) => {
//     socket.join(roomId);
//     if (!pongGames.has(roomId)) {
//       pongGames.set(roomId, {
//         players: {},
//         ball:    { x:0.5, y:0.5, vx: 0.005, vy: 0.005 },
//         scores:  { left:0, right:0 },
//         loop:    null
//       });
//     }
//     const game = pongGames.get(roomId);

//     if (role === 'controller') {
//       // slot controllers in left (first) or right (second)
//       const count = Object.keys(game.players).length;
//       if (count < 2) {
//         game.players[socket.id] = {
//           x: count === 0 ? 0.05 : 0.95,
//           y: 0.5
//         };
//       }
//     } else if (role === 'client') {
//       // the game‐viewer will receive init and updates
//       socket.emit('init', { id: socket.id });
//     }

//     // once two controllers are in, start the loop
//     if (Object.keys(game.players).length === 2) {
//       startPongLoop(roomId);
//     }
//   });

//   // 2) controller movement updates
//   socket.on('movePong', ({ roomId, x, y }) => {
//     const game = pongGames.get(roomId);
//     if (!game || !game.players[socket.id]) return;
//     game.players[socket.id].x = x;
//     game.players[socket.id].y = y;
//     // (optional) you could emit updatePlayers immediately here,
//     // but our loop will broadcast 60×/s anyway.
//   });

//     // socket.on('pingPong', (data) => {
//     //     const controller = controllers.get(socket.id);
//     //     if (!controller) return;
//     //     controller.posY = data.posY;
//     //     console.log(Array.from(controllers.entries()));
//     // })

//     socket.on('selectController', (controllerId) => {
//         const controller = controllers.get(controllerId);
//         if (controller && controller.available) {
//             controller.available = false;
//             controllers.set(controllerId, controller);
//             clientControllerMap.set(socket.id, controllerId);
//             controllerClientMap.set(controllerId, socket.id);

//             console.log(`Controller ${controller.name} (${controllerId}) has been selected by client ${socket.id}`);
//             io.to('clients').emit('availableControllers', Array.from(controllers.values()).filter(c => c.available));
//             socket.join(controllerId);
//         }
//     });

//     socket.on('deselectController', (controllerId) => {
//       const clientId = socket.id;
//       const controller = controllers.get(controllerId);
  
//       if (controller && clientId) {
//           console.log(`Client ${clientId} is deselecting controller ${controllerId}.`);
  
//           // Mark the controller as available again
//           controller.available = true;
//           controllers.set(controllerId, controller);
  
//           // Remove the mapping from the maps
//           clientControllerMap.delete(clientId);
//           controllerClientMap.delete(controllerId);
  
//           // Notify the client that the controller has been deselected
//           io.to(clientId).emit('controllerDeselected', { controllerId: controllerId });
//           console.log(`Notified client ${clientId} that controller ${controllerId} has been deselected.`);
  
//           // Update all clients with the new list of available controllers
//           const availableControllers = Array.from(controllers.values()).filter(c => c.available);
//           io.to('clients').emit('availableControllers', availableControllers);
//           console.log(`Updated all clients with new available controllers after controller ${controllerId} was deselected.`);
//       } else {
//           console.log(`Failed to deselect controller ${controllerId} by client ${clientId}: controller or client ID may not be correct.`);
//       }
//     });

//     socket.on('messageFromController', (message) => {
//         const controllerId = socket.id;
//         const clientId = controllerClientMap.get(controllerId);
//         if (clientId) {
//             console.log(`Forwarding message from controller ${socket.id} to client ${clientId}:`, message);
//             // io.to(clientId).emit('controllerMessage', { payload: message });
//             io.emit('controllerMessage', { payload: message });
//         }
//     });

//     socket.on('disconnect', () => {
//       console.log(`Socket ${socket.id} has disconnected.`);
  
//       // Check if the disconnecting socket is a controller
//       const clientId = controllerClientMap.get(socket.id); // Get client associated with this controller
//       if (clientId) {
//           console.log(`Controller ${socket.id} disconnected, was connected to client ${clientId}.`);
//           // Notify the client that the controller has disconnected
//           io.to(clientId).emit('controllerDisconnected', { controllerId: socket.id });
//           console.log(`Notified client ${clientId} of controller ${socket.id} disconnection.`);
//           // Make the controller available again
//           if (controllers.has(socket.id)) {
//               const controller = controllers.get(socket.id);
//               controller.available = true;
//               controllers.set(socket.id, controller);
//               console.log(`Controller ${socket.id} set to available.`);
//           }
//           // Update the clients about available controllers
//           const availableControllers = Array.from(controllers.values()).filter(c => c.available);
//           io.to('clients').emit('availableControllers', availableControllers);
//           console.log(`Updated all clients with new available controllers.`);
//           // Clean up the maps
//           clientControllerMap.delete(clientId);
//           controllerClientMap.delete(socket.id);
//           console.log(`Cleared mappings for controller ${socket.id}.`);
//       }
  
//       // Check if the disconnecting socket is a client
//       const controllerId = clientControllerMap.get(socket.id); // Get controller associated with this client
//       if (controllerId) {
//           console.log(`Client ${socket.id} disconnected, was controlling ${controllerId}.`);
//           // Make the controller available again
//           if (controllers.has(controllerId)) {
//               const controller = controllers.get(controllerId);
//               controller.available = true;
//               controllers.set(controllerId, controller);
//               console.log(`Controller ${controllerId} set to available after client ${socket.id} disconnection.`);
//           }
//           // Update the clients about available controllers
//           const availableControllers = Array.from(controllers.values()).filter(c => c.available);
//           io.to('clients').emit('availableControllers', availableControllers);
//           console.log(`Updated all clients with new available controllers post-client disconnection.`);
//           // Clean up the maps
//           clientControllerMap.delete(socket.id);
//           controllerClientMap.delete(controllerId);
//           console.log(`Cleared mappings for client ${socket.id}.`);
//       }
  
//       // If the socket is a controller itself
//       if (controllers.has(socket.id)) {
//           console.log(`Direct controller ${socket.id} disconnected and removed from controllers.`);
//           controllers.delete(socket.id);
//           const availableControllers = Array.from(controllers.values()).filter(c => c.available);
//           io.to('clients').emit('availableControllers', availableControllers);
//           console.log(`Updated all clients with new available controllers after removing controller ${socket.id}.`);
//       }
//     });
  
  
// });

// // const PORT = 8125;
// const PORT = 3000;
// server.listen(PORT, () => {
//     console.log(`Socket.IO server is running on http://localhost:${PORT}`);
// });



// // server.js
// // server.js
const http = require('http');
const { Server } = require("socket.io");

// ——— HTTP + Socket.IO setup ———
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Socket.IO server');
});
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

// ——— Controller/Client maps for other games ———
const controllers         = new Map(); // socketId → { id, name, available }
const clientControllerMap = new Map(); // clientSocketId → controllerSocketId
const controllerClientMap = new Map(); // controllerSocketId → clientSocketId

// ——— Pong game state & physics loop ———
const pongGames = new Map();  // roomId → { players, ball, scores, loop, restartReady, countdownStarted }

function updateBallPhysics(game) {
  const { ball, players, scores } = game;
  // move
  ball.x += ball.vx;
  ball.y += ball.vy;
  // bounce top/bottom at ball edge
  const r = 0.02;
  if (ball.y <= r) {
    ball.y = r;
    ball.vy *= -1;
  } else if (ball.y >= 1 - r) {
    ball.y = 1 - r;
    ball.vy *= -1;
  }
  // paddle collisions
  const ids = Object.keys(players);
  if (ids.length === 2) {
    const [l, rt] = ids;
    const left  = players[l];
    const right = players[rt];
    const pw = 0.02, ph = 0.2;
    if (ball.x <= left.x + pw && Math.abs(ball.y - left.y) <= ph/2) {
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x >= right.x - pw && Math.abs(ball.y - right.y) <= ph/2) {
      ball.vx = -Math.abs(ball.vx);
    }
  }
  // scoring & reset center
  if (ball.x <= 0) {
    scores.right++;
    ball.x = ball.y = 0.5;
  } else if (ball.x >= 1) {
    scores.left++;
    ball.x = ball.y = 0.5;
  }
}

function startPongLoop(roomId) {
  const game = pongGames.get(roomId);
  if (game.loop) return;
  game.loop = setInterval(() => {
    updateBallPhysics(game);
    // check game over
    if (game.scores.left >= 10 || game.scores.right >= 10) {
      const winner = game.scores.left >= 10 ? 'left' : 'right';
      io.to(roomId).emit('gameOver', { winner, scores: game.scores });
      clearInterval(game.loop);
      game.loop = null;
      return;
    }
    // broadcast updates
    io.to(roomId).emit('updatePlayers', game.players);
    io.to(roomId).emit('updateBall',    game.ball);
    io.to(roomId).emit('scoreUpdate',   game.scores);
  }, 1000/60);
}

function startCountdown(roomId) {
  const game = pongGames.get(roomId);
  if (!game || game.countdownStarted) return;
  game.countdownStarted = true;
  const countdownSeconds = 3;
  for (let i = 0; i < countdownSeconds; i++) {
    setTimeout(() => {
      const tick = countdownSeconds - i;
      io.to(roomId).emit('countdown', { tick }); // clients can display tick
    }, i * 1000);
  }
  // after countdown, start the loop and send a 'start' signal
  setTimeout(() => {
    io.to(roomId).emit('countdown', { tick: 0 });
    startPongLoop(roomId);
  }, countdownSeconds * 1000);
}

// ——— Connection & event handlers ———
io.on('connection', socket => {
  console.log('Socket connected:', socket.id);

  // — Existing controller/client handlers —
  socket.on('register', data => {
    if (data.role === 'client') {
      socket.join('clients');
      const available = Array.from(controllers.values()).filter(c => c.available);
      socket.emit('availableControllers', available);
    } else if (data.role === 'controller') {
      controllers.set(socket.id, {
        id: socket.id,
        name: data.name,
        available: true
      });
      controllers.get(socket.id).posY = 0.5;
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
    }
  });

  socket.on('selectController', controllerId => {
    const ctrl = controllers.get(controllerId);
    if (ctrl && ctrl.available) {
      ctrl.available = false;
      controllers.set(controllerId, ctrl);
      clientControllerMap.set(socket.id, controllerId);
      controllerClientMap.set(controllerId, socket.id);
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
      socket.join(controllerId);
    }
  });

  socket.on('deselectController', controllerId => {
    const clientId = socket.id;
    const ctrl = controllers.get(controllerId);
    if (ctrl) {
      ctrl.available = true;
      controllers.set(controllerId, ctrl);
      clientControllerMap.delete(clientId);
      controllerClientMap.delete(controllerId);
      io.to(clientId).emit('controllerDeselected', { controllerId });
      const available = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', available);
    }
  });

  socket.on('messageFromController', message => {
    const clientId = controllerClientMap.get(socket.id);
    if (clientId) {
      io.to(clientId).emit('controllerMessage', { payload: message });
    }
  });

  // — Pong: join a game room —
  socket.on('joinPong', ({ roomId, role }) => {
    socket.join(roomId);
    if (!pongGames.has(roomId)) {
      pongGames.set(roomId, {
        players:       {},
        ball:          { x:0.5, y:0.5, vx:0.005, vy:0.005 },
        scores:        { left:0, right:0 },
        loop:          null,
        restartReady:  new Set(),
        countdownStarted: false
      });
    }
    const game = pongGames.get(roomId);
    if (role === 'controller') {
      const count = Object.keys(game.players).length;
      if (count < 2) {
        game.players[socket.id] = {
          x: count === 0 ? 0.05 : 0.95,
          y: 0.5
        };
      }
    }
    // emit initial state
    io.to(roomId).emit('updatePlayers', game.players);
    io.to(roomId).emit('updateBall',    game.ball);
    io.to(roomId).emit('scoreUpdate',   game.scores);

    // when two controllers are present, start countdown
    if (Object.keys(game.players).length === 2) {
      startCountdown(roomId);
    }
  });

  // — Pong: paddle movement —
  socket.on('movePong', ({ roomId, x, y }) => {
    const game = pongGames.get(roomId);
    if (game && game.players[socket.id]) {
      game.players[socket.id].x = x;
      game.players[socket.id].y = y;
    }
  });

// inside your io.on('connection', socket => { … })

socket.on('restartPong', ({ roomId }) => {
    const game = pongGames.get(roomId);
    if (!game) return;
  
    game.restartReady.add(socket.id);
    const totalPlayers = Object.keys(game.players).length;
  
    // First player to press R: reset _only_ their view, then ask them to wait
    if (game.restartReady.size === 1) {
      game.scores = { left: 0, right: 0 };
      game.ball   = { x: 0.5, y: 0.5, vx: 0.005, vy: 0.005 };
  
      // send reset _only_ to this socket
      socket.emit('updatePlayers', game.players);
      socket.emit('updateBall',    game.ball);
      socket.emit('scoreUpdate',   game.scores);
  
      // tell them to wait for the opponent
      socket.emit('waitingForRestart');
      return;
    }
  
    // Once both have pressed: full reset for everyone and restart countdown
    if (game.restartReady.size === totalPlayers && totalPlayers === 2) {
      game.restartReady.clear();
      game.scores = { left: 0, right: 0 };
      game.ball   = { x: 0.5, y: 0.5, vx: 0.005, vy: 0.005 };
      io.to(roomId).emit('updatePlayers', game.players);
      io.to(roomId).emit('updateBall',    game.ball);
      io.to(roomId).emit('scoreUpdate',   game.scores);
  
      game.countdownStarted = false;
      startCountdown(roomId);
    }
  });
  

  // — Disconnect handler (Pong + controllers) —
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);

    // Pong cleanup
    for (const [roomId, game] of pongGames.entries()) {
      if (socket.id in game.players) {
        delete game.players[socket.id];
        game.restartReady.delete(socket.id);
        if (game.loop) {
          clearInterval(game.loop);
          game.loop = null;
        }
        const remaining = Object.keys(game.players);
        if (remaining.length === 1) {
          const winnerSide = game.players[remaining[0]].x < 0.5 ? 'left' : 'right';
          io.to(roomId).emit('gameOver', { winner: winnerSide, scores: game.scores });
        } else if (remaining.length === 0) {
          pongGames.delete(roomId);
        }
      }
    }

    // Controller/client cleanup
    const clientId = controllerClientMap.get(socket.id);
    if (clientId) {
      io.to(clientId).emit('controllerDisconnected', { controllerId: socket.id });
      const ctrl = controllers.get(socket.id);
      if (ctrl) {
        ctrl.available = true;
        controllers.set(socket.id, ctrl);
      }
      const avail = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', avail);
      controllerClientMap.delete(socket.id);
      clientControllerMap.delete(clientId);
    }
    const controllerId = clientControllerMap.get(socket.id);
    if (controllerId) {
      const ctrl = controllers.get(controllerId);
      if (ctrl) {
        ctrl.available = true;
        controllers.set(controllerId, ctrl);
      }
      const avail = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', avail);
      clientControllerMap.delete(socket.id);
      controllerClientMap.delete(controllerId);
    }
    if (controllers.has(socket.id)) {
      controllers.delete(socket.id);
      const avail = Array.from(controllers.values()).filter(c => c.available);
      io.to('clients').emit('availableControllers', avail);
    }
  });
});

// — Start server —
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
