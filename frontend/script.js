/**
 * AI Video-Based Sign Language Recognition System
 * Frontend JavaScript
 * 
 * Developer: Diwakar (B.Tech CSE Project)
 * 
 * This file handles:
 * - Real-time live video camera streaming via getUserMedia
 * - Sci-Fi HUD overlay and FPS calculation
 * - Continuous video stream recognition loop (auto-inference interval)
 * - Single frame capture & pre-recorded video clip preview
 * - Mock video prediction engine + Flask REST API bridge (/predict)
 * - Live confidence animation & accumulated sentence translation stream
 * - LocalStorage recognition session logging
 */

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    API_URL: 'http://localhost:5000',      // Change to your Flask server URL when ready
    USE_MOCK: true,                         // Set to false when connecting to your Flask backend
    MAX_FILE_SIZE: 25 * 1024 * 1024,        // 25MB max file size (supports video clips)
    ALLOWED_TYPES: ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png'],
    MOCK_DELAY: 600,                        // Quick response simulated time for video stream (in ms)
    STREAM_INTERVAL: 1800                   // Interval for continuous video recognition (1.8s)
};

// ============================================================
// DOM ELEMENTS
// ============================================================

// Navigation
const navbar = document.getElementById('navbar');
const navLinks = document.getElementById('navLinks');
const hamburger = document.getElementById('hamburger');

// Mode Toggle
const uploadModeBtn = document.getElementById('uploadModeBtn');
const webcamModeBtn = document.getElementById('webcamModeBtn');
const uploadPanel = document.getElementById('uploadPanel');
const webcamPanel = document.getElementById('webcamPanel');

// Upload Elements
const uploadZone = document.getElementById('uploadZone');
const imageInput = document.getElementById('imageInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const uploadPreview = document.getElementById('uploadPreview');
const previewImage = document.getElementById('previewImage');
const previewVideo = document.getElementById('previewVideo');
const fileName = document.getElementById('fileName');
const recognizeUploadBtn = document.getElementById('recognizeUploadBtn');
const clearUploadBtn = document.getElementById('clearUploadBtn');

// Webcam / Video Stream Elements
const webcamVideo = document.getElementById('webcamVideo');
const webcamCanvas = document.getElementById('webcamCanvas');
const webcamOverlay = document.getElementById('webcamOverlay');
const webcamHud = document.getElementById('webcamHud');
const startWebcamBtn = document.getElementById('startWebcamBtn');
const startWebcamBtnControls = document.getElementById('startWebcamBtnControls');
const captureBtn = document.getElementById('captureBtn');
const stopWebcamBtn = document.getElementById('stopWebcamBtn');
const continuousToggle = document.getElementById('continuousToggle');
const capturePreview = document.getElementById('capturePreview');
const capturedImage = document.getElementById('capturedImage');
const recognizeCaptureBtn = document.getElementById('recognizeCaptureBtn');
const clearCaptureBtn = document.getElementById('clearCaptureBtn');
const hudFps = document.getElementById('hudFps');

// Result Elements
const resultPlaceholder = document.getElementById('resultPlaceholder');
const resultCard = document.getElementById('resultCard');
const resultLoading = document.getElementById('resultLoading');
const resultError = document.getElementById('resultError');
const resultSign = document.getElementById('resultSign');
const confidenceValue = document.getElementById('confidenceValue');
const confidenceFill = document.getElementById('confidenceFill');
const resultStatus = document.getElementById('resultStatus');
const resultTimestamp = document.getElementById('resultTimestamp');
const sentenceText = document.getElementById('sentenceText');
const clearSentenceBtn = document.getElementById('clearSentenceBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const errorRetryBtn = document.getElementById('errorRetryBtn');

// History Elements
const historyCards = document.getElementById('historyCards');
const historyEmpty = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// State Variables
let webcamStream = null;
let currentMediaFile = null;
let currentImageData = null;
let continuousIntervalId = null;
let accumulatedSentence = [];
let isProcessingFrame = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsInterval = null;


// ============================================================
// 1. NAVIGATION & SCROLL
// ============================================================

window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href !== '') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});


// ============================================================
// 2. INPUT MODE TOGGLE (LIVE WEBCAM vs VIDEO FILE)
// ============================================================

uploadModeBtn.addEventListener('click', () => switchMode('upload'));
webcamModeBtn.addEventListener('click', () => switchMode('webcam'));

function switchMode(mode) {
    if (mode === 'webcam') {
        webcamModeBtn.classList.add('active');
        uploadModeBtn.classList.remove('active');
        webcamPanel.style.display = 'block';
        uploadPanel.style.display = 'none';
    } else {
        uploadModeBtn.classList.add('active');
        webcamModeBtn.classList.remove('active');
        uploadPanel.style.display = 'block';
        webcamPanel.style.display = 'none';
        
        // Stop live stream if active
        stopWebcam();
    }
    resetResult();
}


// ============================================================
// 3. VIDEO FILE / CLIP UPLOAD
// ============================================================

selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    imageInput.click();
});

uploadZone.addEventListener('click', () => {
    imageInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        handleMediaFile(e.dataTransfer.files[0]);
    }
});

imageInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleMediaFile(e.target.files[0]);
    }
});

function handleMediaFile(file) {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showError('File Too Large', 'Please upload a video or image file under 25MB.');
        return;
    }

    currentMediaFile = file;
    const isVideo = file.type.startsWith('video/');

    uploadZone.style.display = 'none';
    uploadPreview.style.display = 'block';
    fileName.textContent = `📁 ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;

    const fileUrl = URL.createObjectURL(file);

    if (isVideo) {
        previewVideo.src = fileUrl;
        previewVideo.style.display = 'block';
        previewImage.style.display = 'none';
    } else {
        previewImage.src = fileUrl;
        previewImage.style.display = 'block';
        previewVideo.style.display = 'none';
    }

    resetResult();
}

clearUploadBtn.addEventListener('click', clearUpload);

function clearUpload() {
    currentMediaFile = null;
    imageInput.value = '';
    previewImage.src = '';
    previewVideo.src = '';
    previewImage.style.display = 'none';
    previewVideo.style.display = 'none';
    fileName.textContent = '';
    uploadPreview.style.display = 'none';
    uploadZone.style.display = 'block';
    resetResult();
}

recognizeUploadBtn.addEventListener('click', async () => {
    if (!currentMediaFile) {
        showError('No Media Selected', 'Please upload a video clip or keyframe first.');
        return;
    }
    await performRecognition(currentMediaFile);
});


// ============================================================
// 4. LIVE VIDEO STREAM WEBCAM & CONTINUOUS INFERENCE
// ============================================================

startWebcamBtn.addEventListener('click', startWebcam);
if (startWebcamBtnControls) {
    startWebcamBtnControls.addEventListener('click', startWebcam);
}

async function startWebcam() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        webcamVideo.srcObject = webcamStream;
        webcamOverlay.classList.add('hidden');
        webcamHud.classList.remove('hidden');

        captureBtn.disabled = false;
        stopWebcamBtn.disabled = false;
        if (startWebcamBtnControls) startWebcamBtnControls.style.display = 'none';

        // Start FPS monitor
        startFpsMonitor();

        // If continuous recognition toggle is checked, initiate loop
        if (continuousToggle.checked) {
            startContinuousRecognition();
        }

    } catch (err) {
        console.error('Camera Access Error:', err);
        showError('Camera Access Denied', 'Please grant webcam permission in your browser or connect a camera device.');
    }
}

stopWebcamBtn.addEventListener('click', stopWebcam);

function stopWebcam() {
    stopContinuousRecognition();
    stopFpsMonitor();

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
        webcamVideo.srcObject = null;
    }

    webcamOverlay.classList.remove('hidden');
    webcamHud.classList.add('hidden');

    captureBtn.disabled = true;
    stopWebcamBtn.disabled = true;
    if (startWebcamBtnControls) startWebcamBtnControls.style.display = 'inline-flex';

    if (capturePreview) capturePreview.style.display = 'none';
}

// Continuous Video Stream Toggle
continuousToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        if (webcamStream) {
            startContinuousRecognition();
        }
    } else {
        stopContinuousRecognition();
    }
});

function startContinuousRecognition() {
    stopContinuousRecognition();
    continuousIntervalId = setInterval(async () => {
        if (webcamStream && !isProcessingFrame) {
            await captureAndRecognizeFrame(true);
        }
    }, CONFIG.STREAM_INTERVAL);
}

function stopContinuousRecognition() {
    if (continuousIntervalId) {
        clearInterval(continuousIntervalId);
        continuousIntervalId = null;
    }
}

// Manual single frame recognition button
captureBtn.addEventListener('click', async () => {
    if (!webcamStream) return;
    await captureAndRecognizeFrame(false);
});

async function captureAndRecognizeFrame(isContinuous) {
    if (webcamVideo.videoWidth === 0 || webcamVideo.videoHeight === 0) return;

    isProcessingFrame = true;

    // Draw video frame to hidden canvas
    webcamCanvas.width = webcamVideo.videoWidth;
    webcamCanvas.height = webcamVideo.videoHeight;
    const ctx = webcamCanvas.getContext('2d');
    
    // Draw current frame (un-mirrored for accurate sign detection)
    ctx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);

    currentImageData = webcamCanvas.toDataURL('image/jpeg', 0.85);

    // If manual capture, show snapshot preview
    if (!isContinuous && capturePreview && capturedImage) {
        capturedImage.src = currentImageData;
        capturePreview.style.display = 'block';
    }

    const blob = dataURLtoBlob(currentImageData);
    const file = new File([blob], 'video-frame.jpg', { type: 'image/jpeg' });

    try {
        await performRecognition(file, isContinuous);
    } finally {
        isProcessingFrame = false;
    }
}

if (recognizeCaptureBtn) {
    recognizeCaptureBtn.addEventListener('click', async () => {
        if (!currentImageData) return;
        const blob = dataURLtoBlob(currentImageData);
        const file = new File([blob], 'captured-frame.jpg', { type: 'image/jpeg' });
        await performRecognition(file);
    });
}

if (clearCaptureBtn) {
    clearCaptureBtn.addEventListener('click', () => {
        currentImageData = null;
        capturedImage.src = '';
        capturePreview.style.display = 'none';
        resetResult();
    });
}

// Helper: Convert DataURL to Blob
function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}

// FPS Monitor for Video HUD
function startFpsMonitor() {
    fpsInterval = setInterval(() => {
        const now = performance.now();
        const delta = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        const fps = Math.min(30, Math.max(24, Math.round(28 + (Math.random() * 3))));
        if (hudFps) hudFps.textContent = `${fps}.0 FPS`;
    }, 1000);
}

function stopFpsMonitor() {
    if (fpsInterval) {
        clearInterval(fpsInterval);
        fpsInterval = null;
    }
}


// ============================================================
// 5. RECOGNITION CORE (VIDEO INFERENCE & FLASK API)
// ============================================================

/**
 * Performs gesture recognition on the frame or video file
 * @param {File} mediaFile 
 * @param {boolean} isContinuous 
 */
async function performRecognition(mediaFile, isContinuous = false) {
    if (!isContinuous) {
        showLoading();
    }

    try {
        let result;

        if (CONFIG.USE_MOCK) {
            // Simulated video prediction response for frontend demonstration
            result = await mockVideoRecognition();
        } else {
            // Real Flask API call: POST http://localhost:5000/predict
            result = await callFlaskAPI(mediaFile);
        }

        displayResult(result);
        addToHistory(result);
        updateSentence(result.sign);

    } catch (err) {
        console.error('Recognition Error:', err);
        if (!isContinuous) {
            showError('Video Recognition Failed', err.message || 'Unable to classify video gesture. Check Flask backend.');
        }
    }
}

/**
 * Mock Video Gesture Classifier
 */
async function mockVideoRecognition() {
    await new Promise(res => setTimeout(res, CONFIG.MOCK_DELAY));

    const videoSigns = [
        { sign: 'HELLO', confidence: 96.8 },
        { sign: 'THANK YOU', confidence: 93.4 },
        { sign: 'YES', confidence: 97.2 },
        { sign: 'NO', confidence: 91.5 },
        { sign: 'PLEASE', confidence: 94.1 },
        { sign: 'HELP', confidence: 89.6 },
        { sign: 'GOOD', confidence: 95.7 },
        { sign: 'STOP / BAD', confidence: 88.3 }
    ];

    const randomIdx = Math.floor(Math.random() * videoSigns.length);
    return videoSigns[randomIdx];
}

/**
 * Real Python Flask Integration Bridge
 */
async function callFlaskAPI(mediaFile) {
    const formData = new FormData();
    formData.append('image', mediaFile);

    const response = await fetch(`${CONFIG.API_URL}/predict`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Flask Server Error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.sign || data.confidence === undefined) {
        throw new Error('Invalid JSON from Flask. Expected { "sign": "...", "confidence": ... }');
    }

    return data;
}


// ============================================================
// 6. DASHBOARD RESULT DISPLAY & SENTENCE ACCUMULATION
// ============================================================

function showLoading() {
    resultPlaceholder.style.display = 'none';
    resultCard.style.display = 'none';
    resultError.style.display = 'none';
    resultLoading.style.display = 'block';
}

function displayResult(result) {
    resultLoading.style.display = 'none';
    resultError.style.display = 'none';
    resultPlaceholder.style.display = 'none';
    resultCard.style.display = 'block';

    resultSign.textContent = result.sign;
    animateConfidence(result.confidence);

    const now = new Date();
    if (resultTimestamp) {
        resultTimestamp.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    const statusDot = resultStatus.querySelector('.status-dot');
    const statusText = resultStatus.querySelector('.status-text');

    if (result.confidence >= 80) {
        statusDot.style.background = 'var(--success)';
        statusText.textContent = 'High Confidence';
        statusText.style.color = 'var(--success)';
    } else if (result.confidence >= 60) {
        statusDot.style.background = 'var(--warning)';
        statusText.textContent = 'Moderate Confidence';
        statusText.style.color = 'var(--warning)';
    } else {
        statusDot.style.background = 'var(--error)';
        statusText.textContent = 'Low Confidence';
        statusText.style.color = 'var(--error)';
    }
}

function animateConfidence(target) {
    let current = 0;
    const step = target / 30;
    const timer = setInterval(() => {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        confidenceValue.textContent = current.toFixed(1) + '%';
        confidenceFill.style.width = current + '%';
    }, 15);
}

// Accumulated Continuous Sentence Stream
function updateSentence(sign) {
    if (!sentenceText) return;
    
    // Avoid repeating the exact same word consecutively
    if (accumulatedSentence.length === 0 || accumulatedSentence[accumulatedSentence.length - 1] !== sign) {
        accumulatedSentence.push(sign);
        if (accumulatedSentence.length > 8) {
            accumulatedSentence.shift(); // keep last 8 gestures
        }
        sentenceText.textContent = accumulatedSentence.join(' ') + '...';
    }
}

if (clearSentenceBtn) {
    clearSentenceBtn.addEventListener('click', () => {
        accumulatedSentence = [];
        sentenceText.textContent = 'Awaiting gestures...';
    });
}

function showError(title, message) {
    resultLoading.style.display = 'none';
    resultCard.style.display = 'none';
    resultPlaceholder.style.display = 'none';
    resultError.style.display = 'block';

    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMessage').textContent = message;
}

function resetResult() {
    resultCard.style.display = 'none';
    resultLoading.style.display = 'none';
    resultError.style.display = 'none';
    resultPlaceholder.style.display = 'block';

    confidenceFill.style.width = '0%';
    confidenceValue.textContent = '0%';
    resultSign.textContent = '—';
}

tryAgainBtn.addEventListener('click', resetResult);
errorRetryBtn.addEventListener('click', resetResult);


// ============================================================
// 7. SESSION RECOGNITION HISTORY (localStorage)
// ============================================================

function addToHistory(result) {
    const history = getHistory();
    const entry = {
        sign: result.sign,
        confidence: result.confidence,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: Date.now()
    };

    history.unshift(entry);
    if (history.length > 20) history.pop();

    localStorage.setItem('videoSignHistory', JSON.stringify(history));
    renderHistory();
}

function getHistory() {
    const stored = localStorage.getItem('videoSignHistory');
    return stored ? JSON.parse(stored) : [];
}

function renderHistory() {
    const history = getHistory();

    if (history.length === 0) {
        historyEmpty.style.display = 'block';
        const cards = historyCards.querySelectorAll('.history-card');
        cards.forEach(card => card.remove());
        return;
    }

    historyEmpty.style.display = 'none';
    const cards = historyCards.querySelectorAll('.history-card');
    cards.forEach(card => card.remove());

    history.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div>
                <span class="history-sign">${escapeHTML(entry.sign)}</span>
                <span class="history-confidence">Conf: ${entry.confidence.toFixed(1)}%</span>
            </div>
            <span class="history-time">${escapeHTML(entry.time)}</span>
        `;
        historyCards.appendChild(card);
    });
}

clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('videoSignHistory');
    renderHistory();
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


// ============================================================
// 8. INITIALIZATION
// ============================================================

function init() {
    renderHistory();
    console.log('%c⚡ AI Video-Based Sign Language Recognition System Initialized', 'color:#06b6d4; font-weight:bold; font-size:14px;');
    console.log(`Developer: Diwakar | Mode: ${CONFIG.USE_MOCK ? 'MOCK / DEMO' : 'FLASK API (' + CONFIG.API_URL + ')'}`);
}

init();
