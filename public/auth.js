const TOKEN_STORAGE_KEY = "agribidToken";
const SESSION_STORAGE_KEY = "agribidUser";

function getStoredToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

function saveAuthSession(token, user, remember = false) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_STORAGE_KEY, token);
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));

    if (remember) {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(SESSION_STORAGE_KEY);
    }
}

function clearAuthSession() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function showAuthMessage(container, message, type = "success") {
    container.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function sendAuthRequest(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}

    if (!response.ok) {
        throw new Error(data.message || "Authentication request failed.");
    }

    return data;
}

function initializeLoginForm() {
    const form = document.getElementById("loginForm");
    const message = document.getElementById("loginMessage");
    if (!form || !message) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        form.classList.add("was-validated");
        if (!form.checkValidity()) return;

        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        button.textContent = "Logging in...";

        try {
            const data = await sendAuthRequest("/api/auth/login", {
                email: document.getElementById("email").value.trim().toLowerCase(),
                password: document.getElementById("password").value
            });

            saveAuthSession(data.token, data.user, document.getElementById("remember").checked);
            showAuthMessage(message, `Login successful. Welcome, <strong>${escapeHTML(data.user.name)}</strong>.`, "success");
            button.textContent = "Login Successful";

            setTimeout(() => {
                const role = String(data.user.role || "").toLowerCase();
                window.location.href = role === "farmer"
                    ? "/farmer-dashboard.html"
                    : role === "admin"
                        ? "/admin-dashboard.html"
                        : "/buyer-dashboard.html";
            }, 600);
        } catch (error) {
            showAuthMessage(message, escapeHTML(error.message), "danger");
            button.disabled = false;
            button.textContent = "Login";
        }
    });
}

function initializeRegisterForm() {
    const form = document.getElementById("registerForm");
    const message = document.getElementById("registerMessage");
    if (!form || !message) return;

    const password = document.getElementById("password");
    const confirmPassword = document.getElementById("confirmPassword");

    const validatePasswordMatch = () => {
        confirmPassword.setCustomValidity(confirmPassword.value === password.value ? "" : "Passwords do not match.");
    };

    confirmPassword.addEventListener("input", validatePasswordMatch);
    password.addEventListener("input", validatePasswordMatch);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        form.classList.add("was-validated");
        validatePasswordMatch();
        if (!form.checkValidity()) return;

        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        button.textContent = "Creating Account...";

        const account = {
            name: `${document.getElementById("firstName").value.trim()} ${document.getElementById("lastName").value.trim()}`.trim(),
            email: document.getElementById("email").value.trim().toLowerCase(),
            role: document.getElementById("role").value.toLowerCase(),
            phone: document.getElementById("phone").value.trim(),
            address: document.getElementById("address").value.trim(),
            password: password.value
        };

        try {
            const data = await sendAuthRequest("/api/auth/register", account);
            showAuthMessage(message, `Registration successful as <strong>${escapeHTML(data.user.role)}</strong>. Please log in with your new account.`, "success");
            form.reset();
            form.classList.remove("was-validated");
        } catch (error) {
            showAuthMessage(message, escapeHTML(error.message), "danger");
        } finally {
            button.disabled = false;
            button.textContent = "Create Account";
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initializeLoginForm();
    initializeRegisterForm();
});

window.AgriBidAuth = {
    getToken: getStoredToken,
    clearSession: clearAuthSession
};
