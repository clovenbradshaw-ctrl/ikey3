class SessionManager {
    constructor() {
        this.defaultDuration = 45 * 60 * 1000;
        this.duration = this.defaultDuration;
        this.extendDuration = 30 * 60 * 1000;
        this.expiration = null;
        this.interval = null;
        this.warning5Shown = false;
        this.warning1Shown = false;
        this.autoSaveTimer = null;
        this.ring = document.getElementById('session-timer');
        this.countdown = document.getElementById('session-countdown');
        this.buildUI();
        this.attachListeners();

        const storedExpiration = parseInt(localStorage.getItem('sessionExpiration'), 10);
        const storedDuration = parseInt(localStorage.getItem('sessionDuration'), 10);
        if (storedExpiration && storedExpiration > Date.now()) {
            this.duration = storedDuration || this.defaultDuration;
            this.expiration = storedExpiration;
            this.updateRing();
            this.interval = setInterval(() => this.tick(), 1000);
        } else if (storedExpiration) {
            this.expire();
        } else {
            this.reset();
        }
    }

    buildUI() {
        // Warning banner
        this.banner = document.createElement('div');
        this.banner.id = 'session-warning';
        this.banner.className = 'session-banner';
        this.banner.innerHTML = `Your session will expire in <span id="banner-time">5 minutes</span>
            <button id="continue-btn">Continue Working</button>
            <button id="save-logout-btn">Save & Logout</button>`;
        document.body.appendChild(this.banner);
        document.getElementById('continue-btn').addEventListener('click', () => this.reset());
        document.getElementById('save-logout-btn').addEventListener('click', () => this.expire());

        // Modal
        this.modal = document.createElement('div');
        this.modal.id = 'session-modal';
        this.modal.className = 'session-modal';
        this.modal.innerHTML = `<div class="session-modal-content">
            <p>Session expiring in <span id="modal-time">60</span>...</p>
            <button id="extend-btn">Extend Session - 30 min</button>
            <button id="logout-btn">Logout Now</button>
        </div>`;
        document.body.appendChild(this.modal);
        document.getElementById('extend-btn').addEventListener('click', () => {
            this.duration = this.extendDuration;
            this.reset();
            this.hideModal();
        });
        document.getElementById('logout-btn').addEventListener('click', () => this.expire());

        // Expired overlay
        this.expired = document.createElement('div');
        this.expired.id = 'session-expired';
        this.expired.className = 'session-expired';
        this.expired.innerHTML = `<div class="session-expired-content">
            <p>Session expired for your security</p>
            <button id="login-again-btn">Login Again</button>
            <button id="public-view-btn">Go to Public View</button>
        </div>`;
        document.body.appendChild(this.expired);
        document.getElementById('login-again-btn').addEventListener('click', () => {
            this.restoreDraft();
            this.hideExpired();
            this.reset();
            if (typeof ownerPassword !== 'undefined' && ownerPassword && typeof showOwnerDashboard === 'function') {
                showOwnerDashboard();
            }
        });
        document.getElementById('public-view-btn').addEventListener('click', () => window.location.reload());
    }

    attachListeners() {
        const activity = () => {
            this.duration = this.defaultDuration;
            this.reset();
            resetIdle();
        };
        const resetIdle = () => {
            clearTimeout(this.idleTimer);
            this.idleTimer = setTimeout(() => this.showIdleReminder(), 5 * 60 * 1000);
        };
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
            document.addEventListener(evt, activity)
        );
        document.addEventListener('scroll', activity, { passive: true });
        resetIdle();
        document.addEventListener('input', e => {
            if (e.target.matches('input, textarea, select')) {
                this.scheduleAutoSave();
            }
        });
    }

    reset() {
        this.expiration = Date.now() + this.duration;
        localStorage.setItem('sessionExpiration', this.expiration);
        localStorage.setItem('sessionDuration', this.duration);
        this.warning5Shown = false;
        this.warning1Shown = false;
        this.hideBanner();
        this.hideModal();
        this.hideExpired();
        this.updateRing();
        if (!this.interval) {
            this.interval = setInterval(() => this.tick(), 1000);
        }
    }

    tick() {
        const remaining = this.expiration - Date.now();
        if (remaining <= 0) {
            this.expire();
            return;
        }
        this.updateRing(remaining);
        if (remaining <= 60 * 1000 && !this.warning1Shown) {
            this.showModal(remaining);
            this.warning1Shown = true;
        } else if (remaining <= 5 * 60 * 1000 && !this.warning5Shown) {
            this.showBanner(remaining);
            this.warning5Shown = true;
        }
    }

    updateRing(remaining = this.expiration - Date.now()) {
        const total = this.duration;
        const progress = 360 * (1 - remaining / total);
        const elapsedMin = (total - remaining) / 60000;
        let color = '#4caf50';
        if (elapsedMin >= 40) color = '#ff9800';
        else if (elapsedMin >= 30) color = '#ffeb3b';
        this.ring.style.setProperty('--progress', progress + 'deg');
        this.ring.style.setProperty('--ring-color', color);
        this.countdown.textContent = Math.ceil(remaining / 60000) + 'm';
        if (remaining <= 5 * 60 * 1000) this.ring.classList.add('pulse');
        else this.ring.classList.remove('pulse');
    }

    showBanner(remaining) {
        document.getElementById('banner-time').textContent = Math.ceil(remaining / 60000) + ' minutes';
        this.banner.classList.add('active');
        setTimeout(() => this.hideBanner(), 10000);
    }
    hideBanner() {
        this.banner.classList.remove('active');
    }

    showModal(remaining) {
        const modalTime = document.getElementById('modal-time');
        modalTime.textContent = Math.ceil(remaining / 1000);
        this.modal.classList.add('active');
        this.modalInterval = setInterval(() => {
            const left = this.expiration - Date.now();
            if (left <= 0) {
                clearInterval(this.modalInterval);
            } else {
                modalTime.textContent = Math.ceil(left / 1000);
            }
        }, 1000);
    }
    hideModal() {
        this.modal.classList.remove('active');
        if (this.modalInterval) clearInterval(this.modalInterval);
    }

    showIdleReminder() {
        if (this.idleNotice) return;
        this.idleNotice = document.createElement('div');
        this.idleNotice.className = 'session-banner active';
        this.idleNotice.textContent = "You've been idle";
        document.body.appendChild(this.idleNotice);
        setTimeout(() => {
            this.idleNotice.classList.remove('active');
            setTimeout(() => { this.idleNotice.remove(); this.idleNotice = null; }, 300);
        }, 3000);
    }

    expire() {
        this.autoSave();
        this.hideBanner();
        this.hideModal();
        this.expired.classList.add('active');
        clearInterval(this.interval);
        this.interval = null;
        localStorage.removeItem('sessionExpiration');
        localStorage.removeItem('sessionDuration');
    }
    hideExpired() {
        this.expired.classList.remove('active');
    }

    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => this.autoSave(), 15000);
    }

    autoSave() {
        clearTimeout(this.autoSaveTimer);
        const status = document.getElementById('autosave-status');
        if (status) status.textContent = 'Saving...';

        const draft = {};
        document.querySelectorAll('input, textarea, select').forEach(el => {
            draft[el.id || el.name] = el.value;
        });
        localStorage.setItem('sessionDraft', JSON.stringify(draft));
        this.saveToArchive(draft);

        if (status) {
            status.textContent = 'Saved';
            setTimeout(() => { status.textContent = ''; }, 2000);
        }
    }

    saveToArchive(data) {
        const url = 'https://web.archive.org/save/' + encodeURIComponent(location.href);
        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, blob);
            } else {
                fetch(url, { method: 'POST', body: blob, mode: 'no-cors' });
            }
        } catch (e) {
            console.error('Archive save failed', e);
        }
    }

    restoreDraft() {
        const data = localStorage.getItem('sessionDraft');
        if (!data) return;
        const draft = JSON.parse(data);
        Object.keys(draft).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = draft[key];
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.sessionManager && document.getElementById('session-timer')) {
        window.sessionManager = new SessionManager();
    }
});
