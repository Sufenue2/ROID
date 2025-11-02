// ROID Program - Update Manager
// Handles announcements and auto-updates from GitHub

interface Announcement {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  date: string;
  priority: 'low' | 'medium' | 'high';
  dismissible: boolean;
  action?: {
    label: string;
    type: string;
  } | null;
}

interface AnnouncementResponse {
  version: string;
  last_updated: string;
  announcements: Announcement[];
  metadata: {
    total_announcements: number;
    active_announcements: number;
    fetch_interval_hours: number;
  };
}

interface AudioIDUpdate {
  version: string;
  last_updated: string;
  total_ids: number;
  changelog: {
    version: string;
    date: string;
    changes: string[];
  }[];
  metadata: {
    repository: string;
    raw_url: string;
    check_for_updates: boolean;
    auto_update_enabled: boolean;
  };
}

class UpdateManager {
  private readonly GITHUB_USERNAME = 'Sufenue'; // Replace with your GitHub username
  private readonly REPO_NAME = 'ROID'; // Replace with your repo name
  private readonly ANNOUNCEMENTS_URL = `https://raw.githubusercontent.com/Sufenue2/ROID/refs/heads/main/announcements.json`;
  private readonly AUDIO_IDS_URL = `https://raw.githubusercontent.com/Sufenue2/ROID/refs/heads/main/audio-ids.json`;
  
  private currentVersion: string = '2.4.0'; // Current local version
  private lastChecked: Date | null = null;
  private checkIntervalMs: number = 6 * 60 * 60 * 1000; // 6 hours

  /**
   * Fetch announcements from GitHub
   */
  async fetchAnnouncements(): Promise<AnnouncementResponse | null> {
    try {
      const response = await fetch(this.ANNOUNCEMENTS_URL, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch announcements:', response.statusText);
        return null;
      }

      const data: AnnouncementResponse = await response.json();
      this.lastChecked = new Date();
      
      return data;
    } catch (error) {
      console.error('Error fetching announcements:', error);
      return null;
    }
  }

  /**
   * Check for new audio ID updates
   */
  async checkForIDUpdates(): Promise<{
    hasUpdate: boolean;
    remoteVersion: string;
    newIDs: number;
    changelog: string[];
  } | null> {
    try {
      const response = await fetch(this.AUDIO_IDS_URL, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to check for updates:', response.statusText);
        return null;
      }

      const data: AudioIDUpdate = await response.json();
      const remoteVersion = data.version;
      const hasUpdate = this.compareVersions(remoteVersion, this.currentVersion) > 0;

      if (hasUpdate) {
        const latestChangelog = data.changelog[0];
        return {
          hasUpdate: true,
          remoteVersion: remoteVersion,
          newIDs: this.calculateNewIDs(data.total_ids),
          changelog: latestChangelog.changes
        };
      }

      return {
        hasUpdate: false,
        remoteVersion: remoteVersion,
        newIDs: 0,
        changelog: []
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return null;
    }
  }

  /**
   * Download and apply audio ID updates
   */
  async downloadUpdates(): Promise<boolean> {
    try {
      const response = await fetch(this.AUDIO_IDS_URL);
      const data = await response.json();

      // Save to local storage or file
      localStorage.setItem('audio-ids', JSON.stringify(data));
      this.currentVersion = data.version;
      
      console.log(`✅ Updated to version ${data.version}`);
      return true;
    } catch (error) {
      console.error('Error downloading updates:', error);
      return false;
    }
  }

  /**
   * Show update dialog to user
   */
  async promptUserForUpdate(updateInfo: any): Promise<boolean> {
    return new Promise((resolve) => {
      // Create a modal dialog
      const dialog = document.createElement('div');
      dialog.className = 'update-dialog';
      dialog.innerHTML = `
        <div class="update-modal">
          <h2>🎵 New Audio IDs Available!</h2>
          <p><strong>Version ${updateInfo.remoteVersion}</strong> is now available.</p>
          <p>You're currently on version ${this.currentVersion}.</p>
          
          <div class="update-info">
            <p><strong>What's New:</strong></p>
            <ul>
              ${updateInfo.changelog.map((change: string) => `<li>${change}</li>`).join('')}
            </ul>
            <p class="new-ids-count">📊 <strong>${updateInfo.newIDs} new IDs</strong> will be added to your collection.</p>
          </div>

          <div class="update-actions">
            <button id="update-now" class="btn-primary">Update Now</button>
            <button id="update-later" class="btn-secondary">Maybe Later</button>
            <button id="update-never" class="btn-tertiary">Don't Ask Again</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // Event listeners
      document.getElementById('update-now')?.addEventListener('click', () => {
        dialog.remove();
        resolve(true);
      });

      document.getElementById('update-later')?.addEventListener('click', () => {
        dialog.remove();
        resolve(false);
      });

      document.getElementById('update-never')?.addEventListener('click', () => {
        localStorage.setItem('auto-update-disabled', 'true');
        dialog.remove();
        resolve(false);
      });
    });
  }

  /**
   * Display announcements in the UI
   */
  displayAnnouncements(announcements: Announcement[]): void {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    // Sort by priority
    const sortedAnnouncements = announcements.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    container.innerHTML = sortedAnnouncements.map(announcement => `
      <div class="announcement announcement-${announcement.type}" data-id="${announcement.id}">
        <div class="announcement-header">
          <span class="announcement-icon">${this.getAnnouncementIcon(announcement.type)}</span>
          <h3>${announcement.title}</h3>
          ${announcement.dismissible ? '<button class="dismiss-btn">✕</button>' : ''}
        </div>
        <p>${announcement.message}</p>
        <span class="announcement-date">${announcement.date}</span>
        ${announcement.action ? `
          <button class="announcement-action" data-action="${announcement.action.type}">
            ${announcement.action.label}
          </button>
        ` : ''}
      </div>
    `).join('');

    // Add event listeners for dismiss buttons
    container.querySelectorAll('.dismiss-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const announcementEl = (e.target as HTMLElement).closest('.announcement');
        if (announcementEl) {
          const id = announcementEl.getAttribute('data-id');
          this.dismissAnnouncement(id!);
          announcementEl.remove();
        }
      });
    });

    // Add event listeners for action buttons
    container.querySelectorAll('.announcement-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = (e.target as HTMLElement).getAttribute('data-action');
        if (action === 'check_updates') {
          await this.checkAndPromptForUpdates();
        }
      });
    });
  }

  /**
   * Main update check flow
   */
  async checkAndPromptForUpdates(): Promise<void> {
    const updateInfo = await this.checkForIDUpdates();
    
    if (!updateInfo) {
      alert('❌ Unable to check for updates. Please try again later.');
      return;
    }

    if (!updateInfo.hasUpdate) {
      alert('✅ You\'re up to date! No new IDs available.');
      return;
    }

    const userWantsUpdate = await this.promptUserForUpdate(updateInfo);
    
    if (userWantsUpdate) {
      const success = await this.downloadUpdates();
      if (success) {
        alert(`✅ Successfully updated to version ${updateInfo.remoteVersion}!`);
        // Reload the app or refresh the ID list
        window.location.reload();
      } else {
        alert('❌ Update failed. Please try again.');
      }
    }
  }

  /**
   * Initialize auto-update checker
   */
  startAutoUpdateChecker(): void {
    // Check on startup
    this.checkAndPromptForUpdates();

    // Check periodically
    setInterval(() => {
      if (!localStorage.getItem('auto-update-disabled')) {
        this.checkAndPromptForUpdates();
      }
    }, this.checkIntervalMs);
  }

  /**
   * Initialize announcement fetcher
   */
  async startAnnouncementFetcher(): Promise<void> {
    const data = await this.fetchAnnouncements();
    if (data) {
      this.displayAnnouncements(data.announcements);
    }

    // Fetch periodically
    setInterval(async () => {
      const data = await this.fetchAnnouncements();
      if (data) {
        this.displayAnnouncements(data.announcements);
      }
    }, this.checkIntervalMs);
  }

  // Helper methods
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
  }

  private calculateNewIDs(remoteTotalIDs: number): number {
    const localTotalIDs = JSON.parse(localStorage.getItem('audio-ids') || '{"total_ids": 0}').total_ids;
    return Math.max(0, remoteTotalIDs - localTotalIDs);
  }

  private getAnnouncementIcon(type: string): string {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type as keyof typeof icons] || 'ℹ️';
  }

  private dismissAnnouncement(id: string): void {
    const dismissed = JSON.parse(localStorage.getItem('dismissed-announcements') || '[]');
    dismissed.push(id);
    localStorage.setItem('dismissed-announcements', JSON.stringify(dismissed));
  }
}

// Export for use in your app
export default UpdateManager;

// Usage example:
// const updateManager = new UpdateManager();
// updateManager.startAutoUpdateChecker();
// updateManager.startAnnouncementFetcher();

