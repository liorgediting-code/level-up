const btn = document.getElementById("grant");
const status = document.getElementById("status");

async function check() {
  try {
    const p = await navigator.permissions.query({ name: "microphone" });
    if (p.state === "granted") {
      status.textContent = "המיקרופון כבר מאושר. אפשר לסגור את החלון.";
      status.className = "ok";
      btn.disabled = true;
    }
  } catch {}
}

btn.addEventListener("click", async () => {
  status.textContent = "";
  status.className = "";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = "הרשאה ניתנה ✓ אפשר לסגור את החלון.";
    status.className = "ok";
    btn.disabled = true;
  } catch (e) {
    status.textContent = "ההרשאה נדחתה: " + (e && e.message ? e.message : e);
    status.className = "err";
  }
});

check();
