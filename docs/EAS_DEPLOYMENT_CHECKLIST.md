# EAS Deployment Credentials Checklist

**🚀 Rapid Deployment Guide for 3 Applications**

---

## ⏰ **Timeline: 10 Days to EAS Subscription Expiry**

### **Target Applications:**
1. **Seftec SaaS** (`saas.seftec.tech`)
2. **VortexCore** (`vortexcore.app`) 
3. **LanOnasis** (`lanonasis.com`)

---

## 🍎 **Apple Developer Credentials**

### **Required for All 3 Apps:**

#### **1. Apple Developer Account**
- [ ] **Apple ID**: _____________________
- [ ] **Developer Account Status**: Active/Pending
- [ ] **Membership Fee**: $99/year (paid/pending)
- [ ] **Team ID**: __________________ (found in Membership tab)

#### **2. App Store Connect Access**
- [ ] **App Store Connect Login**: _____________________
- [ ] **Two-Factor Authentication**: Enabled
- [ ] **App-Specific Passwords**: Generated (if using 2FA)

#### **3. Certificates & Provisioning (EAS will handle, but verify access)**
- [ ] **iOS Distribution Certificate**: EAS auto-generates
- [ ] **Push Notification Certificate**: EAS auto-generates
- [ ] **Provisioning Profiles**: EAS auto-generates
- [ ] **Bundle Identifiers Reserved**:
  - [ ] `com.seftec.saas` (Seftec SaaS)
  - [ ] `com.vortexcore.app` (VortexCore)
  - [ ] `com.lanonasis.privacy` (LanOnasis)

#### **4. App Store Listings (Prepare in advance)**
```bash
# App 1: Seftec SaaS
App Name: "Seftec SaaS - Enterprise Platform"
Bundle ID: com.seftec.saas
Category: Business
Description: "Enterprise-grade SaaS platform with AI-powered automation"

# App 2: VortexCore
App Name: "VortexCore - AI/ML Platform"
Bundle ID: com.vortexcore.app
Category: Developer Tools
Description: "Advanced AI/ML infrastructure for developers and teams"

# App 3: LanOnasis
App Name: "LanOnasis - Privacy Communication"
Bundle ID: com.lanonasis.privacy
Category: Social Networking
Description: "Privacy-first communication with encrypted AI chat"
```

---

## 🤖 **Google Play Console Credentials**

### **Required for All 3 Apps:**

#### **1. Google Play Console Account**
- [ ] **Google Account**: _____________________
- [ ] **Developer Account Status**: Active
- [ ] **Registration Fee**: $25 (one-time, paid/pending)
- [ ] **Developer Account ID**: __________________

#### **2. Google Cloud Project (for Play Services)**
- [ ] **Project ID**: __________________ (create if needed)
- [ ] **Project Number**: __________________
- [ ] **APIs Enabled**:
  - [ ] Google Play Developer API
  - [ ] Google Play Console API
  - [ ] Google Sign-In API (if using)

#### **3. Service Account (for EAS)**
- [ ] **Service Account Email**: __________________
- [ ] **Service Account Key File**: `google-play-service-account.json`
- [ ] **Permissions**: Release Manager, Developer

#### **4. App Listings (Prepare in advance)**
```bash
# App 1: Seftec SaaS
Package Name: com.seftec.saas
App Title: "Seftec SaaS - Enterprise Platform"
Category: Business
Content Rating: Everyone

# App 2: VortexCore  
Package Name: com.vortexcore.app
App Title: "VortexCore - AI/ML Platform"
Category: Tools
Content Rating: Everyone

# App 3: LanOnasis
Package Name: com.lanonasis.privacy
App Title: "LanOnasis - Privacy Communication"
Category: Communication
Content Rating: Everyone
```

---

## 📱 **AdMob Credentials**

### **Required for Monetization:**

#### **1. AdMob Account**
- [ ] **AdMob Account**: _____________________
- [ ] **Publisher ID**: ca-app-pub-________________
- [ ] **Account Status**: Active, Payment verified

#### **2. App Registration in AdMob**
```bash
# App 1: Seftec SaaS
App ID (iOS): ca-app-pub-xxxxxxxx~yyyyyyyy
App ID (Android): ca-app-pub-xxxxxxxx~zzzzzzzz

# App 2: VortexCore
App ID (iOS): ca-app-pub-xxxxxxxx~aaaaaaaa
App ID (Android): ca-app-pub-xxxxxxxx~bbbbbbbb

# App 3: LanOnasis
App ID (iOS): ca-app-pub-xxxxxxxx~cccccccc
App ID (Android): ca-app-pub-xxxxxxxx~dddddddd
```

#### **3. Ad Unit IDs**
```bash
# Banner Ads
Banner iOS: ca-app-pub-xxxxxxxx/1111111111
Banner Android: ca-app-pub-xxxxxxxx/2222222222

# Interstitial Ads
Interstitial iOS: ca-app-pub-xxxxxxxx/3333333333
Interstitial Android: ca-app-pub-xxxxxxxx/4444444444

# Rewarded Ads
Rewarded iOS: ca-app-pub-xxxxxxxx/5555555555
Rewarded Android: ca-app-pub-xxxxxxxx/6666666666
```

---

## 🛠️ **EAS CLI Setup**

### **1. EAS CLI Installation & Login**
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login
# Username: _____________________
# Password: _____________________

# Verify login
eas whoami
```

### **2. EAS Configuration Files**

#### **`eas.json` - Master Configuration**
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID@email.com",
        "ascAppId": "APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

#### **`app.json` - App Configuration (per app)**
```json
{
  "expo": {
    "name": "Seftec SaaS",
    "slug": "seftec-saas",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/seftec-icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/seftec-splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#2563eb"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.seftec.saas",
      "buildNumber": "1"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/seftec-adaptive-icon.png",
        "backgroundColor": "#2563eb"
      },
      "package": "com.seftec.saas",
      "versionCode": 1
    },
    "web": {
      "favicon": "./assets/seftec-favicon.png"
    },
    "plugins": [
      [
        "expo-admob",
        {
          "androidAppId": "ca-app-pub-xxxxxxxx~zzzzzzzz",
          "iosAppId": "ca-app-pub-xxxxxxxx~yyyyyyyy"
        }
      ]
    ]
  }
}
```

---

## 🔧 **SD-Ghost Protocol Integration for EAS**

### **Option 1: Expo-Compatible API Integration**
```javascript
// services/api.js
import Constants from 'expo-constants';

const API_CONFIG = {
  baseURL: 'https://mxtsdgkwzjzlttpotole.supabase.co',
  memoryServerURL: 'http://168.231.74.29:3000',
  onasisURL: 'https://api.lanonasis.com',
  apiKey: Constants.expoConfig?.extra?.apiKey || 'your-api-key'
};

export class SDGhostAPI {
  static async aiChat(messages, model = 'gpt-3.5-turbo') {
    const response = await fetch(`${API_CONFIG.baseURL}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`,
        'apikey': API_CONFIG.apiKey
      },
      body: JSON.stringify({
        messages,
        model,
        platform_context: {
          source: 'mobile_app',
          platform: Constants.platform?.ios ? 'ios' : 'android'
        }
      })
    });
    
    return await response.json();
  }
  
  static async textToSpeech(text, voice = 'aria') {
    const response = await fetch(`${API_CONFIG.baseURL}/functions/v1/elevenlabs-tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`,
        'apikey': API_CONFIG.apiKey
      },
      body: JSON.stringify({ text, voice })
    });
    
    return await response.json();
  }
}
```

### **Option 2: Onasis-CORE Integration (Recommended)**
```javascript
// services/onasis-api.js
import Constants from 'expo-constants';

const ONASIS_CONFIG = {
  platforms: {
    'seftec': 'https://saas.seftec.tech',
    'vortexcore': 'https://vortexcore.app',
    'lanonasis': 'https://lanonasis.com'
  },
  apiKey: Constants.expoConfig?.extra?.onasisApiKey
};

export class OnasisAPI {
  constructor(platform = 'seftec') {
    this.baseURL = ONASIS_CONFIG.platforms[platform];
  }
  
  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ONASIS_CONFIG.apiKey}`,
        'X-Platform': this.baseURL.split('//')[1],
        ...options.headers
      }
    });
    
    return await response.json();
  }
  
  async aiChat(messages) {
    return this.request('/ai-chat', {
      method: 'POST',
      body: JSON.stringify({ messages })
    });
  }
  
  async textToSpeech(text) {
    return this.request('/text-to-speech', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }
}
```

---

## 🚀 **Rapid Deployment Commands**

### **1. Build All 3 Apps (iOS)**
```bash
# Build for iOS App Store
eas build --platform ios --profile production

# Check build status
eas build:list

# Auto-submit to App Store (when ready)
eas submit --platform ios --profile production
```

### **2. Build All 3 Apps (Android)**
```bash
# Build for Google Play Store
eas build --platform android --profile production

# Check build status
eas build:list

# Auto-submit to Play Store (when ready)
eas submit --platform android --profile production
```

### **3. Parallel Deployment Strategy**
```bash
# Terminal 1: Seftec SaaS
cd seftec-saas-app
eas build --platform all --profile production

# Terminal 2: VortexCore
cd vortexcore-app
eas build --platform all --profile production

# Terminal 3: LanOnasis
cd lanonasis-app
eas build --platform all --profile production
```

---

## 📋 **Pre-Deployment Checklist**

### **24 Hours Before Deployment:**
- [ ] All credentials verified and active
- [ ] App icons and splash screens ready (1024x1024 PNG)
- [ ] App descriptions and metadata prepared
- [ ] Privacy policy and terms of service URLs ready
- [ ] AdMob integration tested in development
- [ ] API integrations tested on device
- [ ] Push notification certificates ready

### **Day of Deployment:**
- [ ] EAS CLI logged in and authenticated
- [ ] All 3 app projects configured with correct bundle IDs
- [ ] Google Play service account key file in place
- [ ] Apple Developer account 2FA ready
- [ ] App Store Connect apps created
- [ ] Google Play Console apps created
- [ ] AdMob apps registered and ad units ready

### **Post-Deployment:**
- [ ] TestFlight builds distributed to beta testers
- [ ] Play Store internal testing track activated
- [ ] App Store review submission (can take 24-48 hours)
- [ ] Play Store review submission (can take 24-48 hours)
- [ ] Monitor build logs for any issues

---

## 🎯 **Success Metrics**

**Target Timeline:**
- **Day 1-2**: Credential setup and verification
- **Day 3-4**: App configuration and testing
- **Day 5-6**: EAS builds and submissions
- **Day 7-8**: Store review process
- **Day 9-10**: Apps live on stores

**Before EAS subscription expires, you'll have:**
- 3 apps live on App Store
- 3 apps live on Google Play Store
- Monetization through AdMob active
- Complete mobile ecosystem deployed

---

## 📞 **Emergency Contacts**

- **Apple Developer Support**: https://developer.apple.com/contact/
- **Google Play Support**: https://support.google.com/googleplay/android-developer
- **Expo EAS Support**: https://expo.dev/contact
- **AdMob Support**: https://support.google.com/admob

---

**Get your credentials ready ASAP and let's deploy before your EAS subscription expires!** 🚀

*Time is of the essence - 10 days to get 3 apps live on both stores.*