/**
 * Advanced Pi Camera - JavaScript Application
 * Interactive controls, real-time updates, and smooth animations
 */

// ============================================
// INITIALIZATION
// ============================================

class AdvancedCameraApp {
    constructor() {
        // State
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.gallery = [];
        this.currentImageIndex = 0;
        this.statsInterval = null;
        this.controlsTimeout = null;

        // DOM Elements
        this.elements = {};

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.initParticles();
        this.loadSettings();
        this.startStatsUpdate();
        this.loadGallery();
        this.setupVideoFeed();

        // Show connected status after brief delay
        setTimeout(() => {
            this.setStatus('connected', 'Live');
        }, 1500);
    }

    cacheElements() {
        // Header
        this.elements.statusBadge = document.getElementById('statusBadge');
        this.elements.statusText = document.getElementById('statusText');
        this.elements.themeToggle = document.getElementById('themeToggle');
        this.elements.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.elements.settingsBtn = document.getElementById('settingsBtn');

        // Video
        this.elements.videoFeed = document.getElementById('videoFeed');
        this.elements.videoOverlay = document.getElementById('videoOverlay');
        this.elements.videoContainer = document.getElementById('videoContainer');
        this.elements.recordingIndicator = document.getElementById('recordingIndicator');
        this.elements.recordingTime = document.getElementById('recordingTime');
        this.elements.resolutionDisplay = document.getElementById('resolutionDisplay');
        this.elements.fpsDisplay = document.getElementById('fpsDisplay');

        // Controls
        this.elements.recordBtn = document.getElementById('recordBtn');
        this.elements.snapshotBtn = document.getElementById('snapshotBtn');
        this.elements.zoomBtn = document.getElementById('zoomBtn');
        this.elements.zoomSlider = document.getElementById('zoomSlider');
        this.elements.zoomRange = document.getElementById('zoomRange');
        this.elements.zoomValue = document.getElementById('zoomValue');

        // Stats
        this.elements.statFps = document.getElementById('statFps');
        this.elements.statFrames = document.getElementById('statFrames');
        this.elements.statUptime = document.getElementById('statUptime');
        this.elements.statViewers = document.getElementById('statViewers');

        // Camera Controls
        this.elements.brightnessSlider = document.getElementById('brightnessSlider');
        this.elements.brightnessValue = document.getElementById('brightnessValue');
        this.elements.contrastSlider = document.getElementById('contrastSlider');
        this.elements.contrastValue = document.getElementById('contrastValue');
        this.elements.saturationSlider = document.getElementById('saturationSlider');
        this.elements.saturationValue = document.getElementById('saturationValue');
        this.elements.sharpnessSlider = document.getElementById('sharpnessSlider');
        this.elements.sharpnessValue = document.getElementById('sharpnessValue');
        this.elements.resolutionSelect = document.getElementById('resolutionSelect');
        this.elements.awbSelect = document.getElementById('awbSelect');
        this.elements.resetBtn = document.getElementById('resetBtn');

        // Gallery
        this.elements.galleryGrid = document.getElementById('galleryGrid');
        this.elements.viewAllBtn = document.getElementById('viewAllBtn');
        this.elements.galleryModal = document.getElementById('galleryModal');
        this.elements.galleryFull = document.getElementById('galleryFull');
        this.elements.closeGallery = document.getElementById('closeGallery');

        // Image Viewer
        this.elements.imageModal = document.getElementById('imageModal');
        this.elements.viewerImage = document.getElementById('viewerImage');
        this.elements.viewerFilename = document.getElementById('viewerFilename');
        this.elements.prevImage = document.getElementById('prevImage');
        this.elements.nextImage = document.getElementById('nextImage');
        this.elements.closeViewer = document.getElementById('closeViewer');
        this.elements.deleteImage = document.getElementById('deleteImage');

        // Toast
        this.elements.toastContainer = document.getElementById('toastContainer');
    }

    bindEvents() {
        // Header buttons
        this.elements.themeToggle?.addEventListener('click', () => this.toggleTheme());
        this.elements.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

        // Control buttons
        this.elements.recordBtn?.addEventListener('click', () => this.toggleRecording());
        this.elements.snapshotBtn?.addEventListener('click', () => this.captureSnapshot());
        this.elements.zoomBtn?.addEventListener('click', () => this.toggleZoomSlider());
        this.elements.zoomRange?.addEventListener('input', (e) => this.updateZoom(e.target.value));

        // Camera control sliders
        this.elements.brightnessSlider?.addEventListener('input', (e) => this.updateControl('brightness', e.target.value, -100, 100, -1, 1));
        this.elements.contrastSlider?.addEventListener('input', (e) => this.updateControl('contrast', e.target.value, 0, 200, 0, 2));
        this.elements.saturationSlider?.addEventListener('input', (e) => this.updateControl('saturation', e.target.value, 0, 200, 0, 2));
        this.elements.sharpnessSlider?.addEventListener('input', (e) => this.updateControl('sharpness', e.target.value, 0, 200, 0, 2));

        // Selects
        this.elements.resolutionSelect?.addEventListener('change', (e) => this.updateSetting('resolution', e.target.value));
        this.elements.awbSelect?.addEventListener('change', (e) => this.updateSetting('awb_mode', e.target.value));

        // Reset button
        this.elements.resetBtn?.addEventListener('click', () => this.resetControls());

        // Gallery
        this.elements.viewAllBtn?.addEventListener('click', () => this.openGalleryModal());
        this.elements.closeGallery?.addEventListener('click', () => this.closeModal('galleryModal'));

        // Image Viewer
        this.elements.prevImage?.addEventListener('click', () => this.navigateImage(-1));
        this.elements.nextImage?.addEventListener('click', () => this.navigateImage(1));
        this.elements.closeViewer?.addEventListener('click', () => this.closeModal('imageModal'));
        this.elements.deleteImage?.addEventListener('click', () => this.deleteCurrentImage());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Video load event
        this.elements.videoFeed?.addEventListener('load', () => {
            this.elements.videoOverlay?.classList.add('hidden');
        });

        this.elements.videoFeed?.addEventListener('error', () => {
            this.setStatus('offline', 'Disconnected');
        });

        // Modal close on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    // ============================================
    // VIDEO FEED
    // ============================================

    setupVideoFeed() {
        // Add timestamp to prevent caching issues
        if (this.elements.videoFeed) {
            const src = this.elements.videoFeed.src;
            if (!src.includes('?')) {
                this.elements.videoFeed.src = src + '?t=' + Date.now();
            }
        }
    }

    // ============================================
    // STATUS
    // ============================================

    setStatus(state, text) {
        if (this.elements.statusBadge) {
            this.elements.statusBadge.classList.remove('offline');
            if (state === 'offline') {
                this.elements.statusBadge.classList.add('offline');
            }
        }
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
    }

    // ============================================
    // PARTICLES BACKGROUND
    // ============================================

    initParticles() {
        const canvas = document.getElementById('particles');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let particles = [];
        const particleCount = 50;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const createParticle = () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.1
        });

        const initParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(createParticle());
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.speedX;
                p.y += p.speedY;

                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 245, 212, ${p.opacity})`;
                ctx.fill();
            });

            // Draw connections
            particles.forEach((p1, i) => {
                particles.slice(i + 1).forEach(p2 => {
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(0, 245, 212, ${0.1 * (1 - dist / 150)})`;
                        ctx.stroke();
                    }
                });
            });

            requestAnimationFrame(animate);
        };

        resize();
        initParticles();
        animate();

        window.addEventListener('resize', () => {
            resize();
            initParticles();
        });
    }

    // ============================================
    // CAMERA CONTROLS
    // ============================================

    async loadSettings() {
        try {
            const response = await fetch('/api/controls');
            const settings = await response.json();

            // Update sliders
            if (settings.brightness !== undefined) {
                const sliderVal = this.mapValue(settings.brightness, -1, 1, -100, 100);
                this.elements.brightnessSlider.value = sliderVal;
                this.elements.brightnessValue.textContent = Math.round(sliderVal);
            }
            if (settings.contrast !== undefined) {
                const sliderVal = this.mapValue(settings.contrast, 0, 2, 0, 200);
                this.elements.contrastSlider.value = sliderVal;
                this.elements.contrastValue.textContent = settings.contrast.toFixed(1);
            }
            if (settings.saturation !== undefined) {
                const sliderVal = this.mapValue(settings.saturation, 0, 2, 0, 200);
                this.elements.saturationSlider.value = sliderVal;
                this.elements.saturationValue.textContent = settings.saturation.toFixed(1);
            }
            if (settings.sharpness !== undefined) {
                const sliderVal = this.mapValue(settings.sharpness, 0, 2, 0, 200);
                this.elements.sharpnessSlider.value = sliderVal;
                this.elements.sharpnessValue.textContent = settings.sharpness.toFixed(1);
            }

            // Update selects
            if (settings.resolution) {
                this.elements.resolutionSelect.value = settings.resolution;
                this.elements.resolutionDisplay.textContent = settings.resolution;
            }
            if (settings.awb_mode) {
                this.elements.awbSelect.value = settings.awb_mode;
            }

            // Update recording state
            if (settings.is_recording) {
                this.isRecording = true;
                this.elements.recordBtn?.classList.add('active');
                this.elements.recordingIndicator?.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    mapValue(value, inMin, inMax, outMin, outMax) {
        return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
    }

    updateControl(name, sliderValue, sliderMin, sliderMax, valueMin, valueMax) {
        const actualValue = this.mapValue(sliderValue, sliderMin, sliderMax, valueMin, valueMax);

        // Update display
        const displayEl = this.elements[`${name}Value`];
        if (displayEl) {
            displayEl.textContent = name === 'brightness'
                ? Math.round(sliderValue)
                : actualValue.toFixed(1);
        }

        // Debounce API call
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            this.updateSetting(name, actualValue);
        }, 100);
    }

    async updateSetting(name, value) {
        try {
            await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [name]: value })
            });
        } catch (error) {
            console.error('Failed to update setting:', error);
            this.showToast('Failed to update setting', 'error');
        }
    }

    resetControls() {
        this.elements.brightnessSlider.value = 0;
        this.elements.brightnessValue.textContent = '0';
        this.elements.contrastSlider.value = 100;
        this.elements.contrastValue.textContent = '1.0';
        this.elements.saturationSlider.value = 100;
        this.elements.saturationValue.textContent = '1.0';
        this.elements.sharpnessSlider.value = 100;
        this.elements.sharpnessValue.textContent = '1.0';

        this.updateSetting('brightness', 0);
        this.updateSetting('contrast', 1);
        this.updateSetting('saturation', 1);
        this.updateSetting('sharpness', 1);

        this.showToast('Controls reset to defaults', 'success');
    }

    // ============================================
    // RECORDING
    // ============================================

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const response = await fetch('/api/recording/start', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                this.isRecording = true;
                this.recordingStartTime = Date.now();
                this.elements.recordBtn?.classList.add('active');
                this.elements.recordingIndicator?.classList.add('active');
                this.startRecordingTimer();
                this.showToast('Recording started', 'success');
            } else {
                this.showToast(result.error || 'Failed to start recording', 'error');
            }
        } catch (error) {
            console.error('Recording error:', error);
            this.showToast('Failed to start recording', 'error');
        }
    }

    async stopRecording() {
        try {
            const response = await fetch('/api/recording/stop', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                this.isRecording = false;
                this.elements.recordBtn?.classList.remove('active');
                this.elements.recordingIndicator?.classList.remove('active');
                this.stopRecordingTimer();
                this.showToast(`Recording saved: ${result.filename}`, 'success');
                this.loadGallery();
            } else {
                this.showToast(result.error || 'Failed to stop recording', 'error');
            }
        } catch (error) {
            console.error('Recording error:', error);
            this.showToast('Failed to stop recording', 'error');
        }
    }

    startRecordingTimer() {
        this.recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.elements.recordingTime.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        this.elements.recordingTime.textContent = '00:00';
    }

    // ============================================
    // SNAPSHOT
    // ============================================

    async captureSnapshot() {
        // Add visual feedback
        this.elements.videoContainer?.classList.add('flash');
        setTimeout(() => this.elements.videoContainer?.classList.remove('flash'), 200);

        try {
            const response = await fetch('/api/snapshot', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                this.showToast(`Snapshot saved: ${result.filename}`, 'success');
                this.loadGallery();
            } else {
                this.showToast(result.error || 'Failed to capture snapshot', 'error');
            }
        } catch (error) {
            console.error('Snapshot error:', error);
            this.showToast('Failed to capture snapshot', 'error');
        }
    }

    // ============================================
    // ZOOM
    // ============================================

    toggleZoomSlider() {
        const slider = this.elements.zoomSlider;
        if (slider) {
            slider.style.display = slider.style.display === 'none' ? 'flex' : 'none';
        }
    }

    updateZoom(value) {
        const zoom = value / 100;
        this.elements.zoomValue.textContent = `${zoom.toFixed(1)}x`;
        this.updateSetting('zoom', zoom);
    }

    // ============================================
    // STATS
    // ============================================

    startStatsUpdate() {
        this.updateStats();
        this.statsInterval = setInterval(() => this.updateStats(), 2000);
    }

    async updateStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();

            // Calculate FPS (estimate based on frame count change)
            const currentFrames = stats.frame_count;
            if (this.lastFrameCount !== undefined) {
                const fps = Math.round((currentFrames - this.lastFrameCount) / 2);
                this.elements.statFps.textContent = fps;
                this.elements.fpsDisplay.textContent = `${fps} FPS`;
            }
            this.lastFrameCount = currentFrames;

            this.elements.statFrames.textContent = this.formatNumber(stats.frame_count);
            this.elements.statUptime.textContent = stats.uptime;
            this.elements.statViewers.textContent = stats.viewers;
        } catch (error) {
            console.error('Stats update error:', error);
        }
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    // ============================================
    // GALLERY
    // ============================================

    async loadGallery() {
        try {
            const response = await fetch('/api/gallery');
            this.gallery = await response.json();
            this.renderGalleryPreview();
        } catch (error) {
            console.error('Gallery load error:', error);
        }
    }

    renderGalleryPreview() {
        const grid = this.elements.galleryGrid;
        if (!grid) return;

        const images = this.gallery.filter(f => f.type === 'image').slice(0, 6);

        if (images.length === 0) {
            grid.innerHTML = '<div class="gallery-empty">No captures yet</div>';
            return;
        }

        grid.innerHTML = images.map((item, index) => `
            <div class="gallery-item" data-index="${index}" onclick="app.openImageViewer(${index})">
                <img src="/api/gallery/${item.name}" alt="${item.name}" loading="lazy">
            </div>
        `).join('');
    }

    openGalleryModal() {
        this.renderFullGallery();
        this.openModal('galleryModal');
    }

    renderFullGallery() {
        const container = this.elements.galleryFull;
        if (!container) return;

        const images = this.gallery.filter(f => f.type === 'image');

        if (images.length === 0) {
            container.innerHTML = '<div class="gallery-empty">No captures yet. Start taking snapshots!</div>';
            return;
        }

        container.innerHTML = images.map((item, index) => `
            <div class="gallery-full-item" onclick="app.openImageViewer(${index})">
                <img src="/api/gallery/${item.name}" alt="${item.name}" loading="lazy">
                <div class="item-overlay">
                    <span class="item-name">${item.name}</span>
                </div>
            </div>
        `).join('');
    }

    openImageViewer(index) {
        const images = this.gallery.filter(f => f.type === 'image');
        if (index < 0 || index >= images.length) return;

        this.currentImageIndex = index;
        const image = images[index];

        this.elements.viewerImage.src = `/api/gallery/${image.name}`;
        this.elements.viewerFilename.textContent = image.name;

        this.closeModal('galleryModal');
        this.openModal('imageModal');
    }

    navigateImage(direction) {
        const images = this.gallery.filter(f => f.type === 'image');
        let newIndex = this.currentImageIndex + direction;

        if (newIndex < 0) newIndex = images.length - 1;
        if (newIndex >= images.length) newIndex = 0;

        this.openImageViewer(newIndex);
    }

    async deleteCurrentImage() {
        const images = this.gallery.filter(f => f.type === 'image');
        const image = images[this.currentImageIndex];

        if (!image) return;

        if (!confirm(`Delete ${image.name}?`)) return;

        try {
            const response = await fetch(`/api/gallery/${image.name}`, { method: 'DELETE' });
            const result = await response.json();

            if (result.success) {
                this.showToast('Image deleted', 'success');
                this.closeModal('imageModal');
                await this.loadGallery();
            } else {
                this.showToast('Failed to delete image', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Failed to delete image', 'error');
        }
    }

    // ============================================
    // MODALS
    // ============================================

    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ============================================
    // FULLSCREEN
    // ============================================

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen-mode');
        } else {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen-mode');
        }
    }

    // ============================================
    // THEME
    // ============================================

    toggleTheme() {
        // Future: Light mode implementation
        this.showToast('Dark mode is the default theme', 'info');
    }

    // ============================================
    // KEYBOARD SHORTCUTS
    // ============================================

    handleKeyboard(e) {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                this.captureSnapshot();
                break;
            case 'r':
                this.toggleRecording();
                break;
            case 'f':
                this.toggleFullscreen();
                break;
            case 'g':
                this.openGalleryModal();
                break;
            case 'escape':
                this.closeModal('galleryModal');
                this.closeModal('imageModal');
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                    document.body.classList.remove('fullscreen-mode');
                }
                break;
            case 'arrowleft':
                if (this.elements.imageModal?.classList.contains('active')) {
                    this.navigateImage(-1);
                }
                break;
            case 'arrowright':
                if (this.elements.imageModal?.classList.contains('active')) {
                    this.navigateImage(1);
                }
                break;
        }
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    showToast(message, type = 'info') {
        const container = this.elements.toastContainer;
        if (!container) return;

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app
const app = new AdvancedCameraApp();

// Add flash animation style dynamically
const style = document.createElement('style');
style.textContent = `
    .video-container.flash {
        animation: flashCapture 0.2s ease-out;
    }
    @keyframes flashCapture {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(2); }
    }
`;
document.head.appendChild(style);
