let farmerAuctions = [];
let farmerBids = [];
let farmerNotifications = [];
let FARMER_NAME = "Farmer";
let FARMER_ID = null;

const farmerDashboard = document;

farmerDashboard.addEventListener("DOMContentLoaded", initializeFarmerDashboard);

async function initializeFarmerDashboard() {
    setupFarmerEvents();
    applyTheme();

    try {
        const currentUser = await getCurrentUser();
        if (String(currentUser.role || "").toLowerCase() !== "farmer") {
            throw new Error("Farmer access is required for this dashboard.");
        }

        FARMER_NAME = currentUser.name || "Farmer";
        const data = await loadDashboardData();
        const farmerProfile = data.farmers.find(farmer => Number(farmer.userId) === Number(currentUser.user_id));
        FARMER_ID = farmerProfile ? Number(farmerProfile.id) : null;

        const farmerName = FARMER_NAME.toLowerCase();
        farmerAuctions = data.auctions.filter(auction =>
            (FARMER_ID !== null && Number(auction.farmerId) === FARMER_ID) ||
            String(auction.farmerName || "").toLowerCase() === farmerName
        );

        const nameElement = document.getElementById("farmerNameDisplay");
        if (nameElement) nameElement.textContent = FARMER_NAME;
        farmerBids = data.bids.filter(bid =>
            farmerAuctions.some(auction => Number(auction.id) === Number(bid.auctionId))
        );

        renderFarmerStatistics();
        renderFarmerAuctions();
        renderFarmerManagement();
        renderFarmerBids();
        renderFarmerSales();
        renderFarmerWishlist();
        renderFarmerPerformance();
        renderFarmerTopAuctions();
        await refreshFarmerNotifications();
        startFarmerCountdowns();
    } catch (error) {
        console.error(error);
        showDashboardError(error.message);
    }
}

function setupFarmerEvents() {
    document.getElementById("mobileMenuButton")?.addEventListener("click", toggleMobileMenu);
    document.getElementById("logoutButton")?.addEventListener("click", handleLogout);
    document.getElementById("createAuctionDashboardButton")?.addEventListener("click", openAuctionPage);
    document.getElementById("quickCreateAuction")?.addEventListener("click", openAuctionPage);
    document.getElementById("viewNotificationsButton")?.addEventListener("click", scrollToNotifications);
    document.getElementById("markAllNotificationsRead")?.addEventListener("click", markAllFarmerNotificationsRead);
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
}

function renderFarmerStatistics() {
    const active = farmerAuctions.filter(auction => auction.status === "Active").length;
    const closed = farmerAuctions.filter(auction => auction.status === "Closed").length;

    document.getElementById("activeAuctionCount").textContent = active;
    document.getElementById("currentBidCount").textContent = farmerBids.length;
    document.getElementById("salesCount").textContent = closed;
    document.getElementById("wishlistCount").textContent = getWishlist().length;
}

function renderFarmerAuctions() {
    const container = document.getElementById("dashboardAuctionList");
    const visible = farmerAuctions
        .filter(auction => auction.status === "Active" || auction.status === "Scheduled")
        .sort((a, b) => getTimeRemaining(a) - getTimeRemaining(b))
        .slice(0, 6);

    if (!visible.length) {
        container.innerHTML = `
            <div class="px-6 py-10 text-center text-slate-500">
                No active or scheduled auctions found.
            </div>
        `;
        return;
    }

    container.innerHTML = visible.map(auction => {
        const bidCount = farmerBids.filter(bid => Number(bid.auctionId) === Number(auction.id)).length;
        const statusClass = auction.status === "Active" ? "green" : "blue";
        return `
            <div class="px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-xl bg-green-100 text-green-700 flex items-center justify-center font-bold">
                        ${getCropInitial(auction.cropName)}
                    </div>
                    <div>
                        <h4 class="font-semibold text-slate-900">${escapeHTML(auction.cropName || auction.title)}</h4>
                        <p class="text-sm text-slate-500">${escapeHTML(auction.category || "General")} · ${auction.quantity || 0} ${escapeHTML(auction.unit || "units")}</p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-5 text-sm">
                    <div><span class="text-slate-500 block">Current Bid</span><strong class="text-green-600">${formatCurrency(auction.currentBid || auction.basePrice)}</strong></div>
                    <div><span class="text-slate-500 block">Bids</span><strong>${bidCount}</strong></div>
                    <div><span class="text-slate-500 block">Time</span><strong class="countdown-value text-${statusClass}-600" data-auction-id="${auction.id}">${formatDuration(getTimeRemaining(auction))}</strong></div>
                    <span class="rounded-full bg-${statusClass}-100 px-3 py-1 text-xs font-semibold text-${statusClass}-700">${escapeHTML(auction.status)}</span>
                </div>
            </div>
        `;
    }).join("");
}

function renderFarmerManagement() {
    const container = document.getElementById("farmerManagementSummary");
    const managedAuctions = [...farmerAuctions].sort((a, b) => getTimeRemaining(a) - getTimeRemaining(b));

    if (!managedAuctions.length) {
        container.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-500">You have not created any auctions yet.</td></tr>`;
        return;
    }

    container.innerHTML = managedAuctions.map(auction => {
        const bidCount = getBidCountForAuction(farmerBids, auction.id);
        return `
            <tr>
                <td class="px-6 py-4 font-semibold text-slate-900">${escapeHTML(auction.cropName || auction.title)}</td>
                <td class="px-6 py-4">${auction.quantity || 0} ${escapeHTML(auction.unit || "units")}</td>
                <td class="px-6 py-4 font-semibold text-green-600">${formatCurrency(auction.currentBid || auction.basePrice)}</td>
                <td class="px-6 py-4">${bidCount}</td>
                <td class="px-6 py-4"><span class="status-dot ${auction.status.toLowerCase()}"></span>${escapeHTML(auction.status)}</td>
                <td class="px-6 py-4 countdown-value" data-management-auction-id="${auction.id}">${formatDuration(getTimeRemaining(auction))}</td>
                <td class="px-6 py-4">
                    <div class="flex flex-wrap gap-2">
                        <a href="/auctions.html?auction=${auction.id}" class="text-xs font-semibold text-agrigreen-600 hover:underline">View</a>
                        <a href="/auctions.html?edit=${auction.id}" class="text-xs font-semibold text-blue-600 hover:underline">Edit</a>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderFarmerPerformance() {
    const container = document.getElementById("farmerPerformance");
    if (!container) return;

    const closed = farmerAuctions.filter(auction => auction.status === "Closed");
    const totalValue = closed.reduce((sum, auction) => sum + Number(auction.currentBid || auction.basePrice || 0), 0);
    const averageSale = closed.length ? totalValue / closed.length : 0;
    const auctionCount = farmerAuctions.length;
    const soldRate = auctionCount ? Math.round((closed.length / auctionCount) * 100) : 0;

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="rounded-xl bg-green-50 p-4"><p class="text-xs text-green-700">Total Sale Value</p><strong class="text-xl text-green-800">${formatCurrency(totalValue)}</strong></div>
            <div class="rounded-xl bg-blue-50 p-4"><p class="text-xs text-blue-700">Average Sale</p><strong class="text-xl text-blue-800">${formatCurrency(averageSale)}</strong></div>
            <div class="rounded-xl bg-amber-50 p-4"><p class="text-xs text-amber-700">Completion Rate</p><strong class="text-xl text-amber-800">${soldRate}%</strong></div>
            <div class="rounded-xl bg-purple-50 p-4"><p class="text-xs text-purple-700">Total Bids</p><strong class="text-xl text-purple-800">${farmerBids.length}</strong></div>
        </div>
        <div id="farmerBidChart" class="space-y-3"></div>
    `;

    const chartItems = farmerAuctions
        .map(auction => ({
            label: auction.cropName || auction.title || "Auction",
            value: getBidCountForAuction(farmerBids, auction.id)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    renderSimpleBarChart("farmerBidChart", chartItems, value => `${value} bids`);
}

function renderFarmerTopAuctions() {
    const container = document.getElementById("farmerTopAuctions");
    if (!container) return;

    const rows = farmerAuctions
        .map(auction => ({
            auction,
            bidCount: getBidCountForAuction(farmerBids, auction.id)
        }))
        .sort((a, b) => b.bidCount - a.bidCount)
        .slice(0, 4);

    container.innerHTML = rows.length ? rows.map(({ auction, bidCount }) => `
        <div class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div><p class="font-semibold text-slate-800">${escapeHTML(auction.cropName || auction.title)}</p><p class="text-xs text-slate-500">${escapeHTML(auction.status)} · ${auction.quantity || 0} ${escapeHTML(auction.unit || "units")}</p></div>
            <div class="text-right"><strong class="text-green-600">${bidCount}</strong><p class="text-xs text-slate-500">bids</p></div>
        </div>
    `).join("") : '<p class="text-sm text-slate-500 text-center py-4">No auction activity yet.</p>';
}

function renderFarmerBids() {
    const container = document.getElementById("recentBidsList");
    const recent = [...farmerBids].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

    if (!recent.length) {
        container.innerHTML = `<div class="px-6 py-10 text-center text-slate-500">No bids have been placed on your auctions yet.</div>`;
        return;
    }

    container.innerHTML = recent.map(bid => {
        const auction = farmerAuctions.find(item => Number(item.id) === Number(bid.auctionId));
        return `
            <div class="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                    <p class="font-semibold text-slate-800">${escapeHTML(bid.buyerName || "Buyer")}</p>
                    <p class="text-xs text-slate-500 mt-1">Bid on ${escapeHTML(auction?.cropName || `Auction #${bid.auctionId}`)}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-green-600">${formatCurrency(bid.amount)}</p>
                    <p class="text-xs text-slate-400 mt-1">${escapeHTML(formatDateTime(bid.time))}</p>
                </div>
            </div>
        `;
    }).join("");
}

function renderFarmerSales() {
    const container = document.getElementById("salesSummary");
    const closed = farmerAuctions.filter(auction => auction.status === "Closed");
    const totalValue = closed.reduce((sum, auction) => sum + Number(auction.currentBid || auction.basePrice || 0), 0);

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div class="rounded-xl bg-green-50 p-5">
                <p class="text-sm text-green-700">Completed Sales</p>
                <p class="text-3xl font-bold text-green-800 mt-2">${closed.length}</p>
            </div>
            <div class="rounded-xl bg-blue-50 p-5">
                <p class="text-sm text-blue-700">Total Value</p>
                <p class="text-3xl font-bold text-blue-800 mt-2">${formatCurrency(totalValue)}</p>
            </div>
        </div>
        <div class="mt-5 space-y-3">
            ${closed.slice(0, 4).map(auction => `
                <div class="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                    <div><p class="font-semibold text-slate-800">${escapeHTML(auction.cropName || "Crop")}</p><p class="text-xs text-slate-500">${auction.quantity || 0} ${escapeHTML(auction.unit || "units")}</p></div>
                    <p class="font-bold text-green-600">${formatCurrency(auction.currentBid || auction.basePrice)}</p>
                </div>
            `).join("") || '<p class="text-sm text-slate-500 text-center">No completed sales yet.</p>'}
        </div>
    `;
}

function renderFarmerWishlist() {
    document.getElementById("wishlistCount").textContent = getWishlist().length;
}

async function refreshFarmerNotifications() {
    farmerNotifications = await loadNotifications("Farmer", FARMER_NAME);
    renderNotificationCenter("notificationList", "notificationBadge", farmerNotifications);
}

function markAllFarmerNotificationsRead() {
    markAllNotificationsRead(farmerNotifications);
    renderNotificationCenter("notificationList", "notificationBadge", farmerNotifications);
}

function startFarmerCountdowns() {
    setInterval(() => {
        document.querySelectorAll("[data-auction-id]").forEach(element => {
            const auction = farmerAuctions.find(item => Number(item.id) === Number(element.dataset.auctionId));
            if (auction) element.textContent = formatDuration(getTimeRemaining(auction));
        });

        document.querySelectorAll("[data-management-auction-id]").forEach(element => {
            const auction = farmerAuctions.find(item => Number(item.id) === Number(element.dataset.managementAuctionId));
            if (auction) element.textContent = formatDuration(getTimeRemaining(auction));
        });
    }, 1000);
}

function toggleMobileMenu() {
    document.getElementById("mobileMenu")?.classList.toggle("hidden");
}

function handleLogout() {
    localStorage.removeItem("agribidUser");
    window.location.href = "/login.html";
}

function openAuctionPage() {
    window.location.href = "/auctions.html";
}

function scrollToNotifications() {
    document.getElementById("notificationList")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function getCropInitial(name) {
    return String(name || "C").trim().charAt(0).toUpperCase() || "C";
}

function showDashboardError(message) {
    const container = document.getElementById("dashboardAuctionList");
    container.innerHTML = `<div class="px-6 py-8"><div class="rounded-xl bg-red-50 border border-red-200 p-5"><p class="font-semibold text-red-800">Dashboard Error</p><p class="text-sm text-red-600 mt-1">${escapeHTML(message)}</p></div></div>`;
}
