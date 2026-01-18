const video = document.getElementById('video');
const snap = document.getElementById('snap');
const status = document.getElementById('status');
const gpsBadge = document.getElementById('gps-badge');
const resultArea = document.getElementById('result-area');
const editStore = document.getElementById('editStore');
const editDate = document.getElementById('editDate');
const editTotal = document.getElementById('editTotal');
const canvas = document.getElementById('canvas');

// Replace this with your latest Deployment URL
const GOOGLE_SCRIPT_URL = 'YOUR_DEPLOYED_URL_HERE'; 

let userLocation = { lat: null, lng: null };
let currentPhoto = null;

async function setupCamera() {
    status.innerText = "Finding GPS Location...";
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
        userLocation.lat = pos.coords.latitude;
        userLocation.lng = pos.coords.longitude;
        
        try {
            // Check for previous GPS matches in Google Sheets
            const resp = await fetch(`${GOOGLE_SCRIPT_URL}?lat=${userLocation.lat}&lng=${userLocation.lng}`);
            const matchedStore = await resp.text();
            
            if (matchedStore !== "Other") {
                gpsBadge.style.display = "block";
                gpsBadge.innerText = `📍 Matched: ${matchedStore}`;
                editStore.value = matchedStore;
                status.innerText = "GPS Fixed & Matched.";
            } else {
                status.innerText = "GPS Fixed (New Location)";
                gpsBadge.style.display = "none";
                editStore.value = ""; 
            }
        } catch (e) {
            status.innerText = "GPS Fixed (Offline).";
        }
        startVideo();
    }, (err) => {
        status.innerText = "GPS Denied. Manual input required.";
        startVideo();
    }, { enableHighAccuracy: true });
}

async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 } } 
        });
        video.srcObject = stream;
    } catch (err) {
        status.innerText = "Camera Error.";
    }
}

snap.addEventListener('click', async () => {
    status.innerText = "Scanning text...";
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    currentPhoto = canvas.toDataURL('image/jpeg', 0.8);
    
    try {
        // Run OCR on the captured image
        const { data: { text } } = await Tesseract.recognize(currentPhoto, 'eng');
        processOCR(text);
    } catch (e) {
        status.innerText = "OCR Failed. Enter data manually.";
        resultArea.style.display = "block";
    }
});

function processOCR(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    
    // 1. EXTRACT DATE
    const dateMatch = rawText.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
    editDate.value = dateMatch ? dateMatch[0] : new Date().toLocaleDateString();

    // 2. EXTRACT TOTAL (The Anti-Kroger Shield)
    let candidates = [];
    lines.forEach((line, index) => {
        const up = line.toUpperCase();
        
        // HARD BLOCK: Ignore lines with these words (Kroger Savings Trap)
        const isSavings = up.includes("SAVING") || 
                           up.includes("SAVED") || 
                           up.includes("DISCOUNT") || 
                           up.includes("OFF") || 
                           up.includes("COUPON") || 
                           up.includes("REWARD");
        
        if (isSavings) return;

        // Regex to find a price (e.g., 98.56) at the end of a line
        const priceMatch = line.match(/(\d+[\.,]\d{2})[^\d]*$/);
        
        if (priceMatch) {
            const val = parseFloat(priceMatch[1].replace(',', '.'));
            let score = 0;
            
            // PRIORITY SCORING
            if (up.includes("BALANCE")) score += 50; // High priority for Kroger
            if (up.includes("TOTAL DUE")) score += 40;
            if (up.includes("TOTAL") && !up.includes("SUB")) score += 20;
            if (up.includes("PAID") || up.includes("VISA") || up.includes("MASTERCARD")) score += 15;
            
            // Position Weight: Numbers at the bottom are more likely to be totals
            if (index > lines.length * 0.7) score += 10;

            candidates.push({ val, score, index });
        }
    });

    // Sort by best score, then by position (lower in the receipt is better)
    candidates.sort((a, b) => (b.score - a.score) || (b.index - a.index));

    if (candidates.length > 0) {
        editTotal.value = candidates[0].val.toFixed(2);
    } else {
        editTotal.value = "0.00";
    }
    
    resultArea.style.display = "block";
    status.innerText = "Review and Save.";
}

async function uploadToCloud() {
    const btn = document.getElementById('saveBtn');
    if (!editStore.value) { 
        alert("Please enter a store name."); 
        return; 
    }
    
    btn.disabled = true;
    status.innerText = "Uploading to Google...";

    const payload = {
        store: editStore.value,
        date: editDate.value,
        total: editTotal.value,
        photo: currentPhoto,
        lat: userLocation.lat,
        lng: userLocation.lng
    };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        status.innerText = "Success! Logged.";
        resultArea.style.display = "none";
        btn.disabled = false;
        gpsBadge.style.display = "none";
    } catch (e) {
        status.innerText = "Upload failed.";
        btn.disabled = false;
    }
}

// Ensure the badge disappears if you manually clear or change the store name
editStore.addEventListener('input', () => {
    gpsBadge.style.display = "none";
});

setupCamera();
