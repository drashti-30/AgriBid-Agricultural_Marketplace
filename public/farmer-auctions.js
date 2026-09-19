let myAuctions = [];

document.addEventListener("DOMContentLoaded", initializeFarmerAuctions);

async function initializeFarmerAuctions() {
    document.getElementById("logoutButton")?.addEventListener("click", logout);

    try {
        const token = getAuthToken();
        if (!token) throw new Error("Please log in as a farmer to manage your auctions.");

        const userResponse = await fetch("/api/auth/me", { headers: getAuthHeaders() });
        const userData = await userResponse.json().catch(() => ({}));
        if (!userResponse.ok || String(userData.user?.role || "").toLowerCase() !== "farmer") {
            throw new Error("Farmer access is required for this page.");
        }

        const response = await fetch("/api/farmer/auctions", { headers: getAuthHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || "Unable to load your auctions.");

        myAuctions = Array.isArray(data) ? data : [];
        renderMyAuctions();
    } catch (error) {
        showPageMessage(error.message, "danger");
        document.getElementById("farmerAuctionList").innerHTML = "";
    }
}

function renderMyAuctions() {
    const container = document.getElementById("farmerAuctionList");

    if (!myAuctions.length) {
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center md:col-span-2 xl:col-span-3">
                <h2 class="font-semibold text-slate-800">You have not created any auctions yet.</h2>
                <p class="mt-2 text-sm text-slate-500">Create your first crop listing to begin receiving bids.</p>
                <a href="/auctions.html" class="mt-5 inline-flex rounded-lg bg-agrigreen-600 px-4 py-2 text-sm font-semibold text-white hover:bg-agrigreen-700">Create auction</a>
            </div>`;
        return;
    }

    container.innerHTML = myAuctions.map(auction => `
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-agrigreen-600">Auction #${escapeHTML(auction.id)}</p>
                    <h2 class="mt-1 text-xl font-bold text-slate-900">${escapeHTML(auction.cropName || auction.title || "Crop auction")}</h2>
                    <p class="mt-1 text-sm text-slate-500">${escapeHTML(auction.category || "General")} · ${escapeHTML(auction.quantity)} ${escapeHTML(auction.unit || "units")}</p>
                </div>
                <span class="rounded-full px-3 py-1 text-xs font-semibold ${statusClass(auction.status)}">${escapeHTML(auction.status)}</span>
            </div>
            <div class="mt-5 grid grid-cols-2 gap-4 border-y border-slate-100 py-4 text-sm">
                <div><span class="block text-slate-500">Current bid</span><strong class="text-agrigreen-700">${formatCurrency(auction.currentBid || auction.basePrice)}</strong></div>
                <div><span class="block text-slate-500">Ends</span><strong>${escapeHTML(formatDateTime(auction.endTime))}</strong></div>
            </div>
            <button data-auction-id="${escapeHTML(auction.id)}" class="manage-auction mt-5 w-full rounded-lg bg-agrigreen-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-agrigreen-700">View and manage auction</button>
        </article>`).join("");

    container.querySelectorAll(".manage-auction").forEach(button => {
        button.addEventListener("click", () => {
            window.location.href = `/auctions.html?auction=${encodeURIComponent(button.dataset.auctionId)}`;
        });
    });
}

function statusClass(status) {
    return ({ Active: "bg-green-100 text-green-700", Scheduled: "bg-blue-100 text-blue-700", Closed: "bg-slate-200 text-slate-700", Cancelled: "bg-red-100 text-red-700" })[status] || "bg-slate-100 text-slate-700";
}

function showPageMessage(message, type) {
    document.getElementById("farmerAuctionsMessage").innerHTML = `<div class="rounded-xl border border-${type === "danger" ? "red" : "green"}-200 bg-${type === "danger" ? "red" : "green"}-50 p-4 text-sm text-${type === "danger" ? "red" : "green"}-700">${escapeHTML(message)}</div>`;
}

function logout() {
    localStorage.removeItem("agribidUser");
    localStorage.removeItem("agribidToken");
    sessionStorage.removeItem("agribidUser");
    sessionStorage.removeItem("agribidToken");
    window.location.href = "/login.html";
}
