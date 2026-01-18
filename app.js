const video = document.getElementById('video');
const snap = document.getElementById('snap');
const status = document.getElementById('status');
const gpsBadge = document.getElementById('gps-badge');
const resultArea = document.getElementById('result-area');
const editStore = document.getElementById('editStore');
const editDate = document.getElementById('editDate');
const editTotal = document.getElementById('editTotal');
const canvas = document.getElementById('canvas');

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxj7LfaA06MvcBFiMXXMM8X2VGzYf6_oQxzbWgHI2GJE6kgOgHLdX91ioNeLDWYv1jszg/exec';
let userLocation = { lat: null, lng: null };
let currentPhoto = null;

async function setupCamera() {
    status.innerText = "Finding GPS Location...";
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
        userLocation.lat = pos.coords.latitude;
        userLocation.lng = pos.coords.longitude;
        
        try {
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
                editStore.value = ""; // Clear for new input
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
        const { data: { text } } = await Tesseract.recognize(currentPhoto, 'eng');
        processOCR(text);
    } catch (e) {
        status.innerText = "OCR Failed. Enter data manually.";
        resultArea.style.display = "block";
    }
});

function processOCR(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const dateMatch = rawText.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
    editDate.value = dateMatch ? dateMatch[0] : new Date().toLocaleDateString();

    let candidates = [];
    lines.forEach((line, index) => {
        const up = line.toUpperCase();
        if (up.includes("SAVINGS") || up.includes("POINTS") || up.includes("YOU")) return;
        const priceMatch = line.match(/(\d+[\.,]\d{2})[^\d]*$/);
        if (priceMatch) {
            const val = parseFloat(priceMatch[1].replace(',', '.'));
            let score = 0;
            if (up.includes("TOTAL") || up.includes("BALANCE") || up.includes("DUE")) score += 20;
            if (index > lines.length * 0.7) score += 5;
            candidates.push({ val, score, index });
        }
    });

    candidates.sort((a, b) => (b.score - a.score) || (b.index - a.index));
    editTotal.value = candidates.length > 0 ? candidates[0].val.toFixed(2) : "0.00";
    
    resultArea.style.display = "block";
    status.innerText = "Review and Save.";
}

async function uploadToCloud() {
    const btn = document.getElementById('saveBtn');
    if (!editStore.value) { alert("Please enter a store name."); return; }
    
    btn.disabled = true;
    status.innerText = "Uploading...";

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

setupCamera();
