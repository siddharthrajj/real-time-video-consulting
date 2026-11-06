/* ==========================================================
   Arogya Connect — backend
   - Serves the frontend (public/) as static files
   - Socket.io handles:
       1. Chat relay between the two people in a consultation room
       2. WebRTC signaling relay (offer / answer / ICE candidates)
   The server never touches video/audio itself — it only passes
   small signaling messages so the two browsers can set up a direct
   peer-to-peer WebRTC connection.
   ========================================================== */

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }, // demo only — restrict this to your real frontend domain in production
});

app.use(express.static(path.join(__dirname, "public")));

// simple in-memory count, just for server-side logging (no DB needed for this demo)
const roomCounts = {};

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ---- Join a consultation room ----
  socket.on("join-room", ({ roomId, name, role }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;
    socket.data.role = role;

    roomCounts[roomId] = (roomCounts[roomId] || 0) + 1;
    console.log(`[join] ${name} (${role}) -> ${roomId}  [${roomCounts[roomId]} in room]`);

    const room = io.sockets.adapter.rooms.get(roomId);
    const othersAlreadyPresent = room ? room.size - 1 : 0;

    if (othersAlreadyPresent > 0) {
      // Someone was already waiting in this room — tell THEM a peer joined.
      // The one who was already here becomes the WebRTC "offerer".
      socket.to(roomId).emit("peer-joined", { name, role });
    }
  });

  // ---- WebRTC signaling relay (server just forwards these, untouched) ----
  socket.on("webrtc-offer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("webrtc-offer", { sdp });
  });

  socket.on("webrtc-answer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("webrtc-answer", { sdp });
  });

  socket.on("webrtc-ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice-candidate", { candidate });
  });

  // ---- Chat relay ----
  socket.on("chat-message", ({ roomId, text, senderName }) => {
    socket.to(roomId).emit("chat-message", { text, senderName });
  });

  socket.on("typing-start", ({ roomId }) => socket.to(roomId).emit("typing-start"));
  socket.on("typing-stop", ({ roomId }) => socket.to(roomId).emit("typing-stop"));

  // ---- Leaving ----
  socket.on("leave-room", () => leaveCurrentRoom(socket));

  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  if (roomCounts[roomId]) roomCounts[roomId] = Math.max(0, roomCounts[roomId] - 1);
  socket.to(roomId).emit("peer-left");
  socket.leave(roomId);
  socket.data.roomId = null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Arogya Connect server running at http://localhost:${PORT}\n`);
});
