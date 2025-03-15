// background.js
let isRunning = false;
let isWorkTime = true;
let timeLeft;
let timer;
let workDuration;
let breakDuration;
let blockedSites = [];
let currentSession = {
  startTime: null,
  totalFocusTime: 0
};

// Track stats
let dailyStats = {};
let weeklyStats = {};

// Load saved data
chrome.storage.sync.get(['dailyStats', 'weeklyStats', 'workDuration', 'breakDuration', 'blockedSites'], function(data) {
  if (data.dailyStats) dailyStats = data.dailyStats;
  if (data.weeklyStats) weeklyStats = data.weeklyStats;
  if (data.workDuration) workDuration = data.workDuration * 60;
  if (data.breakDuration) breakDuration = data.breakDuration * 60;
  if (data.blockedSites) blockedSites = data.blockedSites;
  
  // Clean up old stats (keep only current week)
  cleanupStats();
});

// Handle messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "startTimer") {
    startTimer(request.workTime, request.breakTime, request.sites);
    sendResponse({status: "Timer started"});
  } else if (request.action === "stopTimer") {
    stopTimer();
    sendResponse({status: "Timer stopped"});
  } else if (request.action === "getStatus") {
    sendResponse({
      isRunning: isRunning,
      isWorkTime: isWorkTime,
      timeLeft: timeLeft,
      blockedSites: blockedSites
    });
  } else if (request.action === "getStats") {
    sendResponse({
      daily: dailyStats,
      weekly: weeklyStats
    });
  } else if (request.action === "checkTab") {
    if (isRunning && isWorkTime) {
      checkAndBlockTab(request.tabId, request.url);
    }
    sendResponse({status: "Tab checked"});
  } else if (request.action === "recheckAllTabs") {
    forceRecheckAllTabs();
    sendResponse({status: "All tabs rechecked"});
  }
  return true; // Required to use sendResponse asynchronously
});

// Start the timer
function startTimer(workTime, breakTime, sites) {
  workDuration = workTime * 60; // Convert to seconds
  breakDuration = breakTime * 60; // Convert to seconds
  timeLeft = workDuration;
  isWorkTime = true;
  isRunning = true;
  
  // Update blockedSites
  if (sites && Array.isArray(sites)) {
    blockedSites = sites;
    
    // Save to storage
    chrome.storage.sync.set({
      blockedSites: blockedSites,
      workDuration: workTime,
      breakDuration: breakTime
    });
  }
  
  // Record session start time
  currentSession.startTime = new Date().getTime();
  currentSession.totalFocusTime = 0;
  
  clearInterval(timer);
  timer = setInterval(updateTimer, 1000);
  
  // Update browser action icon
  chrome.action.setIcon({path: "icons/icon-active.png"});
  
  // Notify the user
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Focus Mode Started",
    message: `Work session started for ${workTime} minutes`
  });
  
  // Set up site blocking by checking all tabs
  updateTabBlocking();
  
  // Force check all tabs immediately when starting
  forceRecheckAllTabs();
}

// Stop the timer
function stopTimer() {
  isRunning = false;
  clearInterval(timer);
  
  // Update session stats
  if (currentSession.startTime) {
    updateStats();
  }
  
  // Reset current session
  currentSession = {
    startTime: null,
    totalFocusTime: 0
  };
  
  // Update browser action icon
  chrome.action.setIcon({path: "icons/icon-inactive.png"});
  
  // Notify the user
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Focus Mode Ended",
    message: "Your session has ended"
  });
  
  // Refresh any blocked tabs
  refreshBlockedTabs();
}

// Update the timer each second
function updateTimer() {
  timeLeft--;
  
  // Send time update to popup if it's open
  chrome.runtime.sendMessage({
    action: "timeUpdate",
    timeLeft: timeLeft,
    isWorkTime: isWorkTime
  }).catch(() => {
    // Ignore errors when popup is closed
  });
  
  if (timeLeft <= 0) {
    if (isWorkTime) {
      // Work time finished, start break
      isWorkTime = false;
      timeLeft = breakDuration;
      
      // Update stats before switching to break
      updateStats();
      
      // Refresh any previously blocked tabs
      refreshBlockedTabs();
      
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Break Time!",
        message: `Take a ${breakDuration/60} minute break`
      });
    } else {
      // Break time finished, start work
      isWorkTime = true;
      timeLeft = workDuration;
      
      // Reset session start time for new work period
      currentSession.startTime = new Date().getTime();
      
      // Re-apply site blocking
      updateTabBlocking();
      
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Back to Work",
        message: `Focus for ${workDuration/60} minutes`
      });
    }
  }
}

// Update stats with session data
function updateStats() {
  const now = new Date();
  const today = now.toDateString();
  const week = getWeekNumber(now);
  
  // Calculate focus time for this session
  const sessionEnd = new Date().getTime();
  const focusTimeMinutes = Math.floor((sessionEnd - currentSession.startTime) / 60000);
  currentSession.totalFocusTime += focusTimeMinutes;
  
  // Update daily stats
  if (!dailyStats[today]) {
    dailyStats[today] = {
      sessions: 0,
      totalFocusTime: 0
    };
  }
  dailyStats[today].sessions++;
  dailyStats[today].totalFocusTime += focusTimeMinutes;
  
  // Update weekly stats
  const weekKey = `${week[0]}-${week[1]}`; // Year-Week format
  if (!weeklyStats[weekKey]) {
    weeklyStats[weekKey] = {
      sessions: 0,
      totalFocusTime: 0,
      dailyAverage: 0
    };
  }
  weeklyStats[weekKey].sessions++;
  weeklyStats[weekKey].totalFocusTime += focusTimeMinutes;
  weeklyStats[weekKey].dailyAverage = weeklyStats[weekKey].totalFocusTime / 7;
  
  // Save stats
  chrome.storage.sync.set({
    dailyStats: dailyStats,
    weeklyStats: weeklyStats
  });
  
  // Reset session start time
  currentSession.startTime = new Date().getTime();
}

// Get the week number for a date
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return [d.getUTCFullYear(), weekNo];
}

// Clean up old stats
function cleanupStats() {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const currentWeekKey = `${currentWeek[0]}-${currentWeek[1]}`;
  
  // Keep only current week in weekly stats
  for (const weekKey in weeklyStats) {
    if (weekKey !== currentWeekKey) {
      delete weeklyStats[weekKey];
    }
  }
  
  // Keep only last 7 days in daily stats
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  for (const day in dailyStats) {
    if (new Date(day) < oneWeekAgo) {
      delete dailyStats[day];
    }
  }
  
  // Save cleaned stats
  chrome.storage.sync.set({
    dailyStats: dailyStats,
    weeklyStats: weeklyStats
  });
}

// Check if a URL is in the blocked list - IMPROVED VERSION
function isBlockedSite(url) {
  if (!isRunning || !isWorkTime || blockedSites.length === 0) {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    for (const site of blockedSites) {
      // Improved domain matching logic
      if (hostname === site || hostname.endsWith('.' + site) || hostname.includes(site)) {
        return true;
      }
    }
  } catch (e) {
    console.error("Error parsing URL:", e);
  }
  
  return false;
}

// Check and block a specific tab if needed
function checkAndBlockTab(tabId, url) {
  if (isBlockedSite(url)) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("blocked.html")
    });
    return true;
  }
  return false;
}

// Force checking all open tabs
function forceRecheckAllTabs() {
  if (isRunning && isWorkTime) {
    chrome.tabs.query({}, function(tabs) {
      for (const tab of tabs) {
        if (tab.url) {
          checkAndBlockTab(tab.id, tab.url);
        }
      }
    });
  }
}

// Update tab blocking for all open tabs
function updateTabBlocking() {
  if (!isRunning || !isWorkTime || blockedSites.length === 0) {
    return;
  }
  
  forceRecheckAllTabs();
  
  // Add listeners for new tabs and navigation
  setupNavigationListeners();
}

// Set up listeners for tab navigation
function setupNavigationListeners() {
  // Remove existing listeners first to avoid duplicates
  chrome.tabs.onUpdated.removeListener(tabUpdateListener);
  chrome.tabs.onCreated.removeListener(tabCreatedListener);
  
  // Add listeners
  chrome.tabs.onUpdated.addListener(tabUpdateListener);
  chrome.tabs.onCreated.addListener(tabCreatedListener);
}

// Tab update listener - IMPROVED VERSION
function tabUpdateListener(tabId, changeInfo, tab) {
  // Check on URL changes AND when a page completes loading
  if ((changeInfo.url && isBlockedSite(changeInfo.url)) || 
      (changeInfo.status === 'complete' && tab.url && isBlockedSite(tab.url))) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("blocked.html")
    });
  }
}

// Tab created listener
function tabCreatedListener(tab) {
  if (tab.url && isBlockedSite(tab.url)) {
    chrome.tabs.update(tab.id, {
      url: chrome.runtime.getURL("blocked.html")
    });
  }
}

// Refresh any tabs that were previously blocked
function refreshBlockedTabs() {
  chrome.tabs.query({url: chrome.runtime.getURL("blocked.html")}, function(tabs) {
    for (const tab of tabs) {
      chrome.tabs.goBack(tab.id);
    }
  });
  
  // Remove navigation listeners
  chrome.tabs.onUpdated.removeListener(tabUpdateListener);
  chrome.tabs.onCreated.removeListener(tabCreatedListener);
}

// This keeps the background service worker active
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === "keepAlive") {
    // Do nothing, just keep the service worker alive
  }
});

// Initial setup of navigation listeners
chrome.tabs.onUpdated.addListener(tabUpdateListener);
chrome.tabs.onCreated.addListener(tabCreatedListener);