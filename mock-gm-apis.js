// Mock Tampermonkey APIs for testing
window.GM = {
    xmlHttpRequest: function(opts) {
        console.log('[GM Mock] Request:', opts);
        
        // Simulate network delay
        setTimeout(() => {
            if (opts.url && opts.url.includes('m.weibo.cn')) {
                // Return mock data for Weibo API
                const mockResponse = window.mockWeiboResponse || getDefaultMockResponse();
                
                if (opts.onload) {
                    opts.onload({
                        status: 200,
                        responseText: JSON.stringify(mockResponse),
                        finalUrl: opts.url
                    });
                }
            } else if (opts.responseType === 'blob') {
                // Handle image/blob requests
                console.log('[GM Mock] Blob request for:', opts.url);
                
                // Create a dummy blob (1x1 pixel PNG)
                const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                fetch('data:image/png;base64,' + base64)
                    .then(response => response.blob())
                    .then(blob => {
                        if (opts.onload) {
                            opts.onload({
                                status: 200,
                                response: blob,
                                finalUrl: opts.url
                            });
                        }
                    })
                    .catch(err => {
                        console.error('[GM Mock] Failed to create blob:', err);
                        if (opts.onerror) {
                            opts.onerror({ status: 500, error: err });
                        }
                    });
            } else {
                // Generic mock response
                if (opts.onload) {
                    opts.onload({
                        status: 200,
                        responseText: '{}',
                        finalUrl: opts.url
                    });
                }
            }
        }, Math.random() * 1000 + 500); // 500-1500ms delay
    }
};

window.GM_xmlhttpRequest = window.GM.xmlHttpRequest;

window.GM_registerMenuCommand = function(caption, callback) {
    console.log('[GM Mock] Menu command registered:', caption);
    
    // For testing, we'll expose the callback globally
    if (!window.testMenuCommands) {
        window.testMenuCommands = {};
    }
    window.testMenuCommands[caption] = callback;
    
    // Create a button in the test interface
    const button = document.createElement('button');
    button.textContent = caption;
    button.onclick = callback;
    
    const controlsContainer = document.querySelector('.controls');
    if (controlsContainer) {
        controlsContainer.appendChild(button);
    }
};

function getDefaultMockResponse() {
    return {
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
                }
            ]
        }
    };
}

// Set default mock response
window.mockWeiboResponse = getDefaultMockResponse();

// Mock localStorage for testing
if (typeof window.localStorage === 'undefined') {
    window.localStorage = {
        _data: {},
        setItem: function(key, value) {
            this._data[key] = value;
        },
        getItem: function(key) {
            return this._data[key] || null;
        },
        removeItem: function(key) {
            delete this._data[key];
        },
        clear: function() {
            this._data = {};
        }
    };
}

// Console override to capture logs in the test interface
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
};

function captureConsole(type, ...args) {
    originalConsole[type](...args);
    
    const logElement = document.getElementById('log');
    if (logElement) {
        const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        
        logElement.textContent += `[${timestamp}] ${type.toUpperCase()}: ${message}\n`;
        logElement.scrollTop = logElement.scrollHeight;
    }
}

console.log = (...args) => captureConsole('log', ...args);
console.error = (...args) => captureConsole('error', ...args);
console.warn = (...args) => captureConsole('warn', ...args);
console.info = (...args) => captureConsole('info', ...args);