let myAuctions = [];

document.addEventListener("DOMContentLoaded", initializeFarmerAuctions);

async function initializeFarmerAuctions() {
    document.getElementById("logoutButton")?.addEventListener("click", logout);
    document.getElementById("openCreateAuctionButton")?.addEventListener("click", openCreateAuctionModal);
    document.getElementById("closeCreateAuctionButton")?.addEventListener("click", closeCreateAuctionModal);
    document.getElementById("cancelCreateAuctionButton")?.addEventListener("click", closeCreateAuctionModal);
    document.getElementById("createAuctionModal")?.addEventListener("click", event => {
        if (event.target.id === "createAuctionModal") closeCreateAuctionModal();
    });
    document.getElementById("createAuctionForm")?.addEventListener("submit", submitCreateAuction);
    document.getElementById("getLocationButton")?.addEventListener("click", useCurrentLocation);

    await loadMyAuctions();

    // Support "Create Auction" shortcuts elsewhere (e.g. the farmer
    // dashboard) linking here with ?create=1 to open the form directly.
    if (new URLSearchParams(window.location.search).get("create") === "1") {
        openCreateAuctionModal();
    }
}

async function loadMyAuctions() {
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
                <button type="button" id="emptyStateCreateAuction" class="mt-5 inline-flex rounded-lg bg-agrigreen-600 px-4 py-2 text-sm font-semibold text-white hover:bg-agrigreen-700">Create auction</button>
            </div>`;
        document.getElementById("emptyStateCreateAuction")?.addEventListener("click", openCreateAuctionModal);
        return;
    }

    container.innerHTML = myAuctions.map(auction => {
        // Farmers may only end an auction early while it can still be bid on.
        const canEnd = auction.status === "Active" || auction.status === "Scheduled";

        return `
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
            <div class="mt-5 flex gap-2">
                <button data-auction-id="${escapeHTML(auction.id)}" class="manage-auction flex-1 rounded-lg bg-agrigreen-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-agrigreen-700">View and manage auction</button>
                ${canEnd ? `<button data-auction-id="${escapeHTML(auction.id)}" class="end-auction rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">End Auction</button>` : ""}
            </div>
        </article>`;
    }).join("");

    container.querySelectorAll(".manage-auction").forEach(button => {
        button.addEventListener("click", () => {
            window.location.href = `/auctions.html?auction=${encodeURIComponent(button.dataset.auctionId)}`;
        });
    });

    container.querySelectorAll(".end-auction").forEach(button => {
        button.addEventListener("click", () => endAuction(button.dataset.auctionId));
    });
}

async function endAuction(auctionId) {
    const auction = myAuctions.find(item => String(item.id) === String(auctionId));
    if (!auction) return;

    const confirmed = confirm(
        `End the auction for ${auction.cropName || auction.title || "this crop"} now? ` +
        "Bidding will stop immediately, before its scheduled end time."
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/auctions/${auctionId}/status`, {
            method: "PATCH",
            headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "Closed" })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Unable to end the auction.");

        showPageMessage("Auction ended successfully.", "success");
        await loadMyAuctions();
    } catch (error) {
        showPageMessage(error.message, "danger");
    }
}

function openCreateAuctionModal() {
    const form = document.getElementById("createAuctionForm");
    form?.reset();
    document.getElementById("createAuctionFormMessage").innerHTML = "";

    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    document.getElementById("startTime").value = toDateTimeLocal(now);
    document.getElementById("endTime").value = toDateTimeLocal(end);

    document.getElementById("locationStatus").textContent = "Click the button to detect your current location.";
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";

    const modal = document.getElementById("createAuctionModal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeCreateAuctionModal() {
    const modal = document.getElementById("createAuctionModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

function toDateTimeLocal(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useCurrentLocation() {
    const status = document.getElementById("locationStatus");
    if (!navigator.geolocation) {
        status.textContent = "Geolocation is not supported by this browser.";
        return;
    }

    status.textContent = "Detecting your location…";

    navigator.geolocation.getCurrentPosition(
        position => {
            document.getElementById("latitude").value = position.coords.latitude;
            document.getElementById("longitude").value = position.coords.longitude;
            status.textContent = `Location detected (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}).`;
        },
        () => {
            status.textContent = "Unable to detect location. You can leave this blank.";
        }
    );
}

async function submitCreateAuction(event) {
    event.preventDefault();

    const messageBox = document.getElementById("createAuctionFormMessage");
    messageBox.innerHTML = "";

    const cropName = document.getElementById("cropName").value.trim();
    const category = document.getElementById("category").value;
    const quantity = Number(document.getElementById("quantity").value);
    const basePrice = Number(document.getElementById("basePrice").value);
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;
    const latitude = document.getElementById("latitude").value;
    const longitude = document.getElementById("longitude").value;

    if (!cropName || !category || !quantity || quantity <= 0 || !basePrice || basePrice <= 0) {
        messageBox.innerHTML = formMessage("Enter a crop, category, positive quantity and positive base price.", "danger");
        return;
    }

    if (!startTime || !endTime || new Date(endTime) <= new Date(startTime)) {
        messageBox.innerHTML = formMessage("End time must be later than the start time.", "danger");
        return;
    }

    const submitButton = document.getElementById("auctionSubmitButton");
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Creating Auction...";

    try {
        const response = await fetch("/api/auctions", {
            method: "POST",
            headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                cropName,
                title: cropName,
                category,
                quantity,
                basePrice,
                currentBid: basePrice,
                minimumIncrement: 0,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                latitude,
                longitude
            })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Unable to create auction.");

        closeCreateAuctionModal();
        showPageMessage(result.message || "Auction created successfully.", "success");
        await loadMyAuctions();
    } catch (error) {
        messageBox.innerHTML = formMessage(error.message, "danger");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

function formMessage(message, type) {
    const color = type === "danger" ? "red" : "green";
    return `<div class="mb-2 rounded-lg border border-${color}-200 bg-${color}-50 px-3 py-2 text-sm text-${color}-700">${escapeHTML(message)}</div>`;
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
