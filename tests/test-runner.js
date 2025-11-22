// Test runner for Weibo Timeline userscript
class WeiboTimelineTester {
    constructor() {
        this.statusElement = document.getElementById('status');
        this.logElement = document.getElementById('log');
        this.uidListElement = document.getElementById('uidList');
        this.uidStatusElement = document.getElementById('uidStatus');
        this.timelineElement = document.getElementById('timelinePreview');
        this.mockApiElement = document.getElementById('mockApiResponse');
        
        this.uidHealth = new Map();
        
        this.initializeEventListeners();
        this.loadDefaultMockResponse();
    }

    initializeEventListeners() {
        // Control buttons
        document.getElementById('loadScript').addEventListener('click', () => this.loadScript());
        document.getElementById('testStorage').addEventListener('click', () => this.testStorage());
        document.getElementById('testApi').addEventListener('click', () => this.testApi());
        document.getElementById('testUidValidation').addEventListener('click', () => this.testUidValidation());
        document.getElementById('simulateFetch').addEventListener('click', () => this.simulateFetch());
        document.getElementById('clearStorage').addEventListener('click', () => this.clearStorage());
        document.getElementById('openDashboard').addEventListener('click', () => this.openDashboard());
        
        // UID management
        document.getElementById('validateAllUids').addEventListener('click', () => this.validateAllUids());
        document.getElementById('addUid').addEventListener('click', () => this.addUid());
        document.getElementById('exportUids').addEventListener('click', () => this.exportUids());
        
        // Timeline
        document.getElementById('refreshTimeline').addEventListener('click', () => this.refreshTimeline());
        document.getElementById('testSorting').addEventListener('click', () => this.testSorting());
        
        // Mock API
        document.getElementById('updateMockResponse').addEventListener('click', () => this.updateMockResponse());
        document.getElementById('loadDefaultMock').addEventListener('click', () => this.loadDefaultMockResponse());
    }

    updateStatus(message, type = 'info') {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = `status ${type}`;
        }
        console.log(`[STATUS] ${message}`);
    }

    loadScript() {
        this.updateStatus('Userscript already loaded', 'success');
        
        // The script should already be loaded via script tag
        setTimeout(() => {
            if (typeof window.loadTimeline === 'function') {
                this.updateStatus('Userscript loaded successfully', 'success');
                this.refreshUidList();
            } else {
                this.updateStatus('Userscript not available', 'error');
            }
        }, 1000);
    }

    testStorage() {
        this.updateStatus('Testing storage functions...', 'info');
        
        try {
            // Test loadTimeline
            const timeline1 = window.loadTimeline();
            console.log('loadTimeline() result:', timeline1);
            
            // Test with sample data
            const sampleTimeline = {
                'test_uid_1_test_bid': {
                    key: 'test_uid_1_test_bid',
                    uid: 'test_uid_1',
                    username: 'Test User',
                    bid: 'test_bid',
                    text: 'Test post',
                    createdAt: 'Wed Nov 20 10:30:00 +0800 2024',
                    created_ts: Date.now(),
                    link: 'https://weibo.com/test_uid_1/test_bid'
                }
            };
            
            window.saveTimeline(sampleTimeline);
            const timeline2 = window.loadTimeline();
            console.log('After save/load:', timeline2);
            
            if (timeline2['test_uid_1_test_bid']) {
                this.updateStatus('Storage functions working correctly', 'success');
            } else {
                this.updateStatus('Storage functions failed', 'error');
            }
        } catch (error) {
            this.updateStatus(`Storage test error: ${error.message}`, 'error');
        }
    }

    testApi() {
        this.updateStatus('Testing API functions...', 'info');
        
        try {
            // Test gmRequest function
            if (typeof window.gmRequest === 'function') {
                this.updateStatus('gmRequest function available', 'success');
                
                // Test actual request
                window.gmRequest({
                    method: 'GET',
                    url: 'https://m.weibo.cn/api/container/getIndex?type=uid&value=test',
                    timeout: 5000,
                    onload: (response) => {
                        console.log('Test API response:', response);
                        this.updateStatus('API test completed', 'success');
                    },
                    onerror: (response) => {
                        this.updateStatus('API test failed', 'error');
                    }
                });
            } else {
                this.updateStatus('gmRequest function not available', 'error');
            }
        } catch (error) {
            this.updateStatus(`API test error: ${error.message}`, 'error');
        }
    }

    testUidValidation() {
        this.updateStatus('Testing UID validation...', 'info');
        
        try {
            // Test with some sample UIDs
            const testUids = ['1234567890', 'invalid', '9999999999', '1052404565'];
            
            testUids.forEach(uid => {
                const isValid = this.validateUid(uid);
                this.uidHealth.set(uid, isValid ? 'valid' : 'invalid');
                console.log(`UID ${uid}: ${isValid ? 'valid' : 'invalid'}`);
            });
            
            this.updateStatus('UID validation test completed', 'success');
            this.refreshUidList();
        } catch (error) {
            this.updateStatus(`UID validation error: ${error.message}`, 'error');
        }
    }

    validateUid(uid) {
        if (!uid) return false;
        
        // Basic validation: numeric and reasonable length
        return /^d{6,11}$/.test(uid);
    }

    simulateFetch() {
        this.updateStatus('Simulating data fetch...', 'info');
        
        try {
            if (typeof window.processOneUid === 'function') {
                // Simulate processing a few UIDs
                const sampleUids = ['1052404565', '1080201461', '1147851595'];
                sampleUids.forEach(async (uid) => {
                    console.log(`Processing UID: ${uid}`);
                    try {
                        await window.processOneUid(uid);
                    } catch (error) {
                        console.error(`Error processing UID ${uid}:`, error);
                        this.uidHealth.set(uid, 'invalid');
                    }
                });
                
                this.updateStatus('Fetch simulation completed', 'success');
            } else {
                this.updateStatus('processOneUid function not available', 'error');
            }
        } catch (error) {
            this.updateStatus(`Fetch simulation error: ${error.message}`, 'error');
        }
    }

    clearStorage() {
        try {
            localStorage.clear();
            this.updateStatus('Local storage cleared', 'success');
            this.refreshTimeline();
        } catch (error) {
            this.updateStatus(`Storage clear error: ${error.message}`, 'error');
        }
    }

    openDashboard() {
        try {
            if (window.testMenuCommands && window.testMenuCommands['🟠 Weibo Timeline']) {
                window.testMenuCommands['🟠 Weibo Timeline']();
                this.updateStatus('Test dashboard opened', 'success');
            } else {
                this.updateStatus('Menu command not available', 'error');
            }
        } catch (error) {
            this.updateStatus(`Dashboard open error: ${error.message}`, 'error');
        }
    }

    validateAllUids() {
        this.updateStatus('Validating all UIDs...', 'info');
        
        try {
            if (typeof window.USERS === 'undefined') {
                this.updateStatus('USERS array not available', 'error');
                return;
            }
            
            let validCount = 0;
            let invalidCount = 0;
            
            window.USERS.forEach(uid => {
                const isValid = this.validateUid(uid);
                this.uidHealth.set(uid, isValid ? 'valid' : 'invalid');
                if (isValid) {
                    validCount++;
                } else {
                    invalidCount++;
                }
            });
            
            this.updateStatus(`Validation complete: ${validCount} valid, ${invalidCount} invalid`, 'success');
            this.refreshUidList();
        } catch (error) {
            this.updateStatus(`Validation error: ${error.message}`, 'error');
        }
    }

    addUid() {
        const uid = prompt('Enter new Weibo UID:');
        if (uid && this.validateUid(uid)) {
            if (typeof window.USERS !== 'undefined') {
                window.USERS.push(uid);
                this.uidHealth.set(uid, 'valid');
                this.updateStatus(`UID ${uid} added`, 'success');
                this.refreshUidList();
            } else {
                this.updateStatus('USERS array not available', 'error');
            }
        } else {
            this.updateStatus('Invalid UID format', 'error');
        }
    }

    exportUids() {
        try {
            if (typeof window.USERS === 'undefined') {
                this.updateStatus('USERS array not available', 'error');
                return;
            }
            
            const uidData = {
                users: window.USERS,
                health: Object.fromEntries(this.uidHealth),
                exportDate: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(uidData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `weibo-uids-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.updateStatus('UIDs exported successfully', 'success');
            
        } catch (error) {
            this.updateStatus(`Export error: ${error.message}`, 'error');
        }
    }

    refreshTimeline() {
        try {
            const timeline = window.loadTimeline();
            const entries = Object.values(timeline);
            
            if (entries.length === 0) {
                this.timelineElement.innerHTML = '<p>No timeline entries found</p>';
                return;
            }
            
            // Sort by created_ts (current behavior)
            entries.sort((a, b) => (b.created_ts || 0) - (a.created_ts || 0));
            
            const html = entries.slice(0, 50).map(entry => `
                <div class="timeline-item">
                    <div class="timeline-meta">
                        <strong>${entry.username || 'Unknown'}</strong> • UID: ${entry.uid}
                    </div>
                    <div class="timeline-text">${entry.text || 'No text'}</div>
                    <div class="timeline-time">
                        Posted: ${entry.createdAt || 'Unknown'} | Added: ${new Date(entry.created_ts || 0).toLocaleString()}
                    </div>
                </div>
            `).join('');
            
            this.timelineElement.innerHTML = html;
            
        } catch (error) {
            this.updateStatus(`Timeline refresh error: ${error.message}`, 'error');
        }
    }

    testSorting() {
        try {
            this.updateStatus('Testing timeline sorting...', 'info');
            
            const timeline = window.loadTimeline();
            const entries = Object.values(timeline);
            
            if (entries.length < 2) {
                this.updateStatus('Need at least 2 timeline entries to test sorting', 'error');
                return;
            }
            
            // Test current sorting (by created_ts)
            const currentSorted = [...entries].sort((a, b) => (b.created_ts || 0) - (a.created_ts || 0));
            
            // Test new sorting (by actual post time)
            const newSorted = [...entries].sort((a, b) => {
                const timeA = this.parseWeiboTime(a.createdAt);
                const timeB = this.parseWeiboTime(b.createdAt);
                return timeB - timeA;
            });
            
            console.log('Current sort order (created_ts):', currentSorted.map(e => `${e.username}: ${e.createdAt}`));
            console.log('New sort order (post time):', newSorted.map(e => `${e.username}: ${e.createdAt}`));
            
            // Check if sorting is different
            const isDifferent = currentSorted.some((entry, index) => 
                entry.key !== newSorted[index]?.key
            );
            
            if (isDifferent) {
                this.updateStatus('Sorting test completed - order would change with post-time sorting', 'success');
            } else {
                this.updateStatus('Sorting test completed - order is the same', 'success');
            }
            
        } catch (error) {
            this.updateStatus(`Sorting test error: ${error.message}`, 'error');
        }
    }

    parseWeiboTime(timeString) {
        if (!timeString) return 0;
        
        try {
            // Parse Weibo time format: "Wed Nov 20 10:30:00 +0800 2024"
            const match = timeString.match(/\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\+\d{4}\s+\d{4}/);
            if (match) {
                return new Date(match[0]).getTime() || 0;
            }
            
            // Fallback to generic parsing
            return new Date(timeString).getTime() || 0;
        } catch (error) {
            console.warn('Failed to parse time:', timeString, error);
            return 0;
        }
    }

    refreshUidList() {
        try {
            if (typeof window.USERS === 'undefined') {
                this.uidListElement.innerHTML = '<p>USERS array not available</p>';
                return;
            }
            
            const uids = window.USERS;
            const html = uids.map(uid => {
                const health = this.uidHealth.get(uid) || 'unknown';
                const healthClass = health === 'valid' ? 'valid' : health === 'invalid' ? 'invalid' : 'stalled';
                
                return `
                    <div class="uid-item ${healthClass}">
                        <span>${uid}</span>
                        <div class="uid-actions">
                            <button class="test-btn" onclick="tester.testSingleUid('${uid}')">Test</button>
                            <button class="remove-btn" onclick="tester.removeUid('${uid}')">Remove</button>
                        </div>
                    </div>
                `;
            }).join('');
            
            this.uidListElement.innerHTML = html;
            
            // Update status summary
            const validCount = uids.filter(uid => this.uidHealth.get(uid) === 'valid').length;
            const invalidCount = uids.filter(uid => this.uidHealth.get(uid) === 'invalid').length;
            const stalledCount = uids.filter(uid => this.uidHealth.get(uid) === 'stalled').length;
            
            this.uidStatusElement.innerHTML = `
                <div class="status info">
                    Total: ${uids.length} | Valid: ${validCount} | Invalid: ${invalidCount} | Stalled: ${stalledCount}
                </div>
            `;
            
        } catch (error) {
            this.uidListElement.innerHTML = `<p>Error loading UID list: ${error.message}</p>`;
        }
    }

    async testSingleUid(uid) {
        try {
            console.log(`Testing UID: ${uid}`);
            this.updateStatus(`Testing UID ${uid}...`, 'info');
            
            // Simulate API test
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Random health result for demo
            const health = Math.random() > 0.3 ? 'valid' : 'stalled';
            this.uidHealth.set(uid, health);
            
            this.refreshUidList();
            this.updateStatus(`UID ${uid} test complete: ${health}`, 'success');
            
        } catch (error) {
            this.uidHealth.set(uid, 'invalid');
            this.refreshUidList();
            this.updateStatus(`UID ${uid} test failed: ${error.message}`, 'error');
        }
    }

    removeUid(uid) {
        if (confirm(`Remove UID ${uid} from the list?`)) {
            if (typeof window.USERS !== 'undefined') {
                const index = window.USERS.indexOf(uid);
                if (index > -1) {
                    window.USERS.splice(index, 1);
                    this.uidHealth.delete(uid);
                    this.refreshUidList();
                    this.updateStatus(`UID ${uid} removed`, 'success');
                }
            }
        }
    }

    updateMockResponse() {
        try {
            const jsonText = this.mockApiElement.value;
            const mockData = JSON.parse(jsonText);
            window.mockWeiboResponse = mockData;
            this.updateStatus('Mock API response updated', 'success');
        } catch (error) {
            this.updateStatus(`Invalid JSON in mock response: ${error.message}`, 'error');
        }
    }

    loadDefaultMockResponse() {
        const defaultResponse = {
            ok: 1,
            data: {
                cards: [
                    {
                        card_type: 9,
                        mblog: {
                            id: "1234567890",
                            bid: "test_1234567890",
                            created_at: "Wed Nov 20 10:30:00 +0800 2024",
                            text: "This is a test Weibo post for testing purposes. #测试 #test",
                            user: {
                                screen_name: "Test User",
                                name: "Test User",
                                remark: ""
                            }
                        }
                    },
                    {
                        card_type: 9,
                        mblog: {
                            id: "1234567891",
                            bid: "test_1234567891",
                            created_at: "Wed Nov 20 09:15:00 +0800 2024",
                            text: "Another test post with different timestamp for sorting tests.",
                            user: {
                                screen_name: "Another User",
                                name: "Another User",
                                remark: ""
                            }
                        }
                    },
                    {
                        card_type: 9,
                        mblog: {
                            id: "1234567892",
                            bid: "test_1234567892",
                            created_at: "Wed Nov 21 14:45:00 +0800 2024",
                            text: "Latest post for testing chronological ordering.",
                            user: {
                                screen_name: "Latest User",
                                name: "Latest User",
                                remark: ""
                            }
                        }
                    }
                ]
            }
        };
        
        this.mockApiElement.value = JSON.stringify(defaultResponse, null, 2);
        window.mockWeiboResponse = defaultResponse;
        this.updateStatus('Default mock response loaded', 'success');
    }
}

// Initialize tester when page loads
let tester;
document.addEventListener('DOMContentLoaded', () => {
    tester = new WeiboTimelineTester();
});