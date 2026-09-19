let buyerAuctions = [];
let buyerBids = [];
let buyerNotifications = [];

let currentBuyerUser = null;
let selectedBuyerName = "";

// Initialize the real authenticated Buyer Dashboard.
document.addEventListener("DOMContentLoaded", initializeBuyerDashboard);

async function initializeBuyerDashboard() {
    try {
        // Register the existing dashboard controls first.
        setupBuyerEvents();

        // The Phase 11 login flow stores the JWT in sessionStorage.
        const token = sessionStorage.getItem("agribidToken");

        // No login: keep the dashboard stable and show a guest state.
        if (!token) {
            showAuthenticationRequired();
            return;
        }

        // Verify the JWT and obtain the authoritative user from the backend.
        const user = await getCurrentUser();

        if (!user) {
            showAuthenticationRequired();
            return;
        }

        // This page is for Buyer accounts only.
        if (String(user.role || "").toLowerCase() !== "buyer") {
            showDashboardMessage(
                "Buyer access is required for this dashboard.",
                "danger"
            );
            return;
        }

        currentBuyerUser = user;
        selectedBuyerName = user.name || "Buyer";

        console.log("Logged-in buyer:", user);

        // Use the actual authenticated user's identity in the UI.
        updateBuyerIdentity(user);

        // Load the existing buyer dashboard data.
        await loadBuyerDashboardData(user);

    } catch (error) {
        console.error("Buyer dashboard error:", error);

        // Invalid/expired authentication should not leave a broken JS state.
        if (
            error.message === "Authentication required." ||
            error.message === "Invalid or expired token." ||
            error.message === "Invalid or expired token"
        ) {
            showAuthenticationRequired();
            return;
        }

        showDashboardMessage(
            error.message || "Unable to load Buyer Dashboard.",
            "danger"
        );
    }
}

async function loadBuyerDashboardData(user) {
    const [auctionResponse, bidResponse] = await Promise.all([
        fetch("/api/auctions"),
        fetch("/api/bids")
    ]);

    if (!auctionResponse.ok) {
        throw new Error("Unable to load auctions.");
    }

    if (!bidResponse.ok) {
        throw new Error("Unable to load bids.");
    }

    const auctions = await auctionResponse.json();
    const bids = await bidResponse.json();

    buyerAuctions = Array.isArray(auctions) ? auctions : [];

    /*
     * Preserve the existing Phase 1-4/10 bid display contract.
     * Historical bids contain buyerName, while the current
     * authenticated identity comes from /api/auth/me.
     */
    buyerBids = Array.isArray(bids)
        ? bids.filter(
            bid =>
                String(bid.buyerName || "").trim().toLowerCase() ===
                String(selectedBuyerName || "").trim().toLowerCase()
        )
        : [];

    updateBuyerStatistics();
    renderBuyerBids();
    renderBuyerInsights();
    renderBuyerWishlist();
    renderBuyerRecentlyViewed();
    renderRecommendedAuctions();

    // Notifications are protected in Phase 12 and receive the JWT
    // through getAuthHeaders().
    await refreshBuyerNotifications();
}

function showAuthenticationRequired() {
    console.log("No authenticated buyer found.");

    currentBuyerUser = null;
    selectedBuyerName = "";
    buyerAuctions = [];
    buyerBids = [];
    buyerNotifications = [];

    const accountName =
        document.getElementById("buyerProfileName");

    const accountEmail =
        document.getElementById("buyerProfileEmail");

    const accountRole =
        document.getElementById("buyerProfileRole");

    const welcomeName =
        document.getElementById("buyerWelcomeName");

    if (welcomeName) {
        welcomeName.textContent = "Buyer";
    }

    if (accountName) {
        accountName.textContent = "Guest Buyer";
    }

    if (accountEmail) {
        accountEmail.textContent =
            "Please login to access your buyer account.";
    }

    if (accountRole) {
        accountRole.textContent = "BUYER ACCOUNT";
    }

    // Reset authenticated-only statistics without throwing an error.
    updateBuyerStatistics();

    showDashboardMessage(
        "Authentication required. Please login to view your buyer data.",
        "warning"
    );
}

function updateBuyerIdentity(user) {
    const name = user?.name || "Buyer";
    const email = user?.email || "";
    const role = user?.role || "buyer";

    const welcomeName =
        document.getElementById("buyerWelcomeName");

    if (welcomeName) {
        welcomeName.textContent = name;
    }

    const profileName =
        document.getElementById("buyerProfileName");

    if (profileName) {
        profileName.textContent = name;
    }

    const profileEmail =
        document.getElementById("buyerProfileEmail");

    if (profileEmail) {
        profileEmail.textContent = email;
    }

    const profileRole =
        document.getElementById("buyerProfileRole");

    if (profileRole) {
        profileRole.textContent = `${role.toUpperCase()} ACCOUNT`;
    }
}

function setupBuyerEvents() {
    document.getElementById("mobileMenuButton")?.addEventListener("click", () => document.getElementById("mobileMenu")?.classList.toggle("hidden"));
    document.getElementById("logoutButton")?.addEventListener("click", () => {
        localStorage.removeItem("agribidUser");
        localStorage.removeItem("agribidToken");

        sessionStorage.removeItem("agribidUser");
        sessionStorage.removeItem("agribidToken");

        window.location.href = "/login.html";
    });
    document.getElementById("viewWishlistButton")?.addEventListener("click", () => window.location.href = "/auctions.html?wishlist=1");
    document.getElementById("viewNotificationsButton")?.addEventListener("click", () => document.getElementById("buyerNotifications")?.scrollIntoView({ behavior: "smooth" }));
    document.getElementById("markAllNotificationsRead")?.addEventListener("click", markAllBuyerNotificationsRead);
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
}

async function changeBuyerProfile(event) {
    selectedBuyerName = event.target.value;
    buyerBids = [];

    try {
        const response = await fetch("/api/bids");
        if (!response.ok) throw new Error("Unable to refresh buyer bids.");
        const bids = await response.json();
        buyerBids = bids.filter(bid => bid.buyerName.toLowerCase() === selectedBuyerName.toLowerCase());
        updateBuyerStatistics();
        renderBuyerBids();
        renderBuyerInsights();
        await refreshBuyerNotifications();
    } catch (error) {
        showDashboardMessage(error.message, "danger");
    }
}

function getBuyerBidState(bid) {
    const auction = buyerAuctions.find(item => Number(item.id) === Number(bid.auctionId));
    if (!auction) return { auction: null, state: "Unknown" };
    if (auction.status === "Closed") return { auction, state: Number(bid.amount) >= Number(auction.currentBid) ? "Won" : "Lost" };
    return { auction, state: Number(bid.amount) >= Number(auction.currentBid) ? "Winning" : "Outbid" };
}

function updateBuyerStatistics() {
    const states = buyerBids.map(getBuyerBidState);
    document.getElementById("buyerBidCount").textContent = buyerBids.length;
    document.getElementById("buyerWinningCount").textContent = states.filter(item => item.state === "Winning" || item.state === "Won").length;
    document.getElementById("buyerOutbidCount").textContent = states.filter(item => item.state === "Outbid" || item.state === "Lost").length;
    document.getElementById("buyerWishlistCount").textContent = getWishlist().length;
}

function renderBuyerBids() {
    const container = document.getElementById("buyerBidsList");
    const recent = [...buyerBids].sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!recent.length) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500">No bids found for ${escapeHTML(selectedBuyerName)}.</div>`;
        return;
    }

    container.innerHTML = recent.map(bid => {
        const { auction, state } = getBuyerBidState(bid);
        const badge = state === "Winning" || state === "Won"
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700";
        return `
            <div class="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <p class="font-semibold">${escapeHTML(auction?.cropName || `Auction #${bid.auctionId}`)}</p>
                    <p class="text-xs text-slate-500 mt-1">Placed ${escapeHTML(formatDateTime(bid.time))}</p>
                </div>
                <div class="flex items-center gap-5">
                    <div><p class="text-xs text-slate-500">My Bid</p><strong class="text-green-600">${formatCurrency(bid.amount)}</strong></div>
                    <div><p class="text-xs text-slate-500">Current</p><strong>${formatCurrency(auction?.currentBid || 0)}</strong></div>
                    <span class="rounded-full px-3 py-1 text-xs font-semibold ${badge}">${state}</span>
                </div>
            </div>
        `;
    }).join("");
}

function renderRecommendedAuctions() {
    const container = document.getElementById("recommendedAuctions");
    const live = buyerAuctions.filter(auction => auction.status === "Active").sort((a, b) => getTimeRemaining(a) - getTimeRemaining(b)).slice(0, 3);

    container.innerHTML = live.length ? live.map(auction => `
        <a href="/auctions.html" class="block rounded-xl border border-slate-200 p-4 text-decoration-none hover:shadow-sm">
            <div class="flex items-center justify-between gap-2"><span class="badge text-bg-success">Live</span><span class="text-xs text-slate-500">${escapeHTML(auction.quality || "Standard")}</span></div>
            <h4 class="font-bold text-slate-900 mt-3">${escapeHTML(auction.cropName || auction.title)}</h4>
            <p class="text-sm text-slate-500 mt-1">${escapeHTML(auction.farmerName || "Farmer")}</p>
            <div class="mt-3 flex justify-between"><strong class="text-green-600">${formatCurrency(auction.currentBid || auction.basePrice)}</strong><span class="text-xs text-slate-500">${formatDuration(getTimeRemaining(auction))}</span></div>
        </a>
    `).join("") : `<div class="col-span-full text-center text-slate-500 py-6">No active auctions are available.</div>`;
}

async function refreshBuyerNotifications() {
    const wishlist = JSON.stringify(getWishlist());
    const params = new URLSearchParams({ role: "Buyer", userName: selectedBuyerName, wishlist });

    const response = await fetch(`/api/notifications?${params}`, {
        method: "GET",
        headers: getAuthHeaders()
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || result.error || "Unable to load notifications.");
    }

    buyerNotifications = Array.isArray(result) ? result : [];

    renderNotificationCenter("notificationList", "notificationBadge", buyerNotifications);
}

function markAllBuyerNotificationsRead() {
    markAllNotificationsRead(buyerNotifications);
    renderNotificationCenter("notificationList", "notificationBadge", buyerNotifications);
}

function renderBuyerAccount(user) {
    // Keep compatibility with any existing calls while using
    // the real authenticated account renderer.
    updateBuyerIdentity(user);
}

function renderBuyerInsights() {
    const container = document.getElementById("buyerInsights");
    if (!container) return;

    const states = buyerBids.map(getBuyerBidState);
    const activeBids = states.filter(item => item.state === "Winning" || item.state === "Outbid");
    const totalBidValue = buyerBids.reduce((sum, bid) => sum + Number(bid.amount || 0), 0);
    const highestBid = buyerBids.reduce((highest, bid) => Math.max(highest, Number(bid.amount || 0)), 0);
    const wonCount = states.filter(item => item.state === "Won").length;

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="rounded-xl bg-green-50 p-4"><p class="text-xs text-green-700">Won Auctions</p><strong class="text-xl text-green-800">${wonCount}</strong></div>
            <div class="rounded-xl bg-blue-50 p-4"><p class="text-xs text-blue-700">Active Bids</p><strong class="text-xl text-blue-800">${activeBids.length}</strong></div>
            <div class="rounded-xl bg-purple-50 p-4"><p class="text-xs text-purple-700">Total Bid Value</p><strong class="text-xl text-purple-800">${formatCurrency(totalBidValue)}</strong></div>
            <div class="rounded-xl bg-amber-50 p-4"><p class="text-xs text-amber-700">Highest Bid</p><strong class="text-xl text-amber-800">${formatCurrency(highestBid)}</strong></div>
        </div>
        <div id="buyerBidChart" class="space-y-3"></div>
    `;

    const cropValues = {};
    buyerBids.forEach(bid => {
        const auction = buyerAuctions.find(item => Number(item.id) === Number(bid.auctionId));
        const label = auction?.cropName || `Auction #${bid.auctionId}`;
        cropValues[label] = (cropValues[label] || 0) + Number(bid.amount || 0);
    });

    renderSimpleBarChart(
        "buyerBidChart",
        Object.entries(cropValues).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
        value => formatCurrency(value)
    );
}

function renderBuyerWishlist() {
    const container = document.getElementById("buyerWishlistList");
    if (!container) return;

    const wishlist = buyerAuctions.filter(auction => getWishlist().includes(Number(auction.id)));
    container.innerHTML = wishlist.length ? wishlist.map(auction => `
        <a href="/auctions.html?auction=${auction.id}" class="block rounded-xl border border-slate-200 p-4 text-decoration-none hover:shadow-sm">
            <div class="flex justify-between gap-3"><strong class="text-slate-900">${escapeHTML(auction.cropName || auction.title)}</strong><span class="badge text-bg-${auction.status === "Active" ? "success" : auction.status === "Scheduled" ? "info" : "secondary"}">${escapeHTML(auction.status)}</span></div>
            <p class="text-sm text-slate-500 mt-1">${escapeHTML(auction.farmerName || "Farmer")}</p>
            <div class="mt-3 flex justify-between"><strong class="text-green-600">${formatCurrency(auction.currentBid || auction.basePrice)}</strong><span class="text-xs text-slate-500">${formatDuration(getTimeRemaining(auction))}</span></div>
        </a>
    `).join("") : '<div class="col-span-full text-center text-slate-500 py-6">Your wishlist is empty. Save auctions from the marketplace.</div>';
}

function renderBuyerRecentlyViewed() {
    const container = document.getElementById("buyerRecentlyViewed");
    if (!container) return;

    const recent = getRecentlyViewedFromAuctions(buyerAuctions);
    container.innerHTML = recent.length ? recent.map(auction => `
        <a href="/auctions.html?auction=${auction.id}" class="block rounded-xl border border-slate-200 p-4 text-decoration-none hover:shadow-sm">
            <span class="badge text-bg-${auction.status === "Active" ? "success" : auction.status === "Scheduled" ? "info" : "secondary"}">${escapeHTML(auction.status)}</span>
            <strong class="d-block text-slate-900 mt-2">${escapeHTML(auction.cropName || auction.title)}</strong>
            <small class="text-muted">${formatCurrency(auction.currentBid || auction.basePrice)} · ${formatCountdownForBuyer(auction)}</small>
        </a>
    `).join("") : '<div class="col-span-full text-center text-slate-500 py-6">No recently viewed auctions yet.</div>';
}

function formatCountdownForBuyer(auction) {
    return formatDuration(getTimeRemaining(auction));
}
