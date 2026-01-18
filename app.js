const video = document.getElementById('video');
const snap = document.getElementById('snap');
const status = document.getElementById('status');
const resultArea = document.getElementById('result-area');
const editStore = document.getElementById('editStore');
const editDate = document.getElementById('editDate');
const editTotal = document.getElementById('editTotal');
const canvas = document.getElementById('canvas');
const otherGroup = document.getElementById('otherStoreGroup');
const customStoreInput = document.getElementById('customStoreName');

let currentPhoto = null;
let userLocation = { lat: null, lng: null };

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxj7LfaA06MvcBFiMXXMM8X2VGzYf6_oQxzbWgHI2GJE6kgOgHLdX91ioNeLDWYv1jszg/exec';

async function setupCamera() {
    status.innerText = "Fixing GPS Location...";
    
    const getCoords = () => {
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    userLocation.lat = pos.coords.latitude;
                    userLocation.lng = pos.coords.longitude;
                    
                    // PING SCRIPT FOR LOCATION MATCH
                    try {
                        const resp = await fetch(`${GOOGLE_SCRIPT_URL}?lat=${userLocation.lat}&lng=${userLocation.lng}`);
                        const matchedStore = await resp.text();
                        if (matchedStore !== "Other") {
                            editStore.value = matchedStore;
                            status.innerText = `GPS Match: ${matchedStore}`;
                        } else {
                            status.innerText = "GPS Fixed (No Match Found)";
                        }
                    } catch (e) {
                        status.innerText = "GPS Fixed (Sync Error)";
                    }
                    resolve();
                },
                (err) => { status.innerText = "GPS Failed. Select store manually."; resolve(); },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
    };

    await getCoords();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 } }, 
            audio: false 
        });
        video.srcObject = stream;
    } catch (err) {
        status.innerText = "Camera access denied.";
    }
}

snap.addEventListener('click', async () => {
    status.innerText = "Scanning text...";
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    currentPhoto = canvas.toDataURL('image/jpeg', 0.9);
    
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

editStore.addEventListener('change', () => {
    otherGroup.style.display = (editStore.value === "Other") ? "block" : "none";
});

async function uploadToCloud() {
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    status.innerText = "Uploading...";

    const payload = {
        store: editStore.value,
        customStore: customStoreInput.value,
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
        customStoreInput.value = "";
    } catch (e) {
        status.innerText = "Upload failed.";
        btn.disabled = false;
    }
}

setupCamera();
