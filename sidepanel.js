const MAX_HISTORY = 25;
// BACKEND_URL comes from config.js

const els = {
  authView: document.getElementById("authView"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authError: document.getElementById("authError"),
  rememberMeCheckbox: document.getElementById("rememberMeCheckbox"),
  forgotPasswordLink: document.getElementById("forgotPasswordLink"),
  forgotPasswordView: document.getElementById("forgotPasswordView"),
  forgotStepRequest: document.getElementById("forgotStepRequest"),
  forgotStepReset: document.getElementById("forgotStepReset"),
  forgotEmail: document.getElementById("forgotEmail"),
  sendResetCodeBtn: document.getElementById("sendResetCodeBtn"),
  resetCodeInput: document.getElementById("resetCodeInput"),
  resetNewPassword: document.getElementById("resetNewPassword"),
  submitResetBtn: document.getElementById("submitResetBtn"),
  backToSignInLink: document.getElementById("backToSignInLink"),
  forgotError: document.getElementById("forgotError"),
  forgotSuccess: document.getElementById("forgotSuccess"),
  tabSignIn: document.getElementById("tabSignIn"),
  tabSignUp: document.getElementById("tabSignUp"),
  appHeader: document.getElementById("appHeader"),
  appMain: document.getElementById("appMain"),
  userEmailLabel: document.getElementById("userEmailLabel"),
  creditBalanceLabel: document.getElementById("creditBalanceLabel"),
  buyTokensBtn: document.getElementById("buyTokensBtn"),
  keyBanner: document.getElementById("keyBanner"),
  openSettingsLink: document.getElementById("openSettingsLink"),
  settingsBtn: document.getElementById("settingsBtn"),
  inputView: document.getElementById("inputView"),
  loadingView: document.getElementById("loadingView"),
  resultView: document.getElementById("resultView"),
  accountView: document.getElementById("accountView"),
  historySection: document.getElementById("historySection"),
  acctBackBtn: document.getElementById("acctBackBtn"),
  acctMenu: document.getElementById("acctMenu"),
  acctSignOutBtn: document.getElementById("acctSignOutBtn"),
  acctPanelChangeEmail: document.getElementById("acctPanelChangeEmail"),
  acctPanelChangePassword: document.getElementById("acctPanelChangePassword"),
  acctPanelUpgrade: document.getElementById("acctPanelUpgrade"),
  acctPanelBilling: document.getElementById("acctPanelBilling"),
  planList: document.getElementById("planList"),
  acctPlansError: document.getElementById("acctPlansError"),
  newEmailInput: document.getElementById("newEmailInput"),
  newEmailPassword: document.getElementById("newEmailPassword"),
  submitEmailChangeBtn: document.getElementById("submitEmailChangeBtn"),
  acctEmailError: document.getElementById("acctEmailError"),
  acctEmailSuccess: document.getElementById("acctEmailSuccess"),
  currentPasswordInput: document.getElementById("currentPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  submitPasswordChangeBtn: document.getElementById("submitPasswordChangeBtn"),
  acctPasswordError: document.getElementById("acctPasswordError"),
  acctPasswordSuccess: document.getElementById("acctPasswordSuccess"),
  callContext: document.getElementById("callContext"),
  transcriptInput: document.getElementById("transcriptInput"),
  dropZone: document.getElementById("dropZone"),
  dropOverlay: document.getElementById("dropOverlay"),
  fileInput: document.getElementById("fileInput"),
  attachBtn: document.getElementById("attachBtn"),
  gradeBtn: document.getElementById("gradeBtn"),
  clearBtn: document.getElementById("clearBtn"),
  backBtn: document.getElementById("backBtn"),
  errorBox: document.getElementById("errorBox"),
  resultOutput: document.getElementById("resultOutput"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
};

function showView(name) {
  els.inputView.classList.toggle("hidden", name !== "input");
  els.loadingView.classList.toggle("hidden", name !== "loading");
  els.resultView.classList.toggle("hidden", name !== "result");
  els.accountView.classList.toggle("hidden", name !== "account");
  els.historySection.classList.toggle("hidden", name === "account");
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove("hidden");
}

function clearError() {
  els.errorBox.classList.add("hidden");
  els.errorBox.textContent = "";
}

// Minimal markdown -> HTML renderer, enough for headers/bold/lists/paragraphs.
function renderMarkdown(md) {
  const escapeHtml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inline = (s) => {
    s = escapeHtml(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
    return s;
  };

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null; // 'ul' | 'ol' | null

  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      closeList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inline(headingMatch[2])}</h${level}>`;
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${inline(bulletMatch[1])}</li>`;
      continue;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${inline(numberedMatch[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function updateCreditUI(user) {
  const tokens = user.credit_balance_tokens || 0;
  els.creditBalanceLabel.textContent = `${tokens.toLocaleString()} tokens`;
  els.keyBanner.classList.toggle("hidden", tokens > 0);
}

async function getHistory() {
  const { history } = await chrome.storage.local.get("history");
  return history || [];
}

async function saveHistoryEntry(entry) {
  const history = await getHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  await chrome.storage.local.set({ history });
  renderHistory(history);
}

async function renameHistoryEntry(timestamp, newName) {
  const history = await getHistory();
  const entry = history.find((h) => h.timestamp === timestamp);
  if (entry) entry.name = newName;
  await chrome.storage.local.set({ history });
  return history;
}

function startRenamingEntry(entry, row, nameEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "history-rename-input";
  input.value = entry.name || entry.preview;

  let settled = false;

  const commit = async () => {
    if (settled) return;
    settled = true;
    const newName = input.value.trim() || entry.preview;
    const history = await renameHistoryEntry(entry.timestamp, newName);
    renderHistory(history);
  };

  const cancel = async () => {
    if (settled) return;
    settled = true;
    renderHistory(await getHistory());
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
  input.addEventListener("click", (e) => e.stopPropagation());

  row.replaceChild(input, nameEl);
  input.focus();
  input.select();
}

function renderHistory(history) {
  els.historyList.innerHTML = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.style.cursor = "default";
    li.style.background = "transparent";
    li.style.border = "none";
    li.textContent = "No graded calls yet.";
    els.historyList.appendChild(li);
    return;
  }
  for (const entry of history) {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.className = "history-row";

    const nameEl = document.createElement("span");
    nameEl.className = "history-preview";
    nameEl.textContent = entry.name || entry.preview;
    nameEl.addEventListener("click", () => {
      els.resultOutput.innerHTML = renderMarkdown(entry.output);
      showView("result");
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "history-edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Rename";
    editBtn.setAttribute("aria-label", "Rename this call");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRenamingEntry(entry, row, nameEl);
    });

    row.appendChild(nameEl);
    row.appendChild(editBtn);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${entry.grade || ""} · ${new Date(entry.timestamp).toLocaleString()}`;

    li.appendChild(row);
    li.appendChild(meta);
    els.historyList.appendChild(li);
  }
}

function extractGradeLabel(text) {
  const match = text.match(/Grade[:\s\-]*\**\s*([A-F][+-]?)/i);
  return match ? `Grade ${match[1]}` : "";
}

async function gradeTranscript() {
  clearError();
  const transcript = els.transcriptInput.value.trim();
  if (!transcript) {
    showError("Paste a transcript first.");
    return;
  }

  const { token } = await getStoredAuth();
  showView("loading");

  const context = els.callContext.value.trim();

  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ call_context: context, transcript }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error (${response.status})`);
    }

    if (data.user) {
      await setStoredAuth(token, data.user);
      updateCreditUI(data.user);
    }

    els.resultOutput.innerHTML = renderMarkdown(data.output);
    showView("result");

    await saveHistoryEntry({
      timestamp: Date.now(),
      preview: transcript.slice(0, 80).replace(/\s+/g, " "),
      output: data.output,
      grade: extractGradeLabel(data.output),
    });
  } catch (err) {
    showView("input");
    showError(
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message
    );
  }
}

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".webm"];

function looksLikeAudio(file) {
  if (file.type && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) return true;
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function loadTranscriptFile(file) {
  clearError();

  if (looksLikeAudio(file)) {
    showError(
      `"${file.name}" is an audio/video file — this only accepts text transcripts for now (.txt, .md, .srt, .vtt). Transcribe the recording first, then drop the text in.`
    );
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    let text = String(reader.result || "");
    // Strip basic .srt/.vtt timestamp/index cruft so it reads as plain dialogue.
    if (/\.(srt|vtt)$/i.test(file.name)) {
      text = text
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          if (t === "WEBVTT") return false;
          if (/^\d+$/.test(t)) return false;
          if (/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(t)) return false;
          return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    els.transcriptInput.value = text;
  };
  reader.onerror = () => {
    showError(`Couldn't read "${file.name}".`);
  };
  reader.readAsText(file);
}

["dragenter", "dragover"].forEach((evt) => {
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropZone.classList.add("dragging");
    els.dropOverlay.classList.remove("hidden");
  });
});

["dragleave", "dragend"].forEach((evt) => {
  els.dropZone.addEventListener(evt, (e) => {
    if (evt === "dragleave" && els.dropZone.contains(e.relatedTarget)) return;
    els.dropZone.classList.remove("dragging");
    els.dropOverlay.classList.add("hidden");
  });
});

els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  els.dropZone.classList.remove("dragging");
  els.dropOverlay.classList.add("hidden");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadTranscriptFile(file);
});

els.attachBtn.addEventListener("click", () => {
  els.fileInput.click();
});

els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (file) loadTranscriptFile(file);
  els.fileInput.value = "";
});

els.gradeBtn.addEventListener("click", gradeTranscript);

els.clearBtn.addEventListener("click", () => {
  els.transcriptInput.value = "";
  els.callContext.value = "";
  clearError();
});

els.backBtn.addEventListener("click", () => {
  showView("input");
});

els.settingsBtn.addEventListener("click", () => {
  showAccountMenu();
});

els.openSettingsLink.addEventListener("click", (e) => {
  e.preventDefault();
  loadAndShowUpgradePanel();
});

els.buyTokensBtn.addEventListener("click", () => {
  loadAndShowUpgradePanel();
});

els.clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
});

// --- Auth ---

let authMode = "signin"; // 'signin' | 'signup'

async function getStoredAuth() {
  const { authToken, authUser } = await chrome.storage.local.get(["authToken", "authUser"]);
  return { token: authToken || null, user: authUser || null };
}

async function setStoredAuth(token, user) {
  await chrome.storage.local.set({ authToken: token, authUser: user });
}

async function clearStoredAuth() {
  await chrome.storage.local.remove(["authToken", "authUser"]);
}

async function getRememberedEmail() {
  const { rememberedEmail } = await chrome.storage.local.get("rememberedEmail");
  return rememberedEmail || "";
}

async function setRememberedEmail(email) {
  if (email) {
    await chrome.storage.local.set({ rememberedEmail: email });
  } else {
    await chrome.storage.local.remove("rememberedEmail");
  }
}

async function showAuthView() {
  els.authView.classList.remove("hidden");
  els.appHeader.classList.add("hidden");
  els.appMain.classList.add("hidden");
  showSignInForm();

  const remembered = await getRememberedEmail();
  if (remembered) {
    els.authEmail.value = remembered;
    els.rememberMeCheckbox.checked = true;
  }
}

async function showAppView(user) {
  els.authView.classList.add("hidden");
  els.appHeader.classList.remove("hidden");
  els.appMain.classList.remove("hidden");
  els.userEmailLabel.textContent = user.email;
  updateCreditUI(user);

  renderHistory(await getHistory());
  showView("input");
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignIn = mode === "signin";
  els.tabSignIn.classList.toggle("active", isSignIn);
  els.tabSignUp.classList.toggle("active", !isSignIn);
  els.authSubmitBtn.textContent = isSignIn ? "Sign In" : "Sign Up";
  els.authPassword.setAttribute("autocomplete", isSignIn ? "current-password" : "new-password");
  els.authError.classList.add("hidden");
}

function showAuthError(message) {
  els.authError.textContent = message;
  els.authError.classList.remove("hidden");
}

function showSignInForm() {
  els.authForm.classList.remove("hidden");
  els.forgotPasswordLink.classList.remove("hidden");
  els.forgotPasswordView.classList.add("hidden");
  els.forgotError.classList.add("hidden");
  els.forgotSuccess.classList.add("hidden");
}

function showForgotPasswordView() {
  els.authForm.classList.add("hidden");
  els.forgotPasswordLink.classList.add("hidden");
  els.authError.classList.add("hidden");
  els.forgotPasswordView.classList.remove("hidden");
  els.forgotStepRequest.classList.remove("hidden");
  els.forgotStepReset.classList.add("hidden");
  els.forgotError.classList.add("hidden");
  els.forgotSuccess.classList.add("hidden");
  els.forgotEmail.value = els.authEmail.value.trim();
}

function showForgotError(message) {
  els.forgotSuccess.classList.add("hidden");
  els.forgotError.textContent = message;
  els.forgotError.classList.remove("hidden");
}

function showForgotSuccess(message) {
  els.forgotError.classList.add("hidden");
  els.forgotSuccess.textContent = message;
  els.forgotSuccess.classList.remove("hidden");
}

async function sendResetCode() {
  const email = els.forgotEmail.value.trim();
  if (!email) {
    showForgotError("Enter your email first.");
    return;
  }

  els.sendResetCodeBtn.disabled = true;
  try {
    const response = await fetch(`${BACKEND_URL}/api/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");

    showForgotSuccess(data.message || "If an account exists for that email, a reset code has been sent.");
    els.forgotStepReset.classList.remove("hidden");
    els.resetCodeInput.focus();
  } catch (err) {
    showForgotError(
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message
    );
  } finally {
    els.sendResetCodeBtn.disabled = false;
  }
}

async function submitReset() {
  const email = els.forgotEmail.value.trim();
  const code = els.resetCodeInput.value.trim();
  const newPassword = els.resetNewPassword.value;

  if (!code || !newPassword) {
    showForgotError("Enter the reset code and a new password.");
    return;
  }

  els.submitResetBtn.disabled = true;
  try {
    const response = await fetch(`${BACKEND_URL}/api/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't reset password.");

    els.resetCodeInput.value = "";
    els.resetNewPassword.value = "";
    els.authEmail.value = email;
    setAuthMode("signin");
    showSignInForm();
    showAuthError("Password reset — sign in with your new password.");
  } catch (err) {
    showForgotError(
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message
    );
  } finally {
    els.submitResetBtn.disabled = false;
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  els.authError.classList.add("hidden");

  if (!email || !password) {
    showAuthError("Enter both an email and a password.");
    return;
  }

  const endpoint = authMode === "signin" ? "/api/login" : "/api/signup";
  els.authSubmitBtn.disabled = true;

  try {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    await setStoredAuth(data.token, data.user);
    await setRememberedEmail(els.rememberMeCheckbox.checked ? email : "");
    els.authPassword.value = "";
    await showAppView(data.user);
  } catch (err) {
    showAuthError(
      err.message === "Failed to fetch"
        ? "Can't reach the server. Is the backend running?"
        : err.message
    );
  } finally {
    els.authSubmitBtn.disabled = false;
  }
}

async function validateSession() {
  const { token, user } = await getStoredAuth();
  if (!token || !user) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      await clearStoredAuth();
      return null;
    }
    const data = await response.json();
    // Sliding session: the server hands back a freshly-dated token on every
    // check-in, so store it and the device effectively stays signed in.
    if (data.token) await setStoredAuth(data.token, data.user);
    return data.user;
  } catch (_err) {
    // Backend unreachable — fall back to the locally cached session rather
    // than forcing a re-login just because the server is momentarily down.
    return user;
  }
}

els.tabSignIn.addEventListener("click", () => setAuthMode("signin"));
els.tabSignUp.addEventListener("click", () => setAuthMode("signup"));
els.authForm.addEventListener("submit", handleAuthSubmit);

els.forgotPasswordLink.addEventListener("click", showForgotPasswordView);
els.backToSignInLink.addEventListener("click", showSignInForm);
els.sendResetCodeBtn.addEventListener("click", sendResetCode);
els.submitResetBtn.addEventListener("click", submitReset);

// --- Account menu ---

const acctPanels = [
  els.acctPanelChangeEmail,
  els.acctPanelChangePassword,
  els.acctPanelUpgrade,
  els.acctPanelBilling,
];

function showAccountMenu() {
  els.acctMenu.classList.remove("hidden");
  acctPanels.forEach((panel) => panel.classList.add("hidden"));
  showView("account");
}

function showAccountPanel(panel) {
  els.acctMenu.classList.add("hidden");
  acctPanels.forEach((p) => p.classList.toggle("hidden", p !== panel));
  showView("account");
}

async function signOut() {
  await clearStoredAuth();
  els.authEmail.value = "";
  els.authPassword.value = "";
  setAuthMode("signin");
  showAuthView();
}

els.acctBackBtn.addEventListener("click", () => {
  if (els.acctMenu.classList.contains("hidden")) {
    showAccountMenu();
  } else {
    showView("input");
  }
});

els.acctMenu.querySelectorAll(".acct-menu-item[data-target]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    els.acctEmailError.classList.add("hidden");
    els.acctEmailSuccess.classList.add("hidden");
    els.acctPasswordError.classList.add("hidden");
    els.acctPasswordSuccess.classList.add("hidden");

    if (target === "upgrade") {
      loadAndShowUpgradePanel();
      return;
    }
    const panelByTarget = {
      changeEmail: els.acctPanelChangeEmail,
      changePassword: els.acctPanelChangePassword,
      billing: els.acctPanelBilling,
    };
    showAccountPanel(panelByTarget[target]);
  });
});

els.acctSignOutBtn.addEventListener("click", signOut);

// --- Plans / credits ---

function renderPlanList(plans) {
  els.planList.innerHTML = "";
  for (const plan of plans) {
    const card = document.createElement("div");
    card.className = "plan-card";

    const header = document.createElement("div");
    header.className = "plan-card-header";
    const name = document.createElement("span");
    name.className = "plan-name";
    name.textContent = plan.label;
    const price = document.createElement("span");
    price.className = "plan-price";
    price.textContent = `$${plan.price_usd.toFixed(2)}`;
    header.appendChild(name);
    header.appendChild(price);

    const details = document.createElement("p");
    details.className = "plan-details";
    const callsRange =
      plan.estimated_calls_low === plan.estimated_calls_high
        ? `~${plan.estimated_calls_low}`
        : `~${plan.estimated_calls_low}–${plan.estimated_calls_high}`;
    details.textContent = `${plan.credit_tokens.toLocaleString()} tokens · ${callsRange} reviews`;

    const buyBtn = document.createElement("button");
    buyBtn.className = "plan-buy-btn";
    buyBtn.type = "button";
    buyBtn.textContent = `Buy ${plan.label}`;
    buyBtn.addEventListener("click", () => purchasePlan(plan.id, buyBtn));

    card.appendChild(header);
    card.appendChild(details);
    card.appendChild(buyBtn);
    els.planList.appendChild(card);
  }
}

async function loadAndShowUpgradePanel() {
  showAccountPanel(els.acctPanelUpgrade);
  els.acctPlansError.classList.add("hidden");
  els.planList.innerHTML = "<p class=\"empty-note\">Loading plans…</p>";

  try {
    const response = await fetch(`${BACKEND_URL}/api/plans`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't load plans.");
    renderPlanList(data.plans);
  } catch (err) {
    els.planList.innerHTML = "";
    els.acctPlansError.textContent =
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message;
    els.acctPlansError.classList.remove("hidden");
  }
}

async function purchasePlan(planId, buyBtn) {
  const { token } = await getStoredAuth();
  buyBtn.disabled = true;
  const originalLabel = buyBtn.textContent;
  buyBtn.textContent = "Redirecting…";

  try {
    const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan_id: planId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't start checkout.");

    chrome.tabs.create({ url: data.url });
    buyBtn.textContent = originalLabel;
    buyBtn.disabled = false;
  } catch (err) {
    els.acctPlansError.textContent =
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message;
    els.acctPlansError.classList.remove("hidden");
    buyBtn.textContent = originalLabel;
    buyBtn.disabled = false;
  }
}

// Refresh the balance whenever the side panel regains focus — payment
// happens in a separate tab, so this is how the new balance shows up
// without the user needing to manually reload after checking out.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  const { token, user } = await getStoredAuth();
  if (!token || !user) return;
  try {
    const response = await fetch(`${BACKEND_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const data = await response.json();
    if (data.token) await setStoredAuth(data.token, data.user);
    if (data.user) updateCreditUI(data.user);
  } catch (_err) {
    // silent — this is a background convenience refresh, not user-initiated
  }
});

els.submitEmailChangeBtn.addEventListener("click", async () => {
  const newEmail = els.newEmailInput.value.trim();
  const password = els.newEmailPassword.value;
  els.acctEmailError.classList.add("hidden");
  els.acctEmailSuccess.classList.add("hidden");

  if (!newEmail || !password) {
    els.acctEmailError.textContent = "Enter a new email and your current password.";
    els.acctEmailError.classList.remove("hidden");
    return;
  }

  const { token } = await getStoredAuth();
  els.submitEmailChangeBtn.disabled = true;
  try {
    const response = await fetch(`${BACKEND_URL}/api/account/email`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ new_email: newEmail, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't update email.");

    await setStoredAuth(data.token, data.user);
    els.userEmailLabel.textContent = data.user.email;
    els.newEmailInput.value = "";
    els.newEmailPassword.value = "";
    els.acctEmailSuccess.textContent = "Email updated.";
    els.acctEmailSuccess.classList.remove("hidden");
  } catch (err) {
    els.acctEmailError.textContent =
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message;
    els.acctEmailError.classList.remove("hidden");
  } finally {
    els.submitEmailChangeBtn.disabled = false;
  }
});

els.submitPasswordChangeBtn.addEventListener("click", async () => {
  const currentPassword = els.currentPasswordInput.value;
  const newPassword = els.newPasswordInput.value;
  els.acctPasswordError.classList.add("hidden");
  els.acctPasswordSuccess.classList.add("hidden");

  if (!currentPassword || !newPassword) {
    els.acctPasswordError.textContent = "Enter your current and new password.";
    els.acctPasswordError.classList.remove("hidden");
    return;
  }

  const { token } = await getStoredAuth();
  els.submitPasswordChangeBtn.disabled = true;
  try {
    const response = await fetch(`${BACKEND_URL}/api/account/password`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't update password.");

    els.currentPasswordInput.value = "";
    els.newPasswordInput.value = "";
    els.acctPasswordSuccess.textContent = "Password updated.";
    els.acctPasswordSuccess.classList.remove("hidden");
  } catch (err) {
    els.acctPasswordError.textContent =
      err.message === "Failed to fetch" ? "Can't reach the server. Is the backend running?" : err.message;
    els.acctPasswordError.classList.remove("hidden");
  } finally {
    els.submitPasswordChangeBtn.disabled = false;
  }
});

(async function init() {
  const user = await validateSession();
  if (user) {
    await showAppView(user);
  } else {
    showAuthView();
  }
})();
