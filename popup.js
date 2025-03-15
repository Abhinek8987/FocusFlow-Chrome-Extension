// popup.js
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const timerDisplay = document.querySelector('.timer-display');
    const startBtn = document.querySelector('.start-btn');
    const pauseBtn = document.querySelector('.pause-btn');
    const resetBtn = document.querySelector('.reset-btn');
    const recheckBtn = document.querySelector('.recheck-btn');
    const focusTimeInput = document.getElementById('focus-time');
    const breakTimeInput = document.getElementById('break-time');
    const statusMessage = document.querySelector('.status-message');
    const tabsBlockedDisplay = document.querySelector('.tabs-blocked');
    const siteList = document.querySelector('.site-list');
    const newSiteInput = document.getElementById('new-site');
    const addSiteBtn = document.querySelector('.add-btn');
    
    // State variables
    let isRunning = false;
    let isWorkTime = true;
    let timeLeft;
    let blockedSites = [];
    let timer;
    let blockedTabsCount = 0;
    
    // Load saved settings
    chrome.storage.sync.get(['workDuration', 'breakDuration', 'blockedSites'], function(data) {
        if (data.workDuration) focusTimeInput.value = data.workDuration;
        if (data.breakDuration) breakTimeInput.value = data.breakDuration;
        if (data.blockedSites) {
            blockedSites = data.blockedSites;
            renderBlockedSites();
        }
    });
    
    // Check current timer status
    function updateTimerStatus() {
        chrome.runtime.sendMessage({action: "getStatus"}, function(response) {
            if (response) {
                isRunning = response.isRunning;
                isWorkTime = response.isWorkTime;
                timeLeft = response.timeLeft;
                
                if (response.blockedSites) {
                    blockedSites = response.blockedSites;
                    renderBlockedSites();
                }
                
                if (isRunning) {
                    startBtn.disabled = true;
                    pauseBtn.disabled = false;
                    updateTimerDisplay();
                    updateStatusMessage();
                } else {
                    timeLeft = focusTimeInput.value * 60;
                    updateTimerDisplay();
                    startBtn.disabled = false;
                    pauseBtn.disabled = true;
                }
            }
        });
    }
    
    // Update timer display
    function updateTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer color based on mode
        if (!isWorkTime) {
            timerDisplay.style.color = '#27ae60'; // Green for break time
        } else {
            timerDisplay.style.color = '#3498db'; // Blue for focus time
        }
    }
    
    // Update status message
    function updateStatusMessage() {
        if (!isRunning) {
            statusMessage.textContent = 'Ready to start focusing!';
        } else if (isWorkTime) {
            statusMessage.textContent = 'Focus mode active. Stay productive!';
        } else {
            statusMessage.textContent = 'Break time! Relax a bit.';
        }
    }
    
    // Start the timer
    function startTimer() {
        const workTime = parseInt(focusTimeInput.value);
        const breakTime = parseInt(breakTimeInput.value);
        
        // Validate inputs
        if (workTime <= 0 || breakTime <= 0) {
            alert('Please enter valid times');
            return;
        }
        
        // Update UI
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        
        // Start timer in background
        chrome.runtime.sendMessage({
            action: "startTimer",
            workTime: workTime,
            breakTime: breakTime,
            sites: blockedSites
        }, function(response) {
            // After timer starts, check the status to update UI
            updateTimerStatus();
        });
        
        // Setup timer update interval
        setupTimerUpdateInterval();
    }
    
    // Stop the timer
    function stopTimer() {
        chrome.runtime.sendMessage({
            action: "stopTimer"
        }, function(response) {
            updateTimerStatus();
        });
    }
    
    // Reset the timer
    function resetTimer() {
        stopTimer();
        timeLeft = focusTimeInput.value * 60;
        updateTimerDisplay();
        updateStatusMessage();
    }
    
    // Setup timer update interval
    function setupTimerUpdateInterval() {
        // Clear any existing intervals
        clearInterval(timer);
        
        // Set new interval
        timer = setInterval(function() {
            chrome.runtime.sendMessage({action: "getStatus"}, function(response) {
                if (response && response.isRunning) {
                    timeLeft = response.timeLeft;
                    isWorkTime = response.isWorkTime;
                    updateTimerDisplay();
                    updateStatusMessage();
                } else {
                    // Timer might have stopped in background
                    clearInterval(timer);
                    updateTimerStatus();
                }
            });
        }, 1000);
    }
    
    // Add a new blocked site
    function addBlockedSite() {
        const site = newSiteInput.value.trim().toLowerCase();
        
        if (!site) return;
        
        // Simple validation - make sure it looks like a domain
        if (!/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/.test(site)) {
            alert('Please enter a valid domain (e.g., facebook.com)');
            return;
        }
        
        if (!blockedSites.includes(site)) {
            blockedSites.push(site);
            newSiteInput.value = '';
            renderBlockedSites();
            
            // Save to storage
            chrome.storage.sync.set({blockedSites: blockedSites});
            
            // If timer is running, update the blocked sites
            if (isRunning) {
                chrome.runtime.sendMessage({
                    action: "startTimer",
                    workTime: parseInt(focusTimeInput.value),
                    breakTime: parseInt(breakTimeInput.value),
                    sites: blockedSites
                });
            }
        }
    }
    
    // Remove a blocked site
    function removeBlockedSite(site) {
        blockedSites = blockedSites.filter(s => s !== site);
        renderBlockedSites();
        
        // Save to storage
        chrome.storage.sync.set({blockedSites: blockedSites});
        
        // If timer is running, update the blocked sites
        if (isRunning) {
            chrome.runtime.sendMessage({
                action: "startTimer",
                workTime: parseInt(focusTimeInput.value),
                breakTime: parseInt(breakTimeInput.value),
                sites: blockedSites
            });
        }
    }
    
    // Render the list of blocked sites
    function renderBlockedSites() {
        siteList.innerHTML = '';
        
        if (blockedSites.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No sites added yet';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.color = '#999';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '10px 0';
            siteList.appendChild(emptyMessage);
            return;
        }
        
        blockedSites.forEach(site => {
            const siteItem = document.createElement('div');
            siteItem.className = 'site-item';
            
            const siteName = document.createElement('span');
            siteName.textContent = site;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'X';
            deleteBtn.addEventListener('click', () => removeBlockedSite(site));
            
            siteItem.appendChild(siteName);
            siteItem.appendChild(deleteBtn);
            siteList.appendChild(siteItem);
        });
    }
    
    // Check and update blocked tab count
    function updateBlockedTabCount() {
        chrome.tabs.query({url: chrome.runtime.getURL("blocked.html")}, function(tabs) {
            blockedTabsCount = tabs.length;
            tabsBlockedDisplay.textContent = `${blockedTabsCount} distracting tab${blockedTabsCount !== 1 ? 's' : ''} blocked`;
        });
    }
    
    // Show feedback message
    function showFeedbackMessage(message, type = 'info') {
        // Create feedback element if it doesn't exist
        let feedbackEl = document.querySelector('.feedback-message');
        if (!feedbackEl) {
            feedbackEl = document.createElement('div');
            feedbackEl.className = 'feedback-message';
            feedbackEl.style.position = 'fixed';
            feedbackEl.style.top = '50%';
            feedbackEl.style.left = '50%';
            feedbackEl.style.transform = 'translate(-50%, -50%)';
            feedbackEl.style.padding = '10px 15px';
            feedbackEl.style.borderRadius = '4px';
            feedbackEl.style.fontWeight = 'bold';
            feedbackEl.style.zIndex = '1000';
            feedbackEl.style.opacity = '0';
            feedbackEl.style.transition = 'opacity 0.3s ease-in-out';
            document.body.appendChild(feedbackEl);
        }
        
        // Set styles based on message type
        if (type === 'success') {
            feedbackEl.style.backgroundColor = '#2ecc71';
            feedbackEl.style.color = 'white';
        } else if (type === 'error') {
            feedbackEl.style.backgroundColor = '#e74c3c';
            feedbackEl.style.color = 'white';
        } else {
            feedbackEl.style.backgroundColor = '#3498db';
            feedbackEl.style.color = 'white';
        }
        
        // Set message and show
        feedbackEl.textContent = message;
        feedbackEl.style.opacity = '1';
        
        // Hide after delay
        setTimeout(() => {
            feedbackEl.style.opacity = '0';
        }, 2000);
    }
    
    // Recheck all tabs for blocking with visual feedback
    function recheckAllTabs() {
        // Visual feedback on button
        const originalText = recheckBtn.textContent;
        recheckBtn.textContent = 'Checking...';
        recheckBtn.style.backgroundColor = '#2980b9';
        recheckBtn.disabled = true;
        
        // Record previous count for comparison
        const previousCount = blockedTabsCount;
        
        // Send message to background script
        chrome.runtime.sendMessage({action: "recheckAllTabs"}, function(response) {
            // Update blocked tab count after recheck
            setTimeout(() => {
                updateBlockedTabCount();
                
                // Compare with previous count
                chrome.tabs.query({url: chrome.runtime.getURL("blocked.html")}, function(tabs) {
                    const newCount = tabs.length;
                    const newlyBlocked = newCount - previousCount;
                    
                    // Show appropriate message based on results
                    if (newlyBlocked > 0) {
                        showFeedbackMessage(`Blocked ${newlyBlocked} new tab${newlyBlocked !== 1 ? 's' : ''}!`, 'success');
                    } else if (newCount > 0) {
                        showFeedbackMessage(`${newCount} tab${newCount !== 1 ? 's' : ''} already blocked`, 'info');
                    } else {
                        showFeedbackMessage('No distracting tabs found', 'info');
                    }
                    
                    // Reset button
                    recheckBtn.textContent = originalText;
                    recheckBtn.style.backgroundColor = '#3498db';
                    recheckBtn.disabled = false;
                });
            }, 500);
        });
    }
    
    // Event listeners
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', stopTimer);
    resetBtn.addEventListener('click', resetTimer);
    recheckBtn.addEventListener('click', recheckAllTabs);
    addSiteBtn.addEventListener('click', addBlockedSite);
    
    // Handle Enter key in site input
    newSiteInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addBlockedSite();
        }
    });
    
    // Save settings when focus/break time changed
    focusTimeInput.addEventListener('change', function() {
        chrome.storage.sync.set({workDuration: parseInt(focusTimeInput.value)});
        if (!isRunning) {
            timeLeft = focusTimeInput.value * 60;
            updateTimerDisplay();
        }
    });
    
    breakTimeInput.addEventListener('change', function() {
        chrome.storage.sync.set({breakDuration: parseInt(breakTimeInput.value)});
    });
    
    // Listen for messages from background
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === "timeUpdate") {
            timeLeft = message.timeLeft;
            isWorkTime = message.isWorkTime;
            updateTimerDisplay();
            updateStatusMessage();
        }
    });
    
    // Initial setup
    updateTimerStatus();
    updateBlockedTabCount();
    
    // Periodically check for blocked tabs
    setInterval(updateBlockedTabCount, 5000);
});