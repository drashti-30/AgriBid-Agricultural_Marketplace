let buyerAuctions = [];
let buyerBids = [];
let buyerNotifications = [];
let selectedBuyerName = "Fresh Foods Pvt Ltd";

// Authentication will be connected later. This selector uses a real buyer name from the existing bid data for the current demo.
document.addEventListener("DOMContentLoaded", initializeBuyerDashboard);

async function initializeBuyerDashboard() {
    setupBuyerEvents();
    applyTheme();

    try {
        const data = await loadDashboardData();
        buyerAuctions = data.auctions;
        populateBuyerProfiles(data.bids);
        buyerBids = data.bids.filter(bid => bid.buyerName.toLowerCase() === selectedBuyerName.toLowerCase());
        updateBuyerStatistics();
        renderBuyerBids();
        renderRecommendedAuctions();
        renderBuyerInsights();
        renderBuyerWishlist();
        renderBuyerRecentlyViewed();
        await refreshBuyerNotifications();
    } catch (error) {
        console.error(error);
        showDashboardMessage(error.message, "danger");
    }
}

function setupBuyerEvents() {
    document.getElementById("mobileMenuButton")?.addEventListener("click", () => document.getElementById("mobileMenu")?.classList.toggle("hidden"));
    document.getElementById("logoutButton")?.addEventListener("click", () => {
        localStorage.removeItem("agribidUser");
        window.location.href = "/login.html";
    });
    document.getElementById("viewWishlistButton")?.addEventListener("click", () => window.location.href = "/auctions.html?wishlist=1");
    document.getElementById("viewNotificationsButton")?.addEventListener("click", () => document.getElementById("buyerNotifications")?.scrollIntoView({ behavior: "smooth" }));
    document.getElementById("markAllNotificationsRead")?.addEventListener("click", markAllBuyerNotificationsRead);
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
    document.getElementById("buyerProfile")?.addEventListener("change", changeBuyerProfile);
}

function populateBuyerProfiles(bids) {
    const select = document.getElementById("buyerProfile");
    if (!select) return;

    const buyers = [...new Set(bids.map(bid => bid.buyerName).filter(Boolean))].sort();
    select.innerHTML = buyers.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("");
    select.value = buyers.includes(selectedBuyerName) ? selectedBuyerName : buyers[0] || selectedBuyerName;
    selectedBuyerName = select.value;
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
    const response = await fetch(`/api/notifications?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load notifications.");
    buyerNotifications = result;
    renderNotificationCenter("notificationList", "notificationBadge", buyerNotifications);
}

function markAllBuyerNotificationsRead() {
    markAllNotificationsRead(buyerNotifications);
    renderNotificationCenter("notificationList", "notificationBadge", buyerNotifications);
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
