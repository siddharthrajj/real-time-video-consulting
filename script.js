const DOCTORS = [
  { id: 1, name: "Dr. Ananya Rao",   spec: "General Physician", exp: "9 yrs exp", rating: "4.8", slots: ["10:00 AM", "11:30 AM", "4:00 PM", "5:30 PM"] },
  { id: 2, name: "Dr. Vikram Mehta", spec: "Dermatologist",     exp: "6 yrs exp", rating: "4.6", slots: ["9:30 AM", "1:00 PM", "3:00 PM"] },
  { id: 3, name: "Dr. Sana Iqbal",   spec: "Pediatrician",      exp: "12 yrs exp", rating: "4.9", slots: ["10:30 AM", "12:00 PM", "6:00 PM", "7:00 PM"] },
  { id: 4, name: "Dr. Rohan Kulkarni", spec: "Cardiologist",    exp: "15 yrs exp", rating: "4.7", slots: ["11:00 AM", "2:30 PM"] },
];

// ---------- App state (in-memory only, no localStorage) ----------
const state = {
  user: null,            // { name, email, role }
  appointments: [],       // { doctor, slot }
  activeCall: null,       // { doctor }
  callSeconds: 0,
  callTimerInterval: null,
  localStream: null,
  micOn: true,
  camOn: true,
  selectedSlot: null,
  bookingDoctor: null,
};

// ---------- Element refs ----------
const el = (id) => document.getElementById(id);

const loginScreen   = el("login-screen");
const app           = el("app");
const loginForm     = el("login-form");
const roleButtons   = document.querySelectorAll(".role-toggle__btn");

let selectedRole = "patient";

// ============================================================
// LOGIN
// ============================================================
roleButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roleButtons.forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-checked", "false"); });
    btn.classList.add("is-active");
    btn.setAttribute("aria-checked", "true");
    selectedRole = btn.dataset.role;
  });
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = el("name-input").value.trim();
  const email = el("email-input").value.trim();
  if (!name || !email) return;

  state.user = { name, email, role: selectedRole };

  el("user-name").textContent = name;
  el("user-role").textContent = selectedRole;
  el("user-avatar").textContent = name.charAt(0).toUpperCase();

  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");

  renderDoctorList();
});

el("logout-btn").addEventListener("click", () => {
  endCall(); // safety: hang up if mid-call
  state.user = null;
  state.appointments = [];
  loginForm.reset();
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll(".sidebar__link").forEach(link => {
  link.addEventListener("click", () => {
    if (link.disabled) return;
    switchView(link.dataset.view);
  });
});

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll(".sidebar__link").forEach(l => l.classList.remove("is-active"));
  el(`view-${viewName}`).classList.remove("hidden");
  const navBtn = document.querySelector(`.sidebar__link[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add("is-active");
}

// ============================================================
// DOCTOR LIST + BOOKING
// ============================================================
function renderDoctorList() {
  const container = el("doctor-list");
  container.innerHTML = "";
  DOCTORS.forEach(doc => {
    const row = document.createElement("div");
    row.className = "doctor-row";
    row.innerHTML = `
      <div class="doctor-row__avatar">${initials(doc.name)}</div>
      <div class="doctor-row__info">
        <div class="doctor-row__name">${doc.name}</div>
        <div class="doctor-row__spec">${doc.spec}</div>
        <div class="doctor-row__meta">
          <span>${doc.exp}</span>
          <span class="doctor-row__badge">★ ${doc.rating}</span>
        </div>
      </div>
      <button class="btn btn--primary" data-doc-id="${doc.id}">Book slot</button>
    `;
    row.querySelector("button").addEventListener("click", () => openBookingModal(doc.id));
    container.appendChild(row);
  });
}

function initials(name) {
  return name.replace("Dr. ", "").split(" ").map(w => w[0]).slice(0, 2).join("");
}

const modal = el("booking-modal");

function openBookingModal(docId) {
  const doc = DOCTORS.find(d => d.id === docId);
  state.bookingDoctor = doc;
  state.selectedSlot = null;

  el("modal-doctor-name").textContent = `Book with ${doc.name}`;
  el("modal-doctor-spec").textContent = `${doc.spec} · ${doc.exp}`;

  const grid = el("slot-grid");
  grid.innerHTML = "";
  doc.slots.forEach(slot => {
    const btn = document.createElement("button");
    btn.className = "slot-btn";
    btn.type = "button";
    btn.textContent = slot;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      state.selectedSlot = slot;
      el("confirm-booking").disabled = false;
    });
    grid.appendChild(btn);
  });

  el("confirm-booking").disabled = true;
  modal.classList.remove("hidden");
}

el("modal-close").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

el("confirm-booking").addEventListener("click", () => {
  if (!state.selectedSlot || !state.bookingDoctor) return;
  state.appointments.push({ doctor: state.bookingDoctor, slot: state.selectedSlot });
  renderAppointments();
  modal.classList.add("hidden");
  startCall(state.bookingDoctor);
});

// ============================================================
// APPOINTMENTS
// ============================================================
function renderAppointments() {
  const container = el("appointment-list");
  if (state.appointments.length === 0) {
    container.innerHTML = `<p class="empty-state">No appointments booked yet. Go to Dashboard to book one.</p>`;
    return;
  }
  container.innerHTML = "";
  state.appointments.forEach(appt => {
    const card = document.createElement("div");
    card.className = "appointment-card";
    card.innerHTML = `
      <div>
        <div style="font-weight:600">${appt.doctor.name}</div>
        <div class="appointment-card__slot">${appt.doctor.spec} · Today, ${appt.slot}</div>
      </div>
      <button class="btn btn--accent">Join call</button>
    `;
    card.querySelector("button").addEventListener("click", () => startCall(appt.doctor));
    container.appendChild(card);
  });
}

// ============================================================
// VIDEO CALL
// ============================================================
async function startCall(doctor) {
  state.activeCall = { doctor };
  el("nav-call").disabled = false;
  el("call-with-name").textContent = doctor.name;
  el("remote-label").textContent = doctor.name;
  el("remote-status-text").textContent = "Connecting…";
  el("chat-messages").innerHTML = "";
  seedChat(doctor);

  switchView("call");

  // Start local camera preview
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    el("local-video").srcObject = state.localStream;
  } catch (err) {
    console.warn("Camera/mic not available:", err);
    el("local-video").replaceWith(Object.assign(document.createElement("div"), {
      className: "call__local-fallback",
      textContent: "Camera unavailable",
      style: "color:#BFE0D8;font-size:.8rem;display:flex;align-items:center;justify-content:center;height:100%;"
    }));
  }

  // Simulate the remote peer connecting (in a real app this fires when
  // the Socket.io signaling exchange + WebRTC ICE connection completes)
  setTimeout(() => {
    el("remote-status-text").textContent = `${doctor.name} has joined`;
  }, 1600);

  // Call timer
  state.callSeconds = 0;
  el("call-timer").textContent = "00:00";
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const m = String(Math.floor(state.callSeconds / 60)).padStart(2, "0");
    const s = String(state.callSeconds % 60).padStart(2, "0");
    el("call-timer").textContent = `${m}:${s}`;
  }, 1000);
}

function endCall() {
  if (state.callTimerInterval) clearInterval(state.callTimerInterval);
  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  state.activeCall = null;
  el("nav-call").disabled = true;
  switchView("dashboard");
}

el("end-call").addEventListener("click", endCall);

el("toggle-mic").addEventListener("click", () => {
  state.micOn = !state.micOn;
  if (state.localStream) state.localStream.getAudioTracks().forEach(t => t.enabled = state.micOn);
  el("toggle-mic").classList.toggle("is-off", !state.micOn);
  el("toggle-mic").textContent = state.micOn ? "🎤" : "🔇";
});

el("toggle-cam").addEventListener("click", () => {
  state.camOn = !state.camOn;
  if (state.localStream) state.localStream.getVideoTracks().forEach(t => t.enabled = state.camOn);
  el("toggle-cam").classList.toggle("is-off", !state.camOn);
});

// ============================================================
// CHAT (simulated real-time — swap for Socket.io in production)
// ============================================================
const DOCTOR_AUTOREPLIES = [
  "I can see you now — how are you feeling today?",
  "Noted, thank you for sharing that.",
  "Let's go over your symptoms in a bit more detail.",
  "I'll add that to your consultation notes.",
];
let replyIndex = 0;

function seedChat(doctor) {
  addMessage("them", `Hi, this is ${doctor.name}. I'll be with you in just a moment.`);
}

function addMessage(sender, text) {
  const wrap = el("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `msg ${sender === "me" ? "msg--me" : "msg--them"}`;
  bubble.textContent = text;
  wrap.appendChild(bubble);
  wrap.scrollTop = wrap.scrollHeight;
}

el("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = el("chat-input");
  const text = input.value.trim();
  if (!text) return;
  addMessage("me", text);
  input.value = "";

  // Simulate the doctor's real-time reply
  const typing = el("typing-indicator");
  typing.classList.remove("hidden");
  setTimeout(() => {
    typing.classList.add("hidden");
    const reply = DOCTOR_AUTOREPLIES[replyIndex % DOCTOR_AUTOREPLIES.length];
    replyIndex++;
    addMessage("them", reply);
  }, 1200 + Math.random() * 800);
});