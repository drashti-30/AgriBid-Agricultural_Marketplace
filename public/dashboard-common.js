const DASHBOARD_STORAGE_KEYS = {
    WISHLIST: "agribidWishlist",
    NOTIFICATION_READ: "agribidReadNotifications"
};

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function formatCurrency(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getAutomaticAuctionStatus(auction) {
    const start = new Date(auction.startTime).getTime();
    const end = new Date(auction.endTime).getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) return auction.status || "Active";

    const now = Date.now();

    if (now < start) return "Scheduled";
    if (now >= end) return "Closed";

    return "Active";
}

function getTimeRemaining(auction) {
    const status = getAutomaticAuctionStatus(auction);

    if (status === "Closed") return 0;

    const target = status === "Scheduled"
        ? new Date(auction.startTime).getTime()
        : new Date(auction.endTime).getTime();

    return Math.max(0, target - Date.now());
}

function formatDuration(milliseconds) {
    if (milliseconds <= 0) return "Ended";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function getWishlist() {
    try {
        const value = JSON.parse(
            localStorage.getItem(DASHBOARD_STORAGE_KEYS.WISHLIST) || "[]"
        );

        return Array.isArray(value) ? value.map(Number) : [];
    } catch (error) {
        return [];
    }
}

function getReadNotificationIds() {
    try {
        const value = JSON.parse(
            localStorage.getItem(DASHBOARD_STORAGE_KEYS.NOTIFICATION_READ) || "[]"
        );

        return Array.isArray(value) ? value.map(String) : [];
    } catch (error) {
        return [];
    }
}

function setReadNotificationIds(ids) {
    localStorage.setItem(
        DASHBOARD_STORAGE_KEYS.NOTIFICATION_READ,
        JSON.stringify(ids)
    );
}

async function loadDashboardData() {
    const [auctionResponse, bidResponse, farmerResponse] = await Promise.all([
        fetch("/api/auctions"),
        fetch("/api/bids"),
        fetch("/api/farmers")
    ]);

    const responses = [auctionResponse, bidResponse, farmerResponse];

    if (responses.some(response => !response.ok)) {
        throw new Error("Unable to load dashboard data.");
    }

    return {
        auctions: await auctionResponse.json(),
        bids: await bidResponse.json(),
        farmers: await farmerResponse.json()
    };
}

/*
 * Load notifications for the current dashboard user.
 *
 * Phase 12 RBAC:
 * The notifications API requires authentication.
 * Therefore the existing Phase 11 JWT is sent through
 * the Authorization header.
 *
 * Local Storage notification read/unread functionality
 * remains unchanged.
 */
async function loadNotifications(role, userName) {
    const params = new URLSearchParams({ role, userName });

    const response = await fetch(`/api/notifications?${params}`, {
        method: "GET",
        headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            "Unable to load notifications."
        );
    }

    return Array.isArray(result) ? result : [];
}

function renderNotificationCenter(
    containerId,
    badgeId,
    notifications,
    onReadChange
) {
    const container = document.getElementById(containerId);
    const badge = document.getElementById(badgeId);

    if (!container || !badge) return;

    const readIds = getReadNotificationIds();

    const unreadCount = notifications.filter(
        item => !readIds.includes(String(item.id))
    ).length;

    badge.textContent = `${unreadCount} new`;
    badge.classList.toggle("d-none", unreadCount === 0);

    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                No notifications available.
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(notification => {
        const isRead = readIds.includes(String(notification.id));

        return `
            <div class="notification-item ${isRead ? "read" : "unread"}"
                 data-notification-id="${escapeHTML(notification.id)}">
                <div class="notification-icon">
                    ${escapeHTML(notification.icon || "🔔")}
                </div>

                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start gap-2">
                        <strong>${escapeHTML(notification.title)}</strong>
                        ${isRead ? "" : '<span class="badge text-bg-success">New</span>'}
                    </div>

                    <p class="small text-muted mb-1 mt-1">
                        ${escapeHTML(notification.message)}
                    </p>

                    <small class="text-muted">
                        ${escapeHTML(formatDateTime(notification.time))}
                    </small>
                </div>
            </div>
        `;
    }).join("");

    container
        .querySelectorAll(".notification-item.unread")
        .forEach(item => {
            item.addEventListener("click", () => {
                markNotificationRead(item.dataset.notificationId);

                renderNotificationCenter(
                    containerId,
                    badgeId,
                    notifications,
                    onReadChange
                );

                onReadChange?.();
            });
        });
}

function markNotificationRead(id) {
    const ids = getReadNotificationIds();

    if (!ids.includes(String(id))) ids.push(String(id));

    setReadNotificationIds(ids);
}

function markAllNotificationsRead(notifications) {
    const ids = getReadNotificationIds();

    notifications.forEach(notification => {
        const id = String(notification.id);
        if (!ids.includes(id)) ids.push(id);
    });

    setReadNotificationIds(ids);
}

function showDashboardMessage(message, type = "success") {
    const alertContainer = document.getElementById("dashboardAlert");

    if (!alertContainer) return;

    alertContainer.innerHTML = `
        <div class="alert alert-${escapeHTML(type)} alert-dismissible fade show"
             role="alert">
            ${escapeHTML(message)}
            <button type="button"
                    class="btn-close"
                    data-bs-dismiss="alert"
                    aria-label="Close"></button>
        </div>
    `;
}

function getUIPreferences() {
    try {
        const value = JSON.parse(
            localStorage.getItem("agribidUIPreferences") || "{}"
        );

        return {
            theme: value.theme || "light",
            compactMode: Boolean(value.compactMode)
        };
    } catch (error) {
        return { theme: "light", compactMode: false };
    }
}

function saveUIPreferences(preferences) {
    localStorage.setItem(
        "agribidUIPreferences",
        JSON.stringify(preferences)
    );
}

function applyTheme() {
    const preferences = getUIPreferences();

    document.body.classList.toggle(
        "theme-dark",
        preferences.theme === "dark"
    );

    document
        .querySelectorAll("[data-theme-toggle]")
        .forEach(button => {
            button.textContent =
                preferences.theme === "dark"
                    ? "☀ Light Mode"
                    : "🌙 Dark Mode";

            button.setAttribute(
                "aria-label",
                preferences.theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            );
        });
}

function toggleTheme() {
    const preferences = getUIPreferences();

    preferences.theme = preferences.theme === "dark" ? "light" : "dark";

    saveUIPreferences(preferences);
    applyTheme();
}

function getRecentlyViewedIds() {
    try {
        const value = JSON.parse(
            localStorage.getItem("agribidRecentlyViewedAuctions") || "[]"
        );

        return Array.isArray(value) ? value.map(Number) : [];
    } catch (error) {
        return [];
    }
}

function getRecentlyViewedFromAuctions(auctions) {
    const ids = getRecentlyViewedIds();

    return ids
        .map(id => auctions.find(auction => Number(auction.id) === id))
        .filter(Boolean);
}

function getBidCountForAuction(bids, auctionId) {
    return bids.filter(
        bid => Number(bid.auctionId) === Number(auctionId)
    ).length;
}

function renderSimpleBarChart(
    containerId,
    items,
    valueFormatter = value => value
) {
    const container = document.getElementById(containerId);

    if (!container) return;

    const values = items.map(item => Number(item.value) || 0);
    const maxValue = Math.max(...values, 1);

    container.innerHTML = items.length
        ? items.map(item => `
            <div class="chart-row">
                <div class="d-flex justify-content-between gap-3 small mb-1">
                    <span class="text-truncate">${escapeHTML(item.label)}</span>
                    <strong>${escapeHTML(valueFormatter(item.value))}</strong>
                </div>

                <div class="chart-track">
                    <div class="chart-bar"
                         style="width:${Math.max(4, (Number(item.value) / maxValue) * 100)}%">
                    </div>
                </div>
            </div>
        `).join("")
        : `
            <p class="text-muted text-center py-4 mb-0">
                Not enough data for a chart yet.
            </p>
        `;
}

/*
 * Get the currently authenticated user from the backend.
 *
 * Uses the existing Phase 11 JWT stored in sessionStorage.
 */
async function getCurrentUser() {
    const token = sessionStorage.getItem("agribidToken");

    if (!token) throw new Error("Authentication required.");

    const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            "Unable to authenticate user."
        );
    }

    return data.user;
}

/*
 * Return the JWT saved by the existing Phase 11 login flow.
 *
 * Phase 11 stores the active login token in sessionStorage.
 * sessionStorage is checked first so the current login session
 * always takes priority.
 */
function getAuthToken() {
    return (
        sessionStorage.getItem("agribidToken") ||
        localStorage.getItem("agribidToken") ||
        ""
    );
}

/*
 * Headers for APIs protected by Phase 12 RBAC.
 */
function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}