let allAuctions = [];
let selectedAuction = null;
let editingAuctionId = null;
let countdownTimer = null;
let comparisonSelection = [];

const STORAGE_KEYS = {
    AUCTION_DRAFT: "agribidAuctionDraft",
    WISHLIST: "agribidWishlist",
    UI_PREFERENCES: "agribidUIPreferences",
    RECENTLY_VIEWED: "agribidRecentlyViewedAuctions"
};

document.addEventListener("DOMContentLoaded", () => {
    initializeLocalStorage();
    setupEventListeners();
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
    applyTheme();
    setupAuctionDraft();
    restoreAuctionDraft();
    setupCropImageDragDrop();
    loadAuctions();
    startCountdownRefresh();
});

function setupEventListeners() {
    document.getElementById("auctionSearch")?.addEventListener("input", renderFilteredAuctions);
    document.getElementById("categoryFilter")?.addEventListener("change", renderFilteredAuctions);
    document.getElementById("statusFilter")?.addEventListener("change", renderFilteredAuctions);
    document.getElementById("sortAuctions")?.addEventListener("change", renderFilteredAuctions);
    document.getElementById("minPriceFilter")?.addEventListener("input", renderFilteredAuctions);
    document.getElementById("maxPriceFilter")?.addEventListener("input", renderFilteredAuctions);
    document.getElementById("clearSearch")?.addEventListener("click", clearFilters);
    document.getElementById("modalBidButton")?.addEventListener("click", openBidModal);
    document.getElementById("submitBidButton")?.addEventListener("click", submitBid);
    document.getElementById("createAuctionButton")?.addEventListener("click", openCreateAuctionModal);
    document.getElementById("createAuctionForm")?.addEventListener("submit", saveAuction);
    document.getElementById("getLocationButton")?.addEventListener("click", getCurrentLocation);
    document.getElementById("wishlistFilter")?.addEventListener("change", renderFilteredAuctions);
    document.getElementById("compareAuctionsButton")?.addEventListener("click", openComparisonModal);
    document.getElementById("clearComparison")?.addEventListener("click", clearComparison);
}

function initializeLocalStorage() {
    try {
        if (!localStorage.getItem(STORAGE_KEYS.WISHLIST)) {
            localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.UI_PREFERENCES)) {
            localStorage.setItem(
                STORAGE_KEYS.UI_PREFERENCES,
                JSON.stringify({ theme: "light", compactMode: false })
            );
        }
        if (!localStorage.getItem(STORAGE_KEYS.RECENTLY_VIEWED)) {
            localStorage.setItem(STORAGE_KEYS.RECENTLY_VIEWED, JSON.stringify([]));
        }
    } catch (error) {
        console.error("Unable to initialize Local Storage:", error);
    }
}

function getStoredArray(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
        console.error(`Unable to read ${key}:`, error);
        return [];
    }
}

function setStoredArray(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Unable to save ${key}:`, error);
    }
}

function getWishlist() {
    return getStoredArray(STORAGE_KEYS.WISHLIST).map(Number);
}

function isWishlisted(auctionId) {
    return getWishlist().includes(Number(auctionId));
}

function toggleWishlist(auctionId) {
    const id = Number(auctionId);
    const wishlist = getWishlist();
    const index = wishlist.indexOf(id);

    if (index === -1) {
        wishlist.push(id);
        showAuctionAlert("Auction added to your wishlist.", "success");
    } else {
        wishlist.splice(index, 1);
        showAuctionAlert("Auction removed from your wishlist.", "info");
    }

    setStoredArray(STORAGE_KEYS.WISHLIST, wishlist);
    renderFilteredAuctions();
}

function addRecentlyViewed(auctionId) {
    const id = Number(auctionId);
    const recent = getStoredArray(STORAGE_KEYS.RECENTLY_VIEWED).map(Number);
    const updated = [id, ...recent.filter(item => item !== id)].slice(0, 6);
    setStoredArray(STORAGE_KEYS.RECENTLY_VIEWED, updated);
}

function getRecentlyViewedAuctions() {
    const ids = getStoredArray(STORAGE_KEYS.RECENTLY_VIEWED).map(Number);
    return ids
        .map(id => allAuctions.find(auction => Number(auction.id) === id))
        .filter(Boolean);
}

function setupAuctionDraft() {
    const form = document.getElementById("createAuctionForm");
    if (!form) return;

    document.getElementById("saveDraftButton")?.addEventListener("click", saveAuctionDraft);
    document.getElementById("clearDraftButton")?.addEventListener("click", clearAuctionDraft);
    form.addEventListener("input", saveAuctionDraft);
    form.addEventListener("change", saveAuctionDraft);
}

function collectAuctionDraft() {
    const form = document.getElementById("createAuctionForm");
    if (!form) return null;

    const formData = new FormData(form);
    const draft = {};
    formData.forEach((value, key) => {
        draft[key] = value;
    });

    const latitude = document.getElementById("latitude");
    const longitude = document.getElementById("longitude");
    if (latitude) draft.latitude = latitude.value;
    if (longitude) draft.longitude = longitude.value;

    return { ...draft, savedAt: new Date().toISOString() };
}

function saveAuctionDraft() {
    if (editingAuctionId) return;

    const draft = collectAuctionDraft();
    if (!draft) return;

    try {
        localStorage.setItem(STORAGE_KEYS.AUCTION_DRAFT, JSON.stringify(draft));
        showDraftStatus("Draft saved successfully.", "success");
    } catch (error) {
        console.error("Unable to save auction draft:", error);
        showDraftStatus("Unable to save draft.", "danger");
    }
}

function restoreAuctionDraft() {
    const form = document.getElementById("createAuctionForm");
    if (!form) return;

    try {
        const savedDraft = localStorage.getItem(STORAGE_KEYS.AUCTION_DRAFT);
        if (!savedDraft) return;

        const draft = JSON.parse(savedDraft);
        Object.entries(draft).forEach(([key, value]) => {
            if (key === "savedAt") return;
            const field = form.elements.namedItem(key);
            if (field) field.value = value;
        });

        showDraftStatus("Saved auction draft restored.", "info");
    } catch (error) {
        console.error("Unable to restore auction draft:", error);
        localStorage.removeItem(STORAGE_KEYS.AUCTION_DRAFT);
    }
}

function clearAuctionDraft() {
    if (!confirm("Are you sure you want to clear the saved auction draft?")) return;

    localStorage.removeItem(STORAGE_KEYS.AUCTION_DRAFT);
    document.getElementById("createAuctionForm")?.reset();
    setDefaultAuctionTimes();
    showDraftStatus("Saved auction draft has been cleared.", "warning");
}

function showDraftStatus(message, type) {
    const status = document.getElementById("draftStatus");
    if (!status) return;

    status.className = `alert alert-${type} mt-3`;
    status.textContent = message;
    status.classList.remove("d-none");
    setTimeout(() => status.classList.add("d-none"), 3000);
}

let selectedCropImageURL = null;

function setupCropImageDragDrop() {
    const dropZone = document.getElementById("cropImageDropZone");
    const fileInput = document.getElementById("cropImageInput");
    const selectButton = document.getElementById("selectCropImageButton");
    const removeButton = document.getElementById("removeCropImageButton");

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener("click", event => {
        if (event.target !== selectButton) fileInput.click();
    });

    selectButton?.addEventListener("click", event => {
        event.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener("change", event => {
        const file = event.target.files[0];
        if (file) previewCropImage(file);
    });

    dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("border-primary", "bg-success-subtle");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("border-primary", "bg-success-subtle");
    });

    dropZone.addEventListener("drop", event => {
        event.preventDefault();
        dropZone.classList.remove("border-primary", "bg-success-subtle");
        const file = event.dataTransfer.files[0];
        if (file) previewCropImage(file);
    });

    removeButton?.addEventListener("click", removeCropImage);
}

function previewCropImage(file) {
    if (!file.type.startsWith("image/")) {
        showCropImageStatus("Please select a valid image file.", "danger");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showCropImageStatus("Image size must be less than 5 MB.", "danger");
        return;
    }

    if (selectedCropImageURL) URL.revokeObjectURL(selectedCropImageURL);
    selectedCropImageURL = URL.createObjectURL(file);

    const preview = document.getElementById("cropImagePreview");
    const previewContainer = document.getElementById("cropImagePreviewContainer");
    preview.src = selectedCropImageURL;
    previewContainer.classList.remove("d-none");
    showCropImageStatus(`${file.name} selected successfully.`, "success");
}

function removeCropImage() {
    const input = document.getElementById("cropImageInput");
    const preview = document.getElementById("cropImagePreview");
    const previewContainer = document.getElementById("cropImagePreviewContainer");

    if (selectedCropImageURL) {
        URL.revokeObjectURL(selectedCropImageURL);
        selectedCropImageURL = null;
    }

    input.value = "";
    preview.src = "";
    previewContainer.classList.add("d-none");
    showCropImageStatus("Crop image removed.", "info");
}

function showCropImageStatus(message, type) {
    const status = document.getElementById("cropImageStatus");
    if (!status) return;
    status.className = `form-text text-${type} mt-2`;
    status.textContent = message;
}

function getCurrentLocation() {
    const status = document.getElementById("locationStatus");
    const latitude = document.getElementById("latitude");
    const longitude = document.getElementById("longitude");

    if (!navigator.geolocation) {
        status.textContent = "Geolocation is not supported by this browser.";
        status.className = "form-text text-danger mt-2";
        return;
    }

    status.textContent = "Detecting your current location...";
    status.className = "form-text text-success mt-2";
    latitude.value = "";
    longitude.value = "";

    navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

function handleLocationSuccess(position) {
    document.getElementById("latitude").value = position.coords.latitude.toFixed(6);
    document.getElementById("longitude").value = position.coords.longitude.toFixed(6);
    const status = document.getElementById("locationStatus");
    status.textContent = "✓ Location detected successfully.";
    status.className = "form-text text-success mt-2";
}

function handleLocationError(error) {
    const messages = {
        1: "Location permission was denied. Please allow location access.",
        2: "Your location could not be determined.",
        3: "Location request timed out. Please try again."
    };
    const status = document.getElementById("locationStatus");
    status.textContent = messages[error.code] || "Unable to retrieve your location.";
    status.className = "form-text text-danger mt-2";
}

async function loadAuctions() {
    setLoadingState(true);

    try {
        const response = await fetch("/api/auctions");
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to load auctions.");
        }

        allAuctions = result;
        populateCategoryFilter();
        const query = new URLSearchParams(window.location.search);
        if (query.get("wishlist") === "1") {
            document.getElementById("wishlistFilter").checked = true;
        }
        renderFilteredAuctions();
        renderRecentlyViewed();
        renderComparisonBar();
        handleAuctionQuery();
    } catch (error) {
        showAuctionAlert(error.message, "danger");
        document.getElementById("auctionCount").textContent = "Unable to load auctions.";
        document.getElementById("auctionCards").innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">Unable to load auctions. Please try again.</div>
            </div>
        `;
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    const count = document.getElementById("auctionCount");
    if (isLoading) count.textContent = "Loading auctions...";
}

function populateCategoryFilter() {
    const select = document.getElementById("categoryFilter");
    if (!select) return;

    const currentValue = select.value;
    const categories = [...new Set(allAuctions.map(auction => auction.category).filter(Boolean))].sort();

    select.innerHTML = `<option value="">All Categories</option>${categories
        .map(category => `<option value="${escapeAttribute(category)}">${escapeHTML(category)}</option>`)
        .join("")}`;

    select.value = categories.includes(currentValue) ? currentValue : "";
}

function getFilteredAuctions() {
    const searchTerm = document.getElementById("auctionSearch")?.value.trim().toLowerCase() || "";
    const category = document.getElementById("categoryFilter")?.value || "";
    const status = document.getElementById("statusFilter")?.value || "";
    const minPrice = Number(document.getElementById("minPriceFilter")?.value || 0);
    const maxPriceValue = document.getElementById("maxPriceFilter")?.value;
    const maxPrice = maxPriceValue ? Number(maxPriceValue) : Infinity;
    const wishlistOnly = document.getElementById("wishlistFilter")?.checked || false;
    const sort = document.getElementById("sortAuctions")?.value || "endingSoon";
    const wishlist = getWishlist();

    const filtered = allAuctions.filter(auction => {
        const searchableText = [
            auction.title,
            auction.cropName,
            auction.farmerName,
            auction.category,
            auction.status,
            auction.quality,
            auction.location
        ].join(" ").toLowerCase();

        const price = Number(auction.currentBid || auction.basePrice || 0);
        const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
        const matchesCategory = !category || auction.category === category;
        const matchesStatus = !status || getAuctionStatus(auction) === status;
        const matchesPrice = price >= minPrice && price <= maxPrice;
        const matchesWishlist = !wishlistOnly || wishlist.includes(Number(auction.id));

        return matchesSearch && matchesCategory && matchesStatus && matchesPrice && matchesWishlist;
    });

    filtered.sort((a, b) => {
        if (sort === "priceLow") return getCurrentBid(a) - getCurrentBid(b);
        if (sort === "priceHigh") return getCurrentBid(b) - getCurrentBid(a);
        if (sort === "quantityHigh") return Number(b.quantity || 0) - Number(a.quantity || 0);
        if (sort === "newest") return Number(b.id) - Number(a.id);
        return getTimeRemaining(a) - getTimeRemaining(b);
    });

    return filtered;
}

function renderFilteredAuctions() {
    renderAuctions(getFilteredAuctions());
}

function clearFilters() {
    document.getElementById("auctionSearch").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("minPriceFilter").value = "";
    document.getElementById("maxPriceFilter").value = "";
    document.getElementById("sortAuctions").value = "endingSoon";
    document.getElementById("wishlistFilter").checked = false;
    renderFilteredAuctions();
}

function renderAuctions(auctions) {
    const cards = document.getElementById("auctionCards");
    const tableBody = document.getElementById("auctionTableBody");
    const count = document.getElementById("auctionCount");

    count.textContent = `${auctions.length} auction${auctions.length === 1 ? "" : "s"} found`;

    if (auctions.length === 0) {
        cards.innerHTML = `
            <div class="col-12">
                <div class="empty-auction-state text-center py-5">
                    <div class="fs-1">🔍</div>
                    <h4 class="fw-bold mt-3">No auctions found</h4>
                    <p class="text-muted mb-3">Try changing your search or filters.</p>
                    <button class="btn btn-outline-success" onclick="clearFilters()">Reset Filters</button>
                </div>
            </div>
        `;
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No matching auctions.</td></tr>`;
        return;
    }

    cards.innerHTML = auctions.map(createAuctionCard).join("");
    tableBody.innerHTML = auctions.map(createAuctionRow).join("");
}

function createAuctionCard(auction) {
    const status = getAuctionStatus(auction);
    const currentBid = getCurrentBid(auction);
    const minimumBid = currentBid + Number(auction.minimumIncrement || 1);
    const wishlisted = isWishlisted(auction.id);
    const statusClass = getStatusClass(status);
    const verifiedBadge = auction.verified
        ? `<span class="badge rounded-pill text-bg-light border text-success">✓ Verified Farmer</span>`
        : "";

    return `
        <div class="col-12 col-md-6 col-xl-4">
            <div class="card auction-card h-100 shadow-sm border-0">
                <div class="auction-card-top">
                    <div class="d-flex justify-content-between align-items-start gap-2">
                        <span class="badge text-bg-success">Auction #${auction.id}</span>
                        <button class="wishlist-button ${wishlisted ? "active" : ""}" onclick="toggleWishlist(${auction.id})" title="${wishlisted ? "Remove from wishlist" : "Add to wishlist"}">
                            ${wishlisted ? "♥" : "♡"}
                        </button>
                    </div>
                    <div class="d-flex align-items-center justify-content-between mt-3">
                        <span class="badge text-bg-${statusClass}">${status}</span>
                        <label class="small text-muted d-flex align-items-center gap-1">
                            <input type="checkbox" class="form-check-input compare-checkbox" ${comparisonSelection.includes(Number(auction.id)) ? "checked" : ""} onchange="toggleComparison(${auction.id}, this.checked)">
                            Compare
                        </label>
                        ${verifiedBadge}
                    </div>
                </div>

                <div class="card-body d-flex flex-column pt-3">
                    <h4 class="card-title fw-bold text-success mb-1">${escapeHTML(auction.cropName || auction.title || "Crop Auction")}</h4>
                    <p class="text-muted small mb-3">${escapeHTML(auction.farmerName || "Verified Farmer")}</p>

                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <div class="auction-info">
                                <small class="text-muted d-block">Quantity</small>
                                <strong>${escapeHTML(String(auction.quantity || "N/A"))} ${escapeHTML(auction.unit || "units")}</strong>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="auction-info">
                                <small class="text-muted d-block">Quality</small>
                                <strong>${escapeHTML(auction.quality || "Standard")}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="auction-countdown ${status === "Active" ? "active" : ""}">
                        <small>${status === "Scheduled" ? "Starts in" : status === "Active" ? "Ends in" : "Auction ended"}</small>
                        <strong data-countdown-id="${auction.id}">${formatCountdown(auction)}</strong>
                    </div>

                    <div class="mt-auto pt-3">
                        <div class="d-flex justify-content-between align-items-end mb-3">
                            <div>
                                <small class="text-muted d-block">Current Bid</small>
                                <span class="fs-4 fw-bold text-success">₹${formatNumber(currentBid)}</span>
                            </div>
                            <div class="text-end">
                                <small class="text-muted d-block">Next Minimum</small>
                                <strong>₹${formatNumber(minimumBid)}</strong>
                            </div>
                        </div>

                        <div class="d-flex gap-2">
                            <button class="btn btn-success flex-grow-1" onclick="openAuctionModal(${auction.id})">View Auction</button>
                            <button class="btn btn-outline-primary" onclick="openEditAuctionModal(${auction.id})" title="Edit Auction">Edit</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}


function toggleComparison(auctionId, checked) {
    const id = Number(auctionId);
    if (checked && !comparisonSelection.includes(id)) {
        if (comparisonSelection.length >= 3) {
            showAuctionAlert("You can compare up to 3 auctions at a time.", "warning");
            renderFilteredAuctions();
            return;
        }
        comparisonSelection.push(id);
    }
    if (!checked) comparisonSelection = comparisonSelection.filter(item => item !== id);
    renderComparisonBar();
}

function renderComparisonBar() {
    const bar = document.getElementById("comparisonBar");
    const count = document.getElementById("comparisonCount");
    if (!bar || !count) return;
    count.textContent = `${comparisonSelection.length}/3 selected`;
    bar.classList.toggle("d-none", comparisonSelection.length === 0);
}

function clearComparison() {
    comparisonSelection = [];
    renderComparisonBar();
    renderFilteredAuctions();
}

function openComparisonModal() {
    const selected = comparisonSelection
        .map(id => allAuctions.find(auction => Number(auction.id) === id))
        .filter(Boolean);

    if (selected.length < 2) {
        showAuctionAlert("Select at least two auctions to compare.", "warning");
        return;
    }

    const fields = [
        ["Crop", auction => auction.cropName || auction.title || "Crop"],
        ["Farmer", auction => auction.farmerName || "Farmer"],
        ["Category", auction => auction.category || "General"],
        ["Quality", auction => auction.quality || "Standard"],
        ["Quantity", auction => `${auction.quantity || 0} ${auction.unit || "units"}`],
        ["Base Price", auction => formatCurrency(auction.basePrice)],
        ["Current Bid", auction => formatCurrency(getCurrentBid(auction))],
        ["Next Minimum Bid", auction => formatCurrency(getCurrentBid(auction) + Number(auction.minimumIncrement || 1))],
        ["Status", auction => getAuctionStatus(auction)],
        ["Time", auction => formatCountdown(auction)],
        ["Location", auction => auction.location || "Not provided"]
    ];

    document.getElementById("comparisonModalBody").innerHTML = `
        <div class="table-responsive">
            <table class="table table-bordered align-middle comparison-table">
                <thead class="table-success">
                    <tr><th>Feature</th>${selected.map(auction => `<th>${escapeHTML(auction.cropName || auction.title || "Auction")}</th>`).join("")}</tr>
                </thead>
                <tbody>
                    ${fields.map(([label, getter]) => `<tr><th>${escapeHTML(label)}</th>${selected.map(auction => `<td>${escapeHTML(getter(auction))}</td>`).join("")}</tr>`).join("")}
                </tbody>
            </table>
        </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById("comparisonModal")).show();
}

function handleAuctionQuery() {
    const query = new URLSearchParams(window.location.search);
    const auctionId = Number(query.get("auction"));
    const editId = Number(query.get("edit"));

    if (auctionId) openAuctionModal(auctionId);
    if (editId) openEditAuctionModal(editId);
}

function createAuctionRow(auction) {
    const status = getAuctionStatus(auction);
    const statusClass = getStatusClass(status);

    return `
        <tr>
            <td class="fw-semibold">${escapeHTML(auction.cropName || auction.title || "Crop Auction")}</td>
            <td>${escapeHTML(auction.farmerName || "Verified Farmer")}</td>
            <td>${escapeHTML(String(auction.quantity || "N/A"))} ${escapeHTML(auction.unit || "")}</td>
            <td class="fw-bold text-success">₹${formatNumber(getCurrentBid(auction))}</td>
            <td><span class="badge text-bg-${statusClass}">${status}</span></td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-success" onclick="openAuctionModal(${auction.id})">View</button>
                    <button class="btn btn-sm btn-outline-primary" onclick="openEditAuctionModal(${auction.id})">Edit</button>
                </div>
            </td>
        </tr>
    `;
}

function openAuctionModal(auctionId) {
    const auction = allAuctions.find(item => Number(item.id) === Number(auctionId));
    if (!auction) return;

    selectedAuction = auction;
    addRecentlyViewed(auction.id);
    renderAuctionDetailsModal(auction);
    loadBidHistory(auction.id);
    renderRecentlyViewed();

    bootstrap.Modal.getOrCreateInstance(document.getElementById("auctionModal")).show();
}

function renderAuctionDetailsModal(auction) {
    const status = getAuctionStatus(auction);
    const currentBid = getCurrentBid(auction);
    const minimumIncrement = Number(auction.minimumIncrement || 1);
    const minimumNextBid = currentBid + minimumIncrement;

    document.getElementById("auctionModalBody").innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
                <span class="badge text-bg-success mb-2">Auction #${auction.id}</span>
                <h3 class="fw-bold text-success mb-1">${escapeHTML(auction.cropName || auction.title || "Crop Auction")}</h3>
                <p class="text-muted mb-0">${escapeHTML(auction.farmerName || "Verified Farmer")}</p>
            </div>
            <button class="wishlist-button ${isWishlisted(auction.id) ? "active" : ""}" onclick="toggleWishlist(${auction.id}); renderAuctionDetailsModal(selectedAuction)">
                ${isWishlisted(auction.id) ? "♥" : "♡"}
            </button>
        </div>

        <div class="row g-3">
            <div class="col-6"><small class="text-muted d-block">Category</small><strong>${escapeHTML(auction.category || "General")}</strong></div>
            <div class="col-6"><small class="text-muted d-block">Quality</small><strong>${escapeHTML(auction.quality || "Standard")}</strong></div>
            <div class="col-6"><small class="text-muted d-block">Quantity</small><strong>${escapeHTML(String(auction.quantity || "N/A"))} ${escapeHTML(auction.unit || "units")}</strong></div>
            <div class="col-6"><small class="text-muted d-block">Base Price</small><strong>₹${formatNumber(auction.basePrice || 0)}</strong></div>
            <div class="col-6"><small class="text-muted d-block">Current Bid</small><strong class="text-success">₹${formatNumber(currentBid)}</strong></div>
            <div class="col-6"><small class="text-muted d-block">Minimum Increment</small><strong>₹${formatNumber(minimumIncrement)}</strong></div>
            <div class="col-12"><small class="text-muted d-block">Farmer Location</small><strong>${escapeHTML(auction.location || "Location not provided")}</strong></div>
        </div>

        <div class="alert alert-${status === "Active" ? "success" : status === "Scheduled" ? "info" : "secondary"} mt-4 mb-3">
            <div class="d-flex justify-content-between align-items-center gap-3">
                <span>${status === "Active" ? "Auction ends in" : status === "Scheduled" ? "Auction starts in" : "Auction status"}</span>
                <strong data-modal-countdown="${auction.id}">${formatCountdown(auction)}</strong>
            </div>
        </div>

        <div class="alert alert-info mb-0">
            Minimum valid next bid: <strong>₹${formatNumber(minimumNextBid)}</strong>
        </div>

        <div class="mt-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="fw-bold mb-0">Bid History</h5>
                <span id="bidHistoryCount" class="badge text-bg-light border">Loading...</span>
            </div>
            <div id="bidHistory" class="bid-history-list">
                <div class="text-center text-muted py-3">Loading bid history...</div>
            </div>
        </div>
    `;

    document.getElementById("modalBidButton").disabled = status !== "Active";
    document.getElementById("modalBidButton").textContent = status === "Active" ? "Place Bid" : status;
}

async function loadBidHistory(auctionId) {
    const container = document.getElementById("bidHistory");
    const count = document.getElementById("bidHistoryCount");
    if (!container) return;

    try {
        const response = await fetch(`/api/bids?auctionId=${auctionId}`);
        const bids = await response.json();

        if (!response.ok) throw new Error(bids.message || "Unable to load bid history.");

        const sortedBids = bids.sort((a, b) => new Date(b.time) - new Date(a.time));
        count.textContent = `${sortedBids.length} bid${sortedBids.length === 1 ? "" : "s"}`;

        if (sortedBids.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No bids have been placed yet.</div>`;
            return;
        }

        container.innerHTML = sortedBids.map((bid, index) => `
            <div class="bid-history-item ${index === 0 ? "highest" : ""}">
                <div>
                    <strong>${escapeHTML(bid.buyerName || "Buyer")}</strong>
                    <small class="text-muted d-block">${formatDateTime(bid.time)}</small>
                </div>
                <strong class="text-success">₹${formatNumber(bid.amount)}</strong>
            </div>
        `).join("");
    } catch (error) {
        count.textContent = "Unavailable";
        container.innerHTML = `<div class="alert alert-warning mb-0">${escapeHTML(error.message)}</div>`;
    }
}

function openBidModal() {
    if (!selectedAuction || getAuctionStatus(selectedAuction) !== "Active") return;

    const currentBid = getCurrentBid(selectedAuction);
    const minimumBid = currentBid + Number(selectedAuction.minimumIncrement || 1);
    const bidAmount = document.getElementById("bidAmount");

    document.getElementById("bidAuctionName").textContent = selectedAuction.cropName || "Crop Auction";
    document.getElementById("bidCurrentAmount").textContent = `₹${formatNumber(currentBid)}`;
    document.getElementById("bidMinimumAmount").textContent = `₹${formatNumber(minimumBid)}`;
    document.getElementById("buyerName").value = "";
    bidAmount.value = minimumBid;
    bidAmount.min = minimumBid;
    document.getElementById("bidValidationMessage").textContent = `Minimum valid bid is ₹${formatNumber(minimumBid)}.`;

    bootstrap.Modal.getOrCreateInstance(document.getElementById("bidModal")).show();
}

async function submitBid() {
    if (!selectedAuction) return;

    const buyerName = document.getElementById("buyerName").value.trim();
    const amount = Number(document.getElementById("bidAmount").value);
    const minimumBid = getCurrentBid(selectedAuction) + Number(selectedAuction.minimumIncrement || 1);
    const validationMessage = document.getElementById("bidValidationMessage");

    if (!buyerName) {
        validationMessage.textContent = "Please enter your name.";
        validationMessage.className = "form-text text-danger";
        return;
    }

    if (!Number.isFinite(amount) || amount < minimumBid) {
        validationMessage.textContent = `Bid must be at least ₹${formatNumber(minimumBid)}.`;
        validationMessage.className = "form-text text-danger";
        return;
    }

    try {
        const response = await fetch("/api/bids", {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                auctionId: Number(selectedAuction.id),
                buyerName,
                amount
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to place bid.");

        bootstrap.Modal.getInstance(document.getElementById("bidModal"))?.hide();
        bootstrap.Modal.getInstance(document.getElementById("auctionModal"))?.hide();
        showAuctionAlert(result.message || "Bid placed successfully.", "success");
        await loadAuctions();
    } catch (error) {
        validationMessage.textContent = error.message;
        validationMessage.className = "form-text text-danger";
    }
}

function openCreateAuctionModal() {
    editingAuctionId = null;
    const form = document.getElementById("createAuctionForm");
    form.reset();
    document.getElementById("createAuctionModalLabel").textContent = "Create New Auction";
    document.getElementById("auctionSubmitButton").textContent = "Create Auction";
    document.getElementById("auctionStatusInfo").textContent = "Status is calculated automatically from the start and end time.";
    setDefaultAuctionTimes();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("createAuctionModal")).show();
}

function openEditAuctionModal(auctionId) {
    const auction = allAuctions.find(item => Number(item.id) === Number(auctionId));
    if (!auction) {
        showAuctionAlert("Auction not found.", "danger");
        return;
    }

    editingAuctionId = Number(auction.id);
    document.getElementById("createAuctionModalLabel").textContent = "Edit Auction";
    document.getElementById("auctionSubmitButton").textContent = "Save Changes";
    document.getElementById("auctionStatusInfo").textContent = "Status will be recalculated automatically from the auction times.";
    fillAuctionForm(auction);
    bootstrap.Modal.getOrCreateInstance(document.getElementById("createAuctionModal")).show();
}

function fillAuctionForm(auction) {
    document.getElementById("cropName").value = auction.cropName || "";
    document.getElementById("farmerName").value = auction.farmerName || "";
    document.getElementById("category").value = auction.category || "General";
    document.getElementById("quantity").value = auction.quantity || "";
    document.getElementById("basePrice").value = auction.basePrice || "";
    document.getElementById("minimumIncrement").value = auction.minimumIncrement || 1;
    document.getElementById("startTime").value = toDateTimeLocal(auction.startTime);
    document.getElementById("endTime").value = toDateTimeLocal(auction.endTime);
    document.getElementById("latitude").value = auction.latitude || "";
    document.getElementById("longitude").value = auction.longitude || "";
}

function setDefaultAuctionTimes() {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    document.getElementById("startTime").value = toDateTimeLocal(now.toISOString());
    document.getElementById("endTime").value = toDateTimeLocal(end.toISOString());
}

async function saveAuction(event) {
    event.preventDefault();

    const form = document.getElementById("createAuctionForm");

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const cropName = document.getElementById("cropName").value.trim();
    const farmerName = document.getElementById("farmerName").value.trim();
    const category = document.getElementById("category").value;
    const quantity = Number(document.getElementById("quantity").value);
    const basePrice = Number(document.getElementById("basePrice").value);
    const minimumIncrement = Number(
        document.getElementById("minimumIncrement").value
    );

    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;

    const latitude = document.getElementById("latitude").value;
    const longitude = document.getElementById("longitude").value;

    const validationMessage =
        document.getElementById("auctionValidationMessage");

    if (validationMessage) {
        validationMessage.classList.add("d-none");
    }

    if (
        !cropName ||
        !farmerName ||
        !category ||
        quantity <= 0 ||
        basePrice <= 0 ||
        minimumIncrement <= 0
    ) {
        if (validationMessage) {
            validationMessage.textContent =
                "Enter a crop, farmer, category, positive quantity, positive base price and positive bid increment.";
            validationMessage.classList.remove("d-none");
        }

        showAuctionAlert(
            "Please enter valid auction details.",
            "warning"
        );

        return;
    }

    if (
        !startTime ||
        !endTime ||
        new Date(endTime) <= new Date(startTime)
    ) {
        if (validationMessage) {
            validationMessage.textContent =
                "End time must be later than the start time.";
            validationMessage.classList.remove("d-none");
        }

        showAuctionAlert(
            "End time must be later than the start time.",
            "warning"
        );

        return;
    }

    try {
        /*
         * The database-backed API requires cropId.
         * The existing UI uses cropName, so resolve the
         * crop name to its database ID here.
         */
        const cropsResponse = await fetch("/api/crops");

        if (!cropsResponse.ok) {
            throw new Error("Unable to load crop information.");
        }

        const crops = await cropsResponse.json();

        const selectedCrop = crops.find(
            crop =>
                String(crop.name || "")
                    .trim()
                    .toLowerCase() === cropName.toLowerCase()
        );

        if (!selectedCrop) {
            throw new Error(
                `Crop "${cropName}" was not found in the database.`
            );
        }

        /*
         * Support the API's crop ID naming.
         * GET /api/crops returns the database crop identifier.
         */
        const cropId = Number(
            selectedCrop.id ?? selectedCrop.cropId
        );

        if (!Number.isInteger(cropId) || cropId <= 0) {
            throw new Error("Invalid crop ID.");
        }

        /*
         * Phase 12 API contract:
         *
         * - cropId is required
         * - title is required
         * - farmerId is NOT sent
         * - farmerName is NOT trusted by the backend
         *
         * The backend derives farmerId from the authenticated
         * user's JWT.
         *
         * We use the existing crop name as the auction title
         * so the current UI does not need to change.
         */
        const auctionData = {
            cropId: cropId,
            title: cropName,
            category: category,
            quantity: quantity,
            basePrice: basePrice,
            currentBid: basePrice,
            minimumIncrement: minimumIncrement,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            latitude: latitude,
            longitude: longitude
        };

        const url = editingAuctionId
            ? `/api/auctions/${editingAuctionId}`
            : "/api/auctions";

        const method = editingAuctionId
            ? "PATCH"
            : "POST";

        const submitButton =
            document.getElementById("auctionSubmitButton");

        const originalSubmitText =
            submitButton?.textContent || "Save Auction";

        if (submitButton) {
            submitButton.disabled = true;

            submitButton.textContent =
                editingAuctionId
                    ? "Saving Changes..."
                    : "Creating Auction...";
        }

        const response = await fetch(url, {
            method,
            headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(auctionData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Unable to save auction."
            );
        }

        bootstrap.Modal
            .getInstance(
                document.getElementById("createAuctionModal")
            )
            ?.hide();

        /*
         * Preserve the existing Local Storage draft functionality.
         */
        localStorage.removeItem(
            STORAGE_KEYS.AUCTION_DRAFT
        );

        showAuctionAlert(
            result.message ||
            "Auction saved successfully.",
            "success"
        );

        editingAuctionId = null;

        await loadAuctions();

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalSubmitText;
        }

    } catch (error) {

        showAuctionAlert(
            error.message,
            "danger"
        );

        const submitButton =
            document.getElementById("auctionSubmitButton");

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent =
                editingAuctionId
                    ? "Save Changes"
                    : "Create Auction";
        }
    }
}

async function deleteAuction(auctionId) {
    const auction = allAuctions.find(item => Number(item.id) === Number(auctionId));
    if (!auction) {
        showAuctionAlert("Auction not found.", "danger");
        return;
    }

    if (!confirm(`Are you sure you want to delete the ${auction.cropName || "selected"} auction?`)) return;

    try {
        const response = await fetch(`/api/auctions/${auctionId}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to delete auction.");

        showAuctionAlert(result.message || "Auction deleted successfully.", "success");
        await loadAuctions();
    } catch (error) {
        showAuctionAlert(error.message, "danger");
    }
}

function startCountdownRefresh() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        updateCountdowns();
        refreshAutomaticStatuses();
    }, 1000);
}

function updateCountdowns() {
    document.querySelectorAll("[data-countdown-id]").forEach(element => {
        const auction = allAuctions.find(item => Number(item.id) === Number(element.dataset.countdownId));
        if (auction) element.textContent = formatCountdown(auction);
    });

    const modalCountdown = document.querySelector("[data-modal-countdown]");
    if (modalCountdown) {
        const auction = allAuctions.find(item => Number(item.id) === Number(modalCountdown.dataset.modalCountdown));
        if (auction) {
            modalCountdown.textContent = formatCountdown(auction);
            if (selectedAuction && Number(selectedAuction.id) === Number(auction.id)) {
                selectedAuction = auction;
            }
        }
    }
}

let lastStatusRefresh = 0;
async function refreshAutomaticStatuses() {
    const now = Date.now();
    if (now - lastStatusRefresh < 60000 || !allAuctions.length) return;
    lastStatusRefresh = now;

    const changed = allAuctions.some(auction => getAuctionStatus(auction) !== (auction.status || ""));
    if (changed) {
        await loadAuctions();
    }
}

function getAuctionStatus(auction) {
    const now = Date.now();
    const start = auction.startTime ? new Date(auction.startTime).getTime() : 0;
    const end = auction.endTime ? new Date(auction.endTime).getTime() : 0;

    if (start && now < start) return "Scheduled";
    if (end && now >= end) return "Closed";
    return "Active";
}

function getTimeRemaining(auction) {
    const status = getAuctionStatus(auction);
    if (status === "Scheduled") return new Date(auction.startTime).getTime() - Date.now();
    if (status === "Active") return new Date(auction.endTime).getTime() - Date.now();
    return Number.MAX_SAFE_INTEGER;
}

function formatCountdown(auction) {
    const status = getAuctionStatus(auction);
    if (status === "Closed") return "Ended";

    const milliseconds = Math.max(0, getTimeRemaining(auction));
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function getCurrentBid(auction) {
    return Number(auction.currentBid || auction.basePrice || 0);
}

function getStatusClass(status) {
    return status === "Active" ? "success" : status === "Scheduled" ? "info" : "secondary";
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}

function formatDateTime(value) {
    if (!value) return "Time unavailable";
    return new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHTML(value);
}

function renderRecentlyViewed() {
    const section = document.getElementById("recentlyViewedSection");
    const container = document.getElementById("recentlyViewedList");
    if (!section || !container) return;

    const recent = getRecentlyViewedAuctions();
    section.classList.toggle("d-none", recent.length === 0);
    if (!recent.length) return;

    container.innerHTML = recent.map(auction => `
        <button class="recent-auction-card text-start" onclick="openAuctionModal(${auction.id})">
            <span class="badge text-bg-${getStatusClass(getAuctionStatus(auction))}">${getAuctionStatus(auction)}</span>
            <strong class="d-block mt-2">${escapeHTML(auction.cropName || "Crop Auction")}</strong>
            <small class="text-muted">₹${formatNumber(getCurrentBid(auction))} · ${formatCountdown(auction)}</small>
        </button>
    `).join("");
}

function showAuctionAlert(message, type = "info") {
    const alertBox = document.getElementById("auctionAlert");
    if (!alertBox) return;

    alertBox.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${escapeHTML(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
}

window.clearFilters = clearFilters;
window.toggleWishlist = toggleWishlist;
window.openAuctionModal = openAuctionModal;
window.openEditAuctionModal = openEditAuctionModal;
window.deleteAuction = deleteAuction;
window.openBidModal = openBidModal;
