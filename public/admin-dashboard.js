let adminAuctions = [];
let adminBids = [];
let adminFarmers = [];
let adminNotifications = [];

document.addEventListener("DOMContentLoaded", initializeAdminDashboard);

async function initializeAdminDashboard() {
    setupAdminEvents();
    applyTheme();

    try {
        const data = await loadDashboardData();
        adminAuctions = data.auctions;
        adminBids = data.bids;
        adminFarmers = data.farmers;
        renderAdminStatistics();
        renderAdminAuctions();
        renderAdminActivity();
        renderAdminInsights();
        renderFarmerVerification();
        await refreshAdminNotifications();
    } catch (error) {
        console.error(error);
        showDashboardMessage(error.message, "danger");
    }
}

function setupAdminEvents() {
    document.getElementById("mobileMenuButton")?.addEventListener("click", () => document.getElementById("mobileMenu")?.classList.toggle("hidden"));
    document.getElementById("logoutButton")?.addEventListener("click", () => {
        localStorage.removeItem("agribidUser");
        window.location.href = "/login.html";
    });
    document.getElementById("markAllNotificationsRead")?.addEventListener("click", markAllAdminNotificationsRead);
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
}

function renderAdminStatistics() {
    document.getElementById("totalAuctions").textContent = adminAuctions.length;
    document.getElementById("activeAuctions").textContent = adminAuctions.filter(auction => auction.status === "Active").length;
    document.getElementById("scheduledAuctions").textContent = adminAuctions.filter(auction => auction.status === "Scheduled").length;
    document.getElementById("totalBids").textContent = adminBids.length;
    document.getElementById("totalFarmers").textContent = adminFarmers.length;
    document.getElementById("pendingFarmers").textContent = adminFarmers.filter(farmer => !farmer.verified).length;
}

function renderAdminAuctions() {
    const container = document.getElementById("adminAuctionTable");
    const rows = [...adminAuctions].sort((a, b) => getTimeRemaining(a) - getTimeRemaining(b));

    container.innerHTML = rows.map(auction => {
        const bidCount = adminBids.filter(bid => Number(bid.auctionId) === Number(auction.id)).length;
        return `
            <tr>
                <td><strong>${escapeHTML(auction.cropName || auction.title)}</strong><small class="d-block text-muted">${escapeHTML(auction.category || "General")}</small></td>
                <td>${escapeHTML(auction.farmerName || "Farmer")}</td>
                <td class="fw-semibold text-success">${formatCurrency(auction.currentBid || auction.basePrice)}</td>
                <td><span class="status-dot ${auction.status.toLowerCase()}"></span>${escapeHTML(auction.status)}</td>
                <td>${bidCount}</td>
            </tr>
        `;
    }).join("") || `<tr><td colspan="5" class="text-center text-muted py-4">No auctions found.</td></tr>`;
}

function renderAdminActivity() {
    const active = adminAuctions.filter(auction => auction.status === "Active").length;
    const verified = adminFarmers.filter(farmer => farmer.verified).length;
    const pending = adminFarmers.length - verified;
    const averageBid = adminBids.length ? adminBids.reduce((sum, bid) => sum + Number(bid.amount || 0), 0) / adminBids.length : 0;

    document.getElementById("adminActivity").innerHTML = `
        <div class="rounded-xl bg-green-50 p-4"><p class="text-sm text-green-700">Live auctions</p><strong class="text-2xl text-green-800">${active}</strong></div>
        <div class="rounded-xl bg-blue-50 p-4"><p class="text-sm text-blue-700">Verified farmers</p><strong class="text-2xl text-blue-800">${verified}</strong></div>
        <div class="rounded-xl bg-amber-50 p-4"><p class="text-sm text-amber-700">Pending verification</p><strong class="text-2xl text-amber-800">${pending}</strong></div>
        <div class="rounded-xl bg-slate-50 p-4"><p class="text-sm text-slate-500">Average bid</p><strong class="text-2xl text-slate-800">${formatCurrency(averageBid.toFixed(0))}</strong></div>
    `;
}

function renderFarmerVerification() {
    const container = document.getElementById("farmerVerificationTable");
    container.innerHTML = adminFarmers.map(farmer => `
        <tr>
            <td><strong>${escapeHTML(farmer.name)}</strong></td>
            <td>${escapeHTML(farmer.location || "Not provided")}</td>
            <td>${escapeHTML(farmer.phone || "Not provided")}</td>
            <td><span class="badge ${farmer.verified ? "text-bg-success" : "text-bg-warning"}">${farmer.verified ? "Verified" : "Pending"}</span></td>
            <td><button class="btn btn-sm ${farmer.verified ? "btn-outline-secondary" : "btn-success"}" data-verify-id="${farmer.id}" data-next-value="${!farmer.verified}">${farmer.verified ? "Mark Unverified" : "Verify Farmer"}</button></td>
        </tr>
    `).join("");

    container.querySelectorAll("[data-verify-id]").forEach(button => {
        button.addEventListener("click", () => updateFarmerVerification(button.dataset.verifyId, button.dataset.nextValue === "true"));
    });
}

async function updateFarmerVerification(id, verified) {
    try {
        const response = await fetch(`/api/farmers/${id}/verification`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verified })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to update farmer verification.");

        const farmer = adminFarmers.find(item => Number(item.id) === Number(id));
        if (farmer) farmer.verified = verified;
        renderAdminStatistics();
        renderAdminActivity();
        renderAdminInsights();
        renderFarmerVerification();
        await refreshAdminNotifications();
        showDashboardMessage(result.message, "success");
    } catch (error) {
        showDashboardMessage(error.message, "danger");
    }
}

async function refreshAdminNotifications() {
    adminNotifications = await loadNotifications("Admin", "Admin");
    renderNotificationCenter("notificationList", "notificationBadge", adminNotifications);
}

function markAllAdminNotificationsRead() {
    markAllNotificationsRead(adminNotifications);
    renderNotificationCenter("notificationList", "notificationBadge", adminNotifications);
}


function renderAdminInsights() {
    const container = document.getElementById("adminInsights");
    if (!container) return;

    const bidByAuction = adminAuctions.map(auction => ({
        label: auction.cropName || auction.title || `Auction #${auction.id}`,
        value: getBidCountForAuction(adminBids, auction.id)
    })).sort((a, b) => b.value - a.value).slice(0, 5);

    const farmerBidCounts = adminFarmers.map(farmer => {
        const farmerAuctionIds = adminAuctions.filter(auction => Number(auction.farmerId) === Number(farmer.id) || String(auction.farmerName).toLowerCase() === String(farmer.name).toLowerCase()).map(auction => Number(auction.id));
        return { label: farmer.name, value: adminBids.filter(bid => farmerAuctionIds.includes(Number(bid.auctionId))).length };
    }).sort((a, b) => b.value - a.value).slice(0, 5);

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div><h4 class="font-semibold text-slate-800 mb-3">Bids by Auction</h4><div id="adminAuctionChart" class="space-y-3"></div></div>
            <div><h4 class="font-semibold text-slate-800 mb-3">Bids by Farmer</h4><div id="adminFarmerChart" class="space-y-3"></div></div>
        </div>
    `;

    renderSimpleBarChart("adminAuctionChart", bidByAuction, value => `${value} bids`);
    renderSimpleBarChart("adminFarmerChart", farmerBidCounts, value => `${value} bids`);
}
